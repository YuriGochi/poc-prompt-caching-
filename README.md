# OpenAI Prompt Caching — POC

A proof of concept that measures the real impact of OpenAI's prompt caching on **latency (TTFT)** and **cost** using a large, realistic system prompt (~4 500 tokens).

Includes a real-time web dashboard that visualizes cache hit rate, Time to First Token, and cost per call as they happen.

---

## Results

Tests run with `gpt-4o`, an interleaved call structure (A1, B1, A2, B2...) to control for API ordering bias, and `max_tokens: 80` to isolate prompt processing time from response generation time.

| Pair | Cached TTFT | Uncached TTFT | Improvement |
|---|---|---|---|
| 1 | 1 131ms | 506ms | B faster (A is cold miss) |
| 2 | 447ms | 2 103ms | **A 79% faster** |
| 3 | 618ms | 1 236ms | **A 50% faster** |
| 4 | 510ms | 4 964ms | **A 90% faster** |

| Metric | Cached | Uncached | Difference |
|---|---|---|---|
| TTFT avg (warm cache, pairs 2–4) | ~525ms | ~2 768ms | **−79%** |
| Total cost (5 call pairs) | ~$0.037 | ~$0.060 | **−38%** |
| Cache hit rate | ~90% | 0% | — |

> **Turn 1 is always a cache miss** — it warms the cache. The latency benefit starts from Turn 2 onward. This is why per-pair comparison matters more than the overall average.

---

## How Prompt Caching Works

Every API call sends the full prompt to the model. Without caching, the model processes the entire prompt from scratch on every single call — including the system prompt that never changes.

**Prompt caching stores the computation of repeated prefixes.** After the first call, subsequent calls that share the same exact token sequence from position 0 skip prompt processing entirely. Only the new user message is computed.

```
Scenario A — Cached                Scenario B — Uncached
──────────────────────────────     ──────────────────────────────
Call 1: [SYSTEM PROMPT]+[msg]      Call 1: [ts:111+SYSTEM]+[msg]
         cache MISS (written)               cache MISS

Call 2: [SYSTEM PROMPT]+[msg]      Call 2: [ts:222+SYSTEM]+[msg]
         cache HIT  ✓                       cache MISS

Call 3: [SYSTEM PROMPT]+[msg]      Call 3: [ts:333+SYSTEM]+[msg]
         cache HIT  ✓                       cache MISS
```

**Why Scenario B always misses:** a unique timestamp is injected before the system prompt on every call. Because the cache key is the exact token sequence from position 0, changing even one token busts the cache entirely.

### Key rules

- Minimum **1 024 tokens** to be eligible for caching.
- The prefix must be **byte-for-byte identical** across calls. Dynamic values (timestamps, session IDs, user names) injected into the system prompt break the cache.
- Cache TTL is approximately **5–10 minutes** of inactivity.
- Cached tokens are billed at **50% of the standard input price** — no configuration required.

---

## Why Model Size Matters for TTFT

| Model | Uncached prompt processing | Cache benefit visible in TTFT? |
|---|---|---|
| `gpt-4o-mini` | ~30–80ms | No — network latency (~150ms) exceeds the saving |
| `gpt-4o` | ~400–800ms | Yes — clearly measurable per call |

This POC uses `gpt-4o` intentionally. On faster/smaller models the **cost benefit is identical**, but the latency improvement is too small to observe above natural API variability in a short test.

---

## Why Average TTFT Can Be Misleading

A naive average includes Turn 1 (always a cold miss) and any rate-limited turns (gpt-4o has strict TPM limits). The correct comparison is **per-pair**: each cached call (Ai) vs the uncached call (Bi) made seconds later under the same API conditions.

This is why the runner interleaves calls (A1, B1, A2, B2...) instead of running all of A then all of B. Running sequentially introduces ordering bias — the API often warms up over the first few requests, making whichever scenario runs second look artificially faster.

---

## Project Structure

```
src/
├── utils/
│   ├── prompt.ts              # ~4 500-token hospital scheduling system prompt
│   └── display.ts             # Terminal table renderer + TurnResult type
├── scenarios/
│   ├── cached-session.ts      # Scenario A: same prompt every call
│   ├── uncached-calls.ts      # Scenario B: unique prefix every call
│   └── 20260607-comparison.ts # Interleaved runner: A1, B1, A2, B2...
├── 20260604-server.ts         # HTTP server + SSE + real-time web dashboard
└── index.ts                   # CLI entry point (terminal output only)
```

---

## Setup

**1. Clone and install**

```bash
git clone https://github.com/YuriGochi/poc-prompt-caching-.git
cd poc-prompt-caching-
npm install
```

**2. Configure your API key**

```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

**3. Run**

```bash
# Web dashboard (recommended)
npm run server
# Open http://localhost:3000 and click Run POC

# Terminal only
npm start
```

> **Cost warning:** each full run with `gpt-4o` costs approximately $0.10–0.15. Set a spending limit in your OpenAI dashboard before running.

---

## How TTFT Is Measured

The scenarios use the OpenAI streaming API to capture Time to First Token precisely:

```typescript
const start = Date.now();
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages,
  stream: true,
  stream_options: { include_usage: true }, // returns cached_tokens in usage
  max_tokens: 80,                          // short response keeps TTFT = prompt processing time
});

for await (const chunk of stream) {
  if (firstToken && chunk.choices[0]?.delta?.content) {
    ttfTokenMs = Date.now() - start;
    firstToken = false;
  }
  if (chunk.usage) {
    cachedTokens = chunk.usage.prompt_tokens_details.cached_tokens;
  }
}
```

`max_tokens: 80` limits response generation so that TTFT reflects prompt processing time — exactly what caching eliminates.

---

## Interpreting the Web Dashboard

- **Green bar** — cache hit. Width represents the hit rate percentage.
- **TTFT** — time until the model started responding. This is what end users perceive as speed.
- **Total** — full round-trip including response generation.
- **Cost** — estimated using official OpenAI pricing (input, cached input, and output tokens).

---

## The Bottom Line

Prompt caching is primarily a **cost optimization**. At 50% off on cached input tokens, the savings scale directly with call volume — a system making 100k calls/day with a 4 500-token system prompt saves roughly half its input token spend with zero logic changes and zero configuration.

The **latency benefit** is real but requires a model large enough (or a prompt long enough) for the saving to exceed API noise. With `gpt-4o` and a 4 500-token system prompt, the TTFT improvement is 50–90% on warm-cache calls.

The only requirement to benefit: keep the system prompt prefix identical across calls.
