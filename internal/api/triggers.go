package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

type TriggersHandler struct {
	db *sql.DB
}

func NewTriggersHandler(db *sql.DB) *TriggersHandler {
	return &TriggersHandler{db: db}
}

type triggerResponse struct {
	ID           int64  `json:"id"`
	EventPattern string `json:"event_pattern"`
	Action       string `json:"action"`
	Config       any    `json:"config"`
	Active       bool   `json:"active"`
	CreatedAt    string `json:"created_at"`
}

func parseTriggerConfig(configJSON string) any {
	var config map[string]any
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return map[string]any{}
	}
	return config
}

// HandleList returns all triggers as a JSON array.
func (h *TriggersHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, event_pattern, action, config, active, created_at FROM triggers ORDER BY id`)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	result := []triggerResponse{}
	for rows.Next() {
		var tr triggerResponse
		var configJSON string
		var active int
		if err := rows.Scan(&tr.ID, &tr.EventPattern, &tr.Action, &configJSON, &active, &tr.CreatedAt); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		tr.Active = active != 0
		tr.Config = parseTriggerConfig(configJSON)
		result = append(result, tr)
	}
	WriteJSON(w, http.StatusOK, result)
}

// HandleCreate creates a new trigger.
func (h *TriggersHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EventPattern string `json:"event_pattern"`
		Action       string `json:"action"`
		Config       any    `json:"config"`
		Active       *bool  `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.EventPattern == "" {
		WriteError(w, http.StatusBadRequest, "event_pattern is required")
		return
	}
	if body.Action == "" {
		WriteError(w, http.StatusBadRequest, "action is required")
		return
	}

	active := true
	if body.Active != nil {
		active = *body.Active
	}

	configJSON := "{}"
	if body.Config != nil {
		b, err := json.Marshal(body.Config)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to encode config")
			return
		}
		configJSON = string(b)
	}

	res, err := h.db.Exec(
		`INSERT INTO triggers (event_pattern, action, config, active) VALUES (?, ?, ?, ?)`,
		body.EventPattern, body.Action, configJSON, active,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	id, _ := res.LastInsertId()
	var tr triggerResponse
	var configOut string
	var activeInt int
	err = h.db.QueryRow(`SELECT id, event_pattern, action, config, active, created_at FROM triggers WHERE id = ?`, id).
		Scan(&tr.ID, &tr.EventPattern, &tr.Action, &configOut, &activeInt, &tr.CreatedAt)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tr.Active = activeInt != 0
	tr.Config = parseTriggerConfig(configOut)
	WriteJSON(w, http.StatusCreated, tr)
}

// HandleDelete deletes a trigger by ID and returns 204.
func (h *TriggersHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	res, err := h.db.Exec(`DELETE FROM triggers WHERE id = ?`, id)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		WriteError(w, http.StatusNotFound, "trigger not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
