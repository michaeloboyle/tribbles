#!/usr/bin/env python3
"""Local server for Claude Code Session Visualizer.

Scans ~/.claude/projects/ for session files, serves a picker UI,
and streams live session activity via SSE. No hunting for files.

Usage:
    python serve.py              # scan, serve, open browser
    python serve.py --port 8888  # custom port
    python serve.py --live       # open directly to live view of active session
"""

import http.server
import glob as globmod
import json
import os
import signal
import subprocess
import sys
import time
import uuid
import webbrowser
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs

CLAUDE_DIR = Path.home() / ".claude" / "projects"
PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8777
LIVE_MODE = "--live" in sys.argv
SCRIPT_DIR = Path(__file__).parent
SNAPSHOTS_DIR = SCRIPT_DIR / "fix-snapshots"
ANALYSES_DIR = SCRIPT_DIR / "analyses"

# Resolve the claude binary — prefer ~/.claude/local/claude over PATH
_local_claude = Path.home() / ".claude" / "local" / "claude"
CLAUDE_BIN = str(_local_claude) if _local_claude.exists() else "claude"


class ClaudeProcess:
    """Singleton tracking the active Claude CLI subprocess."""
    process = None        # subprocess.Popen
    session_id = None     # UUID string
    mode = None           # "new" or "resume"
    error = None          # error message if failed
    started_at = None     # time.time()
    thread = None         # threading.Thread running the process
    output_lines = []     # captured stdout lines
    output_lock = threading.Lock()
    waiting_for_input = False  # True when Claude is prompting the user
    lock = threading.Lock()

    @classmethod
    def is_running(cls):
        with cls.lock:
            return cls.process is not None and cls.process.poll() is None

    @classmethod
    def start(cls, prompt, session_id=None, skip_permissions=False):
        with cls.lock:
            if cls.process is not None and cls.process.poll() is None:
                return None, "Claude is already running"

            cls.error = None
            cls.waiting_for_input = False
            cls.interactive = not skip_permissions
            with cls.output_lock:
                cls.output_lines = []

            if cls.interactive:
                # Interactive mode: use stream-json for multi-turn
                cmd = [CLAUDE_BIN, "--print",
                       "--output-format", "stream-json",
                       "--input-format", "stream-json",
                       "--verbose"]
                if session_id:
                    cls.session_id = session_id
                    cls.mode = "resume"
                    cmd.extend(["--resume", session_id])
                else:
                    cls.session_id = str(uuid.uuid4())
                    cls.mode = "new"
                    cmd.extend(["--session-id", cls.session_id])
            else:
                # Auto-approve mode: single-shot, close stdin
                if session_id:
                    cls.session_id = session_id
                    cls.mode = "resume"
                    cmd = [
                        CLAUDE_BIN, "--resume", session_id,
                        "--print", prompt,
                        "--dangerously-skip-permissions",
                    ]
                else:
                    cls.session_id = str(uuid.uuid4())
                    cls.mode = "new"
                    cmd = [
                        CLAUDE_BIN, "--print", prompt,
                        "--session-id", cls.session_id,
                        "--dangerously-skip-permissions",
                    ]

            cls.started_at = time.time()
            initial_prompt = prompt  # capture for thread

            def run():
                try:
                    # Clean env: remove CLAUDECODE to allow spawning
                    # from inside an existing Claude Code session
                    clean_env = {k: v for k, v in os.environ.items()
                                 if k != "CLAUDECODE"}
                    cls.process = subprocess.Popen(
                        cmd,
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        env=clean_env,
                    )

                    if cls.interactive:
                        # Send the initial prompt via stream-json stdin
                        msg = json.dumps({
                            "type": "user",
                            "message": {
                                "role": "user",
                                "content": [{"type": "text", "text": initial_prompt}]
                            }
                        })
                        cls.process.stdin.write((msg + "\n").encode("utf-8"))
                        cls.process.stdin.flush()
                    else:
                        # Non-interactive: close stdin so Claude exits after responding
                        try:
                            cls.process.stdin.close()
                        except Exception:
                            pass

                    # Read stdout in a background thread to capture output
                    stdout_thread = threading.Thread(
                        target=cls._read_stdout, daemon=True
                    )
                    stdout_thread.start()

                    cls.process.wait()
                    stdout_thread.join(timeout=2)

                    if cls.process.returncode != 0:
                        stderr = cls.process.stderr.read().decode("utf-8", errors="replace")
                        cls.error = stderr[:500] if stderr else f"Exit code {cls.process.returncode}"
                except Exception as e:
                    cls.error = str(e)
                finally:
                    cls.waiting_for_input = False

            cls.thread = threading.Thread(target=run, daemon=True)
            cls.thread.start()
            return cls.session_id, None

    @classmethod
    def _read_stdout(cls):
        """Read stdout line by line, extract text and detect completion."""
        try:
            for raw_line in iter(cls.process.stdout.readline, b""):
                line = raw_line.decode("utf-8", errors="replace").rstrip("\n")
                if not line.strip():
                    continue

                if cls.interactive:
                    # In stream-json mode, parse JSON messages
                    try:
                        data = json.loads(line)
                        msg_type = data.get("type", "")

                        if msg_type == "assistant":
                            content = data.get("message", {}).get("content", [])
                            for block in content:
                                if block.get("type") == "text":
                                    text = block["text"]
                                    with cls.output_lock:
                                        cls.output_lines.append(text)
                                        if len(cls.output_lines) > 200:
                                            cls.output_lines = cls.output_lines[-200:]
                                    # Detect questions — Claude is waiting for user
                                    if text.rstrip().endswith("?"):
                                        cls.waiting_for_input = True
                                elif block.get("type") == "tool_use":
                                    tool_name = block.get("name", "")
                                    with cls.output_lock:
                                        cls.output_lines.append(f"[Using {tool_name}...]")

                        elif msg_type == "result":
                            # Session turn completed
                            result_text = data.get("result", "")
                            if result_text:
                                with cls.output_lock:
                                    cls.output_lines.append(f"--- Done ---")
                            # In interactive mode, Claude waits for next input after result
                            cls.waiting_for_input = True

                    except json.JSONDecodeError:
                        with cls.output_lock:
                            cls.output_lines.append(line)
                else:
                    # Plain text mode
                    with cls.output_lock:
                        cls.output_lines.append(line)
                        if len(cls.output_lines) > 200:
                            cls.output_lines = cls.output_lines[-200:]

        except (ValueError, OSError):
            pass

    @classmethod
    def respond(cls, text):
        """Send a response to Claude's stdin."""
        with cls.lock:
            if cls.process is None or cls.process.poll() is not None:
                return False, "No running process"
            if not cls.interactive:
                return False, "Not in interactive mode"
            try:
                # Send as stream-json user message
                msg = json.dumps({
                    "type": "user",
                    "message": {
                        "role": "user",
                        "content": [{"type": "text", "text": text}]
                    }
                })
                cls.process.stdin.write((msg + "\n").encode("utf-8"))
                cls.process.stdin.flush()
                cls.waiting_for_input = False
                return True, None
            except (BrokenPipeError, OSError) as e:
                return False, str(e)

    @classmethod
    def stop(cls):
        with cls.lock:
            if cls.process is None or cls.process.poll() is not None:
                return False
            try:
                # Close stdin first to signal EOF
                try:
                    cls.process.stdin.close()
                except Exception:
                    pass
                cls.process.terminate()
                # Give it 3 seconds to terminate gracefully
                for _ in range(30):
                    if cls.process.poll() is not None:
                        return True
                    time.sleep(0.1)
                cls.process.kill()
            except Exception:
                pass
            return True

    @classmethod
    def status(cls):
        with cls.lock:
            running = cls.process is not None and cls.process.poll() is None
            elapsed = time.time() - cls.started_at if cls.started_at and running else None
            with cls.output_lock:
                # Return last 20 lines of output
                recent_output = list(cls.output_lines[-20:])
            return {
                "running": running,
                "sessionId": cls.session_id,
                "mode": cls.mode,
                "error": cls.error,
                "elapsed": round(elapsed, 1) if elapsed else None,
                "waitingForInput": cls.waiting_for_input,
                "output": recent_output,
            }

    @classmethod
    def find_session_file(cls, session_id):
        """Find the JSONL file for a session ID, searching all project dirs."""
        pattern = str(CLAUDE_DIR / "*" / f"{session_id}.jsonl")
        matches = globmod.glob(pattern)
        return matches[0] if matches else None


