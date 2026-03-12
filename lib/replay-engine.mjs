/**
 * ECHO — Replay Engine
 * Reconstructs session timelines for review and debugging.
 */

export class TimelineEntry {
  constructor(event, relativeMs) {
    this.event = event;
    this.relativeMs = relativeMs;
    this.relativeFormatted = TimelineEntry.formatDuration(relativeMs);
  }

  static formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}.${String(ms % 1000).padStart(3, '0')}s`;
  }
}

export class ReplayEngine {
  constructor(sessionData) {
    if (!sessionData || !sessionData.events) {
      throw new Error('Invalid session data: events array required.');
    }
    if (!Array.isArray(sessionData.events)) {
      throw new Error('Invalid session data: events must be an array.');
    }
    this.metadata = sessionData.metadata || {};
    // Validate and filter events
    this.events = this._validateEvents(sessionData.events);
    this._timeline = null;
    this._cursor = 0;
  }

  _validateEvents(events) {
    const validated = [];
    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if (!evt || typeof evt !== 'object') {
        console.warn(`Skipping invalid event at index ${i}: not an object`);
        continue;
      }
      if (!evt.type || typeof evt.type !== 'string') {
        console.warn(`Skipping invalid event at index ${i}: missing or invalid type`);
        continue;
      }
      if (typeof evt.timestamp !== 'number' || isNaN(evt.timestamp)) {
        console.warn(`Skipping invalid event at index ${i}: missing or invalid timestamp`);
        continue;
      }
      validated.push(evt);
    }
    return validated;
  }

  get length() {
    return this.events.length;
  }

  get cursor() {
    return this._cursor;
  }

  buildTimeline() {
    if (this.events.length === 0) {
      this._timeline = [];
      return this._timeline;
    }
    try {
      const baseTime = this.events[0].timestamp;
      this._timeline = this.events.map(evt => {
        const relativeMs = evt.timestamp - baseTime;
        return new TimelineEntry(evt, relativeMs);
      });
      return this._timeline;
    } catch (error) {
      throw new Error(`Failed to build timeline: ${error.message}`);
    }
  }

  getTimeline() {
    if (!this._timeline) this.buildTimeline();
    return this._timeline;
  }

  filterByType(type) {
    return this.getTimeline().filter(entry => entry.event.type === type);
  }

  filterByTimeRange(startMs, endMs) {
    return this.getTimeline().filter(
      entry => entry.relativeMs >= startMs && entry.relativeMs <= endMs
    );
  }

  search(predicate) {
    return this.getTimeline().filter(predicate);
  }

  seek(index) {
    if (index < 0 || index >= this.events.length) {
      throw new RangeError(`Index ${index} out of bounds [0, ${this.events.length - 1}]`);
    }
    this._cursor = index;
    return this.getTimeline()[index];
  }

  next() {
    if (this._cursor >= this.events.length - 1) return null;
    this._cursor++;
    return this.getTimeline()[this._cursor];
  }

  prev() {
    if (this._cursor <= 0) return null;
    this._cursor--;
    return this.getTimeline()[this._cursor];
  }

  current() {
    if (this.events.length === 0) return null;
    return this.getTimeline()[this._cursor];
  }

  reset() {
    this._cursor = 0;
  }

  getToolSequence() {
    return this.filterByType('tool_use').map(entry => ({
      tool: entry.event.data?.tool || 'unknown',
      durationMs: entry.event.data?.durationMs || 0,
      cost: entry.event.data?.cost || 0,
      relativeMs: entry.relativeMs,
    }));
  }

  getErrorSequence() {
    return this.filterByType('error').map(entry => ({
      message: entry.event.data?.message || 'Unknown error',
      relativeMs: entry.relativeMs,
    }));
  }

  getSummary() {
    const timeline = this.getTimeline();
    const totalDuration =
      timeline.length > 0 ? timeline[timeline.length - 1].relativeMs : 0;
    const typeCounts = {};
    for (const entry of timeline) {
      typeCounts[entry.event.type] = (typeCounts[entry.event.type] || 0) + 1;
    }
    return {
      sessionId: this.metadata.sessionId || 'unknown',
      userId: this.metadata.userId || 'unknown',
      totalEvents: timeline.length,
      totalDurationMs: totalDuration,
      totalDurationFormatted: TimelineEntry.formatDuration(totalDuration),
      eventTypes: typeCounts,
      tools: this.getToolSequence(),
      errors: this.getErrorSequence(),
    };
  }

  toTextReport() {
    const summary = this.getSummary();
    const lines = [
      `═══ ECHO Session Replay ═══`,
      `Session: ${summary.sessionId}`,
      `User:    ${summary.userId}`,
      `Events:  ${summary.totalEvents}`,
      `Duration: ${summary.totalDurationFormatted}`,
      ``,
      `── Event Types ──`,
    ];
    for (const [type, count] of Object.entries(summary.eventTypes)) {
      lines.push(`  ${type}: ${count}`);
    }
    if (summary.tools.length > 0) {
      lines.push('', '── Tool Sequence ──');
      for (const t of summary.tools) {
        lines.push(`  [${TimelineEntry.formatDuration(t.relativeMs)}] ${t.tool} (${t.durationMs}ms, $${t.cost.toFixed(4)})`);
      }
    }
    if (summary.errors.length > 0) {
      lines.push('', '── Errors ──');
      for (const e of summary.errors) {
        lines.push(`  [${TimelineEntry.formatDuration(e.relativeMs)}] ${e.message}`);
      }
    }
    return lines.join('\n');
  }
}

export default ReplayEngine;
