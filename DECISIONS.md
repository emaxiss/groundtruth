# Decisions

Ambiguities resolved during the build. One line each.

## Naming

- Project renamed HelpDeck -> `groundtruth`: the DeepEval harness is the deliverable, not the support bot, and "HelpDeck" advertised the fixture instead of the work.
- TaskLoop keeps its name; it is the fictional SaaS under test and is unaffected by the rename.
- Env vars renamed `HELPDECK_*` -> `GROUNDTRUTH_*` (deviation from the original spec, taken deliberately): `GROUNDTRUTH_BASE_URL`, `GROUNDTRUTH_MODEL`, `GROUNDTRUTH_FAKE_LLM`, `GROUNDTRUTH_APP_URL`, `GROUNDTRUTH_JUDGE_MODEL`.

## Providers

- Default provider is OpenRouter (`:free` model tier), not local Ollama; chosen for model quality over qwen2.5:3b and to drop the local install + 2GB pull from quickstart.
- Consequence, accepted deliberately: the `$0 cost` constraint weakens from $0-by-construction to $0-by-free-tier. `:free` models are rate-limited, so a full 30-case run with judge metrics makes real contact with the ceiling.
- `lib/llm.ts` retries with backoff on 429, and the eval rig must distinguish provider rate-limiting from model refusal — a 429 scoring as a failed eval case would be a misleading portfolio result.
- Ollama stays a documented one-env-var fallback (README), not deleted: it is the escape hatch when free-tier limits bite, and the same suite running against both providers is the point of the provider-agnostic client.
- `GROUNDTRUTH_API_KEY` added to the env contract (not in the original spec); required by any hosted provider, ignored by Ollama.
- Free-tier model IDs shift over time, so the exact default model is resolved by querying OpenRouter's live `/api/v1/models` at build time rather than hardcoding a possibly-stale ID.
- `.env.local` is gitignored; only `.env.example` is committed, with a placeholder key.

## Phase 1 — Docs corpus

- Corpus word count: 6 of 12 files land at 301-340 words vs the 150-300 target; kept the extra facts because evals need checkable specifics, and trimming would cut assertable numbers.
- Grounding block is a hand-curated `PINNED` fact map per doc, not naive truncation of the markdown, so budget trimming can never silently drop a refund/pricing rule the guardrail evals depend on.
- Grounding budget enforced as 4800 chars (~1200 tokens at 4 chars/token); `buildGroundingBlock()` throws rather than truncating, so a corpus edit that blows the budget fails loudly.
- Grounding block is cached in-module after first build; corpus is static at runtime, so no invalidation path.
- `scripts/print-grounding.ts` is the Phase 1 verify script, run via Node's native TS type-stripping to avoid adding a dev dependency.
- Docs state facts as absolutes (exact dollar amounts, inclusive boundary language on the 14-day/48-hour windows) so edge-case evals at the boundary have an unambiguous expected answer.

## Phase 2 — Chat

- Disclaimer is appended server-side in the route as a constant, never requested from the model; a model that forgets it cannot produce a non-compliant response, and `DisclaimerPresentMetric` then tests the contract rather than model obedience.
- Fake fixtures live in `lib/fake-llm.ts`, not inside `lib/llm.ts`, to keep the client thin; `complete()` delegates on the first line when `GROUNDTRUTH_FAKE_LLM=1`.
- Fake intent classifier checks docs-fixture probes BEFORE the keyword scope check: "What does Pro cost?" contains no bare TaskLoop term, and loosening the keyword list to `pro` would match "problem"/"process". Caught by the Phase 2 verify.
- `LlmError` carries a typed `kind` (rate_limited / timeout / upstream / config) mapped to distinct HTTP statuses (429/504/502/500) so the eval rig can tell provider rate-limiting from a genuine model failure.
- Retry backoff is 2000ms for rate limits vs 400ms otherwise; free-tier ceilings are per-minute, so an immediate retry would waste the second attempt.
- `temperature: 0` on all calls; a portfolio eval harness wants the least-noisy baseline available.
- UI aesthetic is an instrument panel (dark, monospace, hairline grid): the app is a test fixture, and it should read as instrumentation rather than a product landing page.
- `devIndicators: false` in next.config.ts — the Next dev overlay floats over the composer and would intercept Playwright clicks.
- `allowImportingTsExtensions` enabled so `scripts/print-grounding.ts` can run under Node's native type-stripping; no-op for the app since `noEmit` was already set.
- Layout uses `h-dvh` + `min-h-0` on the flex column so the message list scrolls internally and the composer stays anchored; without `min-h-0` the list grew unbounded and pushed the send button off-screen.
- Chat input capped at 2000 chars client- and server-side (mirrors the triage body cap) with a live counter; empty/over-limit submissions never reach the API.

## Known gaps

- The real-model path (OpenRouter) is UNVERIFIED as of Phase 2: no API key yet, so only `GROUNDTRUTH_FAKE_LLM=1` has been exercised end to end. The model ID in `.env.example` is a placeholder pending a live check against OpenRouter's `/api/v1/models`.
