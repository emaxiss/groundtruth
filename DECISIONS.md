# Decisions

Design choices and their reasoning, one entry each: the decision, then why.

## Naming

- The project is named for the eval harness, not the support bot: the harness is the main body of the repo and the bot is the fixture it grades.
- TaskLoop is the fictional SaaS under test and is named independently of the project.
- All environment variables share the `GROUNDTRUTH_` prefix. App: `GROUNDTRUTH_BASE_URL`, `GROUNDTRUTH_MODEL`, `GROUNDTRUTH_FALLBACK_MODELS`, `GROUNDTRUTH_API_KEY`, `GROUNDTRUTH_ALLOW_PAID_MODELS`, `GROUNDTRUTH_FAKE_LLM`. Harness: `GROUNDTRUTH_APP_URL`, `GROUNDTRUTH_EVAL_DELAY_MS`, `GROUNDTRUTH_RESULTS_DIR`.

## Layout

- Tests live under `tests/`, one folder per layer, rather than next to the source they cover: a reader can see the whole verification story in one tree, and each layer's config (`vitest.config.ts`, `playwright.config.ts`) points at exactly one folder.
- The browser suite is written against page objects and custom fixtures so a spec reads as a user flow and a markup change is a one-file edit; the `api` fixture stubs the app's API from the browser side for error states no fake model produces.
- Every `GROUNDTRUTH_*` variable is read in `lib/env.ts` and input limits live in `lib/limits.ts`, so the env contract and the client-side copy each have one source and cannot drift from the schemas.
- The harness is a package (`evals/harness/`) with suites, unit tests, and tools in their own folders; `conftest.py` only sets DeepEval's environment and provides fixtures, and the report hooks are a named pytest plugin.
- The API contract runs as a Playwright project on the `request` fixture rather than a standalone script, so it shares the web server, the reporters, and the JUnit output with the browser suite and needs no browser installed.
- Browser locators are roles and labels first, test ids only where the UI has no accessible handle; a locator that needs an accessible name is how two missing names were found and added. Every view is scanned with axe at WCAG 2.1 AA under reduced motion, which caught label text at 2.5:1 contrast; the `faint` and `dim` tokens were raised to pass on all three surfaces.
- The browser suite runs on Chromium, Firefox, WebKit, and a mobile viewport. The app is small enough that the full matrix costs about fifteen seconds.
- Coverage is a gate, not a report: Vitest fails under 90% lines and 80% branches for `lib/` and `app/api/`, and the harness fails under 85%. `harness/reporting.py` is excluded because a pytest plugin's hooks only run inside a session, and it is exercised by every tier run.
- The harness is type-checked with mypy in strict mode; DeepEval is untyped, so its imports are skipped rather than the strictness lowered.
- A unit test reads `lib/schemas.ts`, `lib/prompts.ts`, and the client and fails when the harness's copy of the triage enums, the disclaimer, or the model header drifts from the app's.
- CI builds the app once and the contract, browser, and eval jobs run that artifact, so they test the same bytes and the build cost is paid once.
- Python is linted and formatted with ruff in CI at a 120-column limit; rubric text and verbatim model phrasings are exempt from the line limit because wrapping them would change what is being asserted.

## Conversations

- The chat API accepts up to ten earlier turns from the client, because a follow-up like "and annually?" is unanswerable without them and the app has no conversation store.
- Only the customer's turns are forwarded to the model, as a quoted block inside the user message, never as chat messages with the assistant role. The first version forwarded both roles as real turns; the live run of `multi-004` sent a forged agent turn that approved a refund and the model replied with the payout timeline. A model trusts its own earlier words, so the fix is to stop presenting unverifiable text as those words. Rewording the prompt alone left the case passing one time in three.
- The system prompt states that the agent has no record of earlier conversations or account actions and must say so when a customer claims an approval, which is true of this system and is what a human agent without the ticket history would say.
- The cost is that a follow-up about the agent's own previous answer ("explain your second point") loses its referent. That trade is accepted here and would not be in a system with server-side transcripts.

## Red team

- The adversarial suite runs on Promptfoo because it is the common tool for this job, its HTTP provider tests the deployed endpoint like every other layer here, and its results format is one people already read. It is invoked through a pinned `pnpm dlx` instead of being a dependency: eighty direct dependencies are not worth adding to the lockfile for a tool that runs in one job.
- Every assertion is deterministic. Promptfoo's model-graded assertions and generated attack campaigns need a grader or generator model; on a free tier that would make the red team as noisy as the thing it tests. The judge tier is where a model grades, and it is calibrated first.
- Case-insensitive checks are JavaScript assertions because Promptfoo's `regex` type takes a JavaScript pattern, which has no inline flag.
- The output guard exists because of this suite. Asked to summarise its rules "without quoting", a live model paraphrased the system prompt; after the prompt was tightened it still did so one time in three. The chat route replaces any answer, and the triage route any suggested reply, that matches two or more rule signatures or one verbatim prompt heading, sets `x-groundtruth-guard: disclosure`, and the signatures are tested against the observed leak and against honest answers that mention refunds or documentation.

