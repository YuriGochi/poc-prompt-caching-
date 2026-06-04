/**
 * Scenario A — CACHED SESSION
 *
 * Simulates a multi-turn conversation where the system prompt never changes.
 * The same static prefix is sent on every call, so OpenAI's server can cache it.
 *
 * Expected result:
 *  - Turn 1: cachedTokens = 0  (cold miss — first time this prefix is seen)
 *  - Turn 2+: cachedTokens ≈ systemPromptLength  (cache hit)
 *  - Latency drops noticeably from turn 2 onward
 */

import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '../utils/prompt.js';
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

export async function runCachedSession(client: OpenAI): Promise<TurnResult[]> {
  printHeader('Scenario A — Cached session (same system prompt every turn)');

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  const results: TurnResult[] = [];

  for (let i = 0; i < USER_TURNS.length; i++) {
    messages.push({ role: 'user', content: USER_TURNS[i] });

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

    // Add the assistant reply to conversation history so next turn has context
    messages.push({ role: 'assistant', content: response.choices[0].message.content ?? '' });

    // Small delay so we don't hit rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  printSummary(results, 'Summary — Cached session');
  return results;
}
