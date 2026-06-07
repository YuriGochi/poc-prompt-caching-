/**
 * Scenario A — CACHED SESSION
 *
 * Sends the same system prompt on every independent API call.
 * After the first call warms the cache, all subsequent calls pay
 * only for the user message tokens at full price — the ~2 000-token
 * system prompt is served from OpenAI's cache at 50 % of the input rate.
 *
 * Expected behaviour:
 *   Call 1 : cachedTokens = 0   (cold miss — cache is being written)
 *   Call 2+: cachedTokens ≈ len(SYSTEM_PROMPT)  (cache hit)
 *   TTFT drops from ~1 500 ms → ~150 ms from call 2 onward
 */

import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '../utils/prompt.js';
import { calcCost, printHeader, printRow, printSummary, type TurnResult } from '../utils/display.js';

const CALLS = 8;
const USER_MESSAGE = 'Hi, I need to schedule an appointment with a cardiologist for next week. What are my options?';

export async function runCachedSession(
  client: OpenAI,
  onResult?: (r: TurnResult) => void,
): Promise<TurnResult[]> {
  printHeader('Scenario A — Cached (identical system prompt on every call)');

  const results: TurnResult[] = [];

  for (let i = 0; i < CALLS; i++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: USER_MESSAGE },
    ];

    const start = Date.now();
    let ttfTokenMs = 0;
    let firstContent = true;
    let usageData: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } } | null = null;

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (firstContent && delta) {
        ttfTokenMs = Date.now() - start;
        firstContent = false;
      }
      if (chunk.usage) usageData = chunk.usage as typeof usageData;
    }

    const latencyMs = Date.now() - start;
    const usage = usageData!;
    const promptTokens   = usage.prompt_tokens;
    const cachedTokens   = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const completionTokens = usage.completion_tokens;
    const cacheHitRate   = promptTokens > 0 ? (cachedTokens / promptTokens) * 100 : 0;

    const result: TurnResult = {
      turn: i + 1,
      latencyMs,
      ttfTokenMs,
      promptTokens,
      cachedTokens,
      completionTokens,
      cacheHitRate,
      estimatedCostUsd: calcCost(promptTokens, cachedTokens, completionTokens),
    };

    printRow(result);
    onResult?.(result);
    results.push(result);

    await new Promise(r => setTimeout(r, 300));
  }

  printSummary(results, 'Summary — Cached session');
  return results;
}
