# ADR-0003: Python HTTP Server with Session Browser and Live Mode

## Status
Accepted

## Context
The initial design was drag-and-drop only — user finds a `.jsonl` file in `~/.claude/projects/` and drops it on the page. This required users to navigate opaque directory structures with UUID filenames to find the session they want.

Additionally, watching a live session requires tailing a file that's being actively written to, which isn't possible from a static HTML file opened via `file://`.

Alternatives considered:
- **Node.js server** — Would work but adds a Node.js dependency. Python is more likely pre-installed.
- **Deno server** — Similar to Node.js. Less likely to be installed.
- **Browser extension** — Could access the filesystem directly. Much more complex to build and install.
- **Electron wrapper** — Solves filesystem access but heavy for this use case (see ADR-0001).

## Decision
Add `serve.py` — a zero-dependency Python 3 HTTP server that:
1. Scans `~/.claude/projects/` for session JSONL files
2. Extracts metadata (timestamps, tool usage, message counts) for a browseable card UI
3. Serves the HTML app and session data via REST API (`/api/sessions`, `/api/session?id=`)
4. Provides Server-Sent Events (SSE) for live tailing (`/api/live?id=`)
5. Opens files in the default editor (`/api/open?path=`)

Hash-based routing (`#live=ID`, `#replay=ID`) allows direct linking. `--live` flag auto-navigates to the most recently active session.

Large file optimization: files >5MB are scanned by reading only the first 200 and last 50 lines for metadata extraction.

## Consequences
- **Positive:** Session discovery is instant — cards show project path, timestamps, tool chips, message counts. No more hunting through UUIDs.
- **Positive:** Live mode enables watching Claude Code work in real-time via SSE.
- **Positive:** Zero dependencies beyond Python 3 stdlib (`http.server`, `json`, `pathlib`).
- **Negative:** Two files to manage instead of one. Server must be running for session browser and live mode (drag-and-drop still works without it).
- **Negative:** Single-threaded server. SSE live connections block other requests if many clients connect. Acceptable for local single-user tool.
