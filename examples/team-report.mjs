#!/usr/bin/env node
/**
 * ECHO Example: Team Report
 * Demonstrates team dashboard aggregation and reporting.
 */

import { TeamDashboard } from '../lib/team-dashboard.mjs';
import { AnalyticsEngine } from '../lib/analytics.mjs';

function createMockSession(userId, eventCount, toolCount, errorCount = 0, costBase = 0.01) {
  const events = [];
  const baseTime = Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000; // Random time in past week

  const tools = ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'WebSearch', 'Glob'];

  // Add events
  for (let i = 0; i < eventCount; i++) {
    const timestamp = baseTime + i * 1000;

    if (i < toolCount) {
      // Tool use event
      const tool = tools[Math.floor(Math.random() * tools.length)];
      const duration = Math.floor(Math.random() * 2000) + 100;
      const cost = costBase * (Math.random() * 0.5 + 0.5);

      events.push({
        id: `evt-${i}`,
        type: 'tool_use',
        timestamp,
        isoTime: new Date(timestamp).toISOString(),
        data: {
          tool,
          input: { param: 'value' },
          output: { result: 'success' },
          durationMs: duration,
          cost,
        },
      });
    } else if (i < toolCount + errorCount) {
      // Error event
      events.push({
        id: `evt-${i}`,
        type: 'error',
        timestamp,
        isoTime: new Date(timestamp).toISOString(),
        data: {
          message: 'Sample error message',
          severity: 'warning',
        },
      });
    } else {
      // Generic event
      events.push({
        id: `evt-${i}`,
        type: 'generic',
        timestamp,
        isoTime: new Date(timestamp).toISOString(),
        data: {},
      });
    }
  }

  return {
    metadata: {
      sessionId: `session-${userId}-${Date.now()}`,
      userId,
      startedAt: baseTime,
      startedAtISO: new Date(baseTime).toISOString(),
      endedAt: baseTime + eventCount * 1000,
      endedAtISO: new Date(baseTime + eventCount * 1000).toISOString(),
      totalEvents: eventCount,
      durationMs: eventCount * 1000,
    },
    events,
  };
}

