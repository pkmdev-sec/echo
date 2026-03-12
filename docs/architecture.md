# ECHO — Architecture

## System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        ECHO SYSTEM                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Claude Code  │───▶│  PostToolUse │───▶│   Session    │       │
│  │   Session     │    │    Hook      │    │  Recorder    │       │
│  └──────────────┘    │ (Python)     │    │   (.mjs)     │       │
│                      └──────────────┘    └──────┬───────┘       │
│                                                  │               │
│                                                  ▼               │
│                                          ┌──────────────┐       │
│                                          │  Session JSON │       │
│                                          │    Store      │       │
│                                          │ ~/.echo/      │       │
│                                          └──────┬───────┘       │
│                                                  │               │
│                          ┌───────────────────────┼───────┐      │
│                          │                       │       │      │
│                          ▼                       ▼       ▼      │
│                  ┌──────────────┐  ┌────────────┐ ┌─────────┐  │
│                  │   Replay     │  │ Analytics  │ │  Export  │  │
│                  │   Engine     │  │  Engine    │ │  Module  │  │
│                  └──────┬───────┘  └─────┬──────┘ └────┬────┘  │
│                         │                │             │        │
│                         ▼                ▼             ▼        │
│                  ┌──────────────┐  ┌────────────┐ ┌─────────┐  │
│                  │  Timeline    │  │   Team     │ │  CSV /   │  │
│                  │  Navigation  │  │ Dashboard  │ │  JSON    │  │
│                  └──────────────┘  └────────────┘ └─────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
Tool Use Event
    │
    ▼
echo-recorder.py (PostToolUse hook)
    │
    ├──▶ Reads JSON payload from stdin
    ├──▶ Creates structured event { id, type, timestamp, data }
    └──▶ Appends NDJSON to ~/.echo/sessions/<session>.ndjson
              │
              ▼
     SessionRecorder.load()
              │
              ├──▶ ReplayEngine  ──▶ Timeline navigation, search, filtering
              ├──▶ SessionMetrics ──▶ Per-session analytics
              ├──▶ AnalyticsEngine ──▶ Multi-session aggregation
              ├──▶ TeamDashboard  ──▶ Cross-member comparison
              └──▶ ExportManager  ──▶ CSV / JSON file export
```

## Module Dependency Graph

```
index.mjs (entry)
    │
    ├── session-recorder.mjs   (zero deps — standalone capture)
    │
    ├── replay-engine.mjs      (zero deps — pure timeline logic)
    │
    ├── analytics.mjs           (zero deps — pure computation)
    │
    ├── team-dashboard.mjs     (imports analytics.mjs)
    │
    └── export.mjs              (zero deps — pure formatting)
```

## Event Schema

```json
{
  "id": "uuid-v4",
  "type": "tool_use | error | task_start | task_end | custom",
  "timestamp": 1710000000000,
  "isoTime": "2024-03-10T00:00:00.000Z",
  "data": {
    "tool": "Read",
    "input": {},
    "output": {},
    "durationMs": 150,
    "cost": 0.003
  }
}
```

## Storage Layout

```
~/.echo/
  └── sessions/
      ├── <session-id>.json      ← Full session (SessionRecorder.save)
      └── <session-id>.ndjson    ← Streaming log (echo-recorder.py hook)
```
