/**
 * Interleaved comparison: A1, B1, A2, B2, A3, B3 ...
 *
 * Running both scenarios back-to-back (all of A, then all of B) introduces
 * ordering bias — the API often warms up over the first few requests, so
 * whichever scenario runs second looks artificially faster.
 *
 * Interleaving pairs each cached call with an uncached call made seconds
 * apart, under identical API conditions. The only variable left is the
 * cache itself.
 */

import OpenAI from 'openai';
import { SYSTEM_PROMPT, withUniquePrefix } from '../utils/prompt.js';
import { calcCost, type TurnResult } from '../utils/display.js';

const CALLS = 5;
const USER_MESSAGE =
  'Hi, I need to schedule an appointment with a cardiologist for next week. What are my options?';

type ScenarioResult = TurnResult & { scenario: 'A' | 'B' };

async function makeCall(
  client: OpenAI,
  systemPrompt: string,
): Promise<Omit<TurnResult, 'turn'>> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: USER_MESSAGE },
  ];

  const start = Date.now();
  let ttfTokenMs = 0;
  let firstContent = true;
  let usageData: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null = null;

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 80,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (firstContent && delta) {
      ttfTokenMs = Date.now() - start;
      firstContent = false;
    }
    if (chunk.usage) usageData = chunk.usage as typeof usageData;
  }

  const latencyMs      = Date.now() - start;
  const usage          = usageData!;
  const promptTokens   = usage.prompt_tokens;
  const cachedTokens   = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const completionTokens = usage.completion_tokens;
  const cacheHitRate   = promptTokens > 0 ? (cachedTokens / promptTokens) * 100 : 0;

  return {
    latencyMs,
    ttfTokenMs,
    promptTokens,
    cachedTokens,
    completionTokens,
    cacheHitRate,
    estimatedCostUsd: calcCost(promptTokens, cachedTokens, completionTokens),
  };
}

export async function runComparison(
  client: OpenAI,
  onResult?: (r: ScenarioResult) => void,
): Promise<{ cached: TurnResult[]; uncached: TurnResult[] }> {
  const cached: TurnResult[]   = [];
  const uncached: TurnResult[] = [];

  for (let i = 0; i < CALLS; i++) {
    // Cached call — same system prompt every time
    const a = await makeCall(client, SYSTEM_PROMPT);
    const resultA: TurnResult = { turn: i + 1, ...a };
    cached.push(resultA);
    onResult?.({ scenario: 'A', ...resultA });

    await new Promise(r => setTimeout(r, 3000));

    // Uncached call — unique prefix busts the cache
    const b = await makeCall(client, withUniquePrefix(i));
    const resultB: TurnResult = { turn: i + 1, ...b };
    uncached.push(resultB);
    onResult?.({ scenario: 'B', ...resultB });

    await new Promise(r => setTimeout(r, 3000));
  }

  return { cached, uncached };
}
