package server

import (
	"database/sql"
	"net/http"

	"github.com/peterje/superposition/internal/api"
	"github.com/peterje/superposition/internal/models"
	ptymgr "github.com/peterje/superposition/internal/pty"
	"github.com/peterje/superposition/internal/ws"
)

type Server struct {
	mux       *http.ServeMux
	db        *sql.DB
	cliStatus []models.CLIStatus
	gitOk     bool
	PtyMgr    ptymgr.SessionManager
}

func New(db *sql.DB, cliStatus []models.CLIStatus, gitOk bool, spaHandler http.Handler, ptyMgr ptymgr.SessionManager) *Server {
	s := &Server{
		mux:       http.NewServeMux(),
		db:        db,
		cliStatus: cliStatus,
		gitOk:     gitOk,
		PtyMgr:    ptyMgr,
	}
	s.routes(spaHandler)
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes(spaHandler http.Handler) {
	settings := api.NewSettingsHandler(s.db)
	repos := api.NewReposHandler(s.db)
	webhooks := api.NewWebhooksHandler(s.db, s.PtyMgr)
	sessions := api.NewSessionsHandler(s.db, s.PtyMgr, webhooks)
	notes := api.NewNotesHandler(s.db)
	upload := api.NewUploadHandler(s.db)
	files := api.NewFilesHandler(s.db)
	envvars := api.NewEnvVarsHandler(s.db)
	sessionUI := api.NewSessionUIHandler(s.db)
	orchestrator := api.NewOrchestratorHandler(s.db, s.PtyMgr)
	sessionInput := api.NewSessionInputHandler(s.PtyMgr)
	wsHandler := ws.NewHandler(s.PtyMgr)

	// Health
	s.mux.HandleFunc("GET /api/health", s.handleHealth)

	// Settings
	s.mux.HandleFunc("GET /api/settings", settings.ServeHTTP)
	s.mux.HandleFunc("GET /api/settings/{key}", settings.ServeHTTP)
	s.mux.HandleFunc("PUT /api/settings/{key}", settings.ServeHTTP)
	s.mux.HandleFunc("DELETE /api/settings/{key}", settings.ServeHTTP)

	// GitHub
	s.mux.HandleFunc("GET /api/github/repos", repos.HandleGitHubRepos)

	// Repos
	s.mux.HandleFunc("GET /api/repos", repos.HandleList)
	s.mux.HandleFunc("POST /api/repos", repos.HandleCreate)
	s.mux.HandleFunc("DELETE /api/repos/{id}", repos.HandleDelete)
	s.mux.HandleFunc("POST /api/repos/{id}/sync", repos.HandleSync)
	s.mux.HandleFunc("GET /api/repos/{id}/branches", repos.HandleBranches)

	// Sessions
	s.mux.HandleFunc("GET /api/sessions", sessions.HandleList)
	s.mux.HandleFunc("POST /api/sessions", sessions.HandleCreate)
	s.mux.HandleFunc("GET /api/sessions/{id}/replay", sessions.HandleReplay)
	s.mux.HandleFunc("DELETE /api/sessions/{id}", sessions.HandleDelete)

	// Session Notes
	s.mux.HandleFunc("GET /api/sessions/{id}/notes", notes.HandleGet)
	s.mux.HandleFunc("PUT /api/sessions/{id}/notes", notes.HandlePut)

	// File Upload
	s.mux.HandleFunc("POST /api/sessions/{id}/upload", upload.HandleUpload)

	// File Browser
	s.mux.HandleFunc("GET /api/sessions/{id}/files", files.HandleList)
	s.mux.HandleFunc("GET /api/sessions/{id}/files/read", files.HandleRead)
	s.mux.HandleFunc("GET /api/sessions/{id}/files/tree", files.HandleTree)

	// MCP Config
	s.mux.HandleFunc("GET /api/sessions/{id}/mcp", files.HandleMCPGet)
	s.mux.HandleFunc("PUT /api/sessions/{id}/mcp", files.HandleMCPPut)

	// Session Env Vars
	s.mux.HandleFunc("GET /api/sessions/{id}/env", envvars.HandleGet)
	s.mux.HandleFunc("PUT /api/sessions/{id}/env", envvars.HandlePut)

	// Session UI (A2UI)
	s.mux.HandleFunc("GET /api/sessions/{id}/ui", sessionUI.HandleGet)
	s.mux.HandleFunc("PUT /api/sessions/{id}/ui", sessionUI.HandlePut)

	// Webhooks
	s.mux.HandleFunc("GET /api/webhooks", webhooks.HandleList)
	s.mux.HandleFunc("POST /api/webhooks", webhooks.HandleCreate)
	s.mux.HandleFunc("PUT /api/webhooks/{id}", webhooks.HandleUpdate)
	s.mux.HandleFunc("DELETE /api/webhooks/{id}", webhooks.HandleDelete)
	s.mux.HandleFunc("POST /api/webhooks/{id}/test", webhooks.HandleTest)

	// Workflows
	workflows := api.NewWorkflowsHandler(s.db, s.PtyMgr)
	s.mux.HandleFunc("GET /api/workflows", workflows.HandleList)
	s.mux.HandleFunc("POST /api/workflows", workflows.HandleCreate)
	s.mux.HandleFunc("DELETE /api/workflows/{id}", workflows.HandleDelete)
	s.mux.HandleFunc("POST /api/workflows/{id}/run", workflows.HandleRun)

	// Triggers
	triggers := api.NewTriggersHandler(s.db)
	s.mux.HandleFunc("GET /api/triggers", triggers.HandleList)
	s.mux.HandleFunc("POST /api/triggers", triggers.HandleCreate)
	s.mux.HandleFunc("DELETE /api/triggers/{id}", triggers.HandleDelete)

	// Orchestrator
	s.mux.HandleFunc("POST /api/orchestrator", orchestrator.HandleCreate)
	s.mux.HandleFunc("POST /api/orchestrator/stop", orchestrator.HandleStop)
	s.mux.HandleFunc("GET /api/orchestrator/sessions", orchestrator.HandleListSessions)

	// Session Input
	s.mux.HandleFunc("POST /api/sessions/{id}/input", sessionInput.HandleInput)
	s.mux.HandleFunc("GET /api/sessions/{id}/tail", sessionInput.HandleTail)

	// WebSocket
	s.mux.Handle("GET /ws/session/{id}", wsHandler)

	// SPA fallback
	s.mux.Handle("/", spaHandler)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	resp := models.HealthResponse{
		Status: "ok",
		CLIs:   s.cliStatus,
		Git:    s.gitOk,
	}
	api.WriteJSON(w, http.StatusOK, resp)
}
