package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"
)

type SessionUIHandler struct {
	db *sql.DB
}

func NewSessionUIHandler(db *sql.DB) *SessionUIHandler {
	return &SessionUIHandler{db: db}
}

func (h *SessionUIHandler) HandleGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var content string
	var updatedAt sql.NullTime
	err := h.db.QueryRow(`SELECT content, updated_at FROM session_ui WHERE session_id = ?`, id).
		Scan(&content, &updatedAt)
	if err == sql.ErrNoRows {
		WriteJSON(w, http.StatusOK, map[string]any{"content": "{}", "updated_at": nil})
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var ts *time.Time
	if updatedAt.Valid {
		ts = &updatedAt.Time
	}
	WriteJSON(w, http.StatusOK, map[string]any{"content": content, "updated_at": ts})
}

func (h *SessionUIHandler) HandlePut(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	now := time.Now()
	_, err := h.db.Exec(
		`INSERT INTO session_ui (session_id, content, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(session_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
		id, body.Content, now,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"content": body.Content, "updated_at": now})
}