def scan_sessions():
    """Scan all project directories for session .jsonl files."""
    sessions = []
    if not CLAUDE_DIR.exists():
        return sessions

    for project_dir in CLAUDE_DIR.iterdir():
        if not project_dir.is_dir():
            continue

        project_name = project_dir.name
        display_project = project_name.replace("-", "/")

        for jsonl_file in sorted(project_dir.glob("*.jsonl"), key=lambda f: f.stat().st_mtime, reverse=True):
            if jsonl_file.name.startswith("agent-"):
                continue

            stat = jsonl_file.stat()
            if stat.st_size == 0:
                continue

            meta = extract_metadata(jsonl_file)
            if not meta:
                continue

            # Is this session "active"? (modified in last 5 minutes)
            age_seconds = time.time() - stat.st_mtime
            is_active = age_seconds < 300

            sessions.append({
                "id": jsonl_file.stem,
                "project": display_project,
                "projectDir": project_name,
                "file": str(jsonl_file),
                "sizeBytes": stat.st_size,
                "sizeHuman": human_size(stat.st_size),
                "model": meta.get("model", ""),
                "version": meta.get("version", ""),
                "cwd": meta.get("cwd", ""),
                "startTime": meta.get("startTime", ""),
                "endTime": meta.get("endTime", ""),
                "firstMessage": meta.get("firstMessage", ""),
                "stepEstimate": meta.get("stepEstimate", 0),
                "toolCounts": meta.get("toolCounts", {}),
                "active": is_active,
                "modifiedAgo": human_age(age_seconds),
            })

    sessions.sort(key=lambda s: s.get("endTime", ""), reverse=True)
    return sessions


