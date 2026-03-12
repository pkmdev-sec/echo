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

function makeSession(userId, events) {
  return {
    metadata: { sessionId: `s-${Math.random().toString(36).slice(2, 8)}`, userId },
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