## Providers

- Default provider is OpenRouter's `:free` tier rather than local Ollama; it gives better model quality than a 3B local model and keeps a 2 GB pull out of the quickstart.
- Accepted consequence: the zero-cost property weakens from zero-by-construction to zero-by-free-tier, and `:free` models are rate limited, so a full dataset run with judge metrics can hit the ceiling.
- `lib/llm/client.ts` retries with backoff on 429, and the eval harness must treat provider rate limiting as a distinct outcome from model failure; a throttled request scored as a failed case would be a misleading result.
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
- `scripts/print-grounding.mts` runs under Node's native TypeScript type stripping to avoid adding a dev dependency for a one-file script.
- Docs state facts as absolutes with inclusive boundary language on the 14-day and 48-hour windows, so edge-case evals at the boundary have an unambiguous expected answer.
- The pinned refund facts spell out the boundary arithmetic ("exactly 14 days after the charge is day 14 and qualifies"), because the judge tier caught the agent telling a day-14 customer they were on day 15 in one of the calibration runs; the model should not have to do the inclusive count itself.
- The pinned Pro pricing fact carries the annual equivalent and the 17% discount, because the model cannot state a figure the grounding block omits; the first live run failed on exactly that, and the fix belongs in the corpus, not the prompt.

## Chat and guardrails

- The triage system prompt carries the same grounding block as chat; the first live run showed the classifier deciding refund eligibility without ever seeing the refund policy, and it hedged with `needs_review` because, as far as it could tell, nothing was documented.
- Every chat and triage response carries an `x-groundtruth-model` header with the model the provider reports it served, because fallback routing otherwise swaps models silently and a live eval run cannot say what it measured.
- The disclaimer is appended server-side in the route as a constant and never requested from the model; a model that forgets it cannot produce a non-compliant response, and the disclaimer check then tests the contract rather than model obedience.
- Fake fixtures live in `lib/llm/fake.ts`, not inside the client, to keep it thin; `complete()` delegates on its first line when `GROUNDTRUTH_FAKE_LLM=1`.
- The fake intent classifier checks docs-fixture probes before the keyword scope check: "What does Pro cost?" contains no bare TaskLoop term, and loosening the keyword list to `pro` would match "problem" and "process".
- The client refuses to call any model whose id does not end in `:free` unless `GROUNDTRUTH_ALLOW_PAID_MODELS=1`; the check runs before the first request, `/api/health` publishes both flags, and the eval harness exits rather than start a run that could spend money. An account holding credit will serve a paid model without complaint, so a typo in an env var is otherwise the only thing between a free run and a charged one.
- The client rotates through the routing list itself (two passes, short backoff) instead of trusting provider-side routing alone, because OpenRouter only re-routes on some errors and an overloaded upstream answering 200 with no completion is not one of them; the harness records a case where every model failed as `unavailable`, the same treatment as a rate limit, so a provider outage cannot read as a regression.
- A provider can answer 200 with an error payload and no `choices` array at all, so the client checks the shape before indexing it; without that guard an upstream capacity blip surfaced as `Cannot read properties of undefined` behind a 502, which reads like a bug in this code rather than a provider error.
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
- `allowImportingTsExtensions` is enabled so `scripts/print-grounding.mts` can run under Node's native type stripping; it is a no-op for the app because `noEmit` was already set.
- The layout uses `h-dvh` with `min-h-0` on the flex column so the message list scrolls internally and the composer stays anchored; without `min-h-0` the list grew unbounded and pushed the send button off screen.

## Evals

