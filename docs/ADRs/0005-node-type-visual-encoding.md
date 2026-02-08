# ADR-0005: Node Type Visual Encoding (Shape, Color, Persistence)

**GitHub Issue:** [#5](https://github.com/michaeloboyle/claude-code-activity-viz/issues/5)

## Status
Accepted

## Context
The graph contains multiple entity types: files, tool calls (Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch, WebSearch), user messages, assistant text, and bash sub-commands. Users need to distinguish these at a glance without reading labels.

## Decision
Encode node type through three visual channels:

**Shape:**
- **Rounded rectangle** — File nodes (persistent, appear once, never removed)
- **Circle** — Tool call nodes (one per invocation, fade after their step)
- **Hexagon** — Bash sub-command nodes (decomposed from compound bash commands)
- **Pill/rounded rect** — User messages, assistant text

**Color by tool/category:**
| Type | Color | Hex |
|------|-------|-----|
| File | Light blue | `#74b9ff` |
| Read | Green | `#27ae60` |
| Write | Orange | `#e67e22` |
| Edit | Yellow | `#f1c40f` |
| Bash | Red | `#e74c3c` |
| Grep/Glob | Purple | `#9b59b6` |
| Task | Pink | `#e84393` |
| Web | Teal | `#00b894` |
| User | Blue | `#4a90d9` |
| Assistant | Gray | `#636e72` |

Bash sub-commands use category-specific colors: VCS (orange), package (teal), filesystem (blue), exec (yellow), search (purple), network (pink), system (gray).

**Persistence:**
- File nodes persist across all steps — they accumulate as the session progresses, building up a map of touched files.
- Tool/message nodes are transient — they appear at their step and dim to 0.5 opacity as the animation advances.
- Active step nodes get a white glow filter.

**Edges:**
- Tool-to-file edges are colored by operation type and have arrow markers.
- Sequential flow edges (within a turn) are gray dashed lines.

## Consequences
- **Positive:** Three independent visual channels (shape + color + persistence) allow rapid identification without reading labels. File accumulation creates a growing "map" of the session's filesystem footprint.
- **Positive:** Color legend in bottom-right corner provides a key.
- **Negative:** Color palette is hardcoded. Users with color vision deficiency may struggle to distinguish some pairs (green/orange, purple/pink). Shape encoding partially mitigates this.
