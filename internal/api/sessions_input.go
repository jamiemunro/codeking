package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	ptymgr "github.com/peterje/superposition/internal/pty"
)

var ansiEscapeRe = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

// stripANSI removes ANSI escape sequences from s.
func stripANSI(s string) string {
	return ansiEscapeRe.ReplaceAllString(s, "")
}

type SessionInputHandler struct {
	manager ptymgr.SessionManager
}

func NewSessionInputHandler(manager ptymgr.SessionManager) *SessionInputHandler {
	return &SessionInputHandler{manager: manager}
}

// HandleInput accepts a POST body {"data": "..."} and writes it to the session PTY.
func (h *SessionInputHandler) HandleInput(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var body struct {
		Data string `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	sess := h.manager.Get(id)
	if sess == nil {
		WriteError(w, http.StatusNotFound, "session not found or not running")
		return
	}

	if _, err := sess.Write([]byte(body.Data)); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleTail returns the last N lines from the session replay buffer.
func (h *SessionInputHandler) HandleTail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	lines := 50
	if raw := r.URL.Query().Get("lines"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			lines = n
		}
	}

	sess := h.manager.Get(id)
	if sess == nil {
		WriteError(w, http.StatusNotFound, "session not found or not running")
		return
	}

	replay := sess.Replay()
	stripped := stripANSI(string(replay))

	all := strings.Split(stripped, "\n")
	var nonEmpty []string
	for _, l := range all {
		if strings.TrimSpace(l) != "" {
			nonEmpty = append(nonEmpty, l)
		}
	}

	start := len(nonEmpty) - lines
	if start < 0 {
		start = 0
	}
	tail := nonEmpty[start:]

	WriteJSON(w, http.StatusOK, map[string]any{"lines": tail})
}
