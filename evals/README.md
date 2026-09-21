# Evals

The golden dataset for the TaskLoop support agent and the harness that runs it. The dataset is the contract the harness enforces.

```
dataset.jsonl     Thirty golden cases, one JSON object per line
harness/          The harness as a package
  dataset.py      Case dataclass and loader
  http.py         POST helper: throttles and provider outages become outcomes, not failures
  contract.py     Disclaimer, model header, and triage enums the app must honour
  text.py         Typographic normalisation applied before any regex
  report.py       Run report and delta arithmetic, pure functions, plus a compare command
  reporting.py    pytest plugin: one outcome per case, report written at session end
  judge.py        DeepEval judge model, metrics, rubric, and goldens loader
suites/           test_deterministic.py (CI gate) and test_judge.py (-m judge)
tests/            Unit tests for the harness itself, no app needed
tools/            validate_dataset.py, judge_spread.py
examples/         Baseline and regression run pair used in the top-level README
results/          Run reports, gitignored
conftest.py       Telemetry opt-out, app client fixture, case parametrisation
```

## Dataset

`dataset.jsonl` holds 30 cases, one JSON object per line, six per category:

| Category       | What it catches                                                                            |
| -------------- | ------------------------------------------------------------------------------------------ |
| `factual`      | Documented numbers and policies answered correctly and completely.                         |
| `triage`       | Structured classification holds: category, routing, severity, and refund eligibility.      |
| `out_of_scope` | Requests outside TaskLoop are declined in full, with no partial compliance.                |
| `adversarial`  | Prompt injection, prompt extraction, claimed authority, and social-engineered refunds.     |
| `edge`         | Policy boundaries (day 14 vs 15, hour 48 vs 49) and input limits (near-empty, 2000 chars). |

Every case documents why it exists in its `why` field.

## Case shape

```json
{
  "id": "edge-001",
  "category": "edge",
  "endpoint": "chat",
  "input": { "message": "..." },
  "expected": {
    "status": 200,
    "must_match": ["14"],
    "must_not_match": ["(not|no longer) (eligible|refundable)"]
  },
  "reference": "Yes. Annual plans are refundable within 14 calendar days ...",
  "why": "Inclusive boundary: day 14 is inside the window."
}
```

| Field                      | Applies to | Meaning                                                                                       |
| -------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `endpoint`                 | all        | `chat` posts `input` to `/api/chat`; `triage` posts it to `/api/triage`.                      |
| `expected.status`          | all        | Always 200. Error-path behaviour is covered by the route tests, not the dataset.              |
| `expected.must_match`      | all        | Regexes (case-insensitive) that must each match the answer or the suggested reply.            |
| `expected.must_not_match`  | all        | Regexes that must not match anywhere in the answer or the suggested reply.                    |
| `expected.schema`          | triage     | The response must parse as `TriageOutput` from `lib/schemas.ts`.                              |
| `expected.category`        | triage     | Required classification. A list means any listed value passes.                                |
| `expected.route_to`        | triage     | Required routing. A list means any listed value passes.                                       |
| `expected.severity`        | triage     | Required severity when the case pins it. A list means any listed value passes.                |
| `expected.refund_eligible` | triage     | `true`, `false`, or `"needs_review"`, applied strictly.                                       |
| `reference`                | chat       | The answer a judge scores against. Required on `factual`, present on `edge` where it matters. |
| `why`                      | all        | One line on the failure mode this case exists to catch.                                       |

Two invariants apply to every case and are not repeated per line: chat answers must carry the server-side disclaimer, and triage responses must validate against the schema before any field assertion runs.

## Deterministic before judged

`must_match`, `must_not_match`, `schema`, and the triage field assertions are necessary conditions checked with a regex or a parser. Against the fake model they are fully deterministic, which is how CI runs them. They are conservative: they prove the answer mentions the right number or refuses the right thing, not that it is a good answer. Answer quality is what the `reference` field and the judge tier are for.

## Running the deterministic tier

Start the app (fake mode needs no key), then run pytest against it:

```bash
GROUNDTRUTH_FAKE_LLM=1 pnpm dev            # or pnpm build && pnpm start
pip install -r evals/requirements.txt      # or: uv venv evals/.venv && uv pip install -r evals/requirements.txt
pnpm evals:deterministic                   # pytest evals -m "not judge"
```

