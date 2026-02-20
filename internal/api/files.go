package api

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type FilesHandler struct {
	db *sql.DB
}

func NewFilesHandler(db *sql.DB) *FilesHandler {
	return &FilesHandler{db: db}
}

// HandleList returns directory contents for a session's worktree.
// Query param: path (relative to worktree root, defaults to "")
func (h *FilesHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	worktreePath, err := h.getWorktreePath(sessionID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "session not found")
		return
	}

	relPath := r.URL.Query().Get("path")
	absPath, ok := h.safePath(worktreePath, relPath)
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid path")
		return
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		WriteError(w, http.StatusNotFound, "directory not found")
		return
	}

	type fileEntry struct {
		Name  string `json:"name"`
		Path  string `json:"path"`
		IsDir bool   `json:"is_dir"`
		Size  int64  `json:"size"`
	}

	result := []fileEntry{}
	for _, e := range entries {
		// Skip .git directory and hidden files starting with .
		name := e.Name()
		if name == ".git" {
			continue
		}

		info, err := e.Info()
		if err != nil {
			continue
		}

		entryPath := name
		if relPath != "" {
			entryPath = filepath.Join(relPath, name)
		}

		result = append(result, fileEntry{
			Name:  name,
			Path:  entryPath,
			IsDir: e.IsDir(),
			Size:  info.Size(),
		})
	}

	WriteJSON(w, http.StatusOK, result)
}

// HandleRead returns file content for text files, or metadata for binary files.
// Query param: path (relative to worktree root)
func (h *FilesHandler) HandleRead(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	worktreePath, err := h.getWorktreePath(sessionID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "session not found")
		return
	}

	relPath := r.URL.Query().Get("path")
	if relPath == "" {
		WriteError(w, http.StatusBadRequest, "path is required")
		return
	}

	absPath, ok := h.safePath(worktreePath, relPath)
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid path")
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		WriteError(w, http.StatusNotFound, "file not found")
		return
	}
	if info.IsDir() {
		WriteError(w, http.StatusBadRequest, "path is a directory")
		return
	}

	// Limit readable file size to 1MB
	if info.Size() > 1<<20 {
		WriteJSON(w, http.StatusOK, map[string]any{
			"path":     relPath,
			"size":     info.Size(),
			"truncated": true,
			"content":  "",
		})
		return
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to read file")
		return
	}

	// Check if binary
	if isBinary(data) {
		WriteJSON(w, http.StatusOK, map[string]any{
			"path":   relPath,
			"size":   info.Size(),
			"binary": true,
			"content": "",
		})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"path":    relPath,
		"size":    info.Size(),
		"content": string(data),
	})
}

// HandleTree returns the full directory tree (up to a depth limit).
func (h *FilesHandler) HandleTree(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	worktreePath, err := h.getWorktreePath(sessionID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "session not found")
		return
	}

	type treeNode struct {
		Name     string     `json:"name"`
		Path     string     `json:"path"`
		IsDir    bool       `json:"is_dir"`
		Children []treeNode `json:"children,omitempty"`
	}

	var walk func(dir string, relPrefix string, depth int) []treeNode
	walk = func(dir string, relPrefix string, depth int) []treeNode {
		if depth > 5 {
			return nil
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return nil
		}

		nodes := []treeNode{}
		for _, e := range entries {
			name := e.Name()
			if name == ".git" || name == "node_modules" || name == ".claude" {
				continue
			}

			entryPath := name
			if relPrefix != "" {
				entryPath = relPrefix + "/" + name
			}

			node := treeNode{
				Name:  name,
				Path:  entryPath,
				IsDir: e.IsDir(),
			}

			if e.IsDir() {
				node.Children = walk(filepath.Join(dir, name), entryPath, depth+1)
			}

			nodes = append(nodes, node)
		}
		return nodes
	}

	tree := walk(worktreePath, "", 0)
	WriteJSON(w, http.StatusOK, tree)
}

// HandleMCPGet returns the .mcp.json config for a session.
func (h *FilesHandler) HandleMCPGet(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	worktreePath, err := h.getWorktreePath(sessionID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "session not found")
		return
	}

	mcpPath := filepath.Join(worktreePath, ".mcp.json")
	data, err := os.ReadFile(mcpPath)
	if err != nil {
		// No .mcp.json yet — return empty config
		WriteJSON(w, http.StatusOK, map[string]any{
			"mcpServers": map[string]any{},
		})
		return
	}

	// Parse and re-emit to validate JSON
	var config map[string]any
	if err := json.Unmarshal(data, &config); err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{
			"mcpServers": map[string]any{},
		})
		return
	}

	WriteJSON(w, http.StatusOK, config)
}

// HandleMCPPut writes the .mcp.json config for a session.
func (h *FilesHandler) HandleMCPPut(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	worktreePath, err := h.getWorktreePath(sessionID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "session not found")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1MB max
	if err != nil {
		WriteError(w, http.StatusBadRequest, "failed to read body")
		return
	}

	// Validate JSON structure
	var config map[string]any
	if err := json.Unmarshal(body, &config); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	mcpPath := filepath.Join(worktreePath, ".mcp.json")
	// Pretty-print for readability
	formatted, _ := json.MarshalIndent(config, "", "  ")
	if err := os.WriteFile(mcpPath, formatted, 0644); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to write .mcp.json")
		return
	}

	WriteJSON(w, http.StatusOK, config)
}

func (h *FilesHandler) getWorktreePath(sessionID string) (string, error) {
	var worktreePath string
	err := h.db.QueryRow(`SELECT worktree_path FROM sessions WHERE id = ?`, sessionID).Scan(&worktreePath)
	return worktreePath, err
}

// safePath resolves a relative path within the worktree, preventing directory traversal.
func (h *FilesHandler) safePath(worktreePath, relPath string) (string, bool) {
	if relPath == "" {
		return worktreePath, true
	}
	cleaned := filepath.Clean(relPath)
	if strings.HasPrefix(cleaned, "..") || filepath.IsAbs(cleaned) {
		return "", false
	}
	abs := filepath.Join(worktreePath, cleaned)
	// Ensure the resolved path is still within the worktree
	if !strings.HasPrefix(abs, worktreePath) {
		return "", false
	}
	return abs, true
}

// isBinary checks if data contains null bytes (simple heuristic).
func isBinary(data []byte) bool {
	// Check first 8KB
	check := data
	if len(check) > 8192 {
		check = check[:8192]
	}
	for _, b := range check {
		if b == 0 {
			return true
		}
	}
	return false
}

