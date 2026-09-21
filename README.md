# groundtruth

[![CI](https://github.com/emaxiss/groundtruth/actions/workflows/ci.yml/badge.svg)](https://github.com/emaxiss/groundtruth/actions/workflows/ci.yml)

An AI customer-support agent and the evaluation harness that grades it. The agent answers questions about TaskLoop, a fictional project-management SaaS, using only its documentation. The harness is the main body of the repo: written in Python, it tests the app black-box over HTTP as a separate stack.

Shipping an LLM feature is easy; knowing whether it still works after a prompt edit, a model swap, or a docs change is the hard part. The pieces that answer that question: a golden dataset with an explicit taxonomy, deterministic assertions with no threshold to tune, DeepEval judge metrics behind a pytest marker, run-over-run regression tracking, and a black-box harness that reports which model actually answered.

![The chat interface answering a documented pricing question, then declining a prompt-injection attempt](docs/chat.png)

## Status

| Component                                                          | State   |
| ------------------------------------------------------------------ | ------- |
| Docs corpus + grounding block                                      | Working |
| Provider-agnostic LLM client                                       | Working |
| Chat endpoint and UI                                               | Working |
| Deterministic fake mode                                            | Working |
| Unit tests (Vitest)                                                | Working |
| CI: format, lint, typecheck, test, build, dataset, contract, evals | Working |
| Ticket triage (structured output)                                  | Working |
| Golden dataset (30 cases)                                          | Working |
| Eval harness, deterministic tier                                   | Working |
| Run reports with run-over-run delta                                | Working |
| Live-model verification                                            | Working |
| Eval harness, judge tier (DeepEval)                                | Working |
| Playwright E2E suite                                               | Planned |

The agent runs today, the deterministic tier of the harness gates every pull request, and each run reports its delta against the previous one. The browser suite is not built; the table row is the only reference to it.

## Architecture

```
                    ┌────────────────────────┐
                    │  Python eval harness   │
                    │  pytest + DeepEval     │
                    │                        │
                    │  deterministic tier    │
                    │  judge tier  (-m)      │
                    │  run reports + delta   │
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

The harness talks to the app over HTTP and knows nothing about its internals. It tests the deployed contract, not the implementation, and it would catch a regression introduced anywhere between the route handler and the model.

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
GROUNDTRUTH_MODEL=google/gemma-4-31b-it:free
GROUNDTRUTH_API_KEY=sk-or-v1-...
# optional: tried in order, client-side and by OpenRouter, when the primary errors or is throttled;
# every response carries an x-groundtruth-model header naming the model that answered
# every id must end in ":free" or the client refuses the call; opt in with
# GROUNDTRUTH_ALLOW_PAID_MODELS=1
GROUNDTRUTH_FALLBACK_MODELS=google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3-super-120b-a12b:free,nex-agi/nex-n2.5-pro:free

# or run locally, offline, at zero cost:
GROUNDTRUTH_BASE_URL=http://localhost:11434/v1
GROUNDTRUTH_MODEL=qwen2.5:3b
GROUNDTRUTH_API_KEY=ollama
```

### Running without a model

`GROUNDTRUTH_FAKE_LLM=1` makes `lib/llm.ts` return canned responses from a fixture map keyed by intent. The API and UI behave identically; responses are byte-identical across runs. This exists so the contract verifier and the eval harness can assert on exact output without a live model, and it is what CI runs:

```bash
pnpm build
GROUNDTRUTH_FAKE_LLM=1 pnpm start &
pnpm verify:contract
```

## What each layer proves

Six layers, cheapest first.

| Layer                                  | Runs against                          | Proves                                                                                         | Cannot prove                                                      |
| -------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Unit tests (Vitest, `lib/`)            | Pure functions                        | The corpus budget, schemas, prompt assembly, fake fixtures, and the client's error mapping.    | Anything about HTTP, routing, or a real model.                    |
| Route tests (Vitest, `app/api/`)       | Handlers, model mocked                | Every error kind maps to the right status; the disclaimer is always appended; bad JSON is 400. | That the app boots, or that the fake model and the mock agree.    |
| Contract verifier (`scripts/`)         | Built app, fake mode, over HTTP       | The deployed API honours its contract and is byte-identical across runs.                       | Anything a real model does.                                       |
| Deterministic eval tier (`evals/`)     | Running app, fake or live, over HTTP  | Thirty documented behaviours hold: numbers, refusals, classifications, boundaries.             | Answer quality, or that a passing regex means a good answer.      |
| Judge eval tier (DeepEval, `-m judge`) | Running app, live, plus a judge model | Answer relevancy, and correctness against each case's reference on a fixed rubric.             | Anything stable: it is a noisier instrument and is not a CI gate. |
| Browser suite                          | Planned                               | The UI wires to the API and shows each state.                                                  | Not built.                                                        |

The first four run on every pull request with no key and no network. The run report from the fourth layer is what says whether the last edit cost anything.

## Eval design

**Dataset taxonomy.** Thirty golden cases in [`evals/dataset.jsonl`](evals/dataset.jsonl), six per category, each chosen for a failure mode worth catching: `factual` (does it get documented numbers right), `triage` (does structured classification hold), `out_of_scope` (does it decline cleanly), `adversarial` (prompt injection, social engineering for undeserved refunds), and `edge` (boundary cases: a refund request at exactly 14 days, at exactly 48 hours, near-empty input). Boundaries are where policy language quietly fails, so the docs state windows inclusively and the dataset tests both sides.

**Deterministic first.** Most of what matters does not need an LLM to check. Disclaimer presence, schema validity, refusal behaviour, and absence of undocumented promises are regex and parser assertions: fast, free, and deterministic for a given response. These are hard failures with no threshold to tune. Assertion text is normalised for typographic whitespace and dashes first, because a model that writes "7 days" with a narrow no-break space has not got the fact wrong.

**Judge tier second, not a gate.** Answer quality is scored by [DeepEval](https://github.com/confident-ai/deepeval) metrics: `AnswerRelevancyMetric` on every judged case, and a `GEval` correctness metric against the `reference` each factual case carries, with a four-level rubric fixed in [`evals/judge.py`](evals/judge.py). The judge model is a different family from the agent, driven through a `DeepEvalBaseLLM` subclass that enforces JSON mode and the same free-model rule as the app. Thresholds were set from nine calibration runs, documented in [`evals/README.md`](evals/README.md). It sits behind the `judge` pytest marker, so `pytest -m "not judge"` stays a fully deterministic CI gate and the judge tier is a separate, noisier signal that needs a key.

**Regression tracking.** Each run writes a timestamped JSON of per-case outcomes and per-category pass rates under `evals/results/`, and prints the delta against the previous run of the same tier and model: new failures, fixed cases, and the rate change per category. The format is documented in [`evals/README.md`](evals/README.md).

**Black box over HTTP.** The harness is a separate stack in a separate language, which forces it to test the contract rather than reach into internals. It is also how the system will actually be consumed. Provider rate limiting is raised as its own outcome rather than scored as a failed case, so a throttled run cannot masquerade as a regression. Every response names the model that served it, and the run report counts them, because with fallback routing on that is the only way to know what a run measured.

**Worked example.** [`evals/examples/`](evals/examples/) holds two live deterministic runs. `baseline.json` is the agent as committed. `regression.json` was taken after one edit: the annual refund window in the grounding facts changed from 14 days to 15. Comparing the two prints what that edit cost:

```
$ python3 evals/report.py evals/examples/baseline.json evals/examples/regression.json
report: evals/examples/regression.json
tier: deterministic · model: google/gemma-4-31b-it:free · 30 cases · 29 passed, 1 failed · pass rate 96.7%
  adversarial   6/6   100.0%
  edge          5/6   83.3%
  factual       6/6   100.0%
  out_of_scope  6/6   100.0%
  triage        6/6   100.0%
served by: nvidia/nemotron-3-super-120b-a12b:free ×15, nex-agi/nex-n2.5-pro:free ×14, google/gemma-4-26b-a4b-it:free ×1
delta vs baseline.json:
  new failures:  edge-002
  fixed:         none
  overall: 100.0% -> 96.7% (-3.3)
  edge: 100.0% -> 83.3% (-16.7)
```

One case flipped. `edge-002`, a customer 15 days after purchase, was told they still qualified; its pair `edge-001`, at day 14, kept passing. Boundary cases come in pairs so that a window edit shows up as a delta on one side. The `served by:` line differs between the runs because the client rotates through its routing list when a free model is overloaded. A unit test checks that the block above is the output of the command on the checked-in files.

**Retrieval.** Retrieval is not implemented; the grounding block is a curated fact list compiled from `docs-corpus/`. If retrieval is added, the retrieved chunks are the context a faithfulness metric needs, and that metric attaches to the existing cases without the dataset changing.

## Limitations

- **The judge is a small free model.** DeepEval's metrics are only as good as the model behind them; this one separates a wrong figure from a missing detail reliably over three calibration runs, and is not a substitute for a frontier judge. The thresholds are statements about this judge, not about the agent.
- **The live results come from one provider and few runs.** Two live reports are checked in under [`docs/results/`](docs/results/). The 30/30 run was served entirely by the fallback model, `nvidia/nemotron-3-super-120b-a12b:free`, because the free pool for the configured default was saturated. The earlier 25/30 run predates the served-model header, so which model answered it is unknown. Neither is a claim about `google/gemma-4-31b-it:free` specifically, and these prompts have not been exercised against a frontier model or across providers.
- **Free-tier providers are unreliable as well as rate limited.** Upstream capacity errors arrive as a 200 with no completion in it, and the shared free pool for a given model is often saturated. The client rotates through its routing list itself, two passes, because provider-side routing does not step in on those errors; a case where every model fails is recorded as `unavailable`, not as a failed case. A live run reports which model actually served each case for the same reason.
- **Free-tier providers are rate limited.** OpenRouter's free tier allows about 20 requests a minute and 50 a day without credits (1,000 a day with credits on the account). A paced deterministic run fits under the per-minute ceiling; two runs in a day do not fit under the daily one. The client distinguishes a 429 from a model failure so rate limiting cannot masquerade as a failed eval case, and the harness reports throttled cases separately from failed ones.
- **No RAG, no persistence, no auth.** Tickets are not stored. The corpus is twelve markdown files. This is scoped as an evaluation target, not a support product.
- **Guardrails are prompt-level.** There is no separate classifier or moderation layer. The adversarial cases measure how far prompt-level defence actually goes, which is a narrower claim than "the agent is safe".

## Repository layout

```
app/           Next.js App Router: UI and API routes
lib/           LLM client, prompts, zod schemas, corpus loader, unit tests
docs-corpus/   Twelve markdown files the grounding block is compiled from
scripts/       Grounding budget check, black-box contract verifier
evals/         Golden dataset, validation script, pytest harness, run reports
evals/examples Baseline and regression run pair behind the worked example
docs/results/  Two checked-in live run reports, referenced from Limitations
DECISIONS.md   Design decisions and their reasoning
```

## License

MIT