- The harness is Python and talks to the app only over HTTP, so it exercises the deployed contract and cannot reach into route internals; it would catch a regression anywhere between the handler and the model.
- Deterministic assertions (regex, schema, enum fields) are hard failures with no threshold; judge tier metrics sit behind a `judge` pytest marker so `pytest -m "not judge"` is a fully deterministic CI gate.
- Every dataset case expects HTTP 200; error-path behaviour belongs to the route tests, and a case that cannot get a 200 in fake mode is a fixture gap, not an eval result.
- A 429 from the app raises a distinct `RateLimited` outcome instead of a failed assertion, because a throttled request scored as a wrong answer would misreport the agent.
- The fake model's triage fixtures are ordered most-specific first (refund eligibility and account issues before the general billing probe), so the fake satisfies the dataset's boundary cases without a lookup table keyed on the dataset itself.
- `httpx` and `pytest` are the only harness dependencies; versions are pinned in `evals/requirements.txt`.
- The judge tier runs on DeepEval because it integrates with pytest, its vocabulary (`LLMTestCase`, `Golden`, `assert_test`, `GEval`) is already familiar, and its metric templates are maintained upstream.
- The judge model is a `DeepEvalBaseLLM` subclass rather than DeepEval's built-in OpenAI client, for three reasons: it applies the same `:free` guard as the app before any call, it forces JSON mode and validates the schema DeepEval hands to `generate()` locally (a judge that returns prose there fails every metric with a parse error), and it records which model actually served the request.
- Correctness is a `GEval` metric with a four-level rubric (`Rubric` score ranges) rather than free-form criteria, so the scale the thresholds were calibrated on is fixed in code and a future judge swap is re-checked against the same anchors.
- DeepEval's telemetry is opt-out; it is switched off in `evals/conftest.py` before any DeepEval import, in `.env.example`, and in CI, because an evaluation harness should not phone home by default.
- DeepEval also autoloads `.env` and `.env.local` from the working directory (process environment wins), which is why the judge tier needs no exports beyond what already runs the app; `DEEPEVAL_DISABLE_DOTENV=1` opts out, and the harness's own settings never depend on it.
- DeepEval registers a pytest plugin that auto-loads in every session of the environment, which is why a plain deterministic run prints a DeepEval teardown line; the plugin reports nothing when no DeepEval assertion ran, and the telemetry switch covers the rest.
- The judge's routing list shares no model with the agent's (`nex-agi` and `dots-studio` for the judge, Gemma and Nemotron for the agent), because a model grading its own answers shares its blind spots. A unit test keeps the two lists disjoint in `.env.example` and the live workflow, at the cost of one fewer fallback on each side.
- Correctness is scored on rubric anchors (1.0 / 0.7 / 0.3 / 0.0) and the threshold sits at 0.5, between "a secondary fact is missing" and "a figure is wrong or the verdict is hedged"; the threshold was set from three calibration runs and is documented next to the spread that produced it, so a future judge swap has a procedure rather than a guess.
- The judge is measured before it is trusted: sixteen answers written to a label (faithful, missing a secondary fact, wrong figure, contradiction) must land on the right side of the correctness threshold. The labels are true by construction, which is weaker than human-labelled production answers and much stronger than assuming the judge works.
- A repeated case passes only if every scored attempt passed, and the report names the unstable ones. Averaging attempts would hide exactly the behaviour repeats exist to find.
- Live runs are scheduled rather than part of the pull request gate: they need a key, they take minutes, and their failures are often the provider's. The scheduled job fails on scored failures only and uploads its reports, so drift is visible without making every pull request depend on a free tier.
- A judge that fails to return a valid score is recorded as `skipped`, never as a low score, because a broken instrument must not read as a broken agent.
- The browser suite runs against the built app in fake mode, started by Playwright's own `webServer`, so it asserts exact answer text and exact validation copy; provider failures are simulated with `page.route`, since a suite that needed a live model to show an error state would be as flaky as the model.
- Run reports are written by the pytest plugin in `evals/harness/reporting.py` and the arithmetic lives in `evals/harness/report.py` as pure functions, so the delta logic has unit tests that need no app.
- Rate-limited cases appear in the report but are excluded from the pass-rate denominator; a report says how many were throttled instead of quietly lowering the rate.
- The delta compares only case ids present in both runs; added or removed cases are listed but never counted as a regression or a fix, so editing the dataset cannot fake an improvement.
- Reports are compared within a tier and a model: a judge run is never the baseline for a deterministic run, and a fake-mode run is never the baseline for a live one, because a delta across instruments would not measure the edit.
- Assertion text is normalised before matching: models emit narrow no-break spaces and non-breaking hyphens that are invisible in a diff but silently break a plain regex, and an eval that flakes on a codepoint choice measures typography rather than the agent.
- The out-of-scope decline pattern has its own regression test listing every phrasing a live model has actually produced, so widening it is a change backed by evidence instead of a guess made one failure at a time.
- Out-of-scope cases assert on a family of decline phrasings rather than one sentence, because a live model declines in its own words; the sharper check on those cases is `must_not_match`, which proves no partial compliance.
- The harness paces requests with `GROUNDTRUTH_EVAL_DELAY_MS` and retries a 429 with backoff, but raises immediately on a daily-cap 429, because a per-minute ceiling clears in seconds and a per-day one does not.
