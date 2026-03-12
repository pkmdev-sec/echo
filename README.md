![Echo Banner](assets/banner.svg)

> **Session Replay and Analytics for Claude Code**
> Record every tool use, replay entire sessions, compute metrics, and visualize team performance.

## Why Echo?

In Greek mythology, Echo was a mountain nymph cursed by Hera to only repeat the last words spoken to her. She could never speak first — only reflect what others said. ECHO transforms this concept of faithful repetition into a developer tool: it captures every action in a Claude Code session and can perfectly replay them, like Echo repeating words in a mountain valley. Every tool use, every command, every result is faithfully recorded and reflected back, enabling deep analysis of how you work.

## Features

| Module | Description |
|---|---|
| **Session Recorder** | Capture every event with timestamps, persist to JSON |
| **Replay Engine** | Reconstruct timelines, navigate with cursor, filter & search |
| **Analytics** | Tools used, time per task, cost per session, error rate |
| **Team Dashboard** | Aggregate metrics across team members, leaderboards |
| **Export** | CSV and JSON export for reports and data portability |
| **PostToolUse Hook** | Auto-record every tool use via Claude Code hooks |

## Quick Start

```bash
# Install
cd ~/echo && npm install

# Set up the hook in ~/.claude/settings.json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "python3 ~/echo/hooks/echo-recorder.py"
      }]
    }]
  }
}

# Use the CLI
node bin/echo-cli.mjs list
node bin/echo-cli.mjs replay <session-id>
node bin/echo-cli.mjs analyze
```

## Programmatic Usage

```js
import {
  SessionRecorder,
  ReplayEngine,
  AnalyticsEngine,
  TeamDashboard,
  ExportManager,
} from './lib/index.mjs';

// Record a session
const rec = new SessionRecorder({ userId: 'alice' });
rec.recordToolUse('Bash', { cmd: 'npm test' }, { exit: 0 }, 1200, 0.005);
rec.recordError('Lint failed', { file: 'app.js' });
rec.end();
await rec.save();

// Replay
const engine = new ReplayEngine(rec.toJSON());
console.log(engine.toTextReport());

// Analytics
const analytics = new AnalyticsEngine();
analytics.addSession(rec.toJSON());
console.log(analytics.computeAll());

// Team view
const dash = new TeamDashboard('engineering');
dash.addSession(rec.toJSON());
console.log(dash.summary());

// Export
const mgr = new ExportManager(rec.toJSON());
await mgr.saveCSV('report.csv');
await mgr.saveJSON('report.json');
```

## Architecture

![Architecture](docs/visuals/architecture-diagram.svg)

## Testing

```bash
npm test          # Run all 74 tests
npm run test:verbose  # Verbose output
```

## Project Structure

```
echo/
├── lib/
│   ├── index.mjs              # Main entry point
│   ├── session-recorder.mjs   # Event capture & persistence
│   ├── replay-engine.mjs      # Timeline reconstruction
│   ├── analytics.mjs          # Metrics computation
│   ├── team-dashboard.mjs     # Team aggregation
│   └── export.mjs             # CSV/JSON export
├── hooks/
│   └── echo-recorder.py       # PostToolUse hook
├── bin/
│   └── echo-cli.mjs           # CLI interface
├── tests/
│   ├── session-recorder.test.mjs
│   ├── replay-engine.test.mjs
│   ├── analytics.test.mjs
│   ├── team-dashboard.test.mjs
│   └── export.test.mjs
├── docs/
│   ├── architecture.md
│   ├── hook-setup.md
│   └── api-reference.md
├── banner.txt
├── package.json
└── README.md
```

## Examples

Echo includes three comprehensive examples to help you get started:

### 1. Record Session (`examples/record-session.mjs`)

Demonstrates how to create and record a session with various event types:
- Creates a new session recorder with user ID and tags
- Records task start/end events for tracking workflows
- Simulates tool use events (Bash, Read, Edit, Grep, Write)
- Records error events with context
- Saves the session to disk with automatic compression
- Prints session statistics and save location

Run it:
```bash
node examples/record-session.mjs
```

### 2. Replay Session (`examples/replay-session.mjs`)

Shows how to load and replay a recorded session:
- Loads a session from disk by ID
- Creates a replay engine and builds timeline
- Steps through events with cursor navigation
- Filters events by type (tool_use, error, etc.)
- Demonstrates bookmarking important events
- Gets tool sequence and error sequence
- Prints formatted text summary

Run it:
```bash
node examples/replay-session.mjs <session-id>
```

### 3. Team Report (`examples/team-report.mjs`)

