/**
 * ECHO — Analytics Engine
 * Computes metrics: tools used, time per task, cost per session, error rate.
 */

export class SessionMetrics {
  constructor(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
      throw new Error('SessionMetrics requires valid session data');
    }
    this.metadata = sessionData.metadata || {};
    this.events = Array.isArray(sessionData.events) ? sessionData.events : [];
  }

  get totalEvents() {
    return this.events.length;
  }

  get durationMs() {
    if (this.events.length < 2) return 0;
    const first = this.events[0]?.timestamp;
    const last = this.events[this.events.length - 1]?.timestamp;
    if (typeof first !== 'number' || typeof last !== 'number' || isNaN(first) || isNaN(last)) {
      return 0;
    }
    return last - first;
  }

  toolsUsed() {
    const toolEvents = this.events.filter(e => e?.type === 'tool_use');
    const counts = {};
    for (const evt of toolEvents) {
      const name = evt.data?.tool || 'unknown';
      counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }

  toolFrequency() {
    const counts = this.toolsUsed();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return {};
    const freq = {};
    for (const [tool, count] of Object.entries(counts)) {
      freq[tool] = { count, percentage: Number(((count / total) * 100).toFixed(2)) };
    }
    return freq;
  }

  timePerTask() {
    const tasks = {};
    const starts = {};
    for (const evt of this.events) {
      if (evt.type === 'task_start') {
        starts[evt.data?.taskId] = evt.timestamp;
      } else if (evt.type === 'task_end' && starts[evt.data?.taskId] !== undefined) {
        tasks[evt.data.taskId] = {
          durationMs: evt.timestamp - starts[evt.data.taskId],
          status: evt.data?.status || 'completed',
        };
        delete starts[evt.data.taskId];
      }
    }
    // Mark incomplete tasks - guard against malformed event data
    for (const [taskId, startTime] of Object.entries(starts)) {
      if (this.events.length === 0) continue;
      const lastEvent = this.events[this.events.length - 1];
      const lastTs = lastEvent?.timestamp;
      if (typeof lastTs !== 'number' || isNaN(lastTs)) {
        console.warn(`Skipping incomplete task ${taskId}: invalid timestamp on last event`);
        continue;
      }
      tasks[taskId] = {
        durationMs: lastTs - startTime,
        status: 'incomplete',
      };
    }
    return tasks;
  }

  costPerSession() {
    let total = 0;
    for (const evt of this.events) {
      if (evt.type === 'tool_use' && typeof evt.data.cost === 'number') {
        total += evt.data.cost;
      }
    }
    return Number(total.toFixed(6));
  }

  errorRate() {
    if (this.events.length === 0) return 0;
    const errors = this.events.filter(e => e.type === 'error').length;
    return Number(((errors / this.events.length) * 100).toFixed(2));
  }

  errorDetails() {
    return this.events
      .filter(e => e?.type === 'error')
      .map(e => ({
        message: e.data?.message || 'Unknown error',
        timestamp: e.timestamp,
        isoTime: e.isoTime,
      }));
  }

  averageToolDuration() {
    const toolEvents = this.events.filter(
      e => e?.type === 'tool_use' && typeof e.data?.durationMs === 'number' && !isNaN(e.data.durationMs)
    );
    if (toolEvents.length === 0) return 0;
    const total = toolEvents.reduce((sum, e) => sum + e.data.durationMs, 0);
    if (isNaN(total)) return 0;
    return Number((total / toolEvents.length).toFixed(2));
  }

  computeAll() {
    return {
      sessionId: this.metadata.sessionId || 'unknown',
      userId: this.metadata.userId || 'unknown',
      totalEvents: this.totalEvents,
      durationMs: this.durationMs,
      toolsUsed: this.toolsUsed(),
      toolFrequency: this.toolFrequency(),
      timePerTask: this.timePerTask(),
      costPerSession: this.costPerSession(),
      errorRate: this.errorRate(),
      errorDetails: this.errorDetails(),
      averageToolDuration: this.averageToolDuration(),
    };
  }
}

export class AnalyticsEngine {
  constructor() {
    this.sessions = [];
  }

  addSession(sessionData) {
    try {
      const metrics = new SessionMetrics(sessionData);
      this.sessions.push(metrics);
      return metrics;
    } catch (error) {
      throw new Error(`Failed to add session: ${error.message}`);
    }
  }

  aggregateCost() {
    return Number(
      this.sessions.reduce((sum, s) => sum + s.costPerSession(), 0).toFixed(6)
    );
  }

  aggregateErrorRate() {
    if (this.sessions.length === 0) return 0;
    const totalEvents = this.sessions.reduce((s, m) => s + m.totalEvents, 0);
    const totalErrors = this.sessions.reduce(
      (s, m) => s + m.events.filter(e => e?.type === 'error').length,
      0
    );
    if (totalEvents === 0) return 0;
    const rate = (totalErrors / totalEvents) * 100;
    if (isNaN(rate)) return 0;
    return Number(rate.toFixed(2));
  }

  aggregateToolUsage() {
    const combined = {};
    for (const session of this.sessions) {
      const tools = session.toolsUsed();
      for (const [tool, count] of Object.entries(tools)) {
        combined[tool] = (combined[tool] || 0) + count;
      }
    }
    return combined;
  }

  computeAll() {
    return {
      totalSessions: this.sessions.length,
      aggregateCost: this.aggregateCost(),
      aggregateErrorRate: this.aggregateErrorRate(),
      aggregateToolUsage: this.aggregateToolUsage(),
      perSession: this.sessions.map(s => s.computeAll()),
    };
  }
}

export default AnalyticsEngine;