def extract_metadata(path):
    """Read a session file and extract key metadata.

    For large files (>5MB), only reads the first 200 and last 50 lines
    for speed. Full accuracy isn't needed for the browser listing.
    """
    meta = {}
    try:
        size = path.stat().st_size
        if size > 5 * 1024 * 1024:
            # Large file: read head + tail only
            lines = []
            with open(path, "r") as f:
                for i, line in enumerate(f):
                    if i < 200:
                        lines.append(line)
                    else:
                        break
            # Read last 50 lines
            with open(path, "rb") as f:
                f.seek(max(0, size - 100_000))
                tail = f.read().decode("utf-8", errors="replace")
                lines.extend(tail.strip().split("\n")[-50:])
        else:
            with open(path, "r") as f:
                lines = f.readlines()
    except Exception:
        return None

    if not lines:
        return None

    first_timestamp = None
    last_timestamp = None
    first_user_msg = None
    model = None
    version = None
    cwd = None
    visualizable = 0
    tool_counts = {}

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        entry_type = entry.get("type", "")

        if not version and entry.get("version"):
            version = entry["version"]
        if not cwd and entry.get("cwd"):
            cwd = entry["cwd"]

        ts = entry.get("timestamp")
        if ts:
            if not first_timestamp:
                first_timestamp = ts
            last_timestamp = ts

        if entry_type in ("progress", "file-history-snapshot", "queue-operation", "system"):
            continue

        msg = entry.get("message")
        if not msg:
            continue

        if not model and msg.get("model"):
            model = msg["model"]

        if entry_type == "user" and not first_user_msg:
            content = msg.get("content", "")
            if isinstance(content, str) and content.strip():
                first_user_msg = content.strip()[:120]
            elif isinstance(content, list):
                for block in content:
                    if block.get("type") == "text" and block.get("text", "").strip():
                        first_user_msg = block["text"].strip()[:120]
                        break

        if entry_type in ("user", "assistant"):
            visualizable += 1
            if entry_type == "assistant" and isinstance(msg.get("content"), list):
                for block in msg["content"]:
                    if block.get("type") == "tool_use":
                        name = block.get("name", "unknown")
                        tool_counts[name] = tool_counts.get(name, 0) + 1

    if not first_timestamp:
        return None

    short_model = model or ""
    for label in ("opus", "sonnet", "haiku"):
        if label in short_model.lower():
            parts = short_model.split("-")
            ver = parts[-1] if len(parts) > 1 else ""
            short_model = f"{label.title()} {ver}".strip()
            break

    meta["model"] = short_model
    meta["version"] = version or ""
    meta["cwd"] = cwd or ""
    meta["startTime"] = first_timestamp or ""
    meta["endTime"] = last_timestamp or ""
    meta["firstMessage"] = first_user_msg or "(no user message)"
    meta["stepEstimate"] = visualizable
    meta["toolCounts"] = tool_counts
    return meta


def human_size(nbytes):
    for unit in ("B", "KB", "MB", "GB"):
        if nbytes < 1024:
            return f"{nbytes:.1f} {unit}" if unit != "B" else f"{nbytes} B"
        nbytes /= 1024
    return f"{nbytes:.1f} TB"


def human_age(seconds):
    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        m = int(seconds / 60)
        return f"{m}m ago"
    elif seconds < 86400:
        h = int(seconds / 3600)
        return f"{h}h ago"
    else:
        d = int(seconds / 86400)
        return f"{d}d ago"


def parse_ts(ts_str):
    try:
        return datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
    except Exception:
        return datetime.fromtimestamp(0, tz=timezone.utc)


def compute_report(days_back):
    cutoff_ts = time.time() - (days_back * 86400)
    all_sessions = scan_sessions()
    in_range = [s for s in all_sessions
                if s.get('endTime') and parse_ts(s['endTime']).timestamp() > cutoff_ts]

    by_day = {}
    for s in in_range:
        if not s.get('startTime'):
            continue
        day = parse_ts(s['startTime']).strftime('%Y-%m-%d')
        by_day.setdefault(day, []).append(s)

    days = []
    for day in sorted(by_day.keys()):
        day_sessions = by_day[day]
        tool_totals = {}
        for s in day_sessions:
            for tool, count in (s.get('toolCounts') or {}).items():
                tool_totals[tool] = tool_totals.get(tool, 0) + count
        days.append({
            'date': day,
            'sessionCount': len(day_sessions),
            'totalSteps': sum(s['stepEstimate'] for s in day_sessions),
            'totalBytes': sum(s['sizeBytes'] for s in day_sessions),
            'topTools': sorted(tool_totals.items(), key=lambda x: -x[1])[:5],
            'compactions': sum(1 for s in day_sessions if s['sizeBytes'] > 5_000_000),
            'firstMessages': [s['firstMessage'] for s in day_sessions[:6]],
        })

    return {
        'range': days_back,
        'sessionCount': len(in_range),
        'days': days,
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }


# ── Analysis Generation ──────────────────────────────────────
_analysis_lock = threading.Lock()
_analysis_generating = set()  # keys currently being generated
_analysis_semaphore = threading.Semaphore(2)  # max 2 concurrent


