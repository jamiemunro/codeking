package api

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const maxUploadSize = 50 << 20 // 50 MB

type UploadHandler struct {
	db *sql.DB
}

func NewUploadHandler(db *sql.DB) *UploadHandler {
	return &UploadHandler{db: db}
}

func (h *UploadHandler) HandleUpload(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")

	// Look up worktree path
	var worktreePath string
	err := h.db.QueryRow(`SELECT worktree_path FROM sessions WHERE id = ?`, sessionID).Scan(&worktreePath)
	if err == sql.ErrNoRows {
		WriteError(w, http.StatusNotFound, "session not found")
		return
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if worktreePath == "" {
		WriteError(w, http.StatusBadRequest, "session has no worktree")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		WriteError(w, http.StatusBadRequest, "file too large (max 50MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	// Sanitize filename — strip path separators, prevent directory traversal
	filename := filepath.Base(header.Filename)
	if filename == "." || filename == "/" || filename == "" {
		WriteError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	// Optional subdirectory from form field
	subdir := r.FormValue("path")
	if subdir != "" {
		// Prevent traversal
		subdir = filepath.Clean(subdir)
		if strings.HasPrefix(subdir, "..") || filepath.IsAbs(subdir) {
			WriteError(w, http.StatusBadRequest, "invalid path")
			return
		}
	}

	// Build destination path
	destDir := worktreePath
	if subdir != "" {
		destDir = filepath.Join(worktreePath, subdir)
	}
	if err := os.MkdirAll(destDir, 0755); err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("create directory: %v", err))
		return
	}

	destPath := filepath.Join(destDir, filename)

	dst, err := os.Create(destPath)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("create file: %v", err))
		return
	}
	defer dst.Close()

	written, err := io.Copy(dst, file)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("write file: %v", err))
		return
	}

	// Return path relative to worktree so Claude can reference it
	relPath := filename
	if subdir != "" {
		relPath = filepath.Join(subdir, filename)
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"filename": filename,
		"path":     relPath,
		"size":     written,
	})
}
