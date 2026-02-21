# ADR-0006: DevTools Bridge — Browser Console to Claude Code Runtime Bridge

**GitHub Issue:** [#6](https://github.com/michaeloboyle/claude-code-activity-viz/issues/6)

## Status
Accepted

## Context
The Session Visualizer runs at localhost:8777 and renders Claude Code session activity as a force-directed graph. When a UX issue is observed (missing hover state, layout bug, accessibility gap), fixing it requires:

1. Observe the issue in the browser
2. Switch to terminal
3. Describe the issue to Claude Code in natural language
4. Claude Code searches for the relevant file
5. Fix applied, refresh browser to verify

This 5-step loop loses fidelity at every hop. The bridge eliminates steps 2-4 by capturing DOM context directly and feeding it to Claude Code with the relevant runtime state.

## Decision
Embed `devtools-bridge.js` (symlinked from PKM) in the visualizer, providing `window.__claude` console API. Add `POST /api/devtools/session` endpoint to `serve.py` that accepts browser context and spawns a Claude Code session via `ClaudeProcess`.

### Architecture

```
Browser (localhost:8777)
├── devtools-bridge.js (symlink → PKM)
│   ├── __claude.fix(desc) — capture DOM context + create fix session
│   ├── __claude.audit() — accessibility audit (local, instant)
│   ├── __claude.perf() — performance snapshot (local, instant)
│   ├── __claude.resolve(id, outcome) — close telemetry loop
│   ├── __claude.metrics() — fix telemetry dashboard
│   └── 10+ more commands (see __claude.help())
│
serve.py
├── POST /api/devtools/session
│   ├── Receives context bundle from bridge
│   ├── build_devtools_prompt() assembles structured prompt
│   └── ClaudeProcess.start(prompt) spawns session
│
ClaudeProcess
├── Claude Code CLI (--output-format stream-json)
├── Receives context-enriched prompt
├── Maps DOM elements → source files
└── Edits code, HMR/refresh shows results
```

### Telemetry
Every session-creating call logs a fix entry with:
- Context size, sections sent, session name
- Duration, outcome (success/failure/partial via `__claude.resolve()`)
- Aggregated via `__claude.metrics()` for self-improvement feedback

## Consequences

**Positive:**
- Feedback loop drops from minutes to seconds
- DOM context (3,243 elements) vs screenshots (~20 above-fold)
- Autonomous fixes with no human intervention for known patterns
- Built-in telemetry enables self-improvement loops

**Negative:**
- Additional script loaded in browser
- Security surface: browser → filesystem bridge (mitigated: localhost only)
- Claude sessions created programmatically need monitoring

## References
- PKM source: `System/Scripts/claude-remote/devtools-bridge.js`
- PKM ADR: `System/ADRs/0013-devtools-bridge.md`
- PKM benchmarks: `System/ADRs/0013-devtools-bridge-benchmarks.md`
- Symlink: `devtools-bridge.js → PKM source`
