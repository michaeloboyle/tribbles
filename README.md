# Tribbles

Session browser, replay visualizer, and activity analyzer for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Scans `~/.claude/projects/` for session files. Browse sessions grouped by day, replay them as animated force-directed graphs, watch active sessions live via SSE, and auto-generate daily/weekly narrative analysis of your work patterns.

Built by Michael O'Boyle + Claude Code.

## Quick Start

```bash
python3 serve.py
```

Opens `http://localhost:8777` with a session browser showing all your Claude Code sessions.

```bash
python3 serve.py --live          # jump to most recent active session
python3 serve.py --port 8082     # custom port
```

Or open `index.html` directly and drag-and-drop a `.jsonl` session file. No server needed for replay.

## Features

### Session Browser

Sessions are listed by day. Each day gets a summary card showing session count, total steps, context size, compaction count, and top tools. A weekly analysis card at the top aggregates stats across all visible days with project-area breakdowns and automated waste/pattern warnings.

### Session Replay

Animated D3.js force-directed graph that replays a session step-by-step. File nodes (rectangles) persist and accumulate. Tool call nodes (circles) and bash sub-commands (hexagons) appear as the session progresses.

| Control | Action |
|---------|--------|
| Space | Play / Pause |
| Left / Right | Step backward / forward |
| Home / End | Jump to start / end |
| Speed slider | 100ms to 3000ms per step |
| Progress bar | Seek to any step |
| Scroll wheel | Zoom graph |
| Drag nodes | Rearrange layout |
| Click file link | Open in default editor |

### Live Streaming

Watch an active session in real-time. New tool calls and file references appear as they happen via server-sent events.

### Session Analysis

On first page load, Tribbles auto-generates daily and weekly narrative analyses by calling Claude CLI in the background. Each analysis includes:

- **Project area breakdown** with percentage allocation and qualitative status
- **What shipped** — concrete deliverables identified from session topics
- **Waste signals** — reverts, abandoned work, excessive deploys
- **Patterns** — behavioral observations about work habits

Analyses are cached as JSON in `analyses/` and rendered as cards at the appropriate date position in the session list. Generation runs at most 2 concurrent Claude CLI calls and skips days already analyzed.

### DevTools Bridge

Browser extension integration that sends DOM context (element styles, console errors, network failures, component state) to Tribbles, which spawns a Claude Code session with full runtime context to fix issues directly. Before/after screenshots are captured automatically.

## Graph Legend

- **Rectangles** (blue) — Files. Persist across steps; accumulate as the session touches more files.
- **Circles** — Tool calls. Color-coded: Read (green), Write (orange), Edit (yellow), Bash (red), Grep/Glob (purple), Task (pink), Web (teal).
- **Hexagons** — Bash sub-commands. Compound commands decompose into individual nodes, color-coded by category (git, npm, filesystem, exec, search, network, system).

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all sessions with metadata |
| `/api/session?id=ID` | GET | Fetch full session JSONL |
| `/api/live?id=ID` | GET | SSE stream of new session lines |
| `/api/active` | GET | Most recently active session |
| `/api/report?days=N` | GET | Computed daily stats for last N days (1-30) |
| `/api/analyses` | GET | Stored narrative analyses; triggers generation for missing periods |
| `/api/prompt` | POST | Start a new Claude Code session |
| `/api/prompt/respond` | POST | Send input to an interactive session |
| `/api/prompt/stop` | POST | Stop a running session |
| `/api/devtools/session` | POST | Create session with DevTools DOM context |
| `/api/open?path=PATH` | GET | Open a file in default editor |

## Architecture

See [docs/ADRs/](docs/ADRs/) for architectural decisions:

- [ADR-0001](docs/ADRs/0001-single-file-html-architecture.md) — Single-file HTML, no build step
- [ADR-0002](docs/ADRs/0002-d3-force-directed-graph.md) — D3.js force-directed graph
- [ADR-0003](docs/ADRs/0003-python-server-session-browser.md) — Python server with session browser
- [ADR-0004](docs/ADRs/0004-bash-command-decomposition.md) — Bash command decomposition
- [ADR-0005](docs/ADRs/0005-node-type-visual-encoding.md) — Visual encoding by node type
- [ADR-0006](docs/ADRs/0006-devtools-bridge-integration.md) — DevTools Bridge integration

## Requirements

- Python 3.8+
- A modern browser (Chrome, Firefox, Safari, Edge)
- D3.js v7 (loaded from CDN)
- Claude CLI (for session analysis generation; optional)

## License

MIT
