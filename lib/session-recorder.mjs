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
    await mkdir(this.storeDir, { recursive: true });
    const filePath = join(this.storeDir, `${this.sessionId}.json`);
    const payload = JSON.stringify(this.toJSON(), null, 2);
    await writeFile(filePath, payload, 'utf-8');
    return filePath;
  }

  static async load(sessionId, storeDir = DEFAULT_STORE_DIR) {
    const filePath = join(storeDir, `${sessionId}.json`);
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const recorder = new SessionRecorder({
      sessionId: data.metadata.sessionId,
      userId: data.metadata.userId,
      storeDir,
      tags: data.metadata.tags,
    });
    recorder.metadata = data.metadata;
    recorder.events = data.events.map(e => {
      const evt = new SessionEvent(e.type, e.data);
      evt.id = e.id;
      evt.timestamp = e.timestamp;
      evt.isoTime = e.isoTime;
      return evt;
    });
    recorder._active = data.metadata.endedAt === null;
    return recorder;
  }
}

export default SessionRecorder;
