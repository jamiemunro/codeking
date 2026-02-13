.PHONY: dev dev-backend dev-frontend build clean

# Development - run backend and frontend separately
dev-backend:
	go run main.go

dev-frontend:
	cd web && npm run dev

# Build frontend then compile Go binary with embedded SPA
build:
	cd web && npm install && npm run build
	CGO_ENABLED=1 go build -o superposition .

clean:
	rm -f superposition
	rm -rf web/dist web/node_modules