async function main() {
  console.log('═══ ECHO Team Report Example ═══\n');

  // Create a team dashboard
  const team = new TeamDashboard('Engineering Team Alpha');
  console.log(`Team: ${team.teamName}\n`);

  // Add simulated sessions for multiple team members
  console.log('Adding team member sessions...');

  // Alice - high performer
  team.addSession(createMockSession('alice', 50, 35, 1, 0.015));
  team.addSession(createMockSession('alice', 45, 30, 0, 0.012));
  team.addSession(createMockSession('alice', 60, 40, 2, 0.018));

  // Bob - moderate performer
  team.addSession(createMockSession('bob', 40, 25, 3, 0.010));
  team.addSession(createMockSession('bob', 35, 20, 2, 0.009));

  // Charlie - learning
  team.addSession(createMockSession('charlie', 30, 15, 5, 0.008));
  team.addSession(createMockSession('charlie', 28, 12, 4, 0.007));
  team.addSession(createMockSession('charlie', 32, 18, 3, 0.009));

  // Diana - expert
  team.addSession(createMockSession('diana', 70, 50, 0, 0.020));
  team.addSession(createMockSession('diana', 65, 48, 1, 0.019));

  console.log(`✓ Added ${team.totalSessions} sessions for ${team.memberCount} team members\n`);

  // Generate team summary
  console.log('─── Team Overview ───');
  const summary = team.summary();
  console.log(`Members: ${summary.memberCount}`);
  console.log(`Total Sessions: ${summary.totalSessions}`);
  console.log(`Total Cost: $${summary.totalCost.toFixed(4)}`);
  console.log(`Team Error Rate: ${summary.teamErrorRate}%`);
  console.log(`Team Health Score: ${summary.teamHealthScore}/100`);
  console.log('');

  // Show leaderboard
  console.log('─── Leaderboard: Most Active (by sessions) ───');
  const sessionLeaderboard = team.leaderboard('sessions');
  sessionLeaderboard.forEach((entry, idx) => {
    console.log(`  ${idx + 1}. ${entry.userId}: ${entry.value} sessions`);
  });
  console.log('');

  console.log('─── Leaderboard: Total Cost ───');
  const costLeaderboard = team.leaderboard('cost');
  costLeaderboard.forEach((entry, idx) => {
    console.log(`  ${idx + 1}. ${entry.userId}: $${entry.value.toFixed(4)}`);
  });
  console.log('');

  console.log('─── Leaderboard: Error Rate ───');
  const errorLeaderboard = team.leaderboard('errorRate');
  errorLeaderboard.forEach((entry, idx) => {
    const quality = entry.value < 5 ? '✓' : entry.value < 10 ? '○' : '✗';
    console.log(`  ${idx + 1}. ${entry.userId}: ${entry.value}% ${quality}`);
  });
  console.log('');

  // Top tools across team
  console.log('─── Top Tools (Team-wide) ───');
  const topTools = team.topTools(5);
  topTools.forEach((tool, idx) => {
    console.log(`  ${idx + 1}. ${tool.tool}: ${tool.count} uses`);
  });
  console.log('');

  // Common errors
  const commonErrors = team.commonErrors(3);
  if (commonErrors.length > 0) {
    console.log('─── Common Errors ───');
    commonErrors.forEach((error, idx) => {
      console.log(`  ${idx + 1}. "${error.message}": ${error.count} occurrences`);
    });
    console.log('');
  }

  // Per-developer breakdown
  console.log('─── Per-Developer Breakdown ───');
  const breakdown = team.perDeveloperBreakdown();
  breakdown.forEach(dev => {
    console.log(`${dev.userId}:`);
    console.log(`  Sessions: ${dev.sessionCount}`);
    console.log(`  Total Events: ${dev.totalEvents}`);
    console.log(`  Total Errors: ${dev.totalErrors}`);
    console.log(`  Error Rate: ${dev.errorRate}%`);
    console.log(`  Avg Duration/Session: ${dev.avgDurationPerSession}ms`);
    console.log(`  Total Cost: $${dev.totalCost.toFixed(4)}`);
    console.log(`  Avg Cost/Session: $${dev.avgCostPerSession.toFixed(4)}`);
    console.log(`  Unique Tools: ${dev.toolCount}`);
    console.log('');
  });

  // Analytics on team data
  console.log('─── Analytics Engine ───');
  const analytics = new AnalyticsEngine();

  // Add all team sessions to analytics
  for (const member of team.members.values()) {
    for (const session of member.sessions) {
      const sessionData = {
        metadata: session.metadata,
        events: session.events,
      };
      analytics.addSession(sessionData);
    }
  }

  const analyticsResults = analytics.computeAll();
  console.log(`Total Sessions Analyzed: ${analyticsResults.totalSessions}`);
  console.log(`Aggregate Cost: $${analyticsResults.aggregateCost.toFixed(4)}`);
  console.log(`Aggregate Error Rate: ${analyticsResults.aggregateErrorRate}%`);
  console.log('');

  // Baseline metrics
  const baseline = analytics.getBaseline();
  console.log('Baseline Metrics:');
  console.log(`  Avg Duration: ${baseline.avgDuration.toFixed(2)}ms`);
  console.log(`  Avg Cost: $${baseline.avgCost.toFixed(6)}`);
  console.log(`  Avg Error Rate: ${baseline.avgErrorRate.toFixed(2)}%`);
  console.log('');

  // Detect anomalies
  const anomalies = analytics.detectAnomalies();
  if (anomalies.length > 0) {
    console.log(`─── Anomalies Detected: ${anomalies.length} ───`);
    anomalies.slice(0, 3).forEach(anomaly => {
      console.log(`Session: ${anomaly.sessionId} (${anomaly.userId})`);
      anomaly.anomalies.forEach(a => {
        console.log(`  ${a.type}: ${a.value.toFixed(2)} (expected: ${a.expected.toFixed(2)}, z-score: ${a.zScore})`);
      });
    });
    console.log('');
  }

  // Formatted report output
  console.log('═══ FINAL TEAM REPORT ═══');
  console.log(`Team: ${team.teamName}`);
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');
  console.log('SUMMARY:');
  console.log(`  ✓ ${summary.memberCount} active developers`);
  console.log(`  ✓ ${summary.totalSessions} sessions recorded`);
  console.log(`  ✓ $${summary.totalCost.toFixed(4)} total cost`);
  console.log(`  ✓ ${summary.teamErrorRate}% error rate`);
  console.log(`  ✓ ${summary.teamHealthScore}/100 health score`);
  console.log('');
  console.log('TOP PERFORMER: ' + sessionLeaderboard[0].userId + ' (' + sessionLeaderboard[0].value + ' sessions)');
  console.log('MOST EFFICIENT: ' + errorLeaderboard[0].userId + ' (' + errorLeaderboard[0].value + '% error rate)');
  console.log('');
  console.log('✓ Report generated successfully!');
}

main().catch(error => {
  console.error('Error generating team report:', error.message);
  process.exit(1);
});
