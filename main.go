package main

import (
	"bufio"
	"context"
	"database/sql"
	"embed"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/peterje/superposition/internal/db"
	gitops "github.com/peterje/superposition/internal/git"
	"github.com/peterje/superposition/internal/preflight"
	"github.com/peterje/superposition/internal/server"
	"github.com/peterje/superposition/web"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func main() {
	port := flag.Int("port", 8800, "server port")
	flag.Parse()

	fmt.Println("Superposition - AI Coding Sessions")
	fmt.Println("===================================")
	fmt.Println()

	// Preflight checks
	fmt.Println("Running preflight checks...")
	cliStatus, gitOk := preflight.CheckAll()
	if !gitOk {
		fmt.Println("\ngit is required. Please install git and try again.")
		os.Exit(1)
	}
	fmt.Println()

	// Open database
	database, err := db.Open()
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	// Run migrations
	migrationSQL, err := migrationsFS.ReadFile("migrations/001_initial.sql")
	if err != nil {
		log.Fatalf("Failed to read migrations: %v", err)
	}
	if err := db.Migrate(database, string(migrationSQL)); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Startup cleanup: mark stale sessions as stopped
	cleanupStaleSessions(database)

	// Start server
	srv := server.New(database, cliStatus, gitOk, web.SPAHandler())

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	httpSrv := &http.Server{
		Addr:    addr,
		Handler: loggingMiddleware(recoveryMiddleware(srv)),
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		fmt.Printf("\nReceived %s, shutting down...\n", sig)

		// Stop all PTY sessions
		srv.PtyMgr.StopAll()

		// Clean up worktrees for running sessions
		cleanupWorktrees(database)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		httpSrv.Shutdown(ctx)
	}()

	fmt.Printf("Server running at http://%s\n", addr)
	if err := httpSrv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
	fmt.Println("Server stopped.")
}

func cleanupStaleSessions(database *sql.DB) {
	result, err := database.Exec(`UPDATE sessions SET status = 'stopped' WHERE status IN ('running', 'starting')`)
	if err != nil {
		log.Printf("Failed to clean up stale sessions: %v", err)
		return
	}
	rows, _ := result.RowsAffected()
	if rows > 0 {
		log.Printf("Cleaned up %d stale sessions", rows)
	}

	// Remove orphaned worktrees
	cleanupWorktrees(database)
}

func cleanupWorktrees(database *sql.DB) {
	rows, err := database.Query(`SELECT s.worktree_path, r.local_path FROM sessions s JOIN repositories r ON s.repo_id = r.id WHERE s.status = 'stopped' AND s.worktree_path != ''`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var wtPath, repoPath string
		if err := rows.Scan(&wtPath, &repoPath); err != nil {
			continue
		}
		if _, err := os.Stat(wtPath); err == nil {
			if err := gitops.RemoveWorktree(repoPath, wtPath); err != nil {
				log.Printf("Failed to remove worktree %s: %v", wtPath, err)
			}
		}
	}
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(rw, r)

		// Don't log WebSocket upgrades or static assets
		if r.Header.Get("Upgrade") == "websocket" {
			return
		}
		if r.URL.Path == "/" || (len(r.URL.Path) > 1 && r.URL.Path[1] != 'a') {
			return // Skip SPA/static
		}

		log.Printf("%s %s %d %s", r.Method, r.URL.Path, rw.status, time.Since(start).Round(time.Millisecond))
	})
}

func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("PANIC: %s %s: %v", r.Method, r.URL.Path, err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// Implement http.Hijacker so WebSocket upgrades work through the middleware.
func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := rw.ResponseWriter.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, fmt.Errorf("underlying ResponseWriter does not implement http.Hijacker")
}
