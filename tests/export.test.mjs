/**
 * Tests for ECHO Export Module
 */

import { readFile } from 'node:fs/promises';
import {
  toJSON,
  toCSV,
  flattenEvent,
  escapeCSVField,
  eventsToCSV,
  metricsToCSV,
  teamSummaryToCSV,
  exportToFile,
  ExportManager,
} from '../lib/export.mjs';

function makeEvent(type, data = {}, timestamp = 1000000) {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp,
    isoTime: new Date(timestamp).toISOString(),
    data,
  };
}

describe('toJSON', () => {
  test('produces pretty JSON by default', () => {
    const result = toJSON({ a: 1 });
    expect(result).toContain('\n');
    expect(JSON.parse(result).a).toBe(1);
  });

  test('produces compact JSON when pretty=false', () => {
    const result = toJSON({ a: 1 }, false);
    expect(result).not.toContain('\n');
  });
});

describe('escapeCSVField', () => {
  test('returns empty string for null/undefined', () => {
    expect(escapeCSVField(null)).toBe('');
    expect(escapeCSVField(undefined)).toBe('');
  });

  test('escapes commas', () => {
    expect(escapeCSVField('hello, world')).toBe('"hello, world"');
  });

  test('escapes quotes', () => {
    expect(escapeCSVField('say "hi"')).toBe('"say ""hi"""');
  });

  test('passes through simple strings', () => {
    expect(escapeCSVField('hello')).toBe('hello');
  });
});

describe('flattenEvent', () => {
  test('flattens event data into top level keys', () => {
    const evt = makeEvent('tool_use', { tool: 'Read', cost: 0.01 });
    const flat = flattenEvent(evt);
    expect(flat.id).toBe(evt.id);
    expect(flat.type).toBe('tool_use');
    expect(flat.data_tool).toBe('Read');
    expect(flat.data_cost).toBe(0.01);
  });

  test('stringifies nested objects in data', () => {
    const evt = makeEvent('tool_use', { input: { cmd: 'ls' } });
    const flat = flattenEvent(evt);
    expect(typeof flat.data_input).toBe('string');
    expect(JSON.parse(flat.data_input).cmd).toBe('ls');
  });
});

describe('toCSV', () => {
  test('generates CSV from rows', () => {
    const rows = [
      { name: 'Alice', score: 100 },
      { name: 'Bob', score: 85 },
    ];
    const csv = toCSV(rows);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,score');
    expect(lines[1]).toBe('Alice,100');
    expect(lines[2]).toBe('Bob,85');
  });

  test('returns empty string for empty array', () => {
    expect(toCSV([])).toBe('');
  });

  test('handles missing fields across rows', () => {
    const rows = [
      { a: 1, b: 2 },
      { a: 3, c: 4 },
    ];
    const csv = toCSV(rows);
    expect(csv).toContain('a,b,c');
  });
});

describe('eventsToCSV', () => {
  test('exports events as CSV', () => {
    const events = [
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('error', { message: 'oops' }),
    ];
    const csv = eventsToCSV(events);
    expect(csv).toContain('id,type,timestamp,isoTime');
    expect(csv).toContain('tool_use');
    expect(csv).toContain('error');
  });
});

describe('metricsToCSV', () => {
  test('exports metrics array as CSV', () => {
    const metrics = [
      {
        sessionId: 's1',
        userId: 'alice',
        totalEvents: 10,
        durationMs: 5000,
        costPerSession: 0.05,
        errorRate: 10,
        averageToolDuration: 200,
        toolsUsed: { Read: 5, Edit: 3 },
      },
    ];
    const csv = metricsToCSV(metrics);
    expect(csv).toContain('sessionId');
    expect(csv).toContain('s1');
    expect(csv).toContain('alice');
  });
});

describe('teamSummaryToCSV', () => {
  test('exports team member summaries as CSV', () => {
    const summary = {
      members: [
        {
          userId: 'alice',
          sessions: 3,
          totalEvents: 20,
          totalDurationMs: 10000,
          totalCost: 0.15,
          errorRate: 5,
          favoriteTools: [{ tool: 'Read', count: 10 }],
        },
      ],
    };
    const csv = teamSummaryToCSV(summary);
    expect(csv).toContain('userId');
    expect(csv).toContain('alice');
  });
});

describe('exportToFile', () => {
  test('writes content to file', async () => {
    const path = `/tmp/echo-export-test-${Date.now()}.txt`;
    await exportToFile(path, 'hello echo');
    const content = await readFile(path, 'utf-8');
    expect(content).toBe('hello echo');
  });
});

describe('ExportManager', () => {
  const sessionData = {
    metadata: { sessionId: 'test', userId: 'alice' },
    events: [
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }),
      makeEvent('error', { message: 'fail' }),
    ],
  };

  test('toJSON exports full session', () => {
    const manager = new ExportManager(sessionData);
    const json = manager.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.metadata.sessionId).toBe('test');
    expect(parsed.events).toHaveLength(2);
  });

  test('eventsToCSV exports events', () => {
    const manager = new ExportManager(sessionData);
    const csv = manager.eventsToCSV();
    expect(csv).toContain('tool_use');
  });

  test('saveJSON writes to disk', async () => {
    const manager = new ExportManager(sessionData);
    const path = `/tmp/echo-manager-${Date.now()}.json`;
    await manager.saveJSON(path);
    const content = await readFile(path, 'utf-8');
    expect(JSON.parse(content).metadata.sessionId).toBe('test');
  });

  test('saveCSV writes to disk', async () => {
    const manager = new ExportManager(sessionData);
    const path = `/tmp/echo-manager-${Date.now()}.csv`;
    await manager.saveCSV(path);
    const content = await readFile(path, 'utf-8');
    expect(content).toContain('tool_use');
  });
});
