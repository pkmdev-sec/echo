#!/usr/bin/env node
/**
 * ECHO CLI — Session Replay and Analytics
 * Quick command-line interface for viewing session data.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionRecorder } from '../lib/session-recorder.mjs';
import { ReplayEngine } from '../lib/replay-engine.mjs';
import { AnalyticsEngine } from '../lib/analytics.mjs';
import { TeamDashboard } from '../lib/team-dashboard.mjs';
import { eventsToCSV, toJSON } from '../lib/export.mjs';

const STORE_DIR = join(process.env.HOME || '/tmp', '.echo', 'sessions');

const BANNER = `
\x1b[38;2;14;165;233m╔══════════════════════════════════════════════════╗
║                                                  ║
║     )))       )))       )))       )))       )))   ║
║    (((       (((       (((       (((       (((    ║
║     )))  E C H O  )))       )))       )))         ║
║    (((       (((       (((       (((       (((    ║
║     )))       )))       )))       )))       )))   ║
║                                                  ║
║         SESSION REPLAY AND ANALYTICS             ║
║                                                  ║
╚══════════════════════════════════════════════════╝\x1b[0m
`;

async function listSessions() {
  try {
    const files = await readdir(STORE_DIR);
    const sessions = files.filter(f => f.endsWith('.json'));
    if (sessions.length === 0) {
      console.log('No sessions found.');
      return;
    }
    console.log(`Found ${sessions.length} session(s):\n`);
    for (const file of sessions) {
      const raw = await readFile(join(STORE_DIR, file), 'utf-8');
      const data = JSON.parse(raw);
      const meta = data.metadata || {};
      console.log(`  ${meta.sessionId || file}  [${meta.userId || '?'}]  events: ${(data.events || []).length}`);
    }
  } catch {
    console.log('No sessions directory found. Record some sessions first.');
  }
}

async function replaySession(sessionId) {
  const filePath = join(STORE_DIR, `${sessionId}.json`);
  const raw = await readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const engine = new ReplayEngine(data);
  console.log(engine.toTextReport());
}

async function analyzeAll() {
  const files = await readdir(STORE_DIR);
  const engine = new AnalyticsEngine();
  for (const file of files.filter(f => f.endsWith('.json'))) {
    const raw = await readFile(join(STORE_DIR, file), 'utf-8');
    engine.addSession(JSON.parse(raw));
  }
  console.log(JSON.stringify(engine.computeAll(), null, 2));
}

const [,, command, ...args] = process.argv;

console.log(BANNER);

switch (command) {
  case 'list':
    await listSessions();
    break;
  case 'replay':
    if (!args[0]) {
      console.error('Usage: echo replay <session-id>');
      process.exit(1);
    }
    await replaySession(args[0]);
    break;
  case 'analyze':
    await analyzeAll();
    break;
  default:
    console.log('Usage: echo <command>\n');
    console.log('Commands:');
    console.log('  list              List all recorded sessions');
    console.log('  replay <id>       Replay a specific session');
    console.log('  analyze           Analyze all sessions');
    break;
}