Demonstrates team dashboard aggregation and reporting:
- Creates a team dashboard with multiple members
- Adds simulated sessions with various metrics
- Generates leaderboards (by sessions, cost, error rate)
- Shows team health score calculation
- Displays top tools and common errors
- Provides per-developer breakdown with detailed metrics
- Integrates with analytics engine for anomaly detection

Run it:
```bash
node examples/team-report.mjs
```

## HTML Reports

Echo can export sessions as beautiful, self-contained HTML reports with:

### Features
- **Dark Theme**: Professional dark theme optimized for readability
- **Session Metadata**: Formatted header with all session details
- **Summary Statistics**: Quick overview cards for key metrics
- **Cost & Duration Analysis**: Detailed breakdown of tool costs and execution times
- **Tool Usage Charts**: CSS bar charts showing tool frequency
- **Event Timeline Visualization**: Color-coded timeline with relative timestamps
- **Error Highlights**: Dedicated section for error events with context
- **Complete Event Log**: Searchable table with all events
- **Self-Contained**: Inline CSS, no external dependencies

### Usage

```js
import { ExportManager } from './lib/export.mjs';

// Create export manager from session data
const exporter = new ExportManager(sessionData);

// Generate HTML report
const htmlContent = exporter.toHTML('My Session Report');

// Save to file
await exporter.saveHTML('report.html', 'My Session Report');
```

The HTML reports use color coding for event types:
- 🟢 **Green**: Tool uses
- 🔴 **Red**: Errors
- 🔵 **Blue**: Task starts
- 🟣 **Purple**: Task ends
- ⚪ **Gray**: Other events

## Time-Based Analytics

Echo's analytics engine includes powerful time-based filtering and analysis:

### Date Range Filtering

Filter sessions within a specific date range:

```js
import { AnalyticsEngine } from './lib/analytics.mjs';

const analytics = new AnalyticsEngine();
// Add sessions...

// Filter to last 7 days
const endDate = new Date();
const startDate = new Date(endDate - 7 * 24 * 60 * 60 * 1000);
analytics.filterByDateRange(startDate, endDate);

// Compute metrics on filtered data
const results = analytics.computeAll();
```

### Time of Day Filtering

Analyze sessions by time of day (e.g., work hours vs off-hours):

```js
// Filter to business hours (9 AM - 5 PM)
analytics.filterByTimeOfDay(9, 17);

// Filter to night hours (10 PM - 6 AM) - handles midnight crossing
analytics.filterByTimeOfDay(22, 6);

// Clear filters
analytics.clearFilters();
```

### Daily Breakdown

Get metrics grouped by day:

```js
const daily = analytics.dailyBreakdown();
// Returns array of daily metrics:
// [
//   {
//     date: '2024-03-01',
//     totalSessions: 5,
//     totalEvents: 250,
//     totalCost: 0.125,
//     errorRate: 2.4,
//     avgDuration: 5000,
//     avgCost: 0.025
//   },
//   ...
// ]
```

### Weekly Trend Analysis

Track week-over-week changes:

```js
const weekly = analytics.weeklyTrend();
// Returns:
// {
//   weeks: [
//     {
//       weekStart: '2024-02-25',
//       totalSessions: 20,
//       totalCost: 0.5,
//       errorRate: 3.2,
//       weekOverWeekChange: {
//         sessions: +5,
//         cost: +0.1,
//         errorRate: -0.8,
//         duration: -2000
//       }
//     },
//     ...
//   ],
//   summary: {
//     firstWeek: {...},
//     lastWeek: {...},
//     totalWeeks: 4,
//     overallTrend: 'improving' // or 'degrading' or 'stable'
//   }
// }
```

### Chaining Filters

Filters can be chained for complex queries:

```js
analytics
  .filterByDateRange(startDate, endDate)
  .filterByTimeOfDay(9, 17);  // Sessions in date range AND during work hours

const results = analytics.computeAll();
analytics.clearFilters();  // Reset for next query
```

### Use Cases

- **Work Hours Analysis**: Compare productivity during vs outside business hours
- **Weekly Reports**: Track team metrics week-over-week
- **Sprint Analysis**: Filter sessions within sprint dates
- **Daily Standups**: Show yesterday's metrics
- **Trend Detection**: Identify improving or degrading patterns over time
- **Cost Optimization**: Find high-cost time periods

## Documentation

- [Architecture & Diagrams](docs/architecture.md)
- [Hook Setup Guide](docs/hook-setup.md)
- [API Reference](docs/api-reference.md)

## License

MIT
