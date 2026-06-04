/**
 * Scenario B — UNCACHED CALLS
 *
 * Simulates the same 8 turns, but each call starts a brand-new conversation
 * with a unique system prompt prefix. This guarantees a cache miss every time
 * because OpenAI's cache key includes the exact token sequence from position 0.
 *
 * Expected result:
 *  - Every turn: cachedTokens = 0
 *  - Latency remains consistently high
 *  - Total cost is higher than Scenario A
 */

import OpenAI from 'openai';
import { withUniquePrefix } from '../utils/prompt.js';
import { calcCost, printHeader, printRow, printSummary, type TurnResult } from '../utils/display.js';

const USER_TURNS = [
  'Hi, I need to book an appointment with a cardiologist.',
  'My name is James Anderson. Date of birth: March 12th, 1975.',
  'I would prefer something next Tuesday afternoon if possible.',
  'The second option sounds good. Can I confirm with my insurance?',
  'I have Blue Cross Blue Shield, member ID 784512.',
  'Yes, two o clock on Tuesday the 10th works perfectly.',
  'Can you send a confirmation to my email?',
  'Thank you. That\'s all I needed.',
];

export async function runUncachedCalls(client: OpenAI): Promise<TurnResult[]> {
  printHeader('Scenario B — Uncached calls (unique prefix per call, no cache reuse)');

  const results: TurnResult[] = [];

  for (let i = 0; i < USER_TURNS.length; i++) {
    // Each call gets a different system prompt prefix → cache miss guaranteed
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: withUniquePrefix(i) },
      { role: 'user', content: USER_TURNS[i] },
    ];

    const start = Date.now();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });
    const latencyMs = Date.now() - start;

    const usage = response.usage!;
    const promptTokens = usage.prompt_tokens;
    const cachedTokens = (usage.prompt_tokens_details as { cached_tokens?: number })?.cached_tokens ?? 0;
    const completionTokens = usage.completion_tokens;
    const cacheHitRate = promptTokens > 0 ? (cachedTokens / promptTokens) * 100 : 0;

    const result: TurnResult = {
      turn: i + 1,
      latencyMs,
      promptTokens,
      cachedTokens,
      completionTokens,
      cacheHitRate,
      estimatedCostUsd: calcCost(promptTokens, cachedTokens, completionTokens),
    };

    printRow(result);
    results.push(result);

    await new Promise(r => setTimeout(r, 300));
  }

  printSummary(results, 'Summary — Uncached calls');
  return results;
}
