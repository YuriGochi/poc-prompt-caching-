# POC — OpenAI Prompt Caching

Demonstrates the latency and cost difference between LLM calls that hit the
prompt cache versus calls that always miss it.

## What this proves

OpenAI automatically caches the token prefix of any prompt that is 1024+ tokens
and repeated across requests. When a cache hit occurs:

- Input latency drops up to **80%**
- Cached token cost is **50% lower** than uncached input tokens
- No code change required — the model returns `cached_tokens` in `usage`

## How it works

Two scenarios run back-to-back with the same 8 user messages:

| Scenario | System prompt | Cache behaviour |
|---|---|---|
| **A — Cached session** | Identical every turn | Miss on turn 1, hits on turns 2-8 |
| **B — Uncached calls** | Unique prefix per call | Miss every turn |

The only difference is whether the system prompt prefix is identical across
calls or not. Everything else (model, user messages, temperature) is the same.

## Prerequisites

1. **OpenAI account** — create one at https://platform.openai.com
2. **API key** — go to *Settings → API keys → Create new secret key*
3. **Credits** — add $5 in *Settings → Billing*. This POC costs less than $0.20 total.

You can set a monthly spending limit in *Settings → Limits* to avoid surprises.

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/poc-prompt-caching
cd poc-prompt-caching
npm install
cp .env.example .env
# edit .env and paste your API key
```

## Run

```bash
# Run both scenarios and print side-by-side comparison
OPENAI_API_KEY=sk-... npm start

# Or if you have a .env file and dotenv installed:
npm start
```

## Expected output

```
=== OpenAI Prompt Caching — POC ===

Model   : gpt-4o-mini
Turns   : 8 per scenario

────────────────────────────────────────────────────────────────────────────────
  Scenario A — Cached session (same system prompt every turn)
────────────────────────────────────────────────────────────────────────────────
Turn   Latency      Prompt tkns   Cached tkns   Hit rate              Cost (USD)
────────────────────────────────────────────────────────────────────────────────
1      1423ms       1521          0             ░░░░░░░░░░ 0%         $0.000228
2      612ms        1628          1408          ████████░░ 86%        $0.000048
3      589ms        1789          1408          ███████░░░ 78%        $0.000065
...

────────────────────────────────────────────────────────────────────────────────
  Scenario B — Uncached calls (unique prefix per call, no cache reuse)
────────────────────────────────────────────────────────────────────────────────
Turn   Latency      Prompt tkns   Cached tkns   Hit rate              Cost (USD)
────────────────────────────────────────────────────────────────────────────────
1      1398ms       1535          0             ░░░░░░░░░░ 0%         $0.000230
2      1341ms       1549          0             ░░░░░░░░░░ 0%         $0.000232
...

════════════════════════════════════════════════════════════════════════════════
  FINAL COMPARISON
════════════════════════════════════════════════════════════════════════════════

                        Cached session   Uncached calls   Saving
─────────────────────────────────────────────────────────────────
Avg latency (ms)        621              1370             -55%
Total cost (USD)        $0.000412        $0.001841        -78%
Avg cache hit rate      79%              0%
```

## Key concepts

### Why does Turn 1 always miss?
The cache is populated on first use. OpenAI's servers need to see the exact
token sequence at least once before they can serve it from cache.

### What breaks the cache?
Any change to the token sequence **before** the variable content (user message).
That's why Scenario B injects a unique timestamp at the very start of each
system prompt — it shifts all subsequent tokens and invalidates the prefix.

### Cache TTL
OpenAI keeps cached prefixes for **5–10 minutes** by default (up to 1 hour on
some models). For longer-running workflows, sending requests at least every few
minutes maintains the cache warm.

### Real-world implication
In a production voice AI with a ~22,000-token system prompt (typical for a
complex scheduling assistant), prompt caching reduces per-turn LLM cost by
roughly 60–80% and trims 300–800ms from response time after the first turn.

## Project structure

```
src/
  index.ts                 — runs both scenarios and prints comparison
  scenarios/
    cached-session.ts      — Scenario A: same prefix, cache hits
    uncached-calls.ts      — Scenario B: unique prefix, always misses
  utils/
    prompt.ts              — system prompt (~1400 tokens) + unique-prefix helper
    display.ts             — table formatting and cost calculation
```
