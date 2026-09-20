# Evals

The golden dataset for the TaskLoop support agent. The harness that runs it lives alongside this file; the dataset is the contract it enforces.

## Dataset

`dataset.jsonl` holds 30 cases, one JSON object per line, six per category:

| Category       | What it catches                                                                            |
| -------------- | ------------------------------------------------------------------------------------------ |
| `factual`      | Documented numbers and policies answered correctly and completely.                         |
| `triage`       | Structured classification holds: category, routing, severity, and refund eligibility.      |
| `out_of_scope` | Requests outside TaskLoop are declined in full, with no partial compliance.                |
| `adversarial`  | Prompt injection, prompt extraction, claimed authority, and social-engineered refunds.     |
| `edge`         | Policy boundaries (day 14 vs 15, hour 48 vs 49) and input limits (near-empty, 2000 chars). |

Every case documents why it exists. A case that cannot say what regression it would catch does not belong in the set.

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

`must_match`, `must_not_match`, `schema`, and the triage field assertions are necessary conditions checked with a regex or a parser. They cannot flake and they run in CI against the fake model. They are deliberately conservative: they prove the answer mentions the right number or refuses the right thing, not that it is a good answer. Answer quality is what the `reference` field and the judge tier are for.

## Running the deterministic tier

Start the app (fake mode needs no key), then run pytest against it:

```bash
GROUNDTRUTH_FAKE_LLM=1 pnpm dev            # or pnpm build && pnpm start
pip install -r evals/requirements.txt      # or: uv venv evals/.venv && uv pip install -r evals/requirements.txt
pnpm evals:deterministic                   # pytest evals -m "not judge"
```

`GROUNDTRUTH_APP_URL` overrides the default `http://localhost:3000`. The client checks `/api/health` before the first case and exits with a clear message if the app is not up, or if the app is configured with a model that would be billed.

Against a live provider, set `GROUNDTRUTH_EVAL_DELAY_MS` to space the requests; `3500` keeps a run under the free tier's per-minute ceiling. A 429 is retried with backoff (or the `Retry-After` value) up to three times, then raised as `RateLimited`, a distinct outcome from a failed assertion. A daily-cap 429 is raised immediately since waiting would not clear it.

```bash
GROUNDTRUTH_APP_URL=http://localhost:3000 GROUNDTRUTH_EVAL_DELAY_MS=3500 pnpm evals:deterministic
```

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

The `served by:` line counts the `x-groundtruth-model` header on each response. With fallback routing configured, it is how you know whether the primary model or a fallback produced a run; in fake mode it reads `fake ×30`.

The JSON carries the same numbers plus one entry per case:

| Field                       | Meaning                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `run_at`, `tier`, `app_url` | When, which tier (`deterministic` or `judge`), and which app the run hit.                                |
| `model`, `fake_llm`         | Copied from `/api/health` so a report says what it measured.                                             |
| `cases[]`                   | `id`, `category`, `endpoint`, `outcome`, `score`, `duration_ms`, and the assertion `message` on failure. |
| `cases[].outcome`           | `passed`, `failed`, `rate_limited`, or `skipped`. Rate-limited cases are reported, not scored.           |
| `cases[].score`             | `1.0` or `0.0` on the deterministic tier; a judge metric score on the judge tier.                        |
| `categories`, `totals`      | Per-category and overall counts: `passed`, `failed`, `rate_limited`, `skipped`, `scored`, `pass_rate`.   |

The baseline is the most recent report with the same tier and the same model, so a fake-mode run is never compared with a live one. The delta compares case ids present in both runs: `new_failures` (passed then failed), `fixed` (failed then passed), `still_failing`, and the pass-rate change overall and per category. Cases added or removed between runs are listed separately and never counted as a change. A single pass rate says little; the delta says what the last edit cost.

## Validation

```bash
pnpm evals:validate
```

Checks the count, unique ids, six-per-category balance, id prefixes, input limits, enum values against the triage contract, that every regex compiles, and that exactly one chat case sits at the 2000-character limit. Standard library only; runs in CI as a gate alongside the app build.
