# ADR-0001: Single-File HTML Architecture

## Status
Accepted

## Context
We need a visualization tool to replay Claude Code session activity as an animated force-directed graph. The tool must be easy to distribute, run, and modify — no build step, no dependency management, no framework overhead.

Alternatives considered:
- **React/Vue SPA with bundler** — Requires Node.js, npm install, build step. Adds friction for a tool that's essentially a single-purpose viewer.
- **Electron app** — Heavy runtime for what's fundamentally a data viewer. Packaging and distribution overhead.
- **Python GUI (tkinter/Qt)** — Would need a separate graph library, lose browser's SVG/Canvas capabilities.
- **Multi-file vanilla JS** — Requires a server to avoid CORS issues with ES module imports, or a bundler.

## Decision
Build the entire application as a single self-contained HTML file (`index.html`) with inline CSS and JavaScript. Load D3.js v7 from CDN as the only external dependency.

## Consequences
- **Positive:** Zero build step. Copy one file, open in browser. Easy to modify — everything is in one place. Python server (`serve.py`) is optional convenience, not required for core replay functionality (drag-and-drop JSONL works without it).
- **Positive:** D3.js from CDN means no vendored dependencies to track.
- **Negative:** File is large (~70KB). No code splitting, tree-shaking, or minification. IDE experience is worse than multi-file (no per-class files).
- **Negative:** No TypeScript, no linting in CI. Relies on disciplined code organization within the file.
- **Accepted tradeoff:** For a developer tool used locally, simplicity and zero-friction wins over engineering rigor.
