package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os/exec"
	"time"

	ptymgr "github.com/peterje/superposition/internal/pty"
)

type WorkflowsHandler struct {
	db      *sql.DB
	manager ptymgr.SessionManager
}

func NewWorkflowsHandler(db *sql.DB, manager ptymgr.SessionManager) *WorkflowsHandler {
	return &WorkflowsHandler{db: db, manager: manager}
}

type workflowResponse struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Steps       any    `json:"steps"`
	CreatedAt   string `json:"created_at"`
}

type workflowStep struct {
	Type      string `json:"type"`
	Command   string `json:"command"`
	SessionID string `json:"session_id"`
	Data      string `json:"data"`
}

func parseWorkflowSteps(stepsJSON string) any {
	var steps []any
	if err := json.Unmarshal([]byte(stepsJSON), &steps); err != nil {
		return []any{}
	}
	return steps
}

// HandleList returns all workflows as a JSON array.
func (h *WorkflowsHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, name, description, steps, created_at FROM workflows ORDER BY id`)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	result := []workflowResponse{}
	for rows.Next() {
		var wf workflowResponse
		var stepsJSON string
		if err := rows.Scan(&wf.ID, &wf.Name, &wf.Description, &stepsJSON, &wf.CreatedAt); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		wf.Steps = parseWorkflowSteps(stepsJSON)
		result = append(result, wf)
	}
	WriteJSON(w, http.StatusOK, result)
}

// HandleCreate creates a new workflow.
func (h *WorkflowsHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Steps       []any  `json:"steps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Name == "" {
		WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if body.Steps == nil {
		body.Steps = []any{}
	}

	stepsJSON, err := json.Marshal(body.Steps)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to encode steps")
		return
	}

	res, err := h.db.Exec(
		`INSERT INTO workflows (name, description, steps) VALUES (?, ?, ?)`,
		body.Name, body.Description, string(stepsJSON),
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	id, _ := res.LastInsertId()
	var wf workflowResponse
	var stepsOut string
	err = h.db.QueryRow(`SELECT id, name, description, steps, created_at FROM workflows WHERE id = ?`, id).
		Scan(&wf.ID, &wf.Name, &wf.Description, &stepsOut, &wf.CreatedAt)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	wf.Steps = parseWorkflowSteps(stepsOut)
	WriteJSON(w, http.StatusCreated, wf)
}

// HandleDelete deletes a workflow by ID and returns 204.
func (h *WorkflowsHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	res, err := h.db.Exec(`DELETE FROM workflows WHERE id = ?`, id)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		WriteError(w, http.StatusNotFound, "workflow not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleRun returns 202 immediately and executes workflow steps in a goroutine.
func (h *WorkflowsHandler) HandleRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var workflowID int64
	var name, stepsJSON string
	err := h.db.QueryRow(`SELECT id, name, steps FROM workflows WHERE id = ?`, id).
		Scan(&workflowID, &name, &stepsJSON)
	if err == sql.ErrNoRows {
		WriteError(w, http.StatusNotFound, "workflow not found")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusAccepted)

	go executeWorkflowSteps(h.manager, workflowID, name, stepsJSON)
}

// RunWorkflow loads a workflow by ID from the DB and executes its steps sequentially.
// This is a package-level function so webhooks.go can call it directly as RunWorkflow(db, manager, id).
func RunWorkflow(db *sql.DB, manager ptymgr.SessionManager, workflowID int64) {
	var name, stepsJSON string
	err := db.QueryRow(`SELECT name, steps FROM workflows WHERE id = ?`, workflowID).Scan(&name, &stepsJSON)
	if err != nil {
		log.Printf("workflow %d: not found: %v", workflowID, err)
		return
	}

	executeWorkflowSteps(manager, workflowID, name, stepsJSON)
}

func executeWorkflowSteps(manager ptymgr.SessionManager, workflowID int64, name, stepsJSON string) {
	var steps []workflowStep
	if err := json.Unmarshal([]byte(stepsJSON), &steps); err != nil {
		log.Printf("workflow %d (%s): invalid steps JSON: %v", workflowID, name, err)
		return
	}

	log.Printf("workflow %d (%s): running %d step(s)", workflowID, name, len(steps))
	for i, step := range steps {
		log.Printf("workflow %d: step %d type=%s", workflowID, i+1, step.Type)
		switch step.Type {
		case "shell":
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			cmd := exec.CommandContext(ctx, "sh", "-c", step.Command)
			out, err := cmd.CombinedOutput()
			cancel()
			if err != nil {
				log.Printf("workflow %d: step %d shell error: %v", workflowID, i+1, err)
			}
			if len(out) > 0 {
				log.Printf("workflow %d: step %d output: %s", workflowID, i+1, string(out))
			}
		case "send_input":
			if step.SessionID == "" || step.Data == "" {
				log.Printf("workflow %d: step %d send_input missing session_id or data, skipping", workflowID, i+1)
				continue
			}
			sess := manager.Get(step.SessionID)
			if sess == nil {
				log.Printf("workflow %d: step %d session %s not found, skipping", workflowID, i+1, step.SessionID)
				continue
			}
			if _, err := sess.Write([]byte(step.Data)); err != nil {
				log.Printf("workflow %d: step %d write error: %v", workflowID, i+1, err)
			}
		default:
			log.Printf("workflow %d: step %d unknown type %q, skipping", workflowID, i+1, step.Type)
		}
	}
}
