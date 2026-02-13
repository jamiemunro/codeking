package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/peterje/superposition/internal/git"
	"github.com/peterje/superposition/internal/github"
	"github.com/peterje/superposition/internal/models"
)

type ReposHandler struct {
	db *sql.DB
}

func NewReposHandler(db *sql.DB) *ReposHandler {
	return &ReposHandler{db: db}
}

func (h *ReposHandler) HandleGitHubRepos(w http.ResponseWriter, r *http.Request) {
	pat := h.getPAT()
	if pat == "" {
		WriteError(w, http.StatusBadRequest, "GitHub PAT not configured")
		return
	}

	repos, err := github.ListRepos(pat)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, repos)
}

func (h *ReposHandler) HandleList(w http.ResponseWriter, _ *http.Request) {
	rows, err := h.db.Query(`SELECT id, github_url, owner, name, local_path, clone_status, default_branch, last_synced, created_at FROM repositories ORDER BY created_at DESC`)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	repos := []models.Repository{}
	for rows.Next() {
		var repo models.Repository
		if err := rows.Scan(&repo.ID, &repo.GitHubURL, &repo.Owner, &repo.Name, &repo.LocalPath, &repo.CloneStatus, &repo.DefaultBranch, &repo.LastSynced, &repo.CreatedAt); err != nil {
			WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		repos = append(repos, repo)
	}
	WriteJSON(w, http.StatusOK, repos)
}

func (h *ReposHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		GitHubURL string `json:"github_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Parse owner/name from URL
	owner, name, err := parseGitHubURL(body.GitHubURL)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	cloneURL := fmt.Sprintf("https://github.com/%s/%s.git", owner, name)

	result, err := h.db.Exec(
		`INSERT INTO repositories (github_url, owner, name, local_path, clone_status, default_branch) VALUES (?, ?, ?, '', 'cloning', 'main')`,
		body.GitHubURL, owner, name,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			WriteError(w, http.StatusConflict, "repository already added")
			return
		}
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	id, _ := result.LastInsertId()

	// Clone in background
	go h.cloneRepo(id, cloneURL, owner, name)

	repo := models.Repository{
		ID:          id,
		GitHubURL:   body.GitHubURL,
		Owner:       owner,
		Name:        name,
		CloneStatus: "cloning",
	}
	WriteJSON(w, http.StatusCreated, repo)
}

func (h *ReposHandler) HandleDelete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Check for active sessions
	var count int
	h.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE repo_id = ? AND status NOT IN ('stopped', 'error')`, id).Scan(&count)
	if count > 0 {
		WriteError(w, http.StatusConflict, "repository has active sessions")
		return
	}

	result, err := h.db.Exec("DELETE FROM repositories WHERE id = ?", id)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		WriteError(w, http.StatusNotFound, "repository not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ReposHandler) HandleSync(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var repo models.Repository
	err = h.db.QueryRow(`SELECT id, local_path, clone_status FROM repositories WHERE id = ?`, id).
		Scan(&repo.ID, &repo.LocalPath, &repo.CloneStatus)
	if err == sql.ErrNoRows {
		WriteError(w, http.StatusNotFound, "repository not found")
		return
	}
	if repo.CloneStatus != "ready" {
		WriteError(w, http.StatusBadRequest, "repository not ready")
		return
	}

	pat := h.getPAT()
	if err := git.Fetch(repo.LocalPath, pat); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	now := time.Now()
	h.db.Exec(`UPDATE repositories SET last_synced = ? WHERE id = ?`, now, id)
	WriteJSON(w, http.StatusOK, map[string]string{"status": "synced"})
}

func (h *ReposHandler) HandleBranches(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var localPath, cloneStatus string
	err = h.db.QueryRow(`SELECT local_path, clone_status FROM repositories WHERE id = ?`, id).
		Scan(&localPath, &cloneStatus)
	if err == sql.ErrNoRows {
		WriteError(w, http.StatusNotFound, "repository not found")
		return
	}
	if cloneStatus != "ready" {
		WriteError(w, http.StatusBadRequest, "repository not ready")
		return
	}

	branches, err := git.ListBranches(localPath)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, branches)
}

func (h *ReposHandler) cloneRepo(id int64, cloneURL, owner, name string) {
	pat := h.getPAT()
	localPath, err := git.CloneBare(cloneURL, pat, owner, name)
	if err != nil {
		log.Printf("Clone failed for %s/%s: %v", owner, name, err)
		h.db.Exec(`UPDATE repositories SET clone_status = 'error' WHERE id = ?`, id)
		return
	}

	// Get default branch
	defaultBranch := "main"
	branches, err := git.ListBranches(localPath)
	if err == nil && len(branches) > 0 {
		defaultBranch = branches[0]
	}

	now := time.Now()
	h.db.Exec(`UPDATE repositories SET local_path = ?, clone_status = 'ready', default_branch = ?, last_synced = ? WHERE id = ?`,
		localPath, defaultBranch, now, id)
	log.Printf("Cloned %s/%s to %s", owner, name, localPath)
}

func (h *ReposHandler) getPAT() string {
	var pat string
	h.db.QueryRow(`SELECT value FROM settings WHERE key = 'github_pat'`).Scan(&pat)
	return pat
}

func parseGitHubURL(rawURL string) (string, string, error) {
	// Handle formats: https://github.com/owner/name, github.com/owner/name, owner/name
	rawURL = strings.TrimSuffix(rawURL, ".git")
	rawURL = strings.TrimPrefix(rawURL, "https://")
	rawURL = strings.TrimPrefix(rawURL, "http://")
	rawURL = strings.TrimPrefix(rawURL, "github.com/")

	parts := strings.Split(rawURL, "/")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid GitHub URL: need owner/name format")
	}
	return parts[len(parts)-2], parts[len(parts)-1], nil
}
