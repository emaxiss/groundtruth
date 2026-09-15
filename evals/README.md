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

## Validation

```bash
pnpm evals:validate
```

Checks the count, unique ids, six-per-category balance, id prefixes, input limits, enum values against the triage contract, that every regex compiles, and that exactly one chat case sits at the 2000-character limit. Standard library only; runs in CI before the app builds.
