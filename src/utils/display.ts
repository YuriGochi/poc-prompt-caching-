export interface TurnResult {
  turn: number;
  latencyMs: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  cacheHitRate: number;
  estimatedCostUsd: number;
}

// gpt-4o-mini pricing (2025): $0.15/1M input, $0.075/1M cached input, $0.60/1M output
const PRICE_INPUT_PER_TOKEN = 0.15 / 1_000_000;
const PRICE_CACHED_PER_TOKEN = 0.075 / 1_000_000;
const PRICE_OUTPUT_PER_TOKEN = 0.6 / 1_000_000;

export function calcCost(promptTokens: number, cachedTokens: number, completionTokens: number): number {
  const uncachedInput = (promptTokens - cachedTokens) * PRICE_INPUT_PER_TOKEN;
  const cachedInput = cachedTokens * PRICE_CACHED_PER_TOKEN;
  const output = completionTokens * PRICE_OUTPUT_PER_TOKEN;
  return uncachedInput + cachedInput + output;
}

export function printHeader(title: string) {
  const line = '─'.repeat(80);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
  console.log(
    'Turn'.padEnd(6),
    'Latency'.padEnd(12),
    'Prompt tkns'.padEnd(14),
    'Cached tkns'.padEnd(14),
    'Hit rate'.padEnd(12),
    'Cost (USD)'
  );
  console.log('─'.repeat(80));
}

export function printRow(r: TurnResult) {
  const cacheBar = r.cacheHitRate > 0
    ? `${'█'.repeat(Math.round(r.cacheHitRate / 10))}${'░'.repeat(10 - Math.round(r.cacheHitRate / 10))} ${r.cacheHitRate.toFixed(0)}%`
    : '░░░░░░░░░░ 0%';

  console.log(
    String(r.turn).padEnd(6),
    `${r.latencyMs}ms`.padEnd(12),
    String(r.promptTokens).padEnd(14),
    String(r.cachedTokens).padEnd(14),
    cacheBar.padEnd(22),
    `$${r.estimatedCostUsd.toFixed(6)}`
  );
}

export function printSummary(results: TurnResult[], label: string) {
  const totalCost = results.reduce((s, r) => s + r.estimatedCostUsd, 0);
  const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / results.length;
  const avgHitRate = results.reduce((s, r) => s + r.cacheHitRate, 0) / results.length;
  console.log('─'.repeat(80));
  console.log(`  ${label}`);
  console.log(`  Avg latency : ${avgLatency.toFixed(0)}ms`);
  console.log(`  Avg hit rate: ${avgHitRate.toFixed(0)}%`);
  console.log(`  Total cost  : $${totalCost.toFixed(6)}`);
  console.log('─'.repeat(80));
}
