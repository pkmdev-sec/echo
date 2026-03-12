/**
 * ECHO — Export Module
 * CSV/JSON export for reports and data portability.
 */

import { writeFile } from 'node:fs/promises';

export function toJSON(data, pretty = true) {
  try {
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  } catch (error) {
    throw new Error(`Failed to convert to JSON: ${error.message}`);
  }
}

export function flattenEvent(event) {
  if (!event || typeof event !== 'object') {
    throw new Error('flattenEvent requires a valid event object');
  }
  const flat = {
    id: event.id || '',
    type: event.type || '',
    timestamp: event.timestamp || 0,
    isoTime: event.isoTime || '',
  };
  if (event.data && typeof event.data === 'object') {
    for (const [key, value] of Object.entries(event.data)) {
      try {
        if (typeof value === 'object' && value !== null) {
          flat[`data_${key}`] = JSON.stringify(value);
        } else {
          flat[`data_${key}`] = value;
        }
      } catch (error) {
        flat[`data_${key}`] = String(value);
      }
    }
  }
  return flat;
}

export function escapeCSVField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV(rows, options = {}) {
  if (!rows || rows.length === 0) return '';
  if (!Array.isArray(rows)) {
    throw new Error('toCSV requires an array of objects');
  }

  // Support field selection
  const selectedFields = options.fields || null;

  const allKeys = new Set();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      for (const key of Object.keys(row)) {
        if (!selectedFields || selectedFields.includes(key)) {
          allKeys.add(key);
        }
      }
    }
  }
  // Sort headers alphabetically for deterministic output
  const headers = Array.from(allKeys).sort();
  if (headers.length === 0) return '';
  const lines = [headers.map(escapeCSVField).join(',')];
  for (const row of rows) {
    const values = headers.map(h => escapeCSVField(row?.[h]));
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

export function eventsToCSV(events) {
  if (!Array.isArray(events)) {
    throw new Error('eventsToCSV requires an array of events');
  }
  try {
    const flat = events.map(flattenEvent);
    return toCSV(flat);
  } catch (error) {
    throw new Error(`Failed to convert events to CSV: ${error.message}`);
  }
}

export function metricsToCSV(metricsArray) {
  const rows = metricsArray.map(m => ({
    sessionId: m.sessionId,
    userId: m.userId,
    totalEvents: m.totalEvents,
    durationMs: m.durationMs,
    costPerSession: m.costPerSession,
    errorRate: m.errorRate,
    averageToolDuration: m.averageToolDuration,
    toolsUsed: JSON.stringify(m.toolsUsed),
  }));
  return toCSV(rows);
}

export function teamSummaryToCSV(teamSummary) {
  const rows = teamSummary.members.map(member => ({
    userId: member.userId,
    sessions: member.sessions,
    totalEvents: member.totalEvents,
    totalDurationMs: member.totalDurationMs,
    totalCost: member.totalCost,
    errorRate: member.errorRate,
    favoriteTools: JSON.stringify(member.favoriteTools),
  }));
  return toCSV(rows);
}

export function toMarkdown(data, title = 'Echo Report') {
  const lines = [`# ${title}`, '', `Generated: ${new Date().toISOString()}`, ''];

  if (data.metadata) {
    lines.push('## Session Metadata', '');
    lines.push(`- **Session ID**: ${data.metadata.sessionId || 'N/A'}`);
    lines.push(`- **User ID**: ${data.metadata.userId || 'N/A'}`);
    lines.push(`- **Started**: ${data.metadata.startedAtISO || 'N/A'}`);
    lines.push(`- **Ended**: ${data.metadata.endedAtISO || 'N/A'}`);
    lines.push(`- **Duration**: ${data.metadata.durationMs || 0}ms`);
    lines.push('');
  }

  if (data.events && Array.isArray(data.events)) {
    lines.push('## Events', '');
    lines.push(`Total Events: ${data.events.length}`, '');
    lines.push('| Type | Timestamp | Data |');
    lines.push('|------|-----------|------|');
    for (const evt of data.events.slice(0, 100)) {
      const type = evt.type || 'unknown';
      const time = evt.isoTime || 'N/A';
      const dataStr = evt.data ? JSON.stringify(evt.data).substring(0, 50) : '-';
      lines.push(`| ${type} | ${time} | ${dataStr} |`);
    }
    if (data.events.length > 100) {
      lines.push(`| ... | ... | ... (${data.events.length - 100} more events) |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function toHTML(data, title = 'Echo Report') {
  const style = `
    <style>
      /* Dark theme professional styling */
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: #e0e0e0;
        padding: 20px;
        line-height: 1.6;
      }
      .container {
        max-width: 1400px;
        margin: 0 auto;
        background: #0f1419;
        padding: 40px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        border: 1px solid #1f2937;
      }
      h1 {
        color: #60a5fa;
        font-size: 2.5em;
        margin-bottom: 10px;
        text-shadow: 0 0 20px rgba(96, 165, 250, 0.3);
        border-bottom: 3px solid #60a5fa;
        padding-bottom: 15px;
      }
      h2 {
        color: #34d399;
        font-size: 1.8em;
        margin-top: 40px;
        margin-bottom: 20px;
        border-bottom: 2px solid #1f2937;
        padding-bottom: 10px;
      }
      .metadata {
        background: #1a1f2e;
        padding: 25px;
        border-radius: 8px;
        margin: 25px 0;
        border-left: 4px solid #60a5fa;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
      }
      .metadata-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 15px;
      }
      .metadata-item {
        padding: 10px;
        background: #0f1419;
        border-radius: 4px;
      }
      .metadata-label {
        font-weight: bold;
        color: #60a5fa;
        font-size: 0.85em;
        text-transform: uppercase;
        letter-spacing: 1px;
        display: block;
        margin-bottom: 5px;
      }
      .metadata-value {
        color: #e0e0e0;
        font-size: 1.1em;
      }
      .summary-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin: 30px 0;
      }
      .stat-card {
        background: linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%);
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #1f2937;
        text-align: center;
      }
      .stat-value {
        font-size: 2.5em;
        font-weight: bold;
        color: #60a5fa;
        display: block;
        margin: 10px 0;
      }
      .stat-label {
        color: #9ca3af;
        font-size: 0.9em;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
        background: #1a1f2e;
        border-radius: 8px;
        overflow: hidden;
      }
      th {
        background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
        color: white;
        padding: 15px;
        text-align: left;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-size: 0.85em;
      }
      td {
        padding: 12px 15px;
        border-bottom: 1px solid #1f2937;
        color: #d1d5db;
      }
      tr:hover {
        background: #111827;
      }
      .event-type {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 0.85em;
        font-weight: 600;
      }
      .event-type-tool_use { background: #065f46; color: #6ee7b7; }
      .event-type-error { background: #7f1d1d; color: #fca5a5; }
      .event-type-task_start { background: #1e3a8a; color: #93c5fd; }
      .event-type-task_end { background: #581c87; color: #d8b4fe; }
      .event-type-default { background: #374151; color: #9ca3af; }
      .chart {
        margin: 20px 0;
        padding: 25px;
        background: #1a1f2e;
        border-radius: 8px;
        border: 1px solid #1f2937;
      }
      .bar-container {
        margin: 12px 0;
      }
      .bar-label {
        display: inline-block;
        width: 150px;
        color: #9ca3af;
        font-size: 0.9em;
      }
      .bar-wrapper {
        display: inline-block;
        width: calc(100% - 200px);
        background: #0f1419;
        height: 24px;
        border-radius: 4px;
        overflow: hidden;
      }
      .bar {
        height: 100%;
        background: linear-gradient(90deg, #34d399 0%, #10b981 100%);
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      .bar-value {
        display: inline-block;
        margin-left: 10px;
        color: #60a5fa;
        font-weight: bold;
        font-size: 0.9em;
      }
      .timeline {
        position: relative;
        padding-left: 30px;
        margin: 30px 0;
      }
      .timeline-item {
        position: relative;
        padding: 15px;
        margin-bottom: 10px;
        background: #1a1f2e;
        border-radius: 6px;
        border-left: 3px solid #60a5fa;
      }
      .timeline-item::before {
        content: '';
        position: absolute;
        left: -36px;
        top: 20px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #60a5fa;
        border: 3px solid #0f1419;
      }
      .timeline-time {
        color: #6b7280;
        font-size: 0.85em;
        margin-bottom: 5px;
      }
      .error-highlight {
        background: #1f1313;
        border-left-color: #ef4444;
      }
      .error-highlight::before {
        background: #ef4444;
      }
      .cost-summary {
        background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
        padding: 20px;
        border-radius: 8px;
        color: white;
        margin: 20px 0;
      }
      .cost-item {
        display: flex;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .cost-item:last-child {
        border-bottom: none;
        font-size: 1.2em;
        font-weight: bold;
        margin-top: 10px;
      }
      .footer {
        margin-top: 60px;
        padding-top: 30px;
        border-top: 2px solid #1f2937;
        color: #6b7280;
        font-size: 0.9em;
        text-align: center;
      }
      .badge {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 0.8em;
        font-weight: 600;
        margin: 5px;
      }
      .badge-success { background: #065f46; color: #6ee7b7; }
      .badge-warning { background: #92400e; color: #fcd34d; }
      .badge-error { background: #7f1d1d; color: #fca5a5; }
      .badge-info { background: #1e3a8a; color: #93c5fd; }
      @media print {
        body { background: white; }
        .container { box-shadow: none; }
      }
    </style>
  `;

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  ${style}
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>Generated: ${new Date().toISOString()}</p>
`;

  if (data.metadata) {
    const durationMs = data.metadata.durationMs || 0;
    const durationFormatted = durationMs < 60000
      ? `${(durationMs / 1000).toFixed(2)}s`
      : `${Math.floor(durationMs / 60000)}m ${((durationMs % 60000) / 1000).toFixed(0)}s`;

    html += `
    <h2>Session Metadata</h2>
    <div class="metadata">
      <div class="metadata-grid">
        <div class="metadata-item">
          <span class="metadata-label">Session ID</span>
          <div class="metadata-value">${data.metadata.sessionId || 'N/A'}</div>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">User ID</span>
          <div class="metadata-value">${data.metadata.userId || 'N/A'}</div>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Started</span>
          <div class="metadata-value">${data.metadata.startedAtISO || 'N/A'}</div>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Ended</span>
          <div class="metadata-value">${data.metadata.endedAtISO || 'N/A'}</div>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Duration</span>
          <div class="metadata-value">${durationFormatted}</div>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Total Events</span>
          <div class="metadata-value">${data.metadata.totalEvents || 0}</div>
        </div>
      </div>
    </div>
`;
  }

  if (data.events && Array.isArray(data.events)) {
    // Calculate statistics
    const typeCounts = {};
    let totalCost = 0;
    let totalDuration = 0;
    let errorCount = 0;
    let toolUses = {};

    for (const evt of data.events) {
      typeCounts[evt.type] = (typeCounts[evt.type] || 0) + 1;

      if (evt.type === 'tool_use' && evt.data) {
        totalCost += evt.data.cost || 0;
        totalDuration += evt.data.durationMs || 0;
        const tool = evt.data.tool || 'unknown';
        toolUses[tool] = (toolUses[tool] || 0) + 1;
      }

      if (evt.type === 'error') {
        errorCount++;
      }
    }

    const toolUseCount = typeCounts['tool_use'] || 0;
    const avgToolDuration = toolUseCount > 0 ? (totalDuration / toolUseCount).toFixed(2) : 0;

    // Summary statistics
    html += `
    <h2>Summary Statistics</h2>
    <div class="summary-stats">
      <div class="stat-card">
        <span class="stat-label">Total Events</span>
        <span class="stat-value">${data.events.length}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Tool Uses</span>
        <span class="stat-value">${toolUseCount}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Errors</span>
        <span class="stat-value" style="color: ${errorCount > 0 ? '#ef4444' : '#34d399'}">${errorCount}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Total Cost</span>
        <span class="stat-value">$${totalCost.toFixed(4)}</span>
      </div>
    </div>
`;

    // Cost and Duration Summary
    html += `
    <h2>Cost & Duration Summary</h2>
    <div class="cost-summary">
      <div class="cost-item">
        <span>Total Tool Cost:</span>
        <span>$${totalCost.toFixed(6)}</span>
      </div>
      <div class="cost-item">
        <span>Average Cost per Tool:</span>
        <span>$${toolUseCount > 0 ? (totalCost / toolUseCount).toFixed(6) : '0.000000'}</span>
      </div>
      <div class="cost-item">
        <span>Total Tool Duration:</span>
        <span>${(totalDuration / 1000).toFixed(2)}s</span>
      </div>
      <div class="cost-item">
        <span>Average Tool Duration:</span>
        <span>${avgToolDuration}ms</span>
      </div>
    </div>
`;

    // Tool Usage Frequency Chart
    const maxToolCount = Math.max(...Object.values(toolUses), 1);
    html += `
    <h2>Tool Usage Frequency</h2>
    <div class="chart">
`;
    const sortedTools = Object.entries(toolUses).sort((a, b) => b[1] - a[1]);
    for (const [tool, count] of sortedTools.slice(0, 10)) {
      const width = (count / maxToolCount) * 100;
      html += `
      <div class="bar-container">
        <span class="bar-label">${tool}</span>
        <div class="bar-wrapper">
          <div class="bar" style="width: ${width}%;"></div>
        </div>
        <span class="bar-value">${count}</span>
      </div>`;
    }
    html += `
    </div>
`;

    // Event type distribution chart
    const maxCount = Math.max(...Object.values(typeCounts));

    html += `
    <h2>Event Type Distribution</h2>
    <div class="chart">
`;
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      const width = (count / maxCount) * 100;
      html += `
      <div class="bar-container">
        <span class="bar-label">${type}</span>
        <div class="bar-wrapper">
          <div class="bar" style="width: ${width}%;"></div>
        </div>
        <span class="bar-value">${count}</span>
      </div>`;
    }
    html += `
    </div>
`;

    // Error highlights
    const errors = data.events.filter(e => e.type === 'error');
    if (errors.length > 0) {
      html += `
    <h2>Error Highlights</h2>
    <div class="timeline">
`;
      errors.forEach(err => {
        const message = err.data?.message || 'Unknown error';
        const time = new Date(err.timestamp).toLocaleTimeString();
        html += `
      <div class="timeline-item error-highlight">
        <div class="timeline-time">${time}</div>
        <div style="color: #fca5a5; font-weight: 600;">${message}</div>
        ${err.data?.file ? `<div style="color: #9ca3af; font-size: 0.9em;">File: ${err.data.file}</div>` : ''}
      </div>`;
      });
      html += `
    </div>
`;
    }

    // Event timeline visualization
    html += `
    <h2>Event Timeline Visualization</h2>
    <div class="timeline">
`;
    const baseTime = data.events[0]?.timestamp || Date.now();
    const displayEvents = data.events.slice(0, 50);

    for (const evt of displayEvents) {
      const relativeMs = evt.timestamp - baseTime;
      const relativeTime = relativeMs < 1000
        ? `+${relativeMs}ms`
        : `+${(relativeMs / 1000).toFixed(1)}s`;

      let eventClass = 'timeline-item';
      if (evt.type === 'error') {
        eventClass += ' error-highlight';
      }

      let typeClass = `event-type event-type-${evt.type.replace(/[^a-z_]/g, '')}`;
      if (!['tool_use', 'error', 'task_start', 'task_end'].includes(evt.type)) {
        typeClass = 'event-type event-type-default';
      }

      let details = '';
      if (evt.type === 'tool_use' && evt.data?.tool) {
        details = `<strong>${evt.data.tool}</strong>`;
        if (evt.data.durationMs) details += ` - ${evt.data.durationMs}ms`;
        if (evt.data.cost) details += ` - $${evt.data.cost.toFixed(4)}`;
      } else if (evt.type === 'error' && evt.data?.message) {
        details = evt.data.message;
      } else if (evt.type === 'task_start' && evt.data?.description) {
        details = evt.data.description;
      } else if (evt.data) {
        const keys = Object.keys(evt.data).slice(0, 2);
        details = keys.join(', ');
      }

      html += `
      <div class="${eventClass}">
        <div class="timeline-time">${relativeTime}</div>
        <div>
          <span class="${typeClass}">${evt.type}</span>
          ${details ? `<div style="color: #9ca3af; margin-top: 5px; font-size: 0.9em;">${details}</div>` : ''}
        </div>
      </div>`;
    }

    if (data.events.length > 50) {
      html += `
      <div class="timeline-item" style="text-align: center; font-style: italic; color: #6b7280;">
        ... and ${data.events.length - 50} more events
      </div>`;
    }

    html += `
    </div>
`;

    // Event table
    html += `
    <h2>Complete Event Log</h2>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Timestamp</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
`;
    for (const evt of data.events.slice(0, 100)) {
      let typeClass = `event-type event-type-${evt.type.replace(/[^a-z_]/g, '')}`;
      if (!['tool_use', 'error', 'task_start', 'task_end'].includes(evt.type)) {
        typeClass = 'event-type event-type-default';
      }

      const dataStr = evt.data ? JSON.stringify(evt.data).substring(0, 100) : '-';
      const time = new Date(evt.timestamp).toLocaleString();

      html += `
        <tr>
          <td><span class="${typeClass}">${evt.type}</span></td>
          <td style="font-size: 0.9em;">${time}</td>
          <td style="font-size: 0.9em; color: #9ca3af; font-family: monospace;">${dataStr}</td>
        </tr>`;
    }
    if (data.events.length > 100) {
      html += `
        <tr>
          <td colspan="3" style="text-align: center; font-style: italic; color: #6b7280;">
            ... and ${data.events.length - 100} more events
          </td>
        </tr>`;
    }
    html += `
      </tbody>
    </table>
`;
  }

  html += `
    <div class="footer">
      <p>Generated by ECHO - Session Replay and Analytics</p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

export function generatePDFPlaceholder(htmlContent, sessionId) {
  // This is a placeholder - actual PDF generation would require a library like puppeteer
  const instructions = `
=== PDF Export Instructions ===

To convert this HTML report to PDF, you can use one of these methods:

1. Browser: Open the HTML file and use Print > Save as PDF
2. Command line: wkhtmltopdf session-${sessionId}.html session-${sessionId}.pdf
3. Node.js: Use puppeteer or similar library

The HTML content has been optimized for PDF printing with appropriate styles.

================================
`;
  return {
    instructions,
    htmlPath: `session-${sessionId}.html`,
    note: 'PDF generation requires external tools. HTML file has been generated for manual conversion.',
  };
}

export async function exportToFile(filePath, content) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath must be a non-empty string');
    }
    if (content === null || content === undefined) {
      throw new Error('content cannot be null or undefined');
    }
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  } catch (error) {
    throw new Error(`Failed to export to file ${filePath}: ${error.message}`);
  }
}

export class ExportManager {
  constructor(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
      throw new Error('ExportManager requires valid session data');
    }
    this.sessionData = sessionData;
    this.events = Array.isArray(sessionData.events) ? sessionData.events : [];
    this.metadata = sessionData.metadata || {};
  }

  toJSON(pretty = true) {
    return toJSON(this.sessionData, pretty);
  }

  eventsToCSV(options = {}) {
    if (options.fields) {
      const flat = this.events.map(flattenEvent);
      return toCSV(flat, options);
    }
    return eventsToCSV(this.events);
  }

  toMarkdown(title) {
    return toMarkdown(this.sessionData, title);
  }

  toHTML(title) {
    return toHTML(this.sessionData, title);
  }

  async saveJSON(filePath) {
    return exportToFile(filePath, this.toJSON());
  }

  async saveCSV(filePath, options = {}) {
    return exportToFile(filePath, this.eventsToCSV(options));
  }

  async saveMarkdown(filePath, title) {
    return exportToFile(filePath, this.toMarkdown(title));
  }

  async saveHTML(filePath, title) {
    return exportToFile(filePath, this.toHTML(title));
  }

  async savePDF(htmlFilePath) {
    // Save HTML first
    await this.saveHTML(htmlFilePath);
    // Return PDF placeholder instructions
    const sessionId = this.metadata.sessionId || 'unknown';
    return generatePDFPlaceholder(null, sessionId);
  }
}

export default ExportManager;
