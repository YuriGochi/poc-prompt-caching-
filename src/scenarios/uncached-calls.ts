/**
 * Scenario B — UNCACHED CALLS
 *
 * Injects a unique timestamp prefix before the system prompt on every call.
 * Because OpenAI's cache key is the exact token sequence from position 0,
 * any change to the prefix guarantees a cache miss — the full prompt is
 * recomputed from scratch on every single call.
 *
 * Expected behaviour:
 *   Every call: cachedTokens = 0
 *   TTFT stays consistently high (~1 000–2 000 ms)
 *   Total cost is ~2× higher than Scenario A from call 2 onward
 */

import OpenAI from 'openai';
import { withUniquePrefix } from '../utils/prompt.js';
import { calcCost, printHeader, printRow, printSummary, type TurnResult } from '../utils/display.js';

const CALLS = 8;
const USER_MESSAGE = 'Hi, I need to schedule an appointment with a cardiologist for next week. What are my options?';

export async function runUncachedCalls(
  client: OpenAI,
  onResult?: (r: TurnResult) => void,
): Promise<TurnResult[]> {
  printHeader('Scenario B — Uncached (unique prefix per call, cache miss guaranteed)');

  const results: TurnResult[] = [];

  for (let i = 0; i < CALLS; i++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: withUniquePrefix(i) },
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
    const promptTokens     = usage.prompt_tokens;
    const cachedTokens     = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const completionTokens = usage.completion_tokens;
    const cacheHitRate     = promptTokens > 0 ? (cachedTokens / promptTokens) * 100 : 0;

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

  printSummary(results, 'Summary — Uncached calls');
  return results;
}
