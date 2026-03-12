/**
 * ECHO — Session Recorder
 * Captures session events with timestamps for replay and analytics.
 */

import { randomUUID } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_STORE_DIR = join(process.env.HOME || '/tmp', '.echo', 'sessions');

export class SessionEvent {
  constructor(type, data = {}) {
    this.id = randomUUID();
    this.type = type;
    this.timestamp = Date.now();
    this.isoTime = new Date(this.timestamp).toISOString();
    this.data = data;
  }

  static fromJSON(json) {
    const evt = Object.create(SessionEvent.prototype);
    evt.id = json.id;
    evt.type = json.type;
    evt.timestamp = json.timestamp;
    evt.isoTime = json.isoTime;
    evt.data = json.data || {};
    return evt;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      isoTime: this.isoTime,
      data: this.data,
    };
  }
}

export class SessionRecorder {
  constructor(options = {}) {
    this.sessionId = options.sessionId || randomUUID();
    this.userId = options.userId || 'anonymous';
    this.storeDir = options.storeDir || DEFAULT_STORE_DIR;
    this.events = [];
    this.metadata = {
      sessionId: this.sessionId,
      userId: this.userId,
      startedAt: Date.now(),
      startedAtISO: new Date().toISOString(),
      endedAt: null,
      tags: options.tags || [],
    };
    this._active = true;
  }

  get active() {
    return this._active;
  }

  get eventCount() {
    return this.events.length;
  }

  get duration() {
    if (this.events.length === 0) return 0;
    const first = this.events[0].timestamp;
    const last = this.events[this.events.length - 1].timestamp;
    return last - first;
  }

  record(type, data = {}) {
    if (!this._active) {
      throw new Error('Session has been ended. Cannot record new events.');
    }
    if (!type || typeof type !== 'string') {
      throw new Error('Event type must be a non-empty string.');
    }
    const event = new SessionEvent(type, data);
    this.events.push(event);
    return event;
  }

  recordToolUse(toolName, input = {}, output = {}, durationMs = 0, cost = 0) {
    return this.record('tool_use', {
      tool: toolName,
      input,
      output,
      durationMs,
      cost,
    });
  }

  recordError(errorMessage, context = {}) {
    return this.record('error', {
      message: errorMessage,
      ...context,
    });
  }

  recordTaskStart(taskId, description = '') {
    return this.record('task_start', { taskId, description });
  }

  recordTaskEnd(taskId, status = 'completed') {
    return this.record('task_end', { taskId, status });
  }

  end() {
    if (!this._active) return this.metadata;
    this._active = false;
    this.metadata.endedAt = Date.now();
    this.metadata.endedAtISO = new Date().toISOString();
    this.metadata.totalEvents = this.events.length;
    this.metadata.durationMs = this.duration;
    return this.metadata;
  }

  toJSON() {
    return {
      metadata: this.metadata,
      events: this.events.map(e => e.toJSON()),
    };
  }

  async save() {
    try {
      await mkdir(this.storeDir, { recursive: true });
      const filePath = join(this.storeDir, `${this.sessionId}.json`);
      const payload = JSON.stringify(this.toJSON(), null, 2);
      await writeFile(filePath, payload, 'utf-8');
      return filePath;
    } catch (error) {
      throw new Error(`Failed to save session ${this.sessionId}: ${error.message}`);
    }
  }

  static async load(sessionId, storeDir = DEFAULT_STORE_DIR) {
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('sessionId must be a non-empty string');
      }
      const filePath = join(storeDir, `${sessionId}.json`);
      const raw = await readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);

      if (!data.metadata || !data.events || !Array.isArray(data.events)) {
        throw new Error('Invalid session data format');
      }

      const recorder = new SessionRecorder({
        sessionId: data.metadata.sessionId,
        userId: data.metadata.userId,
        storeDir,
        tags: data.metadata.tags,
      });
      recorder.metadata = data.metadata;
      recorder.events = data.events.map(e => {
        // Validate required fields
        if (!e.type || typeof e.type !== 'string') {
          throw new Error(`Invalid event type: ${e.type}`);
        }
        if (typeof e.timestamp !== 'number' || isNaN(e.timestamp)) {
          throw new Error(`Invalid event timestamp: ${e.timestamp}`);
        }
        // Use static factory to avoid creating wasteful intermediate values
        return SessionEvent.fromJSON(e);
      });
      recorder._active = data.metadata.endedAt === null;
      return recorder;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Session not found: ${sessionId}`);
      }
      throw error;
    }
  }
}

export default SessionRecorder;
