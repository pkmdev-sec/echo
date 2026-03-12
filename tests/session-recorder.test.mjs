/**
 * Tests for ECHO Session Recorder
 */

import { jest } from '@jest/globals';
import { SessionRecorder, SessionEvent } from '../lib/session-recorder.mjs';

describe('SessionEvent', () => {
  test('creates event with type and data', () => {
    const evt = new SessionEvent('tool_use', { tool: 'Read' });
    expect(evt.type).toBe('tool_use');
    expect(evt.data.tool).toBe('Read');
    expect(evt.id).toBeDefined();
    expect(evt.timestamp).toBeGreaterThan(0);
    expect(evt.isoTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('toJSON returns plain object', () => {
    const evt = new SessionEvent('error', { message: 'fail' });
    const json = evt.toJSON();
    expect(json.id).toBe(evt.id);
    expect(json.type).toBe('error');
    expect(json.data.message).toBe('fail');
  });
});

describe('SessionRecorder', () => {
  let recorder;

  beforeEach(() => {
    recorder = new SessionRecorder({ userId: 'tester', tags: ['unit-test'] });
  });

  test('initializes with correct defaults', () => {
    expect(recorder.active).toBe(true);
    expect(recorder.eventCount).toBe(0);
    expect(recorder.userId).toBe('tester');
    expect(recorder.metadata.tags).toContain('unit-test');
    expect(recorder.sessionId).toBeDefined();
  });

  test('records events', () => {
    const evt = recorder.record('test_event', { foo: 'bar' });
    expect(evt.type).toBe('test_event');
    expect(recorder.eventCount).toBe(1);
  });

  test('throws on empty event type', () => {
    expect(() => recorder.record('')).toThrow('Event type must be a non-empty string');
    expect(() => recorder.record(null)).toThrow();
  });

  test('recordToolUse captures tool data', () => {
    const evt = recorder.recordToolUse('Bash', { cmd: 'ls' }, { output: 'files' }, 150, 0.002);
    expect(evt.data.tool).toBe('Bash');
    expect(evt.data.durationMs).toBe(150);
    expect(evt.data.cost).toBe(0.002);
  });

  test('recordError captures error details', () => {
    const evt = recorder.recordError('Something broke', { file: 'test.js' });
    expect(evt.data.message).toBe('Something broke');
    expect(evt.data.file).toBe('test.js');
  });

  test('recordTaskStart and recordTaskEnd', () => {
    recorder.recordTaskStart('t1', 'Build feature');
    recorder.recordTaskEnd('t1', 'completed');
    expect(recorder.eventCount).toBe(2);
    expect(recorder.events[0].data.taskId).toBe('t1');
    expect(recorder.events[1].data.status).toBe('completed');
  });

  test('duration computes correctly', () => {
    recorder.record('a');
    // Manually set timestamps for deterministic test
    recorder.events[0].timestamp = 1000;
    recorder.record('b');
    recorder.events[1].timestamp = 3500;
    expect(recorder.duration).toBe(2500);
  });

  test('end() finalizes session', () => {
    recorder.record('test');
    const meta = recorder.end();
    expect(recorder.active).toBe(false);
    expect(meta.endedAt).toBeGreaterThan(0);
    expect(meta.totalEvents).toBe(1);
  });

  test('cannot record after end', () => {
    recorder.end();
    expect(() => recorder.record('x')).toThrow('Session has been ended');
  });

  test('end() is idempotent', () => {
    const meta1 = recorder.end();
    const meta2 = recorder.end();
    expect(meta1).toBe(meta2);
  });

  test('toJSON returns full session structure', () => {
    recorder.record('test');
    const json = recorder.toJSON();
    expect(json.metadata.sessionId).toBe(recorder.sessionId);
    expect(json.events).toHaveLength(1);
  });

  test('save and load round-trip', async () => {
    const tmpDir = `/tmp/echo-test-${Date.now()}`;
    const rec = new SessionRecorder({ userId: 'saver', storeDir: tmpDir });
    rec.recordToolUse('Read', {}, {}, 50, 0.001);
    rec.recordError('test error');
    rec.end();
    const path = await rec.save();
    expect(path).toContain(rec.sessionId);

    const loaded = await SessionRecorder.load(rec.sessionId, tmpDir);
    expect(loaded.sessionId).toBe(rec.sessionId);
    expect(loaded.eventCount).toBe(2);
    expect(loaded.active).toBe(false);
  });

  test('pause and resume recording', () => {
    recorder.record('event1');
    recorder.pause();
    expect(recorder.paused).toBe(true);

    // Events recorded while paused should be filtered
    const evt = recorder.record('event2');
    expect(evt).toBeNull();

    recorder.resume();
    expect(recorder.paused).toBe(false);
    const evt3 = recorder.record('event3');
    expect(evt3).not.toBeNull();
  });

  test('selective recording with event type filter', () => {
    const rec = new SessionRecorder({
      userId: 'filter-test',
      eventTypeFilter: ['tool_use', 'error']
    });

    rec.record('tool_use', { tool: 'Read' });
    rec.record('custom_event', { data: 'test' });
    rec.record('error', { message: 'fail' });

    // Only tool_use and error should be recorded
    expect(rec.eventCount).toBe(2);
    expect(rec.events[0].type).toBe('tool_use');
    expect(rec.events[1].type).toBe('error');
  });

  test('exclude patterns filter data', () => {
    const rec = new SessionRecorder({
      userId: 'exclude-test',
      excludePatterns: [/password/, /secret/]
    });

    rec.record('auth', { username: 'alice', password: 'secret123', apiKey: 'secret-key' });

    expect(rec.events[0].data.username).toBe('alice');
    expect(rec.events[0].data.password).toBe('[FILTERED]');
    expect(rec.events[0].data.apiKey).toBe('[FILTERED]');
  });

  test('session size tracking', () => {
    const rec = new SessionRecorder({ userId: 'size-test' });
    rec.record('event1', { data: 'x'.repeat(1000) });
    rec.record('event2', { data: 'y'.repeat(1000) });

    expect(rec.sessionSize).toBeGreaterThan(0);
  });

  test('compression for large sessions', async () => {
    const tmpDir = `/tmp/echo-compress-${Date.now()}`;
    const rec = new SessionRecorder({
      userId: 'compress-test',
      storeDir: tmpDir,
      compressionThreshold: 100, // Low threshold for testing
      enableCompression: true
    });

    // Add enough data to trigger compression
    for (let i = 0; i < 20; i++) {
      rec.record('event', { data: 'x'.repeat(100) });
    }
    rec.end();

    const path = await rec.save();
    expect(path).toContain('.json.gz');

    // Should be able to load compressed file
    const loaded = await SessionRecorder.load(rec.sessionId, tmpDir);
    expect(loaded.eventCount).toBe(20);
  });

  test('load preserves original timestamps', async () => {
    const tmpDir = `/tmp/echo-timestamp-${Date.now()}`;
    const rec = new SessionRecorder({ userId: 'timestamp-test', storeDir: tmpDir });

    const originalStartedAt = rec.metadata.startedAt;
    rec.record('test');
    rec.end();
    await rec.save();

    const loaded = await SessionRecorder.load(rec.sessionId, tmpDir);
    expect(loaded.metadata.startedAt).toBe(originalStartedAt);
  });
});
