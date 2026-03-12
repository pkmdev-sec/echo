# ECHO — API Reference

## SessionRecorder

```js
import { SessionRecorder } from '@pkmdev/echo';

const rec = new SessionRecorder({
  userId: 'alice',
  tags: ['sprint-42'],
  storeDir: '/custom/path',  // optional
});

// Record events
rec.record('custom_event', { key: 'value' });
rec.recordToolUse('Bash', { cmd: 'npm test' }, { exit: 0 }, 1200, 0.005);
rec.recordError('Build failed', { file: 'app.js' });
rec.recordTaskStart('task-1', 'Implement auth');
rec.recordTaskEnd('task-1', 'completed');

// Properties
rec.active;       // boolean — still recording?
rec.eventCount;   // number of events
rec.duration;     // ms between first and last event
rec.sessionId;    // UUID
rec.userId;       // string

// Finalize
rec.end();        // returns metadata

// Persist
await rec.save();                           // saves to storeDir
const loaded = await SessionRecorder.load(sessionId);  // loads from disk
```

## ReplayEngine

```js
import { ReplayEngine } from '@pkmdev/echo';

const engine = new ReplayEngine(sessionData);

// Timeline
engine.buildTimeline();          // returns TimelineEntry[]
engine.getTimeline();            // cached version

// Navigation
engine.current();                // current cursor entry
engine.next();                   // advance cursor
engine.prev();                   // move back
engine.seek(5);                  // jump to index
engine.reset();                  // back to start

// Filtering
engine.filterByType('tool_use');
engine.filterByTimeRange(0, 5000);
engine.search(entry => entry.event.data.tool === 'Bash');

// Extraction
engine.getToolSequence();        // [{tool, durationMs, cost, relativeMs}]
engine.getErrorSequence();       // [{message, relativeMs}]
engine.getSummary();             // full summary object
engine.toTextReport();           // formatted text report
```

## SessionMetrics / AnalyticsEngine

```js
import { AnalyticsEngine, SessionMetrics } from '@pkmdev/echo';

// Single session
const metrics = new SessionMetrics(sessionData);
metrics.toolsUsed();             // {Read: 5, Edit: 3}
metrics.toolFrequency();         // {Read: {count: 5, percentage: 62.5}}
metrics.timePerTask();           // {taskId: {durationMs, status}}
metrics.costPerSession();        // 0.045
metrics.errorRate();             // 12.5  (percentage)
metrics.averageToolDuration();   // 200  (ms)
metrics.computeAll();            // everything above

// Multi-session
const engine = new AnalyticsEngine();
engine.addSession(session1);
engine.addSession(session2);
engine.aggregateCost();
engine.aggregateErrorRate();
engine.aggregateToolUsage();
engine.computeAll();
```

## TeamDashboard

```js
import { TeamDashboard } from '@pkmdev/echo';

const dash = new TeamDashboard('engineering');
dash.addSession(aliceSession1);
dash.addSession(bobSession1);
dash.addSessions([aliceSession2, bobSession2]);

dash.memberCount;                // 2
dash.totalSessions;              // 4
dash.totalCost();                // aggregate $
dash.teamErrorRate();            // percentage
dash.teamToolUsage();            // {Read: 15, Edit: 8, ...}
dash.leaderboard('sessions');    // sorted [{userId, value}]
dash.leaderboard('cost');
dash.getMember('alice');          // MemberProfile
dash.summary();                  // full team summary
```

## ExportManager

```js
import { ExportManager, eventsToCSV, metricsToCSV, teamSummaryToCSV } from '@pkmdev/echo';

// Object-oriented
const mgr = new ExportManager(sessionData);
mgr.toJSON();                    // pretty JSON string
mgr.eventsToCSV();               // CSV string
await mgr.saveJSON('/out.json');
await mgr.saveCSV('/out.csv');

// Functional
eventsToCSV(events);
metricsToCSV(metricsArray);
teamSummaryToCSV(teamSummary);
```
