/**
 * ECHO — Team Dashboard
 * Aggregates metrics across team members for organizational insights.
 */

import { AnalyticsEngine, SessionMetrics } from './analytics.mjs';

export class MemberProfile {
  constructor(userId) {
    this.userId = userId;
    this.sessions = [];
    this._sessionsByTime = new Map(); // timestamp -> session for time-based queries
  }

  addSession(sessionData) {
    try {
      const sessionMetrics = new SessionMetrics(sessionData);
      this.sessions.push(sessionMetrics);
      // Track by timestamp for time-based queries
      const timestamp = sessionData.metadata?.startedAt || Date.now();
      this._sessionsByTime.set(timestamp, sessionMetrics);
    } catch (error) {
      throw new Error(`Failed to add session for user ${this.userId}: ${error.message}`);
    }
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
      (sum, s) => sum + s.events.filter(e => e?.type === 'error').length,
      0
    );
    const rate = (totalErrors / totalEvents) * 100;
    if (isNaN(rate)) return 0;
    return Number(rate.toFixed(2));
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

  commonErrors(limit = 5) {
    const errorMessages = {};
    for (const session of this.sessions) {
      const errors = session.errorDetails();
      for (const error of errors) {
        const msg = error.message;
        errorMessages[msg] = (errorMessages[msg] || 0) + 1;
      }
    }
    return Object.entries(errorMessages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([message, count]) => ({ message, count }));
  }

  getSessionsInTimeRange(startTime, endTime) {
    return this.sessions.filter(session => {
      const sessionTime = session.metadata?.startedAt;
      if (!sessionTime) return false;
      return sessionTime >= startTime && sessionTime <= endTime;
    });
  }

  metricsForTimeRange(startTime, endTime) {
    const sessions = this.getSessionsInTimeRange(startTime, endTime);
    if (sessions.length === 0) {
      return {
        sessionCount: 0,
        totalEvents: 0,
        totalCost: 0,
        errorRate: 0,
        totalDurationMs: 0,
      };
    }

    const totalEvents = sessions.reduce((sum, s) => sum + s.totalEvents, 0);
    const totalCost = sessions.reduce((sum, s) => sum + s.costPerSession(), 0);
    const totalDurationMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
    const totalErrors = sessions.reduce(
      (sum, s) => sum + s.events.filter(e => e?.type === 'error').length,
      0
    );
    const errorRate = totalEvents > 0 ? Number(((totalErrors / totalEvents) * 100).toFixed(2)) : 0;

    return {
      sessionCount: sessions.length,
      totalEvents,
      totalCost: Number(totalCost.toFixed(6)),
      errorRate,
      totalDurationMs,
    };
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
      commonErrors: this.commonErrors(),
    };
  }

  detailedBreakdown() {
    const totalErrors = this.sessions.reduce(
      (sum, s) => sum + s.events.filter(e => e?.type === 'error').length,
      0
    );

    return {
      userId: this.userId,
      sessionCount: this.sessionCount,
      totalEvents: this.totalEvents(),
      totalErrors,
      totalDurationMs: this.totalDurationMs(),
      avgDurationPerSession: this.sessionCount > 0 ? Number((this.totalDurationMs() / this.sessionCount).toFixed(2)) : 0,
      totalCost: this.totalCost(),
      avgCostPerSession: this.sessionCount > 0 ? Number((this.totalCost() / this.sessionCount).toFixed(6)) : 0,
      errorRate: this.errorRate(),
      favoriteTools: this.favoriteTools(10),
      commonErrors: this.commonErrors(10),
      toolCount: Object.keys(this.sessions.reduce((acc, s) => ({ ...acc, ...s.toolsUsed() }), {})).length,
    };
  }
}

export class TeamDashboard {
  constructor(teamName = 'default') {
    this.teamName = teamName;
    this.members = new Map();
  }

  addSession(sessionData) {
    try {
      if (!sessionData || typeof sessionData !== 'object') {
        throw new Error('Invalid session data');
      }
      const userId = sessionData.metadata?.userId || 'anonymous';
      if (!this.members.has(userId)) {
        this.members.set(userId, new MemberProfile(userId));
      }
      this.members.get(userId).addSession(sessionData);
    } catch (error) {
      throw new Error(`Failed to add session to team dashboard: ${error.message}`);
    }
  }

  addSessions(sessionDataArray) {
    if (!Array.isArray(sessionDataArray)) {
      throw new Error('sessionDataArray must be an array');
    }
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
    if (this.members.size === 0) return 0;
    let total = 0;
    for (const member of this.members.values()) {
      total += member.totalCost();
    }
    if (isNaN(total)) return 0;
    return Number(total.toFixed(6));
  }

