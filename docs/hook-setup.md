# ECHO — Hook Setup Guide

## PostToolUse Hook: `echo-recorder.py`

The echo recorder hook captures every tool use event during Claude Code sessions
and writes them to the ECHO session store for replay and analysis.

## Installation

### 1. Add to Claude Code Settings

Edit `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/echo/hooks/echo-recorder.py"
          }
        ]
      }
    ]
  }
}
```

### 2. Environment Variables (Optional)

| Variable | Default | Description |
|---|---|---|
| `ECHO_SESSION_DIR` | `~/.echo/sessions` | Where session files are stored |
| `ECHO_SESSION_ID` | `default` | Current session identifier |
| `ECHO_USER_ID` | `$USER` | User identifier for team tracking |

### 3. Start a Named Session

```bash
export ECHO_SESSION_ID="feature-auth-$(date +%s)"
export ECHO_USER_ID="alice"
# Now all tool uses in this terminal will be recorded
```

## How It Works

1. Claude Code fires `PostToolUse` after every tool execution
2. The hook receives JSON on stdin with tool details
3. `echo-recorder.py` creates a structured event and appends it as NDJSON
4. Session files accumulate in `~/.echo/sessions/`

## Payload Format (stdin)

```json
{
  "tool_name": "Read",
  "tool_input": { "file_path": "/src/app.js" },
  "tool_output": { "content": "..." },
  "duration_ms": 150,
  "cost": 0.003
}
```

## Output Truncation

- String outputs > 5000 chars are truncated
- Object outputs > 5000 chars (serialized) are replaced with a preview
- This prevents session files from growing excessively

## Viewing Recorded Sessions

```bash
# List all sessions
node ~/echo/bin/echo-cli.mjs list

# Replay a session
node ~/echo/bin/echo-cli.mjs replay <session-id>

# Analyze all sessions
node ~/echo/bin/echo-cli.mjs analyze
```
