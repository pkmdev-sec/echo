/**
 * ECHO — Export Module
 * CSV/JSON export for reports and data portability.
 */

import { writeFile } from 'node:fs/promises';

export function toJSON(data, pretty = true) {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

export function flattenEvent(event) {
  const flat = {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    isoTime: event.isoTime,
  };
  if (event.data) {
    for (const [key, value] of Object.entries(event.data)) {
      if (typeof value === 'object' && value !== null) {
        flat[`data_${key}`] = JSON.stringify(value);
      } else {
        flat[`data_${key}`] = value;
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
  const allKeys = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allKeys.add(key);
    }
  }
  const headers = Array.from(allKeys);
  const lines = [headers.map(escapeCSVField).join(',')];
  for (const row of rows) {
    const values = headers.map(h => escapeCSVField(row[h]));
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

export function eventsToCSV(events) {
  const flat = events.map(flattenEvent);
  return toCSV(flat);
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
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

export class ExportManager {
  constructor(sessionData) {
    this.sessionData = sessionData;
    this.events = sessionData.events || [];
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
