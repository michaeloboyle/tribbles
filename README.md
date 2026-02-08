# Claude Code Activity Visualizer

Animated force-directed graph that replays Claude Code sessions step-by-step. Watch tool calls, file references, and message flow unfold as an interactive D3.js visualization.

Built by Michael O'Boyle + Claude Code.

## Usage

### Quick start (server mode)

```bash
python3 serve.py
```

Opens a session browser at `http://localhost:8777` showing all Claude Code sessions found in `~/.claude/projects/`. Click a session card to replay it.

### Live mode

```bash
python3 serve.py --live
```

Jumps directly to the most recently active session and streams new activity in real-time via SSE.

### Drag and drop

Open `index.html` directly in a browser and drag a `.jsonl` session file onto the page. No server required.

### Options

```
python3 serve.py [--port PORT] [--live]
```

## Controls

| Control | Action |
|---------|--------|
| Space | Play / Pause |
| Left / Right | Step backward / forward |
| Home / End | Jump to start / end |
| Speed slider | 100ms to 3000ms per step |
| Progress bar | Seek to any step |
| Scroll wheel | Zoom graph |
| Drag nodes | Rearrange graph layout |
| Click file link | Open file in default editor |

## Graph Legend

- **Rectangles** (blue) — Files. Persist across all steps; accumulate as the session touches more files.
- **Circles** — Tool calls. Color-coded: Read (green), Write (orange), Edit (yellow), Bash (red), Grep/Glob (purple), Task (pink), Web (teal).
- **Hexagons** — Bash sub-commands. Compound commands like `git add && git commit` decompose into individual nodes, color-coded by category (VCS, package, filesystem, exec, search, network, system).

## API Endpoints

When running `serve.py`:

| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions` | List all sessions with metadata |
| `GET /api/session?id=ID` | Fetch full session JSONL |
| `GET /api/live?id=ID` | SSE stream of new session lines |
| `GET /api/active` | Most recently active session |
| `GET /api/open?path=PATH` | Open a file in the default editor |

## Architecture

See [docs/ADRs/](docs/ADRs/) for architectural decisions:

- [ADR-0001](docs/ADRs/0001-single-file-html-architecture.md) — Single-file HTML, no build step
- [ADR-0002](docs/ADRs/0002-d3-force-directed-graph.md) — D3.js force-directed graph
- [ADR-0003](docs/ADRs/0003-python-server-session-browser.md) — Python server with session browser
- [ADR-0004](docs/ADRs/0004-bash-command-decomposition.md) — Bash command decomposition
- [ADR-0005](docs/ADRs/0005-node-type-visual-encoding.md) — Visual encoding by node type

## Requirements

- A modern browser (Chrome, Firefox, Safari, Edge)
- Python 3.6+ (for `serve.py`; optional if using drag-and-drop)
- D3.js v7 loaded from CDN (requires internet on first load)
