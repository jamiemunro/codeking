package api

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
)

type EnvVarsHandler struct {
	db *sql.DB
}

func NewEnvVarsHandler(db *sql.DB) *EnvVarsHandler {
	return &EnvVarsHandler{db: db}
}

// HandleGet returns all env vars for a session.
func (h *EnvVarsHandler) HandleGet(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")

	rows, err := h.db.Query(`SELECT key, value FROM session_env WHERE session_id = ? ORDER BY key`, sessionID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to query env vars")
		return
	}
	defer rows.Close()

	result := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		result[k] = v
	}

	WriteJSON(w, http.StatusOK, result)
}

// HandlePut replaces all env vars for a session.
func (h *EnvVarsHandler) HandlePut(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "failed to read body")
		return
	}

	var envVars map[string]string
	if err := json.Unmarshal(body, &envVars); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON — expected {\"KEY\": \"value\"}")
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "transaction failed")
		return
	}
	defer tx.Rollback()

	// Clear existing
	if _, err := tx.Exec(`DELETE FROM session_env WHERE session_id = ?`, sessionID); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to clear env vars")
		return
	}

	// Insert new
	for k, v := range envVars {
		if _, err := tx.Exec(`INSERT INTO session_env (session_id, key, value) VALUES (?, ?, ?)`, sessionID, k, v); err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to insert env var")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		WriteError(w, http.StatusInternalServerError, "commit failed")
		return
	}

	WriteJSON(w, http.StatusOK, envVars)
}
