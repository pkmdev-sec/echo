/**
 * Tests for ECHO Analytics Engine
 */

import {
  AnalyticsEngine,
  SessionMetrics,
  mean,
  median,
  percentile,
  standardDeviation,
} from '../lib/analytics.mjs';

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

describe('Statistical Functions', () => {
  test('mean calculates average', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10, 20, 30])).toBe(20);
    expect(mean([100])).toBe(100);
    expect(mean([])).toBe(0);
  });

  test('median finds middle value', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3, 2, 4])).toBe(3);
    expect(median([100])).toBe(100);
    expect(median([])).toBe(0);
  });

  test('percentile calculates correct values', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 50)).toBe(5.5);
    expect(percentile(values, 90)).toBeCloseTo(9.1, 1);
    expect(percentile(values, 95)).toBeCloseTo(9.55, 2);
    expect(percentile(values, 99)).toBeCloseTo(9.91, 2);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 100)).toBe(10);
  });

  test('standardDeviation calculates spread', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const stdDev = standardDeviation(values);
    expect(stdDev).toBeCloseTo(2.0, 1);
    expect(standardDeviation([1, 1, 1, 1])).toBe(0);
    expect(standardDeviation([])).toBe(0);
  });
});

describe('SessionMetrics - Percentiles', () => {
  test('percentileMetrics calculates tool duration percentiles', () => {
    const session = makeSession([
      makeEvent('tool_use', { tool: 'Read', durationMs: 100, cost: 0.01 }),
      makeEvent('tool_use', { tool: 'Edit', durationMs: 200, cost: 0.02 }),
      makeEvent('tool_use', { tool: 'Bash', durationMs: 150, cost: 0.015 }),
      makeEvent('tool_use', { tool: 'Write', durationMs: 300, cost: 0.03 }),
    ]);
    const metrics = new SessionMetrics(session);
    const percentiles = metrics.percentileMetrics();

    expect(percentiles.durations.p50).toBeGreaterThan(0);
    expect(percentiles.durations.p90).toBeGreaterThan(percentiles.durations.p50);
    expect(percentiles.costs.p50).toBeGreaterThan(0);
  });

  test('percentileMetrics handles empty data', () => {
    const session = makeSession([makeEvent('custom', {})]);
    const metrics = new SessionMetrics(session);
    const percentiles = metrics.percentileMetrics();

    expect(percentiles.durations.p50).toBe(0);
    expect(percentiles.costs.p50).toBe(0);
  });
});

describe('AnalyticsEngine - Anomaly Detection', () => {
  test('detectAnomalies finds outliers', () => {
    const engine = new AnalyticsEngine();

    // Add normal sessions
    for (let i = 0; i < 10; i++) {
      engine.addSession(makeSession([
        makeEvent('tool_use', { tool: 'Read', cost: 0.01, durationMs: 100 }, 1000 + i),
        makeEvent('tool_use', { tool: 'Edit', cost: 0.01, durationMs: 100 }, 2000 + i),
      ]));
    }

    // Add anomalous session with high cost
    engine.addSession(makeSession([
      makeEvent('tool_use', { tool: 'Read', cost: 1.0, durationMs: 100 }, 10000),
      makeEvent('tool_use', { tool: 'Edit', cost: 1.0, durationMs: 100 }, 11000),
    ]));

    const anomalies = engine.detectAnomalies(2);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].anomalies.some(a => a.type === 'cost')).toBeTruthy();
  });

  test('detectAnomalies returns empty for uniform data', () => {
    const engine = new AnalyticsEngine();

    for (let i = 0; i < 5; i++) {
      engine.addSession(makeSession([
        makeEvent('tool_use', { tool: 'Read', cost: 0.01, durationMs: 100 }),
      ]));
    }

    const anomalies = engine.detectAnomalies(3);
    expect(anomalies).toHaveLength(0);
  });
});

describe('AnalyticsEngine - Trend Analysis', () => {
  test('trendAnalysis detects patterns over time', () => {
    const engine = new AnalyticsEngine();

    // Add sessions with increasing error rates
    for (let i = 0; i < 15; i++) {
      const events = [makeEvent('tool_use', { tool: 'Read' }, 1000 + i)];
      // Add more errors as we progress
      if (i > 10) {
        events.push(makeEvent('error', { message: 'fail' }, 2000 + i));
      }
      engine.addSession(makeSession(events));
    }

    const trends = engine.trendAnalysis(5);
    expect(trends.trend).toBeDefined();
    expect(trends.windows.length).toBeGreaterThan(0);
    expect(trends.summary.firstWindow).toBeDefined();
    expect(trends.summary.lastWindow).toBeDefined();
  });

  test('trendAnalysis returns insufficient_data for small datasets', () => {
    const engine = new AnalyticsEngine();
    engine.addSession(makeSession([makeEvent('tool_use', { tool: 'Read' })]));

    const trends = engine.trendAnalysis(10);
    expect(trends.trend).toBe('insufficient_data');
  });
});

describe('SessionMetrics - Edge Cases', () => {
  test('handles events with missing timestamps gracefully', () => {
    const session = {
      metadata: { sessionId: 'test' },
      events: [
        { type: 'tool_use', timestamp: 1000, data: {} },
        { type: 'error', timestamp: 2000, data: {} },
      ],
    };
    const metrics = new SessionMetrics(session);
    expect(metrics.durationMs).toBe(1000);
  });
});
