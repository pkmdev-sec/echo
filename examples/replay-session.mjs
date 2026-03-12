#!/usr/bin/env node
/**
 * ECHO Example: Replay Session
 * Demonstrates how to load and replay a recorded session.
 */

import { SessionRecorder } from '../lib/session-recorder.mjs';
import { ReplayEngine } from '../lib/replay-engine.mjs';

async function main() {
  console.log('═══ ECHO Session Replay Example ═══\n');

  // Get session ID from command line or use the demo
  const sessionId = process.argv[2];

  if (!sessionId) {
    console.log('Usage: node examples/replay-session.mjs <session-id>');
    console.log('\nRun the record-session.mjs example first to create a session:');
    console.log('  node examples/record-session.mjs');
    process.exit(1);
  }

  console.log(`Loading session: ${sessionId}`);

  // Load the session
  let sessionData;
  try {
    const recorder = await SessionRecorder.load(sessionId);
    sessionData = recorder.toJSON();
    console.log('✓ Session loaded successfully\n');
  } catch (error) {
    console.error(`Error loading session: ${error.message}`);
    console.log('\nTip: Run record-session.mjs first to create a session to replay.');
    process.exit(1);
  }

  // Create replay engine
  const replay = new ReplayEngine(sessionData);
  console.log(`Session has ${replay.length} events\n`);

  // Build timeline
  replay.buildTimeline();

  // Print text summary
  console.log('─── Session Summary ───');
  console.log(replay.toTextReport());
  console.log('\n');

  // Step through events
  console.log('─── Stepping Through Events ───');
  replay.reset();
  let count = 0;
  let entry = replay.current();

  while (entry && count < 5) {
    console.log(`[${entry.relativeFormatted}] ${entry.event.type}`);
    if (entry.event.data) {
      const keys = Object.keys(entry.event.data).slice(0, 3);
      console.log(`  Data: ${keys.join(', ')}`);
    }
    entry = replay.next();
    count++;
  }

  if (replay.length > 5) {
    console.log(`  ... and ${replay.length - 5} more events\n`);
  }

  // Filter by tool type
  console.log('─── Tool Use Events ───');
  const toolEvents = replay.filterByType('tool_use');
  toolEvents.forEach((entry, idx) => {
    if (idx < 5) {
      const tool = entry.event.data?.tool || 'unknown';
      const duration = entry.event.data?.durationMs || 0;
      const cost = entry.event.data?.cost || 0;
      console.log(`[${entry.relativeFormatted}] ${tool} - ${duration}ms, $${cost.toFixed(4)}`);
    }
  });

  if (toolEvents.length > 5) {
    console.log(`  ... and ${toolEvents.length - 5} more tool uses\n`);
  } else {
    console.log('');
  }

  // Show errors
  const errors = replay.filterByType('error');
  if (errors.length > 0) {
    console.log('─── Errors ───');
    errors.forEach(entry => {
      const message = entry.event.data?.message || 'Unknown error';
      console.log(`[${entry.relativeFormatted}] ${message}`);
    });
    console.log('');
  }

  // Demonstrate bookmarks
  console.log('─── Bookmarks ───');

  // Add bookmark at first tool use
  if (toolEvents.length > 0) {
    replay.seek(0);
    const firstToolIdx = replay.getTimeline().findIndex(e => e.event.type === 'tool_use');
    if (firstToolIdx >= 0) {
      replay.addBookmark('First Tool Use', firstToolIdx);
    }
  }

  // Add bookmark at first error
  if (errors.length > 0) {
    const firstErrorIdx = replay.getTimeline().findIndex(e => e.event.type === 'error');
    if (firstErrorIdx >= 0) {
      replay.addBookmark('First Error', firstErrorIdx);
    }
  }

  const bookmarks = replay.getBookmarks();
  bookmarks.forEach(bookmark => {
    console.log(`  ${bookmark.name} @ index ${bookmark.index} (${bookmark.event.type})`);
  });

  if (bookmarks.length === 0) {
    console.log('  (No bookmarks added)');
  }
  console.log('');

  // Demonstrate event filtering
  console.log('─── Filtered View (tool_use only) ───');
  replay.setEventFilter('tool_use');
  const filteredTimeline = replay.getFilteredTimeline();
  console.log(`Filtered to ${filteredTimeline.length} events of type 'tool_use'`);

  // Clear filter
  replay.setEventFilter(null);
  console.log('Filter cleared\n');

  // Get tool sequence
  const toolSequence = replay.getToolSequence();
  if (toolSequence.length > 0) {
    console.log('─── Tool Sequence ───');
    toolSequence.forEach((tool, idx) => {
      if (idx < 5) {
        console.log(`  ${idx + 1}. ${tool.tool} (${tool.durationMs}ms, $${tool.cost.toFixed(4)})`);
      }
    });
    if (toolSequence.length > 5) {
      console.log(`  ... and ${toolSequence.length - 5} more tools`);
    }
  }

  console.log('\n✓ Replay complete!');
}

main().catch(error => {
  console.error('Error replaying session:', error.message);
  process.exit(1);
});
