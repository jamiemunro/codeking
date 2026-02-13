package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/peterje/superposition/internal/models"
)

type SettingsHandler struct {
	db *sql.DB
}

func NewSettingsHandler(db *sql.DB) *SettingsHandler {
	return &SettingsHandler{db: db}
}

func (h *SettingsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")

	switch r.Method {
	case http.MethodGet:
		if key == "" {
			h.listSettings(w, r)
		} else {
			h.getSetting(w, r, key)
		}
	case http.MethodPut:
		h.putSetting(w, r, key)
	case http.MethodDelete:
		h.deleteSetting(w, r, key)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *SettingsHandler) listSettings(w http.ResponseWriter, _ *http.Request) {
	rows, err := h.db.Query("SELECT key, value, updated_at FROM settings")
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	settings := []models.Setting{}
	for rows.Next() {
		var s models.Setting
		if err := rows.Scan(&s.Key, &s.Value, &s.UpdatedAt); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		settings = append(settings, s)
	}
	WriteJSON(w, http.StatusOK, settings)
}

func (h *SettingsHandler) getSetting(w http.ResponseWriter, _ *http.Request, key string) {
	var s models.Setting
	err := h.db.QueryRow("SELECT key, value, updated_at FROM settings WHERE key = ?", key).
		Scan(&s.Key, &s.Value, &s.UpdatedAt)
	if err == sql.ErrNoRows {
		WriteError(w, http.StatusNotFound, "setting not found")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, s)
}

func (h *SettingsHandler) putSetting(w http.ResponseWriter, r *http.Request, key string) {
	if key == "" {
		WriteError(w, http.StatusBadRequest, "key is required")
		return
	}

	var body struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	now := time.Now()
	_, err := h.db.Exec(
		`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, body.Value, now,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, models.Setting{Key: key, Value: body.Value, UpdatedAt: now})
}

func (h *SettingsHandler) deleteSetting(w http.ResponseWriter, _ *http.Request, key string) {
	if key == "" {
		WriteError(w, http.StatusBadRequest, "key is required")
		return
	}

	result, err := h.db.Exec("DELETE FROM settings WHERE key = ?", key)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		WriteError(w, http.StatusNotFound, "setting not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}
