/**
 * ECHO — Session Recorder
 * Captures session events with timestamps for replay and analytics.
 */

import { randomUUID } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const DEFAULT_STORE_DIR = join(process.env.HOME || '/tmp', '.echo', 'sessions');
const DEFAULT_COMPRESSION_THRESHOLD = 50 * 1024; // 50KB
const SIZE_WARNING_THRESHOLD = 1024 * 1024; // 1MB

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
    this._paused = false;
    this._compressionThreshold = options.compressionThreshold || DEFAULT_COMPRESSION_THRESHOLD;
    this._enableCompression = options.enableCompression !== false;
    this._eventTypeFilter = options.eventTypeFilter || null; // null means record all
    this._excludePatterns = options.excludePatterns || []; // patterns to exclude from data
    this._sessionSize = 0;
    this._sizeWarnings = [];
  }

  get active() {
    return this._active;
  }

  get paused() {
    return this._paused;
  }

  get eventCount() {
    return this.events.length;
  }

  get sessionSize() {
    return this._sessionSize;
  }

  get sizeWarnings() {
    return this._sizeWarnings;
  }

  get duration() {
    if (this.events.length === 0) return 0;
    const first = this.events[0].timestamp;
    const last = this.events[this.events.length - 1].timestamp;
    return last - first;
  }

  pause() {
    if (!this._active) {
      throw new Error('Session has been ended. Cannot pause.');
    }
    this._paused = true;
    this.record('session_paused', {});
  }

  resume() {
    if (!this._active) {
      throw new Error('Session has been ended. Cannot resume.');
    }
    this._paused = false;
    this.record('session_resumed', {});
  }

  _shouldRecordEvent(type) {
    // Always record pause/resume events
    if (type === 'session_paused' || type === 'session_resumed') {
      return true;
    }
    // Check if paused
    if (this._paused) {
      return false;
    }
    // Check event type filter
    if (this._eventTypeFilter && Array.isArray(this._eventTypeFilter)) {
      return this._eventTypeFilter.includes(type);
    }
    return true;
  }

  _filterEventData(data) {
    if (!data || typeof data !== 'object') return data;
    if (this._excludePatterns.length === 0) return data;

    const filtered = { ...data };
    for (const pattern of this._excludePatterns) {
      for (const key of Object.keys(filtered)) {
        if (key.match(pattern)) {
          filtered[key] = '[FILTERED]';
        } else if (typeof filtered[key] === 'string' && filtered[key].match(pattern)) {
          filtered[key] = '[FILTERED]';
        }
      }
    }
    return filtered;
  }

  _updateSessionSize(event) {
    try {
      const eventJson = JSON.stringify(event.toJSON());
      this._sessionSize += Buffer.byteLength(eventJson, 'utf-8');

      if (this._sessionSize > SIZE_WARNING_THRESHOLD &&
          !this._sizeWarnings.find(w => w.threshold === SIZE_WARNING_THRESHOLD)) {
        const warning = {
          threshold: SIZE_WARNING_THRESHOLD,
          currentSize: this._sessionSize,
          eventCount: this.events.length,
          timestamp: Date.now(),
        };
        this._sizeWarnings.push(warning);
      }
    } catch (error) {
      // Ignore size calculation errors
    }
  }

  record(type, data = {}) {
    if (!this._active) {
      throw new Error('Session has been ended. Cannot record new events.');
    }
    if (!type || typeof type !== 'string') {
      throw new Error('Event type must be a non-empty string.');
    }
    if (!this._shouldRecordEvent(type)) {
      return null; // Event filtered out
    }
    const filteredData = this._filterEventData(data);
    const event = new SessionEvent(type, filteredData);
    this.events.push(event);
    this._updateSessionSize(event);
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
      const payload = JSON.stringify(this.toJSON(), null, 2);
      const payloadSize = Buffer.byteLength(payload, 'utf-8');
      const shouldCompress = this._enableCompression && payloadSize > this._compressionThreshold;

      let filePath, fileContent;
      if (shouldCompress) {
        filePath = join(this.storeDir, `${this.sessionId}.json.gz`);
        fileContent = await gzipAsync(Buffer.from(payload, 'utf-8'));
      } else {
        filePath = join(this.storeDir, `${this.sessionId}.json`);
        fileContent = payload;
      }

      await writeFile(filePath, fileContent, shouldCompress ? undefined : 'utf-8');
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

      // Try compressed file first, then uncompressed
      let raw;
      const compressedPath = join(storeDir, `${sessionId}.json.gz`);
      const uncompressedPath = join(storeDir, `${sessionId}.json`);

      try {
        const compressed = await readFile(compressedPath);
        const decompressed = await gunzipAsync(compressed);
        raw = decompressed.toString('utf-8');
      } catch (compressedError) {
        if (compressedError.code === 'ENOENT') {
          // Try uncompressed
          raw = await readFile(uncompressedPath, 'utf-8');
        } else {
          throw compressedError;
        }
      }

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
      // Use Object.assign to preserve existing timestamps instead of creating new ones
      Object.assign(recorder.metadata, data.metadata);
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
