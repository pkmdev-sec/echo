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

  test('playback speed control', () => {
    const data = makeSessionData([makeEvent('test', {}, 1000)]);
    const engine = new ReplayEngine(data);

    expect(engine.playbackSpeed).toBe(1.0);

    engine.setPlaybackSpeed(2.0);
    expect(engine.playbackSpeed).toBe(2.0);

    engine.setPlaybackSpeed(0.5);
    expect(engine.playbackSpeed).toBe(0.5);

    engine.setPlaybackSpeed(4.0);
    expect(engine.playbackSpeed).toBe(4.0);

    expect(() => engine.setPlaybackSpeed(3.0)).toThrow('Invalid playback speed');
  });

  test('event filtering', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('tool_use', { tool: 'Read' }, base),
      makeEvent('error', { message: 'fail' }, base + 100),
      makeEvent('tool_use', { tool: 'Edit' }, base + 200),
      makeEvent('custom', {}, base + 300),
    ]);
    const engine = new ReplayEngine(data);

    // Filter by single type
    engine.setEventFilter('tool_use');
    const filtered1 = engine.getFilteredTimeline();
    expect(filtered1).toHaveLength(2);
    expect(filtered1[0].event.type).toBe('tool_use');

    // Filter by array of types
    engine.setEventFilter(['error', 'custom']);
    const filtered2 = engine.getFilteredTimeline();
    expect(filtered2).toHaveLength(2);

    // Clear filter
    engine.setEventFilter(null);
    const filtered3 = engine.getFilteredTimeline();
    expect(filtered3).toHaveLength(4);
  });

  test('skip to next/prev tool call', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('custom', {}, base),
      makeEvent('tool_use', { tool: 'Read' }, base + 100),
      makeEvent('error', {}, base + 200),
      makeEvent('tool_use', { tool: 'Edit' }, base + 300),
      makeEvent('custom', {}, base + 400),
    ]);
    const engine = new ReplayEngine(data);

    // Start at beginning
    expect(engine.cursor).toBe(0);

    const next1 = engine.skipToNextToolCall();
    expect(next1.event.data.tool).toBe('Read');
    expect(engine.cursor).toBe(1);

    const next2 = engine.skipToNextToolCall();
    expect(next2.event.data.tool).toBe('Edit');
    expect(engine.cursor).toBe(3);

    const next3 = engine.skipToNextToolCall();
    expect(next3).toBeNull(); // No more tool calls

    const prev1 = engine.skipToPrevToolCall();
    expect(prev1.event.data.tool).toBe('Read');
    expect(engine.cursor).toBe(1);
  });

  test('skip to next/prev error', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('tool_use', {}, base),
      makeEvent('error', { message: 'err1' }, base + 100),
      makeEvent('tool_use', {}, base + 200),
      makeEvent('error', { message: 'err2' }, base + 300),
    ]);
    const engine = new ReplayEngine(data);

    const next1 = engine.skipToNextError();
    expect(next1.event.data.message).toBe('err1');

    const next2 = engine.skipToNextError();
    expect(next2.event.data.message).toBe('err2');

    const prev1 = engine.skipToPrevError();
    expect(prev1.event.data.message).toBe('err1');
  });

  test('bookmarks management', () => {
    const base = 1000000;
    const data = makeSessionData([
      makeEvent('a', {}, base),
      makeEvent('b', {}, base + 100),
      makeEvent('c', {}, base + 200),
    ]);
    const engine = new ReplayEngine(data);

    // Add bookmark at current position
    const bm1 = engine.addBookmark('start');
    expect(bm1.name).toBe('start');
    expect(bm1.index).toBe(0);

    // Move cursor and add another bookmark
    engine.seek(2);
    const bm2 = engine.addBookmark('end');
    expect(bm2.index).toBe(2);

    // Get all bookmarks
    const bookmarks = engine.getBookmarks();
    expect(bookmarks).toHaveLength(2);

    // Seek to bookmark
    engine.reset();
    engine.seekToBookmark('end');
    expect(engine.cursor).toBe(2);

    // Clear bookmarks
    engine.clearBookmarks();
    expect(engine.getBookmarks()).toHaveLength(0);
  });

  test('TimelineEntry validates event data', () => {
    expect(() => new TimelineEntry(null, 0)).toThrow('valid event object');
    expect(() => new TimelineEntry({}, 0)).toThrow('valid type');
    expect(() => new TimelineEntry({ type: 'test' }, 0)).toThrow('valid timestamp');
    expect(() => new TimelineEntry({ type: 'test', timestamp: 1000 }, 'invalid')).toThrow('valid number');
  });
});
