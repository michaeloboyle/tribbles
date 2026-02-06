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
import json
import os
import sys
import time
import webbrowser
import threading
from pathlib import Path
from urllib.parse import urlparse, parse_qs

CLAUDE_DIR = Path.home() / ".claude" / "projects"
PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8777
LIVE_MODE = "--live" in sys.argv
SCRIPT_DIR = Path(__file__).parent


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
    """Read a session file and extract key metadata."""
    meta = {}
    try:
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
            session = next((s for s in Handler.sessions if s["id"] == session_id), None)
            if not session:
                Handler.sessions = scan_sessions()
                session = next((s for s in Handler.sessions if s["id"] == session_id), None)
            if not session:
                self.send_error(404, "Session not found")
                return

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            filepath = session["file"]
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

        else:
            super().do_GET()

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

    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
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
