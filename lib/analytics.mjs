/**
 * ECHO — Analytics Engine
 * Computes metrics: tools used, time per task, cost per session, error rate.
 */

// Statistical helper functions
export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  if (p < 0 || p > 100) {
    throw new Error('Percentile must be between 0 and 100');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function standardDeviation(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
  const variance = mean(squaredDiffs);
  return Math.sqrt(variance);
}

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

  percentileMetrics() {
    const durations = this.events
      .filter(e => e?.type === 'tool_use' && typeof e.data?.durationMs === 'number' && !isNaN(e.data.durationMs))
      .map(e => e.data.durationMs);

    const costs = this.events
      .filter(e => e?.type === 'tool_use' && typeof e.data?.cost === 'number' && !isNaN(e.data.cost))
      .map(e => e.data.cost);

    if (durations.length === 0 && costs.length === 0) {
      return {
        durations: { p50: 0, p90: 0, p95: 0, p99: 0 },
        costs: { p50: 0, p90: 0, p95: 0, p99: 0 },
      };
    }

    return {
      durations: {
        p50: durations.length > 0 ? Number(percentile(durations, 50).toFixed(2)) : 0,
        p90: durations.length > 0 ? Number(percentile(durations, 90).toFixed(2)) : 0,
        p95: durations.length > 0 ? Number(percentile(durations, 95).toFixed(2)) : 0,
        p99: durations.length > 0 ? Number(percentile(durations, 99).toFixed(2)) : 0,
      },
      costs: {
        p50: costs.length > 0 ? Number(percentile(costs, 50).toFixed(6)) : 0,
        p90: costs.length > 0 ? Number(percentile(costs, 90).toFixed(6)) : 0,
        p95: costs.length > 0 ? Number(percentile(costs, 95).toFixed(6)) : 0,
        p99: costs.length > 0 ? Number(percentile(costs, 99).toFixed(6)) : 0,
      },
    };
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
      percentiles: this.percentileMetrics(),
    };
  }
}

export class AnalyticsEngine {
  constructor() {
    this.sessions = [];
    this._baseline = null;
    this._filteredSessions = null; // Cache for filtered sessions
  }

  addSession(sessionData) {
    try {
      const metrics = new SessionMetrics(sessionData);
      this.sessions.push(metrics);
      this._filteredSessions = null; // Invalidate cache
      return metrics;
    } catch (error) {
      throw new Error(`Failed to add session: ${error.message}`);
    }
  }

  // Get sessions to analyze (either filtered or all)
  _getActiveSessions() {
    return this._filteredSessions !== null ? this._filteredSessions : this.sessions;
  }

  // Clear any active filters
  clearFilters() {
    this._filteredSessions = null;
    return this;
  }

  // Filter sessions by date range
  filterByDateRange(startDate, endDate) {
    const startTime = startDate instanceof Date ? startDate.getTime() : new Date(startDate).getTime();
    const endTime = endDate instanceof Date ? endDate.getTime() : new Date(endDate).getTime();

    if (isNaN(startTime) || isNaN(endTime)) {
      throw new Error('Invalid date range provided');
    }

    if (startTime > endTime) {
      throw new Error('Start date must be before or equal to end date');
    }

    this._filteredSessions = this.sessions.filter(session => {
      const sessionTime = session.metadata?.startedAt;
      if (!sessionTime || typeof sessionTime !== 'number') return false;
      return sessionTime >= startTime && sessionTime <= endTime;
    });

    return this;
  }

  // Filter sessions by time of day (hour of day, 0-23)
  filterByTimeOfDay(startHour, endHour) {
    if (typeof startHour !== 'number' || typeof endHour !== 'number') {
      throw new Error('Start and end hours must be numbers');
    }

    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
      throw new Error('Hours must be between 0 and 23');
    }

    this._filteredSessions = this.sessions.filter(session => {
      const sessionTime = session.metadata?.startedAt;
      if (!sessionTime || typeof sessionTime !== 'number') return false;

      const sessionDate = new Date(sessionTime);
      const hour = sessionDate.getHours();

      // Handle ranges that cross midnight
      if (startHour <= endHour) {
        return hour >= startHour && hour <= endHour;
      } else {
        return hour >= startHour || hour <= endHour;
      }
    });

