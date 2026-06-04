/**
 * POC: OpenAI Prompt Caching
 *
 * Runs two scenarios back-to-back and prints a side-by-side comparison:
 *
 *  Scenario A (cached)   — same system prompt every turn → cache warms up from turn 2
 *  Scenario B (uncached) — unique prefix per call        → cache miss every turn
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npm start
 */

import OpenAI from 'openai';
import { runCachedSession } from './scenarios/cached-session.js';
import { runUncachedCalls } from './scenarios/uncached-calls.js';
import type { TurnResult } from './utils/display.js';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Error: OPENAI_API_KEY environment variable is not set.');
  console.error('Run: OPENAI_API_KEY=sk-... npm start');
  process.exit(1);
}

const client = new OpenAI({ apiKey });

async function main() {
  console.log('\n=== OpenAI Prompt Caching — POC ===\n');
  console.log('Model   : gpt-4o-mini');
  console.log('Turns   : 8 per scenario');
  console.log('Min cache threshold: 1024 tokens\n');

  // --- Scenario A ---
  const cachedResults = await runCachedSession(client);

  // Brief pause between scenarios so network conditions are roughly comparable
  console.log('\nPausing 2s before Scenario B...');
  await new Promise(r => setTimeout(r, 2000));

  // --- Scenario B ---
  const uncachedResults = await runUncachedCalls(client);

  // --- Final comparison ---
  printComparison(cachedResults, uncachedResults);
}

function printComparison(cached: TurnResult[], uncached: TurnResult[]) {
  const line = '═'.repeat(80);
  console.log(`\n${line}`);
  console.log('  FINAL COMPARISON');
  console.log(line);

  const avgCachedLatency = avg(cached.map(r => r.latencyMs));
  const avgUncachedLatency = avg(uncached.map(r => r.latencyMs));
  const latencySaving = ((avgUncachedLatency - avgCachedLatency) / avgUncachedLatency) * 100;

  const totalCachedCost = sum(cached.map(r => r.estimatedCostUsd));
  const totalUncachedCost = sum(uncached.map(r => r.estimatedCostUsd));
  const costSaving = ((totalUncachedCost - totalCachedCost) / totalUncachedCost) * 100;

  const avgHitRate = avg(cached.map(r => r.cacheHitRate));

  console.log('');
  console.log('                        Cached session   Uncached calls   Saving');
  console.log('─'.repeat(80));
  console.log(
    'Avg latency (ms)'.padEnd(24),
    String(avgCachedLatency.toFixed(0)).padEnd(17),
    String(avgUncachedLatency.toFixed(0)).padEnd(17),
    `${latencySaving > 0 ? '-' : '+'}${Math.abs(latencySaving).toFixed(0)}%`
  );
  console.log(
    'Total cost (USD)'.padEnd(24),
    `$${totalCachedCost.toFixed(6)}`.padEnd(17),
    `$${totalUncachedCost.toFixed(6)}`.padEnd(17),
    `${costSaving > 0 ? '-' : '+'}${Math.abs(costSaving).toFixed(0)}%`
  );
  console.log(
    'Avg cache hit rate'.padEnd(24),
    `${avgHitRate.toFixed(0)}%`.padEnd(17),
    '0%'.padEnd(17),
    ''
  );
  console.log('─'.repeat(80));
  console.log('');
  console.log('Note: Turn 1 in Scenario A is always a cache miss (cold start).');
  console.log('      Latency benefit is visible from Turn 2 onward.');
  console.log(line);
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
