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

export function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  if (!Array.isArray(rows)) {
    throw new Error('toCSV requires an array of objects');
  }
  const allKeys = new Set();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      for (const key of Object.keys(row)) {
        allKeys.add(key);
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

  eventsToCSV() {
    return eventsToCSV(this.events);
  }

  async saveJSON(filePath) {
    return exportToFile(filePath, this.toJSON());
  }

  async saveCSV(filePath) {
    return exportToFile(filePath, this.eventsToCSV());
  }
}

export default ExportManager;
