/**
 * Tests for ECHO Analytics Engine
 */

import { AnalyticsEngine, SessionMetrics } from '../lib/analytics.mjs';

function makeEvent(type, data = {}, timestamp = 1000000) {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp,
    isoTime: new Date(timestamp).toISOString(),
    data,
  };
}

function makeSession(events, userId = 'tester') {
  return {
    metadata: { sessionId: `s-${Date.now()}`, userId },
    events,
  };
}

describe('SessionMetrics', () => {
  test('totalEvents returns event count', () => {
    const session = makeSession([makeEvent('a'), makeEvent('b')]);
    const metrics = new SessionMetrics(session);
    expect(metrics.totalEvents).toBe(2);
  });

  test('durationMs computes span from first to last event', () => {
    const session = makeSession([
      makeEvent('a', {}, 1000),
      makeEvent('b', {}, 3000),
      makeEvent('c', {}, 5500),
    ]);
    const metrics = new SessionMetrics(session);
    expect(metrics.durationMs).toBe(4500);
  });

  test('durationMs returns 0 for < 2 events', () => {
    expect(new SessionMetrics(makeSession([])).durationMs).toBe(0);
    expect(new SessionMetrics(makeSession([makeEvent('a')])).durationMs).toBe(0);
  });

  test('toolsUsed counts tool invocations', () => {
    const session = makeSession([
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Edit' }),
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('error', { message: 'x' }),
    ]);
    const metrics = new SessionMetrics(session);
    const tools = metrics.toolsUsed();
    expect(tools.Read).toBe(2);
    expect(tools.Edit).toBe(1);
    expect(tools.error).toBeUndefined();
  });

  test('toolFrequency returns percentages', () => {
    const session = makeSession([
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Edit' }),
      makeEvent('tool_use', { tool: 'Bash' }),
    ]);
    const metrics = new SessionMetrics(session);
    const freq = metrics.toolFrequency();
    expect(freq.Read.count).toBe(2);
    expect(freq.Read.percentage).toBe(50);
    expect(freq.Edit.percentage).toBe(25);
  });

  test('timePerTask computes task durations', () => {
    const session = makeSession([
      makeEvent('task_start', { taskId: 't1' }, 1000),
      makeEvent('tool_use', { tool: 'Read' }, 1500),
      makeEvent('task_end', { taskId: 't1', status: 'completed' }, 3000),
    ]);
    const metrics = new SessionMetrics(session);
    const tasks = metrics.timePerTask();
    expect(tasks.t1.durationMs).toBe(2000);
    expect(tasks.t1.status).toBe('completed');
  });

  test('timePerTask marks incomplete tasks', () => {
    const session = makeSession([
      makeEvent('task_start', { taskId: 't1' }, 1000),
      makeEvent('tool_use', { tool: 'Read' }, 5000),
    ]);
    const metrics = new SessionMetrics(session);
    const tasks = metrics.timePerTask();
    expect(tasks.t1.status).toBe('incomplete');
    expect(tasks.t1.durationMs).toBe(4000);
  });

  test('costPerSession sums tool costs', () => {
    const session = makeSession([
      makeEvent('tool_use', { tool: 'Read', cost: 0.005 }),
      makeEvent('tool_use', { tool: 'Edit', cost: 0.012 }),
      makeEvent('error', { message: 'x' }),
    ]);
    const metrics = new SessionMetrics(session);
    expect(metrics.costPerSession()).toBeCloseTo(0.017, 4);
  });

  test('errorRate computes percentage', () => {
    const session = makeSession([
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('error', { message: 'e1' }),
      makeEvent('tool_use', { tool: 'Edit' }),
      makeEvent('error', { message: 'e2' }),
    ]);
    const metrics = new SessionMetrics(session);
    expect(metrics.errorRate()).toBe(50);
  });

  test('errorRate returns 0 for no events', () => {
    expect(new SessionMetrics(makeSession([])).errorRate()).toBe(0);
  });

  test('averageToolDuration computes correctly', () => {
    const session = makeSession([
      makeEvent('tool_use', { tool: 'Read', durationMs: 100 }),
      makeEvent('tool_use', { tool: 'Edit', durationMs: 200 }),
      makeEvent('tool_use', { tool: 'Bash', durationMs: 300 }),
    ]);
    const metrics = new SessionMetrics(session);
    expect(metrics.averageToolDuration()).toBe(200);
  });

  test('computeAll returns full metrics object', () => {
    const session = makeSession([
      makeEvent('tool_use', { tool: 'Read', cost: 0.01, durationMs: 50 }),
      makeEvent('error', { message: 'fail' }),
    ]);
    const metrics = new SessionMetrics(session);
    const all = metrics.computeAll();
    expect(all.sessionId).toBeDefined();
    expect(all.toolsUsed.Read).toBe(1);
    expect(all.errorRate).toBe(50);
    expect(all.costPerSession).toBeCloseTo(0.01);
  });
});

describe('AnalyticsEngine', () => {
  test('aggregates across multiple sessions', () => {
    const engine = new AnalyticsEngine();
    engine.addSession(makeSession([
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }),
      makeEvent('error', { message: 'e1' }),
    ], 'alice'));
    engine.addSession(makeSession([
      makeEvent('tool_use', { tool: 'Edit', cost: 0.02 }),
      makeEvent('tool_use', { tool: 'Read', cost: 0.005 }),
    ], 'bob'));

    expect(engine.aggregateCost()).toBeCloseTo(0.035, 4);
    expect(engine.aggregateErrorRate()).toBeCloseTo(25, 0);

    const toolUsage = engine.aggregateToolUsage();
    expect(toolUsage.Read).toBe(2);
    expect(toolUsage.Edit).toBe(1);
  });

  test('computeAll returns structured aggregate', () => {
    const engine = new AnalyticsEngine();
    engine.addSession(makeSession([makeEvent('tool_use', { tool: 'Bash', cost: 0.1 })]));
    const result = engine.computeAll();
    expect(result.totalSessions).toBe(1);
    expect(result.aggregateCost).toBeCloseTo(0.1);
    expect(result.perSession).toHaveLength(1);
  });

  test('handles empty state', () => {
    const engine = new AnalyticsEngine();
    expect(engine.aggregateCost()).toBe(0);
    expect(engine.aggregateErrorRate()).toBe(0);
    expect(engine.aggregateToolUsage()).toEqual({});
  });
});