def _analysis_exists(key):
    return (ANALYSES_DIR / f"{key}.json").exists()


def _build_analysis_prompt(day_data_list, start_date, end_date, period):
    """Build prompt for Claude to analyze session data."""
    lines = []
    for d in day_data_list:
        tools = ", ".join(f"{t[0]}:{t[1]}" for t in d.get("topTools", [])[:5])
        msgs = []
        for m in d.get("firstMessages", [])[:6]:
            clean = m.replace("\n", " ").strip()[:100]
            if clean:
                msgs.append(clean)
        topics = "; ".join(msgs)
        size_mb = round(d["totalBytes"] / 1048576, 1)
        lines.append(
            f"  {d['date']}: {d['sessionCount']} sessions, "
            f"{d['totalSteps']} steps, {size_mb}MB, "
            f"{d['compactions']} compactions, "
            f"tools=[{tools}], topics=[{topics}]"
        )

    session_block = "\n".join(lines)
    total_sessions = sum(d["sessionCount"] for d in day_data_list)
    total_compactions = sum(d["compactions"] for d in day_data_list)

    return f"""Analyze these Claude Code sessions. {period} period: {start_date} to {end_date}.

{session_block}

Return ONLY valid JSON, no markdown fences:
{{
  "startDate": "{start_date}",
  "endDate": "{end_date}",
  "title": "{period} Analysis",
  "headline": "{total_sessions} sessions summary line",
  "areas": [{{"name": "project-area", "pct": 0, "status": "one-line assessment"}}],
  "shipped": "what was completed or deployed",
  "waste": "time sinks, reverts, unproductive work (empty string if none)",
  "pattern": "behavioral observation about work patterns"
}}

Rules:
- Derive project areas from topics (group by project name visible in paths/messages)
- pct values must sum to 100
- Be terse, specific, not generic. Use the actual project names and details.
- status should characterize the outcome, not repeat the stats
- For 1-2 session days, be brief
- headline format: "N sessions · notable observation · notable observation"
- waste: only flag genuine waste (reverts, abandoned work, excessive deploys). Empty string if productive.
"""


