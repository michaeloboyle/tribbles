# ADR-0004: Bash Command Decomposition into Sub-Command Nodes

## Status
Accepted

## Context
Claude Code's Bash tool calls often contain compound commands: `git add . && git commit -m "msg"`, `ls -la /tmp | grep foo`, `mkdir -p dir && cd dir && npm init`. Representing each Bash call as a single node loses the detail of what actually happened.

The original implementation showed one "Bash" circle node per tool call. This was uninformative — a node labeled "Bash" connecting to extracted file paths didn't convey whether it was a git operation, a build command, or a filesystem operation.

## Decision
Parse bash command strings into individual sub-commands and represent each as a separate hexagon node. The parser:

1. **Tokenizes** on `&&`, `||`, `;`, and `|` operators while respecting:
   - Single and double quotes
   - `$()` subshell expressions (tracked via `parenDepth`)
2. **Extracts** program name, arguments, and file targets from each token
3. **Filters** shell syntax noise: keywords (`if/then/else/fi/for/while/...`), variable assignments (`VAR=val`), fragments with `${}()=[]"'`, bare numbers, leading dashes, path fragments
4. **Categorizes** commands (vcs, pkg, exec, fs, search, net, sys) for color coding
5. **Detects** inline code (`node -e`, `python3 -c`) and skips target extraction to avoid parsing code as file paths
6. Uses a **whitelist** of known file extensions (`REAL_EXTS`) instead of a broad `\.\w{1,6}` heuristic to prevent false positives (e.g., `args.length` matching as a `.length` file)

Sub-command tools like `git`, `npm`, `docker` show two-word display names (e.g., "git commit", "npm install").

## Consequences
- **Positive:** Each bash invocation unfolds into its constituent operations. A `git add && git commit && git push` becomes three distinct colored hexagons, each connecting to their file targets.
- **Positive:** Category-based coloring makes it visually obvious what kinds of operations dominated a session.
- **Negative:** Parser is heuristic-based — it will never handle 100% of bash syntax correctly. Exotic constructs (heredocs, process substitution, arrays) are not supported. Accepted because the goal is visualization, not a shell interpreter.
- **Negative:** Adds ~120 lines of parsing code. The parser was iteratively hardened through testing against 140+ real bash commands from actual sessions.
