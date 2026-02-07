# ADR-0002: D3.js Force-Directed Graph for Visualization

## Status
Accepted

## Context
The visualization needs to show relationships between tool calls and files as an animated, interactive graph — inspired by memory-graph.com which uses Viz.js for Python object/reference visualization.

Alternatives considered:
- **Viz.js / Graphviz (WASM)** — memory-graph.com's approach. Good for hierarchical layouts but produces static renders per frame. No smooth animation between states, no drag-to-rearrange. Would need full re-render each step.
- **Cytoscape.js** — Full-featured graph library. More API surface than needed. Heavier than D3 for our use case.
- **vis.js Network** — Simpler API but less control over rendering and animation. Abandoned/unmaintained.
- **Canvas-based (Sigma.js, Pixi)** — Better for 10K+ nodes. Our graphs are <200 nodes; SVG is fine and gives free DOM events/CSS styling.

## Decision
Use D3.js v7 force simulation with SVG rendering. Nodes are SVG groups (`<g>`) with shapes (rect for files, circle for tools, polygon for bash sub-commands). Edges are SVG `<line>` elements with arrow markers.

Force configuration:
- Link force with distance based on edge type
- Charge repulsion (many-body force) to spread nodes
- Center force to keep graph centered
- Collision force to prevent overlap

## Consequences
- **Positive:** Smooth animation as nodes enter/exit. Drag-to-rearrange works naturally. Zoom/pan via `d3.zoom()`. Fine-grained control over transitions, opacity, glow effects.
- **Positive:** D3 is the standard — well-documented, performant for our scale, no bundling needed (CDN).
- **Negative:** Force layout is non-deterministic — same session won't produce identical layouts. Acceptable for an exploration tool.
- **Negative:** D3's enter/update/exit pattern has a learning curve and makes the code verbose.
