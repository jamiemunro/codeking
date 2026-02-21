package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	neturl "net/url"
	"time"
)

type WebhooksHandler struct {
	db *sql.DB
}

func NewWebhooksHandler(db *sql.DB) *WebhooksHandler {
	return &WebhooksHandler{db: db}
}

type webhook struct {
	ID        int64     `json:"id"`
	URL       string    `json:"url"`
	Secret    string    `json:"secret,omitempty"`
	Events    []string  `json:"events"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
}

// redacted returns a copy with the secret omitted from JSON serialization.
func (wh webhook) redacted() webhook {
	wh.Secret = ""
	return wh
}

func scanWebhook(row interface {
	Scan(...any) error
}) (webhook, error) {
	var wh webhook
	var eventsJSON string
	var createdAt string
	if err := row.Scan(&wh.ID, &wh.URL, &wh.Secret, &eventsJSON, &wh.Active, &createdAt); err != nil {
		return wh, err
	}
	if err := json.Unmarshal([]byte(eventsJSON), &wh.Events); err != nil {
		wh.Events = []string{}
	}
	t, err := time.Parse("2006-01-02 15:04:05", createdAt)
	if err == nil {
		wh.CreatedAt = t
	}
	return wh, nil
}

// HandleList returns all webhooks as a JSON array.
func (h *WebhooksHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, url, secret, events, active, created_at FROM webhooks ORDER BY id`)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	result := []webhook{}
	for rows.Next() {
		wh, err := scanWebhook(rows)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		result = append(result, wh.redacted())
	}
	WriteJSON(w, http.StatusOK, result)
}

// HandleCreate creates a new webhook.
func (h *WebhooksHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL    string   `json:"url"`
		Secret string   `json:"secret"`
		Events []string `json:"events"`
		Active *bool    `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.URL == "" {
		WriteError(w, http.StatusBadRequest, "url is required")
		return
	}
	if body.Events == nil {
		body.Events = []string{}
	}
	active := true
	if body.Active != nil {
		active = *body.Active
	}

	eventsJSON, err := json.Marshal(body.Events)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to encode events")
		return
	}

	res, err := h.db.Exec(
		`INSERT INTO webhooks (url, secret, events, active) VALUES (?, ?, ?, ?)`,
		body.URL, body.Secret, string(eventsJSON), active,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	id, _ := res.LastInsertId()
	row := h.db.QueryRow(`SELECT id, url, secret, events, active, created_at FROM webhooks WHERE id = ?`, id)
	wh, err := scanWebhook(row)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusCreated, wh)
}

// HandleUpdate updates an existing webhook by ID.
func (h *WebhooksHandler) HandleUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var body struct {
		URL    *string  `json:"url"`
		Secret *string  `json:"secret"`
		Events []string `json:"events"`
		Active *bool    `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	row := h.db.QueryRow(`SELECT id, url, secret, events, active, created_at FROM webhooks WHERE id = ?`, id)
	wh, err := scanWebhook(row)
	if err == sql.ErrNoRows {
		WriteError(w, http.StatusNotFound, "webhook not found")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if body.URL != nil {
		wh.URL = *body.URL
	}
	if body.Secret != nil {
		wh.Secret = *body.Secret
	}
	if body.Events != nil {
		wh.Events = body.Events
	}
	if body.Active != nil {
		wh.Active = *body.Active
	}

	eventsJSON, err := json.Marshal(wh.Events)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to encode events")
		return
	}

	_, err = h.db.Exec(
		`UPDATE webhooks SET url = ?, secret = ?, events = ?, active = ? WHERE id = ?`,
		wh.URL, wh.Secret, string(eventsJSON), wh.Active, id,
	)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, wh.redacted())
}

// HandleDelete deletes a webhook by ID and returns 204.
func (h *WebhooksHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	res, err := h.db.Exec(`DELETE FROM webhooks WHERE id = ?`, id)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		WriteError(w, http.StatusNotFound, "webhook not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleTest sends a test webhook delivery for the given webhook ID.
func (h *WebhooksHandler) HandleTest(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	row := h.db.QueryRow(`SELECT id, url, secret, events, active, created_at FROM webhooks WHERE id = ?`, id)
	wh, err := scanWebhook(row)
	if err == sql.ErrNoRows {
		WriteError(w, http.StatusNotFound, "webhook not found")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if !isAllowedWebhookURL(wh.URL) {
		WriteError(w, http.StatusBadRequest, "webhook URL must use http or https scheme")
		return
	}

	payload := map[string]any{
		"event":      "webhook.test",
		"session_id": "",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"data":       map[string]any{"message": "test delivery"},
	}

	if err := deliverWebhook(wh.URL, wh.Secret, payload); err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("delivery failed: %s", err.Error()))
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// FireWebhook fires webhooks for the given event to all active matching subscribers.
// Deliveries happen in goroutines (non-blocking).
func (h *WebhooksHandler) FireWebhook(event string, sessionID string, data map[string]any) {
	rows, err := h.db.Query(`SELECT id, url, secret, events, active, created_at FROM webhooks WHERE active = 1`)
	if err != nil {
		log.Printf("webhooks: query error: %v", err)
		return
	}
	defer rows.Close()

	payload := map[string]any{
		"event":      event,
		"session_id": sessionID,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"data":       data,
	}

	// Marshal once before spawning goroutines to avoid shared map access.
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("webhooks: marshal error: %v", err)
		return
	}

	for rows.Next() {
		wh, err := scanWebhook(rows)
		if err != nil {
			continue
		}
		matched := false
		for _, e := range wh.Events {
			if e == event {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
		go func(url, secret string) {
			if err := deliverWebhookRaw(url, secret, body); err != nil {
				log.Printf("webhooks: delivery to %s failed: %v", url, err)
			}
		}(wh.URL, wh.Secret)
	}
}

// isAllowedWebhookURL validates that the URL uses http or https scheme.
func isAllowedWebhookURL(rawURL string) bool {
	u, err := neturl.Parse(rawURL)
	if err != nil {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

// deliverWebhook marshals the payload and delivers it.
func deliverWebhook(url, secret string, payload map[string]any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}
	return deliverWebhookRaw(url, secret, body)
}

// deliverWebhookRaw POSTs pre-marshaled JSON to the given URL with an HMAC-SHA256 signature header.
func deliverWebhookRaw(url, secret string, body []byte) error {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Signature", sig)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return nil
}

