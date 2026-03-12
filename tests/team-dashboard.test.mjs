/**
 * Tests for ECHO Team Dashboard
 */

import { TeamDashboard, MemberProfile } from '../lib/team-dashboard.mjs';

function makeEvent(type, data = {}, timestamp = 1000000) {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp,
    isoTime: new Date(timestamp).toISOString(),
    data,
  };
}

function makeSession(userId, events, startedAt = null) {
  return {
    metadata: {
      sessionId: `s-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      startedAt: startedAt || Date.now(),
    },
    events,
  };
}

describe('MemberProfile', () => {
  test('tracks sessions for a user', () => {
    const member = new MemberProfile('alice');
    member.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }, 1000),
      makeEvent('tool_use', { tool: 'Edit', cost: 0.02 }, 2000),
    ]));
    member.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Bash', cost: 0.005 }, 5000),
      makeEvent('error', { message: 'oops' }, 6000),
    ]));

    expect(member.sessionCount).toBe(2);
    expect(member.totalCost()).toBeCloseTo(0.035, 4);
    expect(member.totalEvents()).toBe(4);
    expect(member.errorRate()).toBe(25);
  });

  test('favoriteTools returns top tools', () => {
    const member = new MemberProfile('bob');
    member.addSession(makeSession('bob', [
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Edit' }),
      makeEvent('tool_use', { tool: 'Bash' }),
      makeEvent('tool_use', { tool: 'Read' }),
    ]));
    const favs = member.favoriteTools(2);
    expect(favs).toHaveLength(2);
    expect(favs[0].tool).toBe('Read');
    expect(favs[0].count).toBe(3);
  });

  test('summary returns correct structure', () => {
    const member = new MemberProfile('carol');
    member.addSession(makeSession('carol', [
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }, 1000),
    ]));
    const summary = member.summary();
    expect(summary.userId).toBe('carol');
    expect(summary.sessions).toBe(1);
    expect(summary.totalCost).toBeCloseTo(0.01);
  });
});

describe('TeamDashboard', () => {
  let dashboard;

  beforeEach(() => {
    dashboard = new TeamDashboard('test-team');
    dashboard.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }, 1000),
      makeEvent('tool_use', { tool: 'Edit', cost: 0.02 }, 2000),
    ]));
    dashboard.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Bash', cost: 0.005 }, 3000),
    ]));
    dashboard.addSession(makeSession('bob', [
      makeEvent('tool_use', { tool: 'Read', cost: 0.015 }, 1000),
      makeEvent('error', { message: 'fail' }, 2000),
    ]));
  });

  test('tracks member count', () => {
    expect(dashboard.memberCount).toBe(2);
  });

  test('totalSessions aggregates correctly', () => {
    expect(dashboard.totalSessions).toBe(3);
  });

  test('totalCost sums across all members', () => {
    expect(dashboard.totalCost()).toBeCloseTo(0.05, 3);
  });

  test('teamErrorRate computes across all sessions', () => {
    // 1 error out of 5 events = 20%
    expect(dashboard.teamErrorRate()).toBe(20);
  });

  test('getMember retrieves correct profile', () => {
    const alice = dashboard.getMember('alice');
    expect(alice).not.toBeNull();
    expect(alice.sessionCount).toBe(2);

    expect(dashboard.getMember('nonexistent')).toBeNull();
  });

  test('leaderboard sorts by metric', () => {
    const bySession = dashboard.leaderboard('sessions');
    expect(bySession[0].userId).toBe('alice');
    expect(bySession[0].value).toBe(2);

    const byCost = dashboard.leaderboard('cost');
    expect(byCost[0].userId).toBe('alice');
  });

  test('teamToolUsage aggregates all tools', () => {
    const tools = dashboard.teamToolUsage();
    expect(tools.Read).toBe(2);
    expect(tools.Edit).toBe(1);
    expect(tools.Bash).toBe(1);
  });

  test('addSessions batch import', () => {
    const d = new TeamDashboard('batch');
    d.addSessions([
      makeSession('x', [makeEvent('tool_use', { tool: 'A' })]),
      makeSession('y', [makeEvent('tool_use', { tool: 'B' })]),
    ]);
    expect(d.memberCount).toBe(2);
    expect(d.totalSessions).toBe(2);
  });

  test('summary returns full team structure', () => {
    const summary = dashboard.summary();
    expect(summary.teamName).toBe('test-team');
    expect(summary.memberCount).toBe(2);
    expect(summary.members).toHaveLength(2);
    expect(summary.totalCost).toBeGreaterThan(0);
    expect(summary.teamToolUsage).toBeDefined();
  });
});

describe('MemberProfile - Time-based queries', () => {
  test('commonErrors tracks error messages', () => {
    const member = new MemberProfile('dave');
    member.addSession(makeSession('dave', [
      makeEvent('error', { message: 'File not found' }),
      makeEvent('error', { message: 'File not found' }),
      makeEvent('error', { message: 'Permission denied' }),
    ]));

    const errors = member.commonErrors(2);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toBe('File not found');
    expect(errors[0].count).toBe(2);
  });

  test('getSessionsInTimeRange filters correctly', () => {
    const member = new MemberProfile('eve');
    const now = Date.now();

    member.addSession(makeSession('eve', [makeEvent('a')], now - 3000));
    member.addSession(makeSession('eve', [makeEvent('b')], now - 2000));
    member.addSession(makeSession('eve', [makeEvent('c')], now - 1000));

    const recent = member.getSessionsInTimeRange(now - 2500, now);
    expect(recent.length).toBe(2);
  });

  test('metricsForTimeRange computes period metrics', () => {
    const member = new MemberProfile('frank');
    const now = Date.now();

    member.addSession(makeSession('frank', [
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }, 1000),
    ], now - 3000));

    member.addSession(makeSession('frank', [
      makeEvent('tool_use', { tool: 'Edit', cost: 0.02 }, 1000),
      makeEvent('error', { message: 'fail' }, 2000),
    ], now - 1000));

    const metrics = member.metricsForTimeRange(now - 2000, now);
    expect(metrics.sessionCount).toBe(1);
    expect(metrics.totalCost).toBeCloseTo(0.02);
    expect(metrics.errorRate).toBe(50);
  });

  test('detailedBreakdown provides comprehensive stats', () => {
    const member = new MemberProfile('grace');
    member.addSession(makeSession('grace', [
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }, 1000),
      makeEvent('tool_use', { tool: 'Edit', cost: 0.02 }, 2000),
      makeEvent('error', { message: 'fail' }, 3000),
    ]));

    const breakdown = member.detailedBreakdown();
    expect(breakdown.userId).toBe('grace');
    expect(breakdown.sessionCount).toBe(1);
    expect(breakdown.totalErrors).toBe(1);
    expect(breakdown.avgCostPerSession).toBeCloseTo(0.03);
    expect(breakdown.toolCount).toBeGreaterThan(0);
  });
});

describe('TeamDashboard - Advanced Features', () => {
  test('topTools returns most used tools', () => {
    const dashboard = new TeamDashboard('tools-team');
    dashboard.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Edit' }),
    ]));
    dashboard.addSession(makeSession('bob', [
      makeEvent('tool_use', { tool: 'Read' }),
    ]));

    const top = dashboard.topTools(2);
    expect(top).toHaveLength(2);
    expect(top[0].tool).toBe('Read');
    expect(top[0].count).toBe(3);
  });

  test('commonErrors aggregates team errors', () => {
    const dashboard = new TeamDashboard('errors-team');
    dashboard.addSession(makeSession('alice', [
      makeEvent('error', { message: 'Network timeout' }),
      makeEvent('error', { message: 'Network timeout' }),
    ]));
    dashboard.addSession(makeSession('bob', [
      makeEvent('error', { message: 'Network timeout' }),
      makeEvent('error', { message: 'Invalid input' }),
    ]));

    const errors = dashboard.commonErrors(2);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toBe('Network timeout');
    expect(errors[0].count).toBe(3);
  });

  test('teamHealthScore calculates health metric', () => {
    const dashboard = new TeamDashboard('health-team');
    dashboard.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Edit' }),
    ]));

    const health = dashboard.teamHealthScore();
    expect(health).toBeGreaterThan(0);
    expect(health).toBeLessThanOrEqual(100);
  });

  test('compareTimePeriods analyzes trends', () => {
    const dashboard = new TeamDashboard('trend-team');
    const now = Date.now();

    // Last week - good performance
    dashboard.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }, 1000),
    ], now - 7 * 24 * 60 * 60 * 1000));

    // This week - degraded performance
    dashboard.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Read', cost: 0.05 }, 1000),
      makeEvent('error', { message: 'fail' }, 2000),
    ], now - 1000));

    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const comparison = dashboard.compareTimePeriods(
      weekAgo - 1000,
      weekAgo + 1000,
      now - 2000,
      now
    );

    expect(comparison.period1).toBeDefined();
    expect(comparison.period2).toBeDefined();
    expect(comparison.changes).toBeDefined();
    expect(comparison.improvement).toBeDefined();
  });

  test('perDeveloperBreakdown returns sorted details', () => {
    const dashboard = new TeamDashboard('dev-team');
    dashboard.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('tool_use', { tool: 'Edit' }),
    ]));
    dashboard.addSession(makeSession('alice', [
      makeEvent('tool_use', { tool: 'Bash' }),
    ]));
    dashboard.addSession(makeSession('bob', [
      makeEvent('tool_use', { tool: 'Read' }),
    ]));

    const breakdown = dashboard.perDeveloperBreakdown();
    expect(breakdown).toHaveLength(2);
    // Should be sorted by session count
    expect(breakdown[0].userId).toBe('alice');
    expect(breakdown[0].sessionCount).toBe(2);
  });
});