    return this;
  }

  // Get daily breakdown of metrics
  dailyBreakdown() {
    const activeSessions = this._getActiveSessions();
    const dailyData = new Map();

    for (const session of activeSessions) {
      const sessionTime = session.metadata?.startedAt;
      if (!sessionTime || typeof sessionTime !== 'number') continue;

      const date = new Date(sessionTime);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!dailyData.has(dateKey)) {
        dailyData.set(dateKey, {
          date: dateKey,
          sessions: [],
          totalSessions: 0,
          totalEvents: 0,
          totalCost: 0,
          totalDuration: 0,
          totalErrors: 0,
        });
      }

      const dayData = dailyData.get(dateKey);
      dayData.sessions.push(session);
      dayData.totalSessions++;
      dayData.totalEvents += session.totalEvents;
      dayData.totalCost += session.costPerSession();
      dayData.totalDuration += session.durationMs;
      dayData.totalErrors += session.events.filter(e => e?.type === 'error').length;
    }

    // Calculate derived metrics for each day
    const breakdown = Array.from(dailyData.values()).map(day => {
      const errorRate = day.totalEvents > 0
        ? Number(((day.totalErrors / day.totalEvents) * 100).toFixed(2))
        : 0;

      const avgDuration = day.totalSessions > 0
        ? Number((day.totalDuration / day.totalSessions).toFixed(2))
        : 0;

      const avgCost = day.totalSessions > 0
        ? Number((day.totalCost / day.totalSessions).toFixed(6))
        : 0;

      return {
        date: day.date,
        totalSessions: day.totalSessions,
        totalEvents: day.totalEvents,
        totalCost: Number(day.totalCost.toFixed(6)),
        totalDuration: day.totalDuration,
        errorRate,
        avgDuration,
        avgCost,
      };
    });

    // Sort by date
    return breakdown.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Get week-over-week comparison
  weeklyTrend() {
    const activeSessions = this._getActiveSessions();
    const weeklyData = new Map();

    for (const session of activeSessions) {
      const sessionTime = session.metadata?.startedAt;
      if (!sessionTime || typeof sessionTime !== 'number') continue;

      const date = new Date(sessionTime);
      // Get ISO week number
      const weekStart = new Date(date);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, {
          weekStart: weekKey,
          sessions: [],
          totalSessions: 0,
          totalEvents: 0,
          totalCost: 0,
          totalDuration: 0,
          totalErrors: 0,
        });
      }

      const weekData = weeklyData.get(weekKey);
      weekData.sessions.push(session);
      weekData.totalSessions++;
      weekData.totalEvents += session.totalEvents;
      weekData.totalCost += session.costPerSession();
      weekData.totalDuration += session.durationMs;
      weekData.totalErrors += session.events.filter(e => e?.type === 'error').length;
    }

    // Calculate metrics and week-over-week changes
    const weeks = Array.from(weeklyData.values())
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((week, index, array) => {
        const errorRate = week.totalEvents > 0
          ? Number(((week.totalErrors / week.totalEvents) * 100).toFixed(2))
          : 0;

        const avgDuration = week.totalSessions > 0
          ? Number((week.totalDuration / week.totalSessions).toFixed(2))
          : 0;

        const avgCost = week.totalSessions > 0
          ? Number((week.totalCost / week.totalSessions).toFixed(6))
          : 0;

        let changes = null;
        if (index > 0) {
          const prevWeek = array[index - 1];
          const prevErrorRate = prevWeek.totalEvents > 0
            ? Number(((prevWeek.totalErrors / prevWeek.totalEvents) * 100).toFixed(2))
            : 0;

          changes = {
            sessions: week.totalSessions - prevWeek.totalSessions,
            cost: Number((week.totalCost - prevWeek.totalCost).toFixed(6)),
            errorRate: Number((errorRate - prevErrorRate).toFixed(2)),
            duration: week.totalDuration - prevWeek.totalDuration,
          };
        }

        return {
          weekStart: week.weekStart,
          totalSessions: week.totalSessions,
          totalEvents: week.totalEvents,
          totalCost: Number(week.totalCost.toFixed(6)),
          totalDuration: week.totalDuration,
          errorRate,
          avgDuration,
          avgCost,
          weekOverWeekChange: changes,
        };
      });

    return {
      weeks,
      summary: weeks.length > 0 ? {
        firstWeek: weeks[0],
        lastWeek: weeks[weeks.length - 1],
        totalWeeks: weeks.length,
        overallTrend: weeks.length > 1 ? this._calculateTrend(weeks) : 'insufficient_data',
      } : null,
    };
  }

  _calculateTrend(weeks) {
    if (weeks.length < 2) return 'stable';

    const first = weeks[0];
    const last = weeks[weeks.length - 1];

    const errorRateChange = last.errorRate - first.errorRate;
    const costChange = ((last.totalCost - first.totalCost) / first.totalCost) * 100;

    if (errorRateChange > 5 || costChange > 25) {
      return 'degrading';
    } else if (errorRateChange < -5 || costChange < -25) {
      return 'improving';
    }
    return 'stable';
  }

  setBaseline(baselineMetrics) {
    // Baseline should contain: { errorRate, avgDuration, avgCost }
    this._baseline = baselineMetrics;
  }

  getBaseline() {
    if (this._baseline) return this._baseline;
    // Auto-compute baseline from all sessions
    if (this.sessions.length === 0) return null;

    const durations = this.sessions.map(s => s.durationMs).filter(d => d > 0);
    const costs = this.sessions.map(s => s.costPerSession());
    const errorRates = this.sessions.map(s => s.errorRate());

    return {
      avgDuration: mean(durations),
      avgCost: mean(costs),
      avgErrorRate: mean(errorRates),
      stdDevDuration: standardDeviation(durations),
      stdDevCost: standardDeviation(costs),
      stdDevErrorRate: standardDeviation(errorRates),
    };
  }

  aggregateCost() {
    const activeSessions = this._getActiveSessions();
    return Number(
      activeSessions.reduce((sum, s) => sum + s.costPerSession(), 0).toFixed(6)
    );
  }

  aggregateErrorRate() {
    const activeSessions = this._getActiveSessions();
    if (activeSessions.length === 0) return 0;
    const totalEvents = activeSessions.reduce((s, m) => s + m.totalEvents, 0);
    const totalErrors = activeSessions.reduce(
      (s, m) => s + m.events.filter(e => e?.type === 'error').length,
      0
    );
    if (totalEvents === 0) return 0;
    const rate = (totalErrors / totalEvents) * 100;
    if (isNaN(rate)) return 0;
    return Number(rate.toFixed(2));
  }

  aggregateToolUsage() {
    const activeSessions = this._getActiveSessions();
    const combined = {};
    for (const session of activeSessions) {
      const tools = session.toolsUsed();
      for (const [tool, count] of Object.entries(tools)) {
        combined[tool] = (combined[tool] || 0) + count;
      }
    }
    return combined;
  }

  detectAnomalies(stdDevThreshold = 2) {
    const baseline = this.getBaseline();
    if (!baseline) return [];

    const anomalies = [];
    for (const session of this.sessions) {
      const sessionAnomalies = [];

      // Check duration anomaly
      if (baseline.stdDevDuration > 0) {
        const durationZScore = Math.abs((session.durationMs - baseline.avgDuration) / baseline.stdDevDuration);
        if (durationZScore > stdDevThreshold) {
          sessionAnomalies.push({
            type: 'duration',
            value: session.durationMs,
            expected: baseline.avgDuration,
            zScore: Number(durationZScore.toFixed(2)),
          });
        }
      }

      // Check cost anomaly
      if (baseline.stdDevCost > 0) {
        const cost = session.costPerSession();
        const costZScore = Math.abs((cost - baseline.avgCost) / baseline.stdDevCost);
        if (costZScore > stdDevThreshold) {
          sessionAnomalies.push({
            type: 'cost',
            value: cost,
            expected: baseline.avgCost,
            zScore: Number(costZScore.toFixed(2)),
          });
        }
      }

      // Check error rate anomaly
      if (baseline.stdDevErrorRate > 0) {
        const errorRate = session.errorRate();
        const errorZScore = Math.abs((errorRate - baseline.avgErrorRate) / baseline.stdDevErrorRate);
        if (errorZScore > stdDevThreshold) {
          sessionAnomalies.push({
            type: 'errorRate',
            value: errorRate,
            expected: baseline.avgErrorRate,
            zScore: Number(errorZScore.toFixed(2)),
          });
        }
      }

      if (sessionAnomalies.length > 0) {
        anomalies.push({
          sessionId: session.metadata.sessionId || 'unknown',
          userId: session.metadata.userId || 'unknown',
          anomalies: sessionAnomalies,
        });
      }
    }

    return anomalies;
  }

  trendAnalysis(windowSize = 10) {
    if (this.sessions.length < windowSize) {
      return {
        trend: 'insufficient_data',
        windows: [],
      };
    }

    const windows = [];
    for (let i = 0; i <= this.sessions.length - windowSize; i++) {
      const windowSessions = this.sessions.slice(i, i + windowSize);
      const durations = windowSessions.map(s => s.durationMs).filter(d => d > 0);
      const costs = windowSessions.map(s => s.costPerSession());
      const errorRates = windowSessions.map(s => s.errorRate());

      windows.push({
        startIndex: i,
        endIndex: i + windowSize - 1,
        avgDuration: mean(durations),
        avgCost: mean(costs),
        avgErrorRate: mean(errorRates),
      });
    }

    // Detect trend direction
    let trend = 'stable';
    if (windows.length >= 2) {
      const first = windows[0];
      const last = windows[windows.length - 1];
      const durationChange = ((last.avgDuration - first.avgDuration) / first.avgDuration) * 100;
      const errorRateChange = last.avgErrorRate - first.avgErrorRate;

      if (errorRateChange > 5 || durationChange > 20) {
        trend = 'degrading';
      } else if (errorRateChange < -5 || durationChange < -20) {
        trend = 'improving';
      }
    }

    return {
      trend,
      windows,
      summary: {
        firstWindow: windows[0],
        lastWindow: windows[windows.length - 1],
        totalWindows: windows.length,
      },
    };
  }

  computeAll() {
    const activeSessions = this._getActiveSessions();
    return {
      totalSessions: activeSessions.length,
      filteredCount: this._filteredSessions !== null ? this._filteredSessions.length : this.sessions.length,
      isFiltered: this._filteredSessions !== null,
      aggregateCost: this.aggregateCost(),
      aggregateErrorRate: this.aggregateErrorRate(),
      aggregateToolUsage: this.aggregateToolUsage(),
      baseline: this.getBaseline(),
      anomalies: this.detectAnomalies(),
      trends: this.trendAnalysis(),
      dailyBreakdown: this.dailyBreakdown(),
      weeklyTrend: this.weeklyTrend(),
      perSession: activeSessions.map(s => s.computeAll()),
    };
  }
}

export default AnalyticsEngine;