def _run_analysis(key, day_data_list, start_date, end_date, period):
    """Generate an analysis via Claude CLI. Runs in background thread."""
    if not _analysis_semaphore.acquire(timeout=60):
        return
    try:
        out_path = ANALYSES_DIR / f"{key}.json"
        if out_path.exists():
            return

        prompt = _build_analysis_prompt(day_data_list, start_date, end_date, period)
        clean_env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

        result = subprocess.run(
            [CLAUDE_BIN, "--print", prompt, "--output-format", "text"],
            capture_output=True, text=True, timeout=120,
            env=clean_env,
        )

        if result.returncode != 0 or not result.stdout.strip():
            print(f"[analysis] Claude returned {result.returncode} for {key}")
            return

        text = result.stdout.strip()
        # Strip markdown fences if present
        if "```" in text:
            parts = text.split("```")
            text = parts[1] if len(parts) >= 3 else parts[-1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        analysis = json.loads(text)
        analysis["startDate"] = start_date
        analysis["endDate"] = end_date
        analysis["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")

        ANALYSES_DIR.mkdir(exist_ok=True)
        out_path.write_text(json.dumps(analysis, indent=2))
        print(f"[analysis] Generated {key}")

    except json.JSONDecodeError as e:
        print(f"[analysis] JSON parse error for {key}: {e}")
    except subprocess.TimeoutExpired:
        print(f"[analysis] Timeout generating {key}")
    except Exception as e:
        print(f"[analysis] Error generating {key}: {e}")
    finally:
        _analysis_semaphore.release()
        with _analysis_lock:
            _analysis_generating.discard(key)


def trigger_analysis_generation():
    """Check for missing daily/weekly analyses and generate in background."""
    report = compute_report(14)
    days = report.get("days", [])
    if not days:
        return

    today = time.strftime("%Y-%m-%d")

    # Daily analyses (skip today — still in progress)
    for d in days:
        date = d["date"]
        if date == today or d["sessionCount"] == 0:
            continue
        key = f"{date}_{date}"
        with _analysis_lock:
            if key in _analysis_generating or _analysis_exists(key):
                continue
            _analysis_generating.add(key)
        threading.Thread(
            target=_run_analysis,
            args=(key, [d], date, date, "Daily"),
            daemon=True,
        ).start()

    # Weekly analysis: group by ISO week, generate for complete weeks
    from collections import defaultdict
    weeks = defaultdict(list)
    for d in days:
        dt = datetime.strptime(d["date"], "%Y-%m-%d")
        iso = dt.isocalendar()
        week_key = f"{iso[0]}-W{iso[1]:02d}"
        weeks[week_key].append(d)

    for week_key, week_days in weeks.items():
        week_days_sorted = sorted(week_days, key=lambda x: x["date"])
        start = week_days_sorted[0]["date"]
        end = week_days_sorted[-1]["date"]
        # Only generate for weeks that ended before today
        if end >= today:
            continue
        key = f"{start}_{end}"
        with _analysis_lock:
            if key in _analysis_generating or _analysis_exists(key):
                continue
            _analysis_generating.add(key)
        threading.Thread(
            target=_run_analysis,
            args=(key, week_days_sorted, start, end, "Weekly"),
            daemon=True,
        ).start()


# ── Fix Snapshot Tracking ─────────────────────────────────────
# Tracks active fix sessions so we can capture before/after screenshots
active_fixes = {}  # fix_id -> { session_id, description, before_path, after_path, status }


def capture_screenshot(fix_id, label="before"):
    """Capture a screenshot of localhost:{PORT} via Playwright subprocess.

    Runs Playwright in a subprocess to avoid blocking the HTTP server.
    Returns the path to the saved PNG.
    """
    SNAPSHOTS_DIR.mkdir(exist_ok=True)
    out_path = SNAPSHOTS_DIR / f"{fix_id}-{label}.png"

    try:
        # Use node + playwright for screenshot (it's already installed for visual-qa)
        script = f"""
const {{ chromium }} = require('playwright');
(async () => {{
  const browser = await chromium.launch({{ headless: true }});
  const page = await browser.newPage({{ viewport: {{ width: 1440, height: 900 }} }});
  await page.goto('http://localhost:{PORT}', {{ waitUntil: 'load', timeout: 10000 }});
  await page.waitForTimeout(500);
  await page.screenshot({{ path: '{str(out_path).replace(chr(39), "")}', fullPage: false }});
  await browser.close();
}})();
"""
        result = subprocess.run(
            ["node", "-e", script],
            capture_output=True, text=True, timeout=15,
            env={k: v for k, v in os.environ.items() if k != "CLAUDECODE"},
        )
        if result.returncode == 0 and out_path.exists():
            return str(out_path)
        else:
            print(f"[snapshot] {label} capture failed: {result.stderr[:200]}")
            return None
    except Exception as e:
        print(f"[snapshot] {label} capture error: {e}")
        return None


def capture_after_screenshot(fix_id):
    """Capture the 'after' screenshot for a completed fix.

    Called in a background thread that polls for session completion.
    """
    fix = active_fixes.get(fix_id)
    if not fix:
        return

    session_id = fix["session_id"]

    # Poll for session completion (max 5 minutes)
    for _ in range(300):
        time.sleep(1)
        if not ClaudeProcess.is_running():
            break

    # Wait a moment for any HMR/refresh to complete
    time.sleep(2)

    after_path = capture_screenshot(fix_id, "after")
    if after_path:
        fix["after_path"] = after_path
        fix["status"] = "ready"
        print(f"[snapshot] After screenshot captured: {after_path}")
    else:
        fix["status"] = "after_failed"


def build_devtools_prompt(action, description, context):
    """Build a context-enriched prompt from DevTools Bridge data.

    Assembles the browser runtime context (DOM, styles, errors, network)
    into a structured prompt that gives Claude Code full visibility into
    both the app state and the source code.
    """
    parts = []

    # Header
    parts.append(f"# DevTools Bridge — {action.upper()}")
    parts.append(f"\n**Request:** {description}")
    parts.append(f"**App URL:** {context.get('url', 'unknown')}")
    parts.append(f"**Viewport:** {context.get('viewport', {}).get('width', '?')}x{context.get('viewport', {}).get('height', '?')}")
    parts.append(f"**Page Title:** {context.get('title', 'unknown')}")

    # Element context
    element = context.get("element", {})
    if element:
        parts.append("\n## Target Element")
        if element.get("path"):
            parts.append(f"**CSS Path:** `{element['path']}`")

        serialized = element.get("serialized", {})
        if serialized:
            parts.append(f"**Tag:** `<{serialized.get('tag', '?')}>`")
            attrs = serialized.get("attrs", {})
            if attrs:
                parts.append(f"**Attributes:** {json.dumps(attrs)}")

            cs = serialized.get("computedStyle", {})
            if cs:
                # Only show non-default/interesting styles
                style_lines = [f"  {k}: {v}" for k, v in cs.items() if v and v != "none" and v != "auto" and v != "normal" and v != "0px"]
                if style_lines:
                    parts.append("**Computed Styles:**")
                    parts.append("```css")
                    parts.extend(style_lines)
                    parts.append("```")

            rect = serialized.get("rect", {})
            if rect:
                parts.append(f"**Bounding Rect:** x={rect.get('x')}, y={rect.get('y')}, w={rect.get('width')}, h={rect.get('height')}")

        parent = element.get("parent", {})
        if parent:
            parent_cs = parent.get("computedStyle", {})
            if parent_cs:
                parts.append(f"\n**Parent:** `<{parent.get('tag', '?')}>` — display: {parent_cs.get('display')}, position: {parent_cs.get('position')}, overflow: {parent_cs.get('overflow')}")

    # Component state (React/Vue)
    component = context.get("componentState")
    if component:
        parts.append(f"\n## Component State ({component.get('framework', 'unknown')})")
        if component.get("componentName"):
            parts.append(f"**Component:** `{component['componentName']}`")
        if component.get("props"):
            parts.append(f"**Props:** ```json\n{json.dumps(component['props'], indent=2)[:500]}\n```")
        if component.get("state"):
            parts.append(f"**State:** ```json\n{json.dumps(component['state'], indent=2)[:500]}\n```")

    # Error context
    target_error = context.get("targetError")
    if target_error:
        parts.append("\n## Target Error")
        parts.append(f"**Message:** `{target_error.get('message', '')}`")
        if target_error.get("stack"):
            parts.append(f"**Stack:**\n```\n{target_error['stack'][:800]}\n```")

    errors = context.get("consoleErrors", [])
    if errors:
        parts.append(f"\n## Console Errors ({len(errors)} recent)")
        for err in errors[-5:]:
            msg = err.get("args", [""])[0][:150]
            src = err.get("source", "")
            parts.append(f"- `{msg}`{' — ' + src if src else ''}")

    # Network failures
    network = context.get("networkFailures", [])
    if network:
        parts.append(f"\n## Network Failures ({len(network)} recent)")
        for fail in network[-5:]:
            status = fail.get("status", fail.get("error", "?"))
            parts.append(f"- {fail.get('method', 'GET')} {fail.get('url', '?')} → {status}")

    # Performance
    perf = context.get("performance")
    if perf:
        nav = perf.get("navigation", {})
        parts.append(f"\n## Performance")
        parts.append(f"TTFB: {nav.get('ttfb', '?')}ms, DOM loaded: {nav.get('domContentLoaded', '?')}ms, Full load: {nav.get('loadComplete', '?')}ms")
        slow = perf.get("slowResources", [])
        if slow:
            parts.append("Slow resources:")
            for r in slow[:5]:
                parts.append(f"  - {r.get('name', '?')} ({r.get('duration', '?')}ms)")

    # Accessibility
    a11y = context.get("accessibility")
    if a11y and a11y.get("issues"):
        parts.append(f"\n## Accessibility Issues ({len(a11y['issues'])})")
        for issue in a11y["issues"][:10]:
            parts.append(f"- [{issue.get('type')}] {issue.get('element', '')}")

    # Instructions based on action
    parts.append("\n## Instructions")
    if action == "fix":
        parts.append("Using the DOM context above, find the source file responsible and fix the issue.")
        parts.append("After fixing, explain what you changed and why.")
    elif action == "inspect":
        parts.append("Analyze this element's layout, styling, and behavior.")
        parts.append("Identify any issues and suggest specific improvements with file paths and line numbers.")
    elif action == "trace":
        parts.append("Trace this error to its root cause in the source code.")
        parts.append("Show the causality chain and fix the underlying issue.")
    else:
        parts.append(f"Perform the requested '{action}' action using the context above.")

    return "\n".join(parts)


def _load_jsonc(path):
    """Load JSON with tolerance for comments and trailing commas."""
    import re
    with open(path) as f:
        text = f.read()
    # Strip comments while preserving strings: match strings or comments,
    # keep strings, remove comments
    def _replacer(m):
        if m.group(1) is not None:
            return m.group(1)  # keep quoted string
        return ''  # remove comment
    text = re.sub(r'("(?:[^"\\]|\\.)*")|(//.*?$|/\*.*?\*/)', _replacer, text, flags=re.MULTILINE | re.DOTALL)
    # Strip trailing commas before } or ]
    text = re.sub(r',\s*([}\]])', r'\1', text)
    return json.loads(text, strict=False)


def list_vsc_themes():
    """Discover VS Code theme JSON files from installed extensions."""
    base = os.path.expanduser("~/.vscode/extensions")
    result = []
    if not os.path.isdir(base):
        return result

    # Build a map from theme path -> (label, uiTheme) from each extension's package.json
    pkg_map = {}  # resolved theme path -> {"label": ..., "uiTheme": ...}
    for pkg_path in globmod.glob(f"{base}/*/package.json"):
        try:
            ext_dir = os.path.dirname(pkg_path)
            with open(pkg_path) as f:
                pkg = json.load(f)
            for t in pkg.get("contributes", {}).get("themes", []):
                rel = t.get("path", "")
                abs_path = os.path.normpath(os.path.join(ext_dir, rel))
                pkg_map[abs_path] = {
                    "label": t.get("label", ""),
                    "uiTheme": t.get("uiTheme", "vs-dark"),
                }
        except Exception:
            pass

    for path in sorted(globmod.glob(f"{base}/*/themes/*.json")):
        try:
            data = _load_jsonc(path)
        except Exception:
            continue

        norm = os.path.normpath(path)
        pkg_info = pkg_map.get(norm, {})
        ui = pkg_info.get("uiTheme", "vs-dark")
        theme_type = "light" if ui in ("vs", "hc-light") else "dark"
        name = pkg_info.get("label") or data.get("name") or os.path.basename(path)

        result.append({
            "idx": len(result),
            "name": name,
            "type": theme_type,
            "path": path,
        })
    return result


class Handler(http.server.SimpleHTTPRequestHandler):
    sessions = []

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/sessions":
            # Re-scan to catch new sessions
            Handler.sessions = scan_sessions()
            self.send_json(Handler.sessions)

        elif parsed.path == "/api/session":
            params = parse_qs(parsed.query)
            session_id = params.get("id", [None])[0]
            if not session_id:
                self.send_error(400, "Missing id parameter")
                return
            session = next((s for s in Handler.sessions if s["id"] == session_id), None)
            if not session:
                # Re-scan in case it's new
                Handler.sessions = scan_sessions()
                session = next((s for s in Handler.sessions if s["id"] == session_id), None)
            if not session:
                self.send_error(404, "Session not found")
                return
            try:
                size = os.path.getsize(session["file"])
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.send_header("Content-Length", str(size))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                with open(session["file"], "rb") as f:
                    while chunk := f.read(65536):
                        self.wfile.write(chunk)
            except Exception as e:
                self.send_error(500, str(e))

        elif parsed.path == "/api/live":
            # SSE endpoint: tail a session file and push new lines
            params = parse_qs(parsed.query)
            session_id = params.get("id", [None])[0]
            if not session_id:
                self.send_error(400, "Missing id parameter")
                return

            # Find the session file - check known sessions first, then glob
            session = next((s for s in Handler.sessions if s["id"] == session_id), None)
            if not session:
                Handler.sessions = scan_sessions()
                session = next((s for s in Handler.sessions if s["id"] == session_id), None)

            filepath = session["file"] if session else None

            # If not found, try glob discovery (for newly spawned sessions)
            if not filepath:
                filepath = ClaudeProcess.find_session_file(session_id)

            # If still not found, poll up to 10 seconds for the file to appear
            if not filepath:
                for _ in range(20):
                    time.sleep(0.5)
                    filepath = ClaudeProcess.find_session_file(session_id)
                    if filepath:
                        break

            if not filepath:
                self.send_error(404, "Session file not found")
                return

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            try:
                with open(filepath, "r") as f:
                    # Send all existing content as initial batch
                    existing = f.read()
                    if existing:
                        self.wfile.write(f"event: init\ndata: {json.dumps(existing)}\n\n".encode())
                        self.wfile.flush()

                    # Now tail for new content
                    while True:
                        line = f.readline()
                        if line:
                            stripped = line.strip()
                            if stripped:
                                self.wfile.write(f"event: line\ndata: {json.dumps(stripped)}\n\n".encode())
                                self.wfile.flush()
                        else:
                            # Send heartbeat
                            self.wfile.write(b": heartbeat\n\n")
                            self.wfile.flush()
                            time.sleep(0.3)
            except (BrokenPipeError, ConnectionResetError):
                pass

        elif parsed.path == "/api/active":
            # Return the most recently active session
            Handler.sessions = scan_sessions()
            active = [s for s in Handler.sessions if s.get("active")]
            self.send_json(active[0] if active else None)

        elif parsed.path == "/api/report":
            params = parse_qs(parsed.query)
            days = int(params.get("days", ["7"])[0])
            days = min(max(days, 1), 30)
            self.send_json(compute_report(days))

        elif parsed.path == "/api/analyses":
            # Trigger generation for missing analyses
            trigger_analysis_generation()
            # Return existing analyses
            analyses = []
            if ANALYSES_DIR.exists():
                for f in sorted(ANALYSES_DIR.glob("*.json"), reverse=True):
                    try:
                        analyses.append(json.loads(f.read_text()))
                    except Exception:
                        pass
            with _analysis_lock:
                pending = list(_analysis_generating)
            self.send_json({
                "analyses": analyses,
                "generating": pending,
            })

        elif parsed.path == "/api/prompt/status":
            self.send_json(ClaudeProcess.status())

        elif parsed.path == "/api/open":
            # Open a file in the default editor
            params = parse_qs(parsed.query)
            filepath = params.get("path", [None])[0]
            if not filepath:
                self.send_json({"error": "missing path"})
            elif not os.path.exists(filepath):
                self.send_json({"error": "file not found"})
            else:
                import subprocess
                subprocess.Popen(["open", filepath])
                self.send_json({"ok": True, "path": filepath})

        elif parsed.path == "/api/fix/snapshot":
            # Get before/after screenshot status and paths for a fix
            params = parse_qs(parsed.query)
            fix_id = params.get("id", [None])[0]
            if not fix_id:
                self.send_error(400, "Missing id parameter")
                return
            fix = active_fixes.get(fix_id)
            if not fix:
                self.send_json({"error": "Fix not found", "fixId": fix_id})
                return
            self.send_json({
                "fixId": fix_id,
                "status": fix["status"],
                "description": fix["description"],
                "beforePath": fix.get("before_path"),
                "afterPath": fix.get("after_path"),
                "hasBeforeAfter": bool(fix.get("before_path") and fix.get("after_path")),
            })

        elif parsed.path == "/api/fix/snapshots":
            # List all tracked fixes with snapshot status
            result = []
            for fid, fix in active_fixes.items():
                result.append({
                    "fixId": fid,
                    "status": fix["status"],
                    "description": fix["description"][:100],
                    "hasBeforeAfter": bool(fix.get("before_path") and fix.get("after_path")),
                })
            self.send_json(result)

        elif parsed.path == "/api/themes":
            themes = list_vsc_themes()
            # Strip internal path from response
            self.send_json([{k: v for k, v in t.items() if k != 'path'} for t in themes])

        elif parsed.path == "/api/theme":
            params = parse_qs(parsed.query)
            idx = int(params.get("idx", ["0"])[0])
            themes = list_vsc_themes()
            if 0 <= idx < len(themes):
                try:
                    with open(themes[idx]["path"], "r") as f:
                        self.send_json(json.load(f))
                except Exception as e:
                    self.send_error(500, str(e))
            else:
                self.send_error(404, "Theme not found")

        elif parsed.path.startswith("/fix-snapshots/"):
            # Serve screenshot files from the snapshots directory
            filename = parsed.path.replace("/fix-snapshots/", "")
            filepath = SNAPSHOTS_DIR / filename
            if filepath.exists() and filepath.suffix == ".png":
                with open(filepath, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_error(404, "Snapshot not found")

        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b""

        if parsed.path == "/api/prompt":
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
                return

            prompt = data.get("prompt", "").strip()
            if not prompt:
                self.send_error(400, "Missing prompt")
                return

            session_id = data.get("sessionId")
            skip_permissions = data.get("skipPermissions", False)
            result_id, error = ClaudeProcess.start(prompt, session_id, skip_permissions)
            if error:
                self.send_response(409)
                body_bytes = json.dumps({"error": error}).encode("utf-8")
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body_bytes)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body_bytes)
                return

            self.send_json({"sessionId": result_id, "status": "started", "mode": ClaudeProcess.mode})

        elif parsed.path == "/api/prompt/respond":
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
                return

            text = data.get("text", "").strip()
            if not text:
                self.send_error(400, "Missing text")
                return

            ok, error = ClaudeProcess.respond(text)
            if error:
                self.send_json({"ok": False, "error": error})
            else:
                self.send_json({"ok": True})

        elif parsed.path == "/api/prompt/stop":
            stopped = ClaudeProcess.stop()
            self.send_json({"stopped": stopped})

        elif parsed.path == "/api/devtools/session":
            # DevTools Bridge: create a Claude Code session with DOM context
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
                return

            action = data.get("action", "fix")
            description = data.get("description", "").strip()
            context = data.get("context", {})
            fix_id = data.get("fixId")  # from bridge telemetry

            if not description:
                self.send_error(400, "Missing description")
                return

            # Capture "before" screenshot (non-blocking, quick)
            before_path = None
            if action == "fix" and fix_id:
                before_path = capture_screenshot(fix_id, "before")

            # Build a context-enriched prompt for Claude Code
            prompt = build_devtools_prompt(action, description, context)

            # Use auto-approve for devtools sessions (user approved from browser)
            result_id, error = ClaudeProcess.start(prompt, skip_permissions=True)
            if error:
                self.send_response(409)
                body_bytes = json.dumps({"error": error}).encode("utf-8")
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body_bytes)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body_bytes)
                return

            # Track fix for after-capture
            if fix_id:
                active_fixes[fix_id] = {
                    "session_id": result_id,
                    "description": description,
                    "before_path": before_path,
                    "after_path": None,
                    "status": "running",
                }
                # Start background thread to capture "after" screenshot
                threading.Thread(
                    target=capture_after_screenshot,
                    args=(fix_id,),
                    daemon=True,
                ).start()

            self.send_json({
                "status": "created",
                "session_name": result_id,
                "sessionId": result_id,
                "action": action,
                "description": description,
                "fixId": fix_id,
                "beforeScreenshot": before_path is not None,
            })

        else:
            self.send_error(404, "Not found")

    def do_OPTIONS(self):
        """Handle CORS preflight for POST endpoints."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def send_json(self, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        msg = str(args[0]) if args else ""
        if "/api/" in msg or ".js" in msg or ".css" in msg:
            return
        super().log_message(format, *args)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SCRIPT_DIR), **kwargs)


def main():
    print(f"Scanning sessions in {CLAUDE_DIR}...")
    Handler.sessions = scan_sessions()
    active_count = sum(1 for s in Handler.sessions if s.get("active"))
    print(f"Found {len(Handler.sessions)} sessions ({active_count} active)")

    if Handler.sessions:
        top = Handler.sessions[0]
        label = "LIVE" if top.get("active") else top.get("modifiedAgo", "")
        print(f"Latest: [{label}] {top['firstMessage'][:60]}")

    http.server.HTTPServer.allow_reuse_address = True
    server = http.server.ThreadingHTTPServer(("", PORT), Handler)
    print(f"\nServing at http://localhost:{PORT}")
    print("Press Ctrl+C to stop\n")

    url = f"http://localhost:{PORT}"
    if LIVE_MODE:
        active = [s for s in Handler.sessions if s.get("active")]
        if active:
            url += f"#live={active[0]['id']}"
            print(f"Opening live view for active session...")

    def open_browser():
        time.sleep(0.3)
        webbrowser.open(url)

    threading.Thread(target=open_browser, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
