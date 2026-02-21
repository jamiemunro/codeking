# Forge Roadmap

## Vision

AI development workspace — not just a terminal wrapper. Worktree-isolated Claude Code sessions with a rich browser-based interface, accessible from anywhere.

## Phase 1 — Polish what exists

- [x] Terminal theme/readability (font, colors, contrast, spacing)
- [x] Better session cards (status indicators, elapsed time, last activity)
- [x] Auto-generated branch names (session/YYYY-MM-DD-HHMM)
- [x] Source branch defaults to main/master
- [ ] Session naming and search
- [ ] Responsive layout improvements
- [x] Remove/rebrand Superposition references → Forge

## Phase 2 — Living document

- [x] Split-pane layout: terminal + markdown editor side by side
- [x] Shared notepad per session — both user and Claude can read/write
- [x] MCP tool for Claude to read/write the notepad
- [x] Persistent across session restarts
- [ ] Export/import notes as markdown

## Phase 2.5 — File upload

- [x] `POST /api/sessions/{id}/upload` endpoint — writes files to session worktree
- [x] Drop zone in session UI — drag & drop files/screenshots onto the session
- [x] File picker button for selecting files from disk
- [x] Upload progress indicator and file path display (so Claude can reference uploaded files)
- [x] Max file size limit and allowed types validation

## Phase 3 — Project workspace

- [x] File browser for the worktree (tree view, file preview)
- [x] MCP configuration UI per session (add/remove/edit MCP servers)
- [x] Pass `--mcp-config` to Claude Code on session start (via .mcp.json auto-discovery)
- [x] Session environment variable management

## Phase 4 — Integrations

- [ ] Google Docs integration (read/write docs as context for Claude)
- [x] A2UI renderer panel (Claude sends declarative UI, rendered alongside terminal)
- [x] Rich previews for generated frontend components (via A2UI elements: code, table, image)
- [x] Webhook/notification support (session events → Slack, email)

## Phase 5 — Orchestrator / Dashboard Terminal

A persistent "control plane" terminal on the dashboard that manages and coordinates across sessions — modeled on the leader/teammate relationship in Claude Code agent teams.

- [x] Dashboard terminal: a persistent PTY session tied to the workspace, not a single repo
- [x] Orchestrator role: can spawn, monitor, and stop coding sessions from within the terminal
- [x] Cross-session awareness: orchestrator can see status/output summaries of all running sessions
- [x] Deployment commands: run deploy workflows (build, push, restart) from the orchestrator terminal
- [x] Task delegation: send instructions to individual coding sessions (like a team lead assigning work)
- [x] Session output tailing: orchestrator can pull recent output from any session without switching tabs
- [x] Workflow scripts: user-defined multi-step workflows (e.g. "deploy staging" = build + test + push + restart)
- [x] Event-driven triggers: orchestrator reacts to session events (idle, error, completion) and can take action

## Phase 6 — Live Preview & Browser Automation

Embed running apps directly in the Forge UI. Sessions spawn dev servers, Forge proxies them, and you see the live product next to the terminal. Combined with headless browser automation, Claude can build, preview, and design-test in a closed loop.

### Live Preview
- [ ] Port proxy: Go backend reverse-proxies session dev server ports via `/preview/{sessionId}/`
- [ ] WebSocket proxy for HMR/live reload passthrough
- [ ] Port detection: parse PTY output for "localhost:NNNN" patterns, or manual config per session
- [ ] Split-pane UI: terminal + iframe preview side by side (resizable)
- [ ] Preview toolbar: URL bar, refresh, viewport size presets (mobile/tablet/desktop)
- [ ] Multi-port support: some projects run frontend + API on different ports

### Browser Automation
- [ ] Headless Chrome + Playwright installed on server
- [ ] MCP tool for Claude sessions to drive the browser (navigate, click, screenshot, assert)
- [ ] Screenshot streaming: render screenshots inline in the Forge UI (not just terminal)
- [ ] Visual regression: compare screenshots before/after changes, flag differences
- [ ] Design feedback loop: Claude edits code → HMR reloads → Playwright screenshots → Claude evaluates the result

### Design Testing
- [ ] Responsive testing: automated screenshot matrix across viewport sizes
- [ ] Component isolation: preview individual components via Storybook-style URLs
- [ ] Accessibility audit: run axe-core via Playwright, surface issues in the UI
- [ ] User flow testing: Claude can script multi-page interactions and verify outcomes
