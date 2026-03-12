/**
 * Tests for ECHO Replay Engine
 */

import { ReplayEngine, TimelineEntry } from '../lib/replay-engine.mjs';

function makeSessionData(events = []) {
  return {
    metadata: { sessionId: 'test-session', userId: 'tester' },
    events,
  };
}

function makeEvent(type, data = {}, timestamp = Date.now()) {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp,
    isoTime: new Date(timestamp).toISOString(),
    data,
  };
}

describe('TimelineEntry', () => {
  test('formatDuration handles milliseconds', () => {
    expect(TimelineEntry.formatDuration(500)).toBe('500ms');
  });

  test('formatDuration handles seconds', () => {
    expect(TimelineEntry.formatDuration(2500)).toBe('2.500s');
  });

  test('formatDuration handles minutes', () => {
    expect(TimelineEntry.formatDuration(125000)).toBe('2m 5s');
  });

  test('formatDuration handles hours', () => {
    expect(TimelineEntry.formatDuration(3661000)).toBe('1h 1m 1s');
  });
});

describe('ReplayEngine', () => {
  test('throws on invalid session data', () => {
    expect(() => new ReplayEngine(null)).toThrow('Invalid session data');
    expect(() => new ReplayEngine({})).toThrow('Invalid session data');
  });

  test('builds timeline from events', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('tool_use', { tool: 'Read' }, base),
      makeEvent('tool_use', { tool: 'Edit' }, base + 500),
      makeEvent('error', { message: 'fail' }, base + 1200),
    ]);
    const engine = new ReplayEngine(data);
    const timeline = engine.buildTimeline();
    expect(timeline).toHaveLength(3);
    expect(timeline[0].relativeMs).toBe(0);
    expect(timeline[1].relativeMs).toBe(500);
    expect(timeline[2].relativeMs).toBe(1200);
  });

  test('filterByType returns matching entries', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('tool_use', { tool: 'Read' }, base),
      makeEvent('error', { message: 'oops' }, base + 100),
      makeEvent('tool_use', { tool: 'Edit' }, base + 200),
    ]);
    const engine = new ReplayEngine(data);
    expect(engine.filterByType('tool_use')).toHaveLength(2);
    expect(engine.filterByType('error')).toHaveLength(1);
    expect(engine.filterByType('nonexistent')).toHaveLength(0);
  });

  test('filterByTimeRange works correctly', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('a', {}, base),
      makeEvent('b', {}, base + 500),
      makeEvent('c', {}, base + 1000),
      makeEvent('d', {}, base + 2000),
    ]);
    const engine = new ReplayEngine(data);
    const filtered = engine.filterByTimeRange(400, 1100);
    expect(filtered).toHaveLength(2);
  });

  test('seek, next, prev cursor navigation', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('a', {}, base),
      makeEvent('b', {}, base + 100),
      makeEvent('c', {}, base + 200),
    ]);
    const engine = new ReplayEngine(data);

    expect(engine.current().event.type).toBe('a');
    engine.next();
    expect(engine.current().event.type).toBe('b');
    engine.next();
    expect(engine.current().event.type).toBe('c');
    expect(engine.next()).toBeNull();

    engine.prev();
    expect(engine.current().event.type).toBe('b');
    engine.reset();
    expect(engine.cursor).toBe(0);

    engine.seek(2);
    expect(engine.current().event.type).toBe('c');
  });

  test('seek throws on out-of-bounds index', () => {
    const data = makeSessionData([makeEvent('a', {}, 1000)]);
    const engine = new ReplayEngine(data);
    expect(() => engine.seek(-1)).toThrow(RangeError);
    expect(() => engine.seek(5)).toThrow(RangeError);
  });

  test('getToolSequence extracts tool data', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('tool_use', { tool: 'Read', durationMs: 50, cost: 0.001 }, base),
      makeEvent('error', { message: 'x' }, base + 100),
      makeEvent('tool_use', { tool: 'Edit', durationMs: 120, cost: 0.003 }, base + 200),
    ]);
    const engine = new ReplayEngine(data);
    const tools = engine.getToolSequence();
    expect(tools).toHaveLength(2);
    expect(tools[0].tool).toBe('Read');
    expect(tools[1].cost).toBe(0.003);
  });

  test('getSummary produces correct structure', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('tool_use', { tool: 'Read', durationMs: 50, cost: 0.01 }, base),
      makeEvent('error', { message: 'err' }, base + 500),
    ]);
    const engine = new ReplayEngine(data);
    const summary = engine.getSummary();
    expect(summary.sessionId).toBe('test-session');
    expect(summary.totalEvents).toBe(2);
    expect(summary.totalDurationMs).toBe(500);
    expect(summary.eventTypes.tool_use).toBe(1);
    expect(summary.errors).toHaveLength(1);
  });

  test('toTextReport returns a string', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('tool_use', { tool: 'Bash', durationMs: 200, cost: 0.005 }, base),
    ]);
    const engine = new ReplayEngine(data);
    const report = engine.toTextReport();
    expect(report).toContain('ECHO Session Replay');
    expect(report).toContain('Bash');
  });

  test('handles empty events gracefully', () => {
    const engine = new ReplayEngine(makeSessionData([]));
    expect(engine.length).toBe(0);
    expect(engine.buildTimeline()).toHaveLength(0);
    expect(engine.current()).toBeNull();
    expect(engine.getSummary().totalDurationMs).toBe(0);
  });
});
