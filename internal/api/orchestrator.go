package api

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	ptymgr "github.com/peterje/superposition/internal/pty"
)

type OrchestratorHandler struct {
	db      *sql.DB
	manager ptymgr.SessionManager
}

func NewOrchestratorHandler(db *sql.DB, manager ptymgr.SessionManager) *OrchestratorHandler {
	return &OrchestratorHandler{db: db, manager: manager}
}

type orchestratorResponse struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	PID       *int   `json:"pid"`
	WorkDir   string `json:"work_dir"`
	CreatedAt string `json:"created_at"`
}

// HandleCreate gets or creates the singleton orchestrator session.
func (h *OrchestratorHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	// Check for an existing running orchestrator session.
	var existing orchestratorResponse
	var pid sql.NullInt64
	err := h.db.QueryRow(
		`SELECT id, status, pid, work_dir, created_at FROM orchestrator_sessions WHERE status = 'running' LIMIT 1`,
	).Scan(&existing.ID, &existing.Status, &pid, &existing.WorkDir, &existing.CreatedAt)

	if err == nil {
		// Found a running record — verify the process is actually alive.
		if handle := h.manager.Get(existing.ID); handle != nil {
			if pid.Valid {
				p := int(pid.Int64)
				existing.PID = &p
			}
			WriteJSON(w, http.StatusOK, existing)
			return
		}
		// Process is dead; mark it stopped and fall through to create a new one.
		h.db.Exec(`UPDATE orchestrator_sessions SET status = 'stopped' WHERE id = ?`, existing.ID)
	} else if err != sql.ErrNoRows {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Create a new orchestrator session.
	sessionID := uuid.New().String()[:8]

	workDir, err := os.UserHomeDir()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("get home dir: %v", err))
		return
	}

	// Write .mcp.json into the orchestrator's working directory.
	mcpConfig := fmt.Sprintf(`{
  "mcpServers": {
    "codeking-orchestrator": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/superposition/mcp/orchestrator-server.js"],
      "env": {
        "CODEKING_API_URL": "http://localhost:8800"
      }
    },
    "codeking-notepad": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/superposition/mcp/notepad-server.js"],
      "env": {
        "CODEKING_SESSION_ID": "%s",
        "CODEKING_API_URL": "http://localhost:8800"
      }
    },
    "codeking-ui": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/superposition/mcp/a2ui-server.js"],
      "env": {
        "CODEKING_SESSION_ID": "%s",
        "CODEKING_API_URL": "http://localhost:8800"
      }
    }
  }
}`, sessionID, sessionID)

	if err := os.WriteFile(filepath.Join(workDir, ".mcp.json"), []byte(mcpConfig), 0644); err != nil {
		log.Printf("orchestrator: failed to write .mcp.json for session %s: %v", sessionID, err)
	}

	command := resolveCommand(h.db, "claude")

	sess, newPID, err := h.manager.Start(sessionID, command, workDir, nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("start orchestrator: %v", err))
		return
	}

	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	h.db.Exec(
		`INSERT INTO orchestrator_sessions (id, status, pid, work_dir, created_at) VALUES (?, 'running', ?, ?, ?)`,
		sessionID, newPID, workDir, now,
	)

	// Monitor for process exit.
	go func() {
		<-sess.Done()
		h.db.Exec(`UPDATE orchestrator_sessions SET status = 'stopped' WHERE id = ?`, sessionID)
		log.Printf("orchestrator session %s stopped", sessionID)
	}()

	p := newPID
	WriteJSON(w, http.StatusCreated, orchestratorResponse{
		ID:        sessionID,
		Status:    "running",
		PID:       &p,
		WorkDir:   workDir,
		CreatedAt: now,
	})
}

// HandleStop stops the running orchestrator session.
func (h *OrchestratorHandler) HandleStop(w http.ResponseWriter, r *http.Request) {
	var id string
	err := h.db.QueryRow(
		`SELECT id FROM orchestrator_sessions WHERE status = 'running' LIMIT 1`,
	).Scan(&id)
	if err == sql.ErrNoRows {
		WriteError(w, http.StatusNotFound, "no running orchestrator session")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.manager.Stop(id)
	h.db.Exec(`UPDATE orchestrator_sessions SET status = 'stopped' WHERE id = ?`, id)
	w.WriteHeader(http.StatusNoContent)
}

// HandleListSessions returns a summary of all sessions enriched with a
// live-terminal snippet where available.
func (h *OrchestratorHandler) HandleListSessions(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`
		SELECT s.id, s.repo_id, s.worktree_path, s.branch, s.cli_type, s.status, s.pid, s.created_at,
		       r.owner, r.name
		FROM sessions s
		JOIN repositories r ON s.repo_id = r.id
		ORDER BY s.created_at DESC`)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type sessionSummary struct {
		ID        string `json:"id"`
		RepoOwner string `json:"repo_owner"`
		RepoName  string `json:"repo_name"`
		Branch    string `json:"branch"`
		CLIType   string `json:"cli_type"`
		Status    string `json:"status"`
		Snippet   string `json:"snippet"`
		CreatedAt string `json:"created_at"`
	}

	result := []sessionSummary{}
	for rows.Next() {
		var s sessionSummary
		var repoID int64
		var worktreePath string
		var pid sql.NullInt64
		if err := rows.Scan(
			&s.ID, &repoID, &worktreePath, &s.Branch, &s.CLIType,
			&s.Status, &pid, &s.CreatedAt, &s.RepoOwner, &s.RepoName,
		); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}

		if s.Status == "running" {
			if handle := h.manager.Get(s.ID); handle != nil {
				s.Snippet = lastNonEmptyLine(stripANSI(string(handle.Replay())))
			}
		}

		result = append(result, s)
	}

	WriteJSON(w, http.StatusOK, result)
}

// lastNonEmptyLine returns the last non-empty line from s.
func lastNonEmptyLine(s string) string {
	lines := strings.Split(s, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.TrimSpace(lines[i]) != "" {
			return lines[i]
		}
	}
	return ""
}
