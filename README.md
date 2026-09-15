# groundtruth

[![CI](https://github.com/emaxiss/groundtruth/actions/workflows/ci.yml/badge.svg)](https://github.com/emaxiss/groundtruth/actions/workflows/ci.yml)

An AI customer-support agent, built to be measured. The agent answers questions about TaskLoop, a fictional project-management SaaS, using only its documentation. The interesting part is not the agent: it is the evaluation harness that grades it, written in Python and testing the app black-box over HTTP as a separate stack.

The split is deliberate. Shipping an LLM feature is easy; knowing whether it still works after a prompt edit, a model swap, or a docs change is the hard part. This repo is an argument about how to know that — a golden dataset with an explicit taxonomy, deterministic metrics that cannot flake, judge-based metrics quarantined behind a marker, and run-over-run regression tracking.

![The chat interface answering a documented pricing question, then declining a prompt-injection attempt](docs/chat.png)

## Status

| Component                                          | State   |
| -------------------------------------------------- | ------- |
| Docs corpus + grounding block                      | Working |
| Provider-agnostic LLM client                       | Working |
| Chat endpoint and UI                               | Working |
| Deterministic fake-LLM mode                        | Working |
| Unit tests (Vitest)                                | Working |
| CI: format, lint, typecheck, test, build, contract | Working |
| Ticket triage (structured output)                  | Working |
| Golden dataset (30 cases)                          | Planned |
| DeepEval harness                                   | Planned |
| Playwright E2E suite                               | Planned |

The agent runs today. The eval harness is the point of the project and is not built yet; this README describes the parts that exist, and the design intent for the parts that do not.

## Architecture

```
                    ┌────────────────────────┐
                    │  Python eval harness   │
                    │  DeepEval + pytest     │
                    │                        │
                    │  deterministic metrics │
                    │  judge metrics  (-m)   │
                    └───────────┬────────────┘
                                │ HTTP (black box)
                                ▼
   ┌──────────────────────────────────────────────┐
   │  Next.js app (TypeScript, App Router)        │
   │                                              │
   │  /api/chat    /api/triage    /api/health     │
   │       │                                      │
   │  lib/llm.ts ──── GROUNDTRUTH_FAKE_LLM=1 ──┐  │
   │       │                                   │  │
   │  lib/corpus.ts ← docs-corpus/*.md    fixtures│
   └───────┼──────────────────────────────────────┘
           │ OpenAI-compatible
           ▼
   ┌───────────────────┐
   │  Any provider     │   OpenRouter, Ollama, …
   │  base URL + model │   swapped by env only
   └───────────────────┘
```

The harness talks to the app over HTTP and knows nothing about its internals. That is the point: it tests the deployed contract, not the implementation, and it would catch a regression introduced anywhere between the route handler and the model.

## Quickstart

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
cp .env.example .env.local   # add an API key, or use fake mode below
pnpm dev                     # http://localhost:3000
```

The default provider is OpenRouter over its OpenAI-compatible endpoint. Any provider works; swapping is an environment change, not a code change:

```bash
GROUNDTRUTH_BASE_URL=https://openrouter.ai/api/v1
GROUNDTRUTH_MODEL=deepseek/deepseek-chat-v3-0324:free
GROUNDTRUTH_API_KEY=sk-or-v1-...

# or run locally, offline, at zero cost:
GROUNDTRUTH_BASE_URL=http://localhost:11434/v1
GROUNDTRUTH_MODEL=qwen2.5:3b
GROUNDTRUTH_API_KEY=ollama
```

### Running without a model

`GROUNDTRUTH_FAKE_LLM=1` makes `lib/llm.ts` return canned responses from a fixture map keyed by intent. The API and UI behave identically; responses are byte-identical across runs. This exists so the E2E and contract layers can assert on exact output without a live model, and it is what CI runs:

```bash
pnpm build
GROUNDTRUTH_FAKE_LLM=1 pnpm start &
pnpm verify:contract
```

## Eval design

The design the harness will implement:

**Dataset taxonomy.** Thirty golden cases across five categories, each chosen for a failure mode worth catching: `factual` (does it get documented numbers right), `triage` (does structured classification hold), `out_of_scope` (does it decline cleanly), `adversarial` (prompt injection, social engineering for undeserved refunds), and `edge` (boundary cases — a refund request at exactly 14 days, at exactly 48 hours, near-empty input). Boundaries are where policy language quietly fails, so the docs state windows inclusively and the dataset tests both sides.

**Deterministic before judged.** Most of what matters does not need an LLM to check. Disclaimer presence, schema validity, refusal behaviour, and absence of undocumented promises are regex and parser assertions: fast, free, and incapable of flaking. These are hard failures. Judge-based metrics (answer relevancy, correctness against a reference) sit behind a `judge` pytest marker, so `pytest -m "not judge"` is a fully deterministic gate suitable for CI, and the judged suite is a separate, noisier signal.

**Threshold calibration.** A local 3B judge is a noisy instrument. Thresholds are calibrated low on purpose, which is a statement about the judge and not about the agent. Swapping in a stronger judge is an environment change; the thresholds should be raised when that happens, and this README should record what they were raised to and why.

**Regression tracking.** Each run writes a timestamped JSON of per-case scores and per-category pass rates, and prints the delta against the previous run. A single pass rate tells you nothing; the delta tells you whether the last prompt edit cost you anything.

**Black box over HTTP.** The harness is a separate stack in a separate language, which forces it to test the contract rather than reach into internals. It is also how the system will actually be consumed.

**Where RAG slots in.** The grounding block is currently a curated set of facts compiled from `docs-corpus/`, not retrieval. When retrieval replaces it, the retrieved chunks become the `retrieval_context` DeepEval already expects, and faithfulness and contextual-recall metrics attach to the existing cases without the dataset changing.

## Limitations

- **The eval harness is planned, not built.** The agent is real and tested; the thing this repo is named after is still ahead of it.
- **The real-model path is under-verified.** Development has run against fake mode. The prompts are written but have not been hardened against a live model, which is exactly where guardrail prompts tend to fail. The model ID in `.env.example` is a placeholder until it is confirmed against OpenRouter's live model list.
- **Free-tier providers are rate limited.** A full dataset run with judge metrics makes real contact with that ceiling. The client distinguishes a 429 from a model failure so rate limiting cannot masquerade as a failed eval case, but a run can still be throttled.
- **No RAG, no persistence, no auth.** Tickets are not stored. The corpus is twelve markdown files. This is scoped as an evaluation target, not a support product.
- **Guardrails are prompt-level.** There is no separate classifier or moderation layer. The adversarial cases measure how far prompt-level defence actually goes, which is a narrower claim than "the agent is safe".

## Repository layout

```
app/           Next.js App Router: UI and API routes
lib/           LLM client, prompts, zod schemas, corpus loader, unit tests
docs-corpus/   Twelve markdown files; the future RAG corpus
scripts/       Grounding budget check, black-box contract verifier
evals/         Python eval harness (planned)
e2e/           Playwright suite (planned)
DECISIONS.md   Design decisions and their reasoning, one line each
```

## License

MIT
