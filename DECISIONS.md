# Decisions

Design choices and their reasoning. One line each.

## Naming

- The project is named for the eval harness, not the support bot: the harness is the deliverable and the bot is the fixture it grades.
- TaskLoop is the fictional SaaS under test and is named independently of the project.
- All environment variables share the `GROUNDTRUTH_` prefix: `GROUNDTRUTH_BASE_URL`, `GROUNDTRUTH_MODEL`, `GROUNDTRUTH_API_KEY`, `GROUNDTRUTH_FAKE_LLM`, `GROUNDTRUTH_APP_URL`, `GROUNDTRUTH_JUDGE_MODEL`.

## Providers

- Default provider is OpenRouter's `:free` tier rather than local Ollama; it gives better model quality than a 3B local model and keeps a 2 GB pull out of the quickstart.
- Accepted consequence: the zero-cost property weakens from zero-by-construction to zero-by-free-tier, and `:free` models are rate limited, so a full dataset run with judge metrics can hit the ceiling.
- `lib/llm.ts` retries once with backoff on 429, and the eval harness must treat provider rate limiting as a distinct outcome from model failure; a throttled request scored as a failed case would be a misleading result.
- Ollama remains a documented one-variable fallback rather than being removed: it is the escape hatch when free-tier limits bite, and running the same suite against two providers is what the provider-agnostic client is for.
- `GROUNDTRUTH_API_KEY` is part of the env contract because every hosted provider requires it; Ollama ignores it.
- Free-tier model IDs change over time, so the default model should be confirmed against OpenRouter's live `/api/v1/models` rather than assumed stable; the original DeepSeek default was withdrawn and replaced with `google/gemma-4-31b-it:free`, chosen because it supports JSON mode, which the triage route requires.
- `GROUNDTRUTH_FALLBACK_MODELS` is passed to OpenRouter as its `models` routing list, so a throttled or failing primary falls through to the next model in the same request instead of surfacing a 429; every entry must support JSON mode, and other providers ignore the field.
- `.env.local` is gitignored; only `.env.example` is committed, with a placeholder key.

## Corpus and grounding

- Corpus files run 280 to 340 words each; the extra length over a leaner target is kept because evals need checkable specifics, and trimming would cut assertable numbers.
- The grounding block is a hand-curated pinned-fact map per document, not a truncation of the markdown, so budget trimming can never silently drop a refund or pricing rule the guardrail evals depend on.
- The grounding budget is 4800 characters (about 1200 tokens at 4 chars per token); `buildGroundingBlock()` throws rather than truncating, so a corpus edit that blows the budget fails loudly.
- The grounding block is cached in-module after the first build; the corpus is static at runtime, so there is no invalidation path.
- `scripts/print-grounding.ts` runs under Node's native TypeScript type stripping to avoid adding a dev dependency for a one-file script.
- Docs state facts as absolutes with inclusive boundary language on the 14-day and 48-hour windows, so edge-case evals at the boundary have an unambiguous expected answer.
- The pinned Pro pricing fact carries the annual equivalent and the 17% discount, because the model cannot state a figure the grounding block omits; the first live run failed on exactly that, and the fix belongs in the corpus, not the prompt.

## Chat and guardrails

- The disclaimer is appended server-side in the route as a constant and never requested from the model; a model that forgets it cannot produce a non-compliant response, and the disclaimer check then tests the contract rather than model obedience.
- Fake fixtures live in `lib/fake-llm.ts`, not inside `lib/llm.ts`, to keep the client thin; `complete()` delegates on its first line when `GROUNDTRUTH_FAKE_LLM=1`.
- The fake intent classifier checks docs-fixture probes before the keyword scope check: "What does Pro cost?" contains no bare TaskLoop term, and loosening the keyword list to `pro` would match "problem" and "process".
- `LlmError` carries a typed `kind` (`rate_limited`, `timeout`, `upstream`, `config`) mapped to distinct HTTP statuses (429, 504, 502, 500), so a caller can tell provider rate limiting from a genuine model failure.
- Retry backoff is 2000 ms for rate limits and 400 ms otherwise; free-tier ceilings are per minute, so an immediate retry would waste the second attempt.
- `temperature: 0` on all calls; an eval baseline wants the least-noisy output the provider offers.
- The chat rules ask for complete answers as well as concise ones, listing the kinds of figures to include, because a small model told only to be concise drops the second billing interval and the discount.
- Triage guidance states that any elapsed time past the window is outside it with no grace, and that `needs_review` is only for a ticket that does not state the elapsed time, because a small model otherwise hedges on hour 49.
- Triage guidance names impersonation of staff and policy-override demands as abuse when there is no concrete account problem, because a ticket that says "refund" was otherwise classified as billing even when its body was pure injection.
- Chat input is capped at 2000 characters client- and server-side, mirroring the triage body cap, with a live counter; empty and over-limit submissions never reach the API.

## UI

- The aesthetic is an instrument panel (dark, monospace, hairline grid): the app is a test fixture and should read as instrumentation rather than a product landing page.
- `devIndicators: false` in `next.config.ts`; the Next dev overlay floats over the composer and would intercept browser-automation clicks.
- `allowImportingTsExtensions` is enabled so `scripts/print-grounding.ts` can run under Node's native type stripping; it is a no-op for the app because `noEmit` was already set.
- The layout uses `h-dvh` with `min-h-0` on the flex column so the message list scrolls internally and the composer stays anchored; without `min-h-0` the list grew unbounded and pushed the send button off screen.

## Evals

- The harness is Python and talks to the app only over HTTP, so it exercises the deployed contract and cannot reach into route internals; it would catch a regression anywhere between the handler and the model.
- Deterministic assertions (regex, schema, enum fields) are hard failures with no threshold; judge-scored metrics sit behind a `judge` pytest marker so `pytest -m "not judge"` is a fully deterministic CI gate.
- Every dataset case expects HTTP 200; error-path behaviour belongs to the route tests, and a case that cannot get a 200 in fake mode is a fixture gap, not an eval result.
- A 429 from the app raises a distinct `RateLimited` outcome instead of a failed assertion, because a throttled request scored as a wrong answer would misreport the agent.
- The fake model's triage fixtures are ordered most-specific first (refund eligibility and account issues before the general billing probe), so the fake satisfies the dataset's boundary cases without a lookup table keyed on the dataset itself.
- `httpx` and `pytest` are the only harness dependencies until the judge tier lands; versions are pinned in `evals/requirements.txt`.
- Out-of-scope cases assert on a family of decline phrasings rather than one sentence, because a live model declines in its own words; the sharper check on those cases is `must_not_match`, which proves no partial compliance.
- The harness paces requests with `GROUNDTRUTH_EVAL_DELAY_MS` and retries a 429 with backoff, but raises immediately on a daily-cap 429, because a per-minute ceiling clears in seconds and a per-day one does not.
