# Roadmap

## Project History

```mermaid
gantt
    title Claude Code Activity Visualizer
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Core
    Initial scaffold & .gitignore           :done, 2026-02-06, 1d
    D3.js force-directed graph visualizer    :done, 2026-02-06, 1d
    Session browser & live SSE streaming     :done, 2026-02-06, 1d
    Performance: scan optimization, port reuse :done, 2026-02-06, 1d

    section Bash Decomposition
    Decompose bash into sub-command hexagons :done, 2026-02-06, 1d
    Fix shell syntax noise (keywords, subshells) :done, 2026-02-06, 1d
    Fix inline code targets (REAL_EXTS whitelist) :done, 2026-02-06, 1d

    section Interaction
    Cmd+click file nodes to open in editor   :done, 2026-02-07, 1d
    Clickable file links in message log      :done, 2026-02-07, 1d

    section Repo Hygiene
    Architecture Decision Records (5 ADRs)   :done, 2026-02-07, 1d
    GitHub remote, README, roadmap           :done, 2026-02-08, 1d
    GitHub Issues linked to ADRs             :done, 2026-02-08, 1d

    section Future
    Session comparison (diff two sessions)   :future, 2026-02-15, 7d
    Token cost visualization (burn-down)     :future, 2026-02-15, 5d
    Export graph as SVG/PNG                   :future, 2026-02-20, 3d
    Session search/filter in browser         :future, 2026-02-20, 5d
    Collapsible directory groups for file nodes :future, 2026-02-22, 5d
```

## Planned Features

- **Session comparison** — Load two sessions side-by-side, highlight differences in tool usage and file coverage
- **Token cost visualization** — Burn-down chart showing token consumption over session steps
- **Export** — Save current graph state as SVG or PNG
- **Session search** — Filter sessions by project path, date range, or tool usage patterns
- **Directory collapsing** — Group file nodes by directory when >30 files are visible
