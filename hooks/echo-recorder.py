#!/usr/bin/env python3
"""
ECHO — PostToolUse Hook (echo-recorder.py)
Records every tool use event into the active ECHO session file.

Hook type: PostToolUse
Reads JSON from stdin with tool_name, tool_input, tool_output, and session_id.
Appends event to the session's NDJSON log file.

Usage in .claude/settings.json:
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/echo/hooks/echo-recorder.py"
          }
        ]
      }
    ]
  }
}
"""

import json
import os
import sys
import time
import uuid
from pathlib import Path

ECHO_DIR = Path(os.environ.get("ECHO_SESSION_DIR", Path.home() / ".echo" / "sessions"))
ECHO_SESSION_ID = os.environ.get("ECHO_SESSION_ID", "default")
ECHO_USER_ID = os.environ.get("ECHO_USER_ID", os.environ.get("USER", "anonymous"))


def ensure_session_dir():
    """Create session directory if it doesn't exist."""
    ECHO_DIR.mkdir(parents=True, exist_ok=True)


def get_session_file():
    """Get the NDJSON log file path for the current session."""
    return ECHO_DIR / f"{ECHO_SESSION_ID}.ndjson"


def create_event(tool_name, tool_input, tool_output, duration_ms=0, cost=0.0):
    """Create a structured session event."""
    now = time.time()
    return {
        "id": str(uuid.uuid4()),
        "type": "tool_use",
        "timestamp": int(now * 1000),
        "isoTime": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now)) + "Z",
        "data": {
            "tool": tool_name,
            "input": tool_input,
            "output": tool_output,
            "durationMs": duration_ms,
            "cost": cost,
        },
    }


def record_event(event):
    """Append event as NDJSON to the session file."""
    ensure_session_dir()
    session_file = get_session_file()
    with open(session_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, separators=(",", ":")) + "\n")


def main():
    """Read hook payload from stdin and record the event."""
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return

        payload = json.loads(raw)

        tool_name = payload.get("tool_name", payload.get("tool", "unknown"))
        tool_input = payload.get("tool_input", payload.get("input", {}))
        tool_output = payload.get("tool_output", payload.get("output", {}))
        duration_ms = payload.get("duration_ms", payload.get("durationMs", 0))
        cost = payload.get("cost", 0.0)

        # Truncate large outputs to avoid bloating session files
        if isinstance(tool_output, str) and len(tool_output) > 5000:
            tool_output = tool_output[:5000] + "... [truncated]"
        elif isinstance(tool_output, dict):
            output_str = json.dumps(tool_output)
            if len(output_str) > 5000:
                tool_output = {"_truncated": True, "preview": output_str[:2000]}

        event = create_event(tool_name, tool_input, tool_output, duration_ms, cost)
        record_event(event)

        # Print confirmation to stderr (stdout is reserved for hook protocol)
        print(
            json.dumps({"status": "recorded", "event_id": event["id"]}),
            file=sys.stderr,
        )

    except json.JSONDecodeError as e:
        print(
            json.dumps({"status": "error", "message": f"Invalid JSON: {e}"}),
            file=sys.stderr,
        )
    except Exception as e:
        print(
            json.dumps({"status": "error", "message": str(e)}),
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
