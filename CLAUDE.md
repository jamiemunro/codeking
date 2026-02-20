# Codeking

Fork of [trezm/superposition](https://github.com/trezm/superposition) (MIT License).

AI coding session manager — bare-clones repos, creates isolated git worktrees, and spawns CLI processes (Claude Code, Codex, Gemini) with PTY streams to the browser.

## Build

```bash
# Full build (frontend + Go binary)
make build

# Frontend only
cd web && npm install && npm run build

# Go binary only (requires web/dist to exist)
go build .
```

## Lint / Check (run before pushing)

```bash
# Go
go vet ./...

# Web (from web/ directory)
cd web && npx eslint src --max-warnings=0
cd web && npx tsc --noEmit
cd web && npx prettier --check "src/**/*.{ts,tsx,css}"

# Fix Prettier formatting
cd web && npx prettier --write "src/**/*.{ts,tsx,css}"
```

## Architecture

- **Backend:** Go with embedded React SPA, SQLite, WebSocket terminal I/O
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, xterm.js
- **Data dir:** `~/.superposition/` (repos, worktrees, DB, shepherd socket)
- **Bare clones:** `~/.superposition/repos/{owner}/{name}.git` (GitHub) or `~/.superposition/repos/local/{name}.git` (local)
- **Worktrees:** `~/.superposition/worktrees/{uuid}`

## Key directories

- `migrations/` — SQLite migrations (run sequentially in main.go, use CREATE TABLE IF NOT EXISTS + copy-drop-rename pattern for ALTERs)
- `internal/api/` — REST handlers
- `internal/git/` — bare clone, fetch, worktree operations
- `internal/models/` — data structs
- `internal/shepherd/` — long-lived PTY process manager (survives server restarts)
- `internal/pty/` — in-process PTY manager (fallback when shepherd unavailable)
- `internal/preflight/` — CLI availability checks on startup
- `internal/gateway/` — reverse-tunnel proxy for remote access
- `web/src/lib/api.ts` — frontend API client
- `web/src/pages/` — page components
- `web/src/components/` — shared components (NewSessionModal, Terminal, Layout)

## How sessions work

1. User creates session → API handler calls `resolveCommand(db, cliType)` to look up CLI command override from settings DB
2. If no override, falls back to bare CLI name (e.g. `claude`)
3. Shepherd spawns the command in a PTY via `creack/pty` with `cmd.Env = os.Environ()`
4. PTY output streamed to browser via WebSocket + xterm.js
5. Shepherd keeps sessions alive across server restarts via Unix socket at `~/.superposition/shepherd.sock`

## Conventions

- Commit messages: imperative mood, short summary line
- Go: standard library style, no frameworks beyond gorilla/websocket
- Frontend: functional components, Tailwind for styling, no CSS modules
- Migrations: numbered `NNN_description.sql`, registered manually in `main.go`

## Deployment (Production)

**Server:** Hetzner CX23 (2 vCPU, 4GB), Nuremberg
**URL:** https://codeking.isolater.app
**IP:** 46.225.118.71
**SSH:** `ssh root@46.225.118.71`

### Services on the server

| Service | Systemd unit | Port | Notes |
|---------|-------------|------|-------|
| Superposition | `superposition.service` | 8800 | Binary at `/opt/superposition/superposition`, `KillMode=process` so shepherd survives restarts |
| Caddy | `caddy.service` | 443/80 | Reverse proxy, auto-TLS, basic auth |
| ttyd | `ttyd.service` | 7681 | Web terminal at `/terminal/` |

### Deploy workflow

Run SSH commands in **separate small steps** — long chains drop the connection.

**CRITICAL: Do NOT kill shepherd during deploys.** Shepherd is designed to survive server
restarts. It runs as an independent process (Setsid, detached). The new server process
reconnects to the existing shepherd via Unix socket, and `reconcileSessions()` re-adopts
all alive sessions. Active PTY sessions, replay buffers, and browser connections all survive.

```bash
# 1. Push from local
git push origin main

# 2. Pull and build frontend
ssh root@46.225.118.71 'cd /opt/superposition && git pull && cd web && npm install && npm run build'

# 3. Build Go binary (go is not in default PATH for non-interactive SSH)
ssh root@46.225.118.71 'export PATH=$PATH:/usr/local/go/bin && cd /opt/superposition && CGO_ENABLED=1 go build -o superposition .'

# 4. Restart service (shepherd stays alive — sessions survive)
ssh root@46.225.118.71 'systemctl restart superposition'

# 5. Verify
ssh root@46.225.118.71 'systemctl is-active superposition'
curl -s -o /dev/null -w "%{http_code}" https://codeking.isolater.app/  # 401 = OK (behind basic auth)
```

### Deploy rules

- **NEVER kill shepherd** unless you changed code in `internal/shepherd/`. Killing shepherd
  destroys all active PTY sessions. The whole point of shepherd is session survival across deploys.
- **Go PATH:** Non-interactive SSH doesn't load shell profile. Always prepend `export PATH=$PATH:/usr/local/go/bin` before `go` commands.
- **Small SSH steps:** Don't chain all commands in one SSH call — the connection drops on long-running builds. Use separate `ssh` invocations per step.
- **Health check:** `curl` returns 401 (Caddy basic auth) — that means the server is up. A 5xx or connection refused means something is wrong.
- **Frontend-only changes:** If only `web/` files changed, skip steps 3-4 (Go build). Just build frontend and restart.
- **Shepherd code changes only:** If `internal/shepherd/` was modified, kill shepherd after building: `ssh root@... 'pgrep -f shepherd && pkill -f shepherd || true'`, then restart. Accept that active sessions will be lost.

### Auth

Claude Code is authenticated via interactive OAuth login (`claude auth login`) on the server.
Do NOT use `CLAUDE_CODE_OAUTH_TOKEN` env var — it causes 401 errors and overrides the working OAuth login.
If auth expires, use the web terminal at `/terminal/` to re-run `claude auth login`.

### DNS

`codeking.isolater.app` → A record on Cloudflare (isolater.app zone), proxy OFF (grey cloud), pointing to 46.225.118.71.

## Upstream sync

```bash
git fetch upstream
git merge upstream/main
# Resolve conflicts if any
git push origin main
```

## Remotes

- `origin` → github.com/jamiemunro/codeking (your fork)
- `upstream` → github.com/trezm/superposition (original)
