package web

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed dist/*
var distFS embed.FS

func SPAHandler() http.Handler {
	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(dist))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Try to serve the file directly
		if path != "/" && !strings.HasPrefix(path, "/api") && !strings.HasPrefix(path, "/ws") {
			if f, err := dist.(fs.ReadFileFS).ReadFile(strings.TrimPrefix(path, "/")); err == nil && f != nil {
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// SPA fallback: serve index.html for all unmatched routes
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}
