#!/usr/bin/env node
/**
 * ECHO Example: Record Session
 * Demonstrates how to create and record a session with various event types.
 */

import { SessionRecorder } from '../lib/session-recorder.mjs';

async function main() {
  console.log('═══ ECHO Session Recording Example ═══\n');

  // Create a new session recorder
  const recorder = new SessionRecorder({
    userId: 'demo-user',
    tags: ['example', 'tutorial'],
  });

  console.log(`Session ID: ${recorder.sessionId}`);
  console.log(`User ID: ${recorder.userId}\n`);

  // Record task start
  console.log('Recording task start...');
  recorder.recordTaskStart('task-001', 'Implement authentication feature');

  // Simulate some tool use events
  console.log('Recording tool use events...');

  recorder.recordToolUse(
    'Bash',
    { command: 'npm test' },
    { exitCode: 0, stdout: 'All tests passed' },
    1250,
    0.005
  );

  recorder.recordToolUse(
    'Read',
    { file_path: '/src/auth.js' },
    { lines: 150, content: '...' },
    50,
    0.001
  );

  recorder.recordToolUse(
    'Edit',
    { file_path: '/src/auth.js', old_string: 'validateUser', new_string: 'authenticateUser' },
    { success: true },
    200,
    0.002
  );

  recorder.recordToolUse(
    'Bash',
    { command: 'git commit -m "Update auth"' },
    { exitCode: 0, stdout: 'Committed' },
    850,
    0.004
  );

  // Record an error
  console.log('Recording error event...');
  recorder.recordError('Type mismatch in auth module', {
    file: '/src/auth.js',
    line: 42,
    severity: 'warning',
  });

  // Record more tool uses
  recorder.recordToolUse(
    'Grep',
    { pattern: 'authenticateUser', path: '/src' },
    { matches: 5, files: ['auth.js', 'login.js'] },
    300,
    0.002
  );

  // Record task end
  console.log('Recording task end...');
  recorder.recordTaskEnd('task-001', 'completed');

  // Start another task
  recorder.recordTaskStart('task-002', 'Write unit tests');

  recorder.recordToolUse(
    'Write',
    { file_path: '/tests/auth.test.js' },
    { bytesWritten: 2500 },
    150,
    0.001
  );

  recorder.recordToolUse(
    'Bash',
    { command: 'npm test -- auth.test.js' },
    { exitCode: 0, tests: 12, passed: 12 },
    2100,
    0.008
  );

  recorder.recordTaskEnd('task-002', 'completed');

  // End the session
  const metadata = recorder.end();
  console.log('\nSession ended.');
  console.log(`Total events: ${metadata.totalEvents}`);
  console.log(`Duration: ${metadata.durationMs}ms`);

  // Save the session
  const filePath = await recorder.save();
  console.log(`\nSession saved to: ${filePath}`);
  console.log(`\nEvent breakdown:`);
  console.log(`  - Task starts: 2`);
  console.log(`  - Task ends: 2`);
  console.log(`  - Tool uses: 7`);
  console.log(`  - Errors: 1`);
  console.log(`  - Total: ${recorder.eventCount} events`);

  console.log('\n✓ Session recorded successfully!');
  console.log(`\nTo replay this session, run:`);
  console.log(`  node examples/replay-session.mjs ${recorder.sessionId}`);
}

main().catch(error => {
  console.error('Error recording session:', error.message);
  process.exit(1);
});
