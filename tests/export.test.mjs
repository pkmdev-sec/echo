/**
 * Tests for ECHO Export Module
 */

import { readFile } from 'node:fs/promises';
import {
  toJSON,
  toCSV,
  toMarkdown,
  toHTML,
  flattenEvent,
  escapeCSVField,
  eventsToCSV,
  metricsToCSV,
  teamSummaryToCSV,
  exportToFile,
  ExportManager,
  generatePDFPlaceholder,
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
    // Headers are alphabetically sorted
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
    // Headers should be sorted alphabetically for deterministic output
    expect(csv).toContain('a');
    expect(csv).toContain('b');
    expect(csv).toContain('c');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('a,b,c');
  });
});

describe('eventsToCSV', () => {
  test('exports events as CSV', () => {
    const events = [
      makeEvent('tool_use', { tool: 'Read' }),
      makeEvent('error', { message: 'oops' }),
    ];
    const csv = eventsToCSV(events);
    // Headers should be alphabetically sorted for deterministic output
    expect(csv).toContain('id');
    expect(csv).toContain('type');
    expect(csv).toContain('timestamp');
    expect(csv).toContain('isoTime');
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

describe('toCSV - Field Selection', () => {
  test('supports field selection', () => {
    const rows = [
      { name: 'Alice', age: 30, city: 'NYC', score: 100 },
      { name: 'Bob', age: 25, city: 'LA', score: 85 },
    ];
    const csv = toCSV(rows, { fields: ['name', 'score'] });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,score');
    expect(lines[1]).toBe('Alice,100');
    expect(lines).toHaveLength(3);
  });

  test('CSV headers are sorted deterministically', () => {
    const rows = [
      { z: 1, a: 2, m: 3 },
    ];
    const csv = toCSV(rows);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('a,m,z');
  });
});

describe('toMarkdown', () => {
  test('generates markdown report', () => {
    const data = {
      metadata: {
        sessionId: 'md-test',
        userId: 'alice',
        startedAtISO: '2024-01-01T00:00:00Z',
        endedAtISO: '2024-01-01T01:00:00Z',
        durationMs: 3600000,
      },
      events: [
        makeEvent('tool_use', { tool: 'Read' }),
        makeEvent('error', { message: 'fail' }),
      ],
    };

    const md = toMarkdown(data, 'Test Report');
    expect(md).toContain('# Test Report');
    expect(md).toContain('Session ID');
    expect(md).toContain('md-test');
    expect(md).toContain('alice');
    expect(md).toContain('Events');
    expect(md).toContain('|');
  });

  test('handles missing metadata', () => {
    const data = { events: [] };
    const md = toMarkdown(data);
    expect(md).toContain('# Echo Report');
    expect(md).toContain('Generated:');
  });
});

describe('toHTML', () => {
  test('generates valid HTML report', () => {
    const data = {
      metadata: {
        sessionId: 'html-test',
        userId: 'bob',
        startedAtISO: '2024-01-01T00:00:00Z',
        totalEvents: 3,
      },
      events: [
        makeEvent('tool_use', { tool: 'Read' }),
        makeEvent('tool_use', { tool: 'Edit' }),
        makeEvent('error', { message: 'oops' }),
      ],
    };

    const html = toHTML(data, 'HTML Report');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('<title>HTML Report</title>');
    expect(html).toContain('html-test');
    expect(html).toContain('bob');
    expect(html).toContain('Event Type Distribution');
    expect(html).toContain('Event Timeline');
    expect(html).toContain('</html>');
  });

  test('includes CSS styles', () => {
    const data = {
      metadata: { sessionId: 'test' },
      events: [makeEvent('tool_use', { tool: 'Read' })],
    };
    const html = toHTML(data);
    expect(html).toContain('<style>');
    expect(html).toContain('font-family');
  });

  test('includes event distribution chart', () => {
    const data = {
      metadata: { sessionId: 'chart-test' },
      events: [
        makeEvent('tool_use', { tool: 'Read' }),
        makeEvent('tool_use', { tool: 'Edit' }),
        makeEvent('error', { message: 'fail' }),
      ],
    };
    const html = toHTML(data);
    expect(html).toContain('tool_use');
    expect(html).toContain('error');
    expect(html).toContain('class="bar"');
  });

  test('truncates long event lists', () => {
    const events = [];
    for (let i = 0; i < 150; i++) {
      events.push(makeEvent('test', { index: i }));
    }
    const data = { metadata: { sessionId: 'long' }, events };
    const html = toHTML(data);
    expect(html).toContain('more events');
  });
});

describe('generatePDFPlaceholder', () => {
  test('returns PDF conversion instructions', () => {
    const placeholder = generatePDFPlaceholder('html content', 'test-session');
    expect(placeholder.instructions).toContain('PDF');
    expect(placeholder.htmlPath).toContain('test-session');
    expect(placeholder.note).toBeDefined();
  });
});

describe('ExportManager - New Features', () => {
  const sessionData = {
    metadata: { sessionId: 'manager-test', userId: 'charlie' },
    events: [
      makeEvent('tool_use', { tool: 'Read', cost: 0.01 }),
      makeEvent('error', { message: 'fail' }),
    ],
  };

  test('toMarkdown exports markdown', () => {
    const manager = new ExportManager(sessionData);
    const md = manager.toMarkdown('Custom Title');
    expect(md).toContain('# Custom Title');
    expect(md).toContain('manager-test');
  });

  test('toHTML exports HTML', () => {
    const manager = new ExportManager(sessionData);
    const html = manager.toHTML('Custom HTML');
    expect(html).toContain('<title>Custom HTML</title>');
    expect(html).toContain('charlie');
  });

  test('saveMarkdown writes to disk', async () => {
    const manager = new ExportManager(sessionData);
    const path = `/tmp/echo-md-${Date.now()}.md`;
    await manager.saveMarkdown(path, 'MD Test');
    const content = await readFile(path, 'utf-8');
    expect(content).toContain('# MD Test');
  });

  test('saveHTML writes to disk', async () => {
    const manager = new ExportManager(sessionData);
    const path = `/tmp/echo-html-${Date.now()}.html`;
    await manager.saveHTML(path, 'HTML Test');
    const content = await readFile(path, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('HTML Test');
  });

  test('savePDF generates HTML and returns placeholder', async () => {
    const manager = new ExportManager(sessionData);
    const path = `/tmp/echo-pdf-${Date.now()}.html`;
    const result = await manager.savePDF(path);
    expect(result.instructions).toContain('PDF');

    // Verify HTML was written
    const content = await readFile(path, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
  });

  test('eventsToCSV with field selection', () => {
    const manager = new ExportManager(sessionData);
    const csv = manager.eventsToCSV({ fields: ['type', 'timestamp'] });
    const lines = csv.split('\n');
    expect(lines[0]).toContain('type');
    expect(lines[0]).toContain('timestamp');
  });
});