  teamErrorRate() {
    if (this.members.size === 0) return 0;
    let totalEvents = 0;
    let totalErrors = 0;
    for (const member of this.members.values()) {
      totalEvents += member.totalEvents();
      // Count actual errors from sessions instead of using error rate
      for (const session of member.sessions) {
        totalErrors += session.events.filter(e => e?.type === 'error').length;
      }
    }
    if (totalEvents === 0) return 0;
    const rate = (totalErrors / totalEvents) * 100;
    if (isNaN(rate)) return 0;
    return Number(rate.toFixed(2));
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

  topTools(limit = 10) {
    const usage = this.teamToolUsage();
    return Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tool, count]) => ({ tool, count }));
  }

  commonErrors(limit = 10) {
    const errorMessages = {};
    for (const member of this.members.values()) {
      for (const session of member.sessions) {
        const errors = session.errorDetails();
        for (const error of errors) {
          const msg = error.message;
          errorMessages[msg] = (errorMessages[msg] || 0) + 1;
        }
      }
    }
    return Object.entries(errorMessages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([message, count]) => ({ message, count }));
  }

  teamHealthScore() {
    if (this.members.size === 0) return 0;

    // Health score based on error rate (0-100, higher is better)
    const errorRate = this.teamErrorRate();
    let errorScore = 100 - Math.min(errorRate * 10, 100); // 10% error rate = 0 score

    // Bonus points for consistent activity
    const avgSessionsPerMember = this.totalSessions / this.members.size;
    const activityScore = Math.min(avgSessionsPerMember * 10, 50); // Up to 50 bonus points

    const healthScore = Math.min(errorScore + activityScore, 100);
    return Number(healthScore.toFixed(2));
  }

  compareTimePeriods(period1Start, period1End, period2Start, period2End) {
    const period1Metrics = { sessionCount: 0, totalEvents: 0, totalCost: 0, totalErrors: 0, totalDurationMs: 0 };
    const period2Metrics = { sessionCount: 0, totalEvents: 0, totalCost: 0, totalErrors: 0, totalDurationMs: 0 };

    for (const member of this.members.values()) {
      for (const session of member.sessions) {
        const sessionTime = session.metadata?.startedAt;
        if (!sessionTime) continue;

        const sessionEvents = session.totalEvents;
        const sessionCost = session.costPerSession();
        const sessionErrors = session.events.filter(e => e?.type === 'error').length;
        const sessionDuration = session.durationMs;

        if (sessionTime >= period1Start && sessionTime <= period1End) {
          period1Metrics.sessionCount++;
          period1Metrics.totalEvents += sessionEvents;
          period1Metrics.totalCost += sessionCost;
          period1Metrics.totalErrors += sessionErrors;
          period1Metrics.totalDurationMs += sessionDuration;
        }

        if (sessionTime >= period2Start && sessionTime <= period2End) {
          period2Metrics.sessionCount++;
          period2Metrics.totalEvents += sessionEvents;
          period2Metrics.totalCost += sessionCost;
          period2Metrics.totalErrors += sessionErrors;
          period2Metrics.totalDurationMs += sessionDuration;
        }
      }
    }

    // Calculate rates
    const period1ErrorRate = period1Metrics.totalEvents > 0
      ? Number(((period1Metrics.totalErrors / period1Metrics.totalEvents) * 100).toFixed(2))
      : 0;
    const period2ErrorRate = period2Metrics.totalEvents > 0
      ? Number(((period2Metrics.totalErrors / period2Metrics.totalEvents) * 100).toFixed(2))
      : 0;

    period1Metrics.errorRate = period1ErrorRate;
    period2Metrics.errorRate = period2ErrorRate;
    period1Metrics.totalCost = Number(period1Metrics.totalCost.toFixed(6));
    period2Metrics.totalCost = Number(period2Metrics.totalCost.toFixed(6));

    // Calculate changes
    const changes = {
      sessionCount: period2Metrics.sessionCount - period1Metrics.sessionCount,
      totalEvents: period2Metrics.totalEvents - period1Metrics.totalEvents,
      totalCost: Number((period2Metrics.totalCost - period1Metrics.totalCost).toFixed(6)),
      errorRate: Number((period2ErrorRate - period1ErrorRate).toFixed(2)),
      totalDurationMs: period2Metrics.totalDurationMs - period1Metrics.totalDurationMs,
    };

    return {
      period1: period1Metrics,
      period2: period2Metrics,
      changes,
      improvement: changes.errorRate < 0 && changes.totalCost <= 0,
    };
  }

  perDeveloperBreakdown() {
    const breakdown = [];
    for (const member of this.members.values()) {
      breakdown.push(member.detailedBreakdown());
    }
    return breakdown.sort((a, b) => b.sessionCount - a.sessionCount);
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
      teamHealthScore: this.teamHealthScore(),
      teamToolUsage: this.teamToolUsage(),
      topTools: this.topTools(),
      commonErrors: this.commonErrors(),
      members: memberSummaries,
      perDeveloperBreakdown: this.perDeveloperBreakdown(),
    };
  }
}

export default TeamDashboard;