`GROUNDTRUTH_APP_URL` overrides the default `http://localhost:3000`. The client checks `/api/health` before the first case and exits with a clear message if the app is not up, or if the app is configured with a model that would be billed.

Against a live provider, set `GROUNDTRUTH_EVAL_DELAY_MS` to space the requests; `3500` keeps a run under the free tier's per-minute ceiling. A 429 is retried with backoff (or the `Retry-After` value) up to three times, then raised as `RateLimited`, a distinct outcome from a failed assertion. A daily-cap 429 is raised immediately since waiting would not clear it. A 502, 503, or 504 (every model in the app's routing list failed upstream or timed out) is retried the same way, then raised as `ProviderUnavailable` and recorded as `unavailable`.

```bash
GROUNDTRUTH_APP_URL=http://localhost:3000 GROUNDTRUTH_EVAL_DELAY_MS=3500 pnpm evals:deterministic
```

## Running the judge tier

The judge tier scores answer quality with [DeepEval](https://github.com/confident-ai/deepeval) on every chat case that carries a `reference`: nine cases today, the six `factual` ones and the three `edge` ones with a documented right answer. It is not a CI gate. It needs a key and a judge model, both read from the environment:

```bash
GROUNDTRUTH_APP_URL=http://localhost:3000 GROUNDTRUTH_EVAL_DELAY_MS=3500 pnpm evals:judge
```

DeepEval reads `.env` and then `.env.local` from the working directory into the process environment without overriding variables that are already set, so a `.env.local` that runs the app also configures the judge (`GROUNDTRUTH_API_KEY`, `GROUNDTRUTH_JUDGE_MODEL`, `GROUNDTRUTH_JUDGE_FALLBACK_MODELS`). Set `DEEPEVAL_DISABLE_DOTENV=1` to make the harness read only the process environment.

Two metrics per case, both in `harness/judge.py`:

| Metric      | DeepEval class          | Inputs                                | What it scores                                            |
| ----------- | ----------------------- | ------------------------------------- | --------------------------------------------------------- |
| relevancy   | `AnswerRelevancyMetric` | input, actual output                  | Whether the answer addresses the question that was asked. |
| correctness | `GEval` with a `Rubric` | input, actual output, expected output | Agreement with the reference on a fixed four-level scale. |

The correctness rubric anchors at 10 (every reference fact present), 7 to 9 (a secondary fact missing), 3 to 6 (a figure wrong or the verdict hedged), and 0 to 2 (verdict contradicted); DeepEval reports it normalised to `[0, 1]`. The dataset is loaded as DeepEval goldens (`load_goldens`), each case's answer is fetched from the running app and wrapped in an `LLMTestCase`, and `assert_test` applies both metrics. Scores are recorded into the run report whether or not the assertion held.

The judge model is `OpenRouterJudge`, a `DeepEvalBaseLLM` subclass: JSON mode on every call, the schema DeepEval passes to `generate()` validated locally, the same `:free` rule as the app, and the served model recorded. A judge that cannot produce a score, or times out, is recorded as `skipped` with the error, not as a low score; a rate-limited judge is `rate_limited`. DeepEval's per-attempt budget is raised to 300 seconds in `conftest.py` because free judge models are slow; a nine-case run takes 10 to 15 minutes.

### Thresholds and how they were set

Three consecutive runs on 2026-09-21 with the judge `nex-agi/nex-n2.5-pro:free` and the agent served by `nvidia/nemotron-3-super-120b-a12b:free` (`python3 evals/tools/judge_spread.py --runs 3`). Cases with `n` below 3 hit an upstream 502 from the agent's provider in one run and were recorded as failed at the HTTP layer, so the judge never scored them:

```
case          relevancy min/mean/max     correctness min/mean/max   n
edge-001      1.00 / 1.00 / 1.00         1.00 / 1.00 / 1.00         3
edge-002      1.00 / 1.00 / 1.00         0.80 / 0.80 / 0.80         2
edge-006      1.00 / 1.00 / 1.00         0.90 / 0.95 / 1.00         2
factual-001   1.00 / 1.00 / 1.00         1.00 / 1.00 / 1.00         3
factual-002   1.00 / 1.00 / 1.00         0.90 / 0.97 / 1.00         3
factual-003   1.00 / 1.00 / 1.00         0.80 / 0.80 / 0.80         2
factual-004   1.00 / 1.00 / 1.00         1.00 / 1.00 / 1.00         2
factual-005   1.00 / 1.00 / 1.00         0.70 / 0.75 / 0.80         2
factual-006   1.00 / 1.00 / 1.00         0.80 / 0.85 / 0.90         2

lowest observed: relevancy 1.00, correctness 0.70
```

Across the six earlier calibration runs that fixed the metric configuration the floors were lower: relevancy 0.57 on `factual-004` (a correct answer that also explained the neighbouring plan, which the relevancy metric counts as off-topic statements) and correctness 0.60 on `edge-006` (a right verdict with a secondary fact missing). Both thresholds therefore sit at 0.5: relevancy 0.5 tolerates an answer that adds correct context, and correctness 0.5 sits between the 0.7 anchor (secondary fact missing) and the 0.3 anchor (a figure wrong or the verdict hedged).

Re-run the calibration whenever the judge model changes:

```bash
pnpm evals:judge   # three times
python3 evals/tools/judge_spread.py --runs 3
```

`judge_spread.py` prints min / mean / max per case and metric across the last N judge reports and the lowest score seen anywhere. Override the thresholds with `GROUNDTRUTH_JUDGE_RELEVANCY_MIN` and `GROUNDTRUTH_JUDGE_CORRECTNESS_MIN`.

Example from an earlier calibration run. On `edge-001` (a refund request exactly 14 days after an annual purchase) the agent answered that day 14 was day 15 and outside the window. The deterministic tier passed it, because the answer mentioned "14" and matched none of the refusal patterns. The judge scored correctness 0.0 with the reason "contradicts the reference by saying a purchase exactly 14 days ago is on day 15 and not refundable". The reference comparison is what caught it; a rubric alone would not have.

## Run reports

Every run writes `evals/results/<timestamp>.json` (gitignored; `GROUNDTRUTH_RESULTS_DIR` overrides the directory) and prints a summary plus the delta against the previous run of the same tier:

```
report: evals/results/2026-09-16T17-41-08Z.json
tier: deterministic · model: fake · 30 cases · 29 passed, 1 failed · pass rate 96.7%
  adversarial   6/6   100.0%
  edge          5/6   83.3%
  factual       6/6   100.0%
  out_of_scope  6/6   100.0%
  triage        6/6   100.0%
served by: nvidia/nemotron-3-super-120b-a12b:free ×30
delta vs 2026-09-16T17-39-52Z.json:
  new failures:  edge-004
  fixed:         none
  overall: 100.0% -> 96.7% (-3.3)
  edge: 100.0% -> 83.3% (-16.7)
```

The `served by:` line counts the `x-groundtruth-model` header on each response. With fallback routing configured, it shows whether the primary model or a fallback produced a run; in fake mode it reads `fake ×30`.

The JSON carries the same numbers plus one entry per case:

| Field                       | Meaning                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `run_at`, `tier`, `app_url` | When, which tier (`deterministic` or `judge`), and which app the run hit.                                |
| `model`, `fake_llm`         | Copied from `/api/health` so a report says what it measured.                                             |
| `cases[]`                   | `id`, `category`, `endpoint`, `outcome`, `score`, `duration_ms`, and the assertion `message` on failure. |
| `cases[].outcome`           | `passed`, `failed`, `rate_limited`, `unavailable`, or `skipped`. Only the first two are scored.          |
| `cases[].score`             | `1.0` or `0.0` on the deterministic tier; the correctness score on the judge tier.                       |
| `cases[].scores`            | Judge tier only: `relevancy`, `correctness`, and `judge_model`.                                          |
| `categories`, `totals`      | Per-category and overall counts per outcome, plus `scored` and `pass_rate`.                              |

The baseline is the most recent report with the same tier and the same model, so a fake-mode run is never compared with a live one. The delta compares case ids present in both runs: `new_failures` (passed then failed), `fixed` (failed then passed), `still_failing`, and the pass-rate change overall and per category. Cases added or removed between runs are listed separately and never counted as a change. A single pass rate says little; the delta says what the last edit cost. Two saved reports can be compared directly: `python3 evals/harness/report.py <previous.json> <current.json>` prints the same summary and delta for any pair, and `examples/` holds the pair the top-level README walks through.

## Validation

```bash
pnpm evals:validate
```

Checks the count, unique ids, six-per-category balance, id prefixes, input limits, enum values against the triage contract, that every regex compiles, and that exactly one chat case sits at the 2000-character limit. Standard library only; runs in CI as a gate alongside the app build.
