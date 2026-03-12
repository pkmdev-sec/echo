/**
 * ECHO — Team Dashboard
 * Aggregates metrics across team members for organizational insights.
 */

import { AnalyticsEngine, SessionMetrics } from './analytics.mjs';

export class MemberProfile {
  constructor(userId) {
    this.userId = userId;
    this.sessions = [];
  }

  addSession(sessionData) {
    this.sessions.push(new SessionMetrics(sessionData));
  }

  get sessionCount() {
    return this.sessions.length;
  }

  totalCost() {
    return Number(
      this.sessions.reduce((sum, s) => sum + s.costPerSession(), 0).toFixed(6)
    );
  }

  totalEvents() {
    return this.sessions.reduce((sum, s) => sum + s.totalEvents, 0);
  }

  totalDurationMs() {
    return this.sessions.reduce((sum, s) => sum + s.durationMs, 0);
  }

  errorRate() {
    const totalEvents = this.totalEvents();
    if (totalEvents === 0) return 0;
    const totalErrors = this.sessions.reduce(
      (sum, s) => sum + s.events.filter(e => e.type === 'error').length,
      0
    );
    return Number(((totalErrors / totalEvents) * 100).toFixed(2));
  }

  favoriteTools(limit = 5) {
    const combined = {};
    for (const session of this.sessions) {
      const tools = session.toolsUsed();
      for (const [tool, count] of Object.entries(tools)) {
        combined[tool] = (combined[tool] || 0) + count;
      }
    }
    return Object.entries(combined)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tool, count]) => ({ tool, count }));
  }

  summary() {
    return {
      userId: this.userId,
      sessions: this.sessionCount,
      totalEvents: this.totalEvents(),
      totalDurationMs: this.totalDurationMs(),
      totalCost: this.totalCost(),
      errorRate: this.errorRate(),
      favoriteTools: this.favoriteTools(),
    };
  }
}

export class TeamDashboard {
  constructor(teamName = 'default') {
    this.teamName = teamName;
    this.members = new Map();
  }

  addSession(sessionData) {
    const userId = sessionData.metadata?.userId || 'anonymous';
    if (!this.members.has(userId)) {
      this.members.set(userId, new MemberProfile(userId));
    }
    this.members.get(userId).addSession(sessionData);
  }

  addSessions(sessionDataArray) {
    for (const s of sessionDataArray) {
      this.addSession(s);
    }
  }

  getMember(userId) {
    return this.members.get(userId) || null;
  }

  get memberCount() {
    return this.members.size;
  }

  get totalSessions() {
    let total = 0;
    for (const member of this.members.values()) {
      total += member.sessionCount;
    }
    return total;
  }

  totalCost() {
    let total = 0;
    for (const member of this.members.values()) {
      total += member.totalCost();
    }
    return Number(total.toFixed(6));
  }

  teamErrorRate() {
    let totalEvents = 0;
    let totalErrors = 0;
    for (const member of this.members.values()) {
      totalEvents += member.totalEvents();
      totalErrors += member.sessions.reduce(
        (sum, s) => sum + s.events.filter(e => e.type === 'error').length,
        0
      );
    }
    if (totalEvents === 0) return 0;
    return Number(((totalErrors / totalEvents) * 100).toFixed(2));
  }

  leaderboard(metric = 'sessions') {
    const entries = [];
    for (const member of this.members.values()) {
      const summary = member.summary();
      let value;
      switch (metric) {
        case 'sessions':
          value = summary.sessions;
          break;
        case 'cost':
          value = summary.totalCost;
          break;
        case 'events':
          value = summary.totalEvents;
          break;
        case 'errorRate':
          value = summary.errorRate;
          break;
        default:
          value = summary.sessions;
      }
      entries.push({ userId: summary.userId, value });
    }
    return entries.sort((a, b) => b.value - a.value);
  }

  teamToolUsage() {
    const combined = {};
    for (const member of this.members.values()) {
      for (const session of member.sessions) {
        const tools = session.toolsUsed();
        for (const [tool, count] of Object.entries(tools)) {
          combined[tool] = (combined[tool] || 0) + count;
        }
      }
    }
    return combined;
  }

  summary() {
    const memberSummaries = [];
    for (const member of this.members.values()) {
      memberSummaries.push(member.summary());
    }
    return {
      teamName: this.teamName,
      memberCount: this.memberCount,
      totalSessions: this.totalSessions,
      totalCost: this.totalCost(),
      teamErrorRate: this.teamErrorRate(),
      teamToolUsage: this.teamToolUsage(),
      members: memberSummaries,
    };
  }
}

export default TeamDashboard;
