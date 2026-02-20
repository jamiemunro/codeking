# Codeking Roadmap

## Vision

AI development workspace — not just a terminal wrapper. Worktree-isolated Claude Code sessions with a rich browser-based interface, accessible from anywhere.

## Phase 1 — Polish what exists

- [x] Terminal theme/readability (font, colors, contrast, spacing)
- [x] Better session cards (status indicators, elapsed time, last activity)
- [ ] Session naming and search
- [ ] Responsive layout improvements
- [x] Remove/rebrand Superposition references → Codeking

## Phase 2 — Living document

- [ ] Split-pane layout: terminal + markdown editor side by side
- [ ] Shared notepad per session — both user and Claude can read/write
- [ ] MCP tool for Claude to read/write the notepad
- [ ] Persistent across session restarts
- [ ] Export/import notes as markdown

## Phase 3 — Project workspace

- [ ] File browser for the worktree (tree view, file preview)
- [ ] File upload to worktree (seed data, config files, assets)
- [ ] MCP configuration UI per session (add/remove/edit MCP servers)
- [ ] Pass `--mcp-config` to Claude Code on session start
- [ ] Session environment variable management

## Phase 4 — Integrations

- [ ] Google Docs integration (read/write docs as context for Claude)
- [ ] A2UI renderer panel (Claude sends declarative UI, rendered alongside terminal)
- [ ] Rich previews for generated frontend components
- [ ] Webhook/notification support (session events → Slack, email)

## Phase 5 — Orchestrator / Dashboard Terminal

A persistent "control plane" terminal on the dashboard that manages and coordinates across sessions — modeled on the leader/teammate relationship in Claude Code agent teams.

- [ ] Dashboard terminal: a persistent PTY session tied to the workspace, not a single repo
- [ ] Orchestrator role: can spawn, monitor, and stop coding sessions from within the terminal
- [ ] Cross-session awareness: orchestrator can see status/output summaries of all running sessions
- [ ] Deployment commands: run deploy workflows (build, push, restart) from the orchestrator terminal
- [ ] Task delegation: send instructions to individual coding sessions (like a team lead assigning work)
- [ ] Session output tailing: orchestrator can pull recent output from any session without switching tabs
- [ ] Workflow scripts: user-defined multi-step workflows (e.g. "deploy staging" = build + test + push + restart)
- [ ] Event-driven triggers: orchestrator reacts to session events (idle, error, completion) and can take action
