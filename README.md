<p align="center">
  <img src="docs/hero.svg" width="100%" alt="groundtruth: an AI support agent, and the harness that proves it works. A run report shows one new failure, edge-002, after a one-line edit to the refund window.">
</p>

<p align="center">
  <a href="https://github.com/emaxiss/groundtruth/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/emaxiss/groundtruth/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/emaxiss/groundtruth/actions/workflows/live-evals.yml"><img alt="Live evals" src="https://github.com/emaxiss/groundtruth/actions/workflows/live-evals.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-4ade9b?style=flat-square&labelColor=111716"></a>
  <br>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-dfe7e4?style=flat-square&logo=nextdotjs&logoColor=white&labelColor=111716">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white&labelColor=111716">
  <img alt="Python 3.12" src="https://img.shields.io/badge/Python-3.12-e8a13a?style=flat-square&logo=python&logoColor=white&labelColor=111716">
  <img alt="DeepEval" src="https://img.shields.io/badge/DeepEval-judge_tier-4ade9b?style=flat-square&labelColor=111716">
  <img alt="Promptfoo" src="https://img.shields.io/badge/Promptfoo-red_team-f2545b?style=flat-square&labelColor=111716">
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-4_browsers_+_axe-2ead33?style=flat-square&logo=playwright&logoColor=white&labelColor=111716">
</p>

**groundtruth** is an AI customer-support agent and the evaluation harness that grades it. The agent answers questions about TaskLoop, a fictional project-management SaaS, using only its documentation. A separate Python harness tests it black-box over HTTP, so a prompt edit, a model swap, or a docs change shows up as a measured delta instead of a surprise in production.

> [!TIP]
> **Try it without an API key.** Fake mode serves deterministic answers, and it is what CI runs.
>
> ```bash
> pnpm install
> GROUNDTRUTH_FAKE_LLM=1 pnpm dev   # http://localhost:3000
> ```

<img src="docs/chat.png" width="100%" alt="The chat interface answering a documented pricing question, then declining a prompt-injection attempt">

## How it works

```mermaid
flowchart LR
  subgraph harness ["Python eval harness"]
    direction TB
    det["Deterministic tier<br/>regex + schema checks"]
    jdg["Judge tier<br/>DeepEval"]
    red["Red team<br/>Promptfoo"]
  end
  e2e["Browser suite<br/>Playwright + axe"]
  app["Next.js app<br/>/api/chat · /api/triage · /api/health"]
  llm[("Any OpenAI-compatible model<br/>or fake mode")]
  judge[("Judge model")]

  det -- "HTTP, black box" --> app
  jdg -- "HTTP, black box" --> app
  red -- "HTTP, black box" --> app
  e2e --> app
  app --> llm
  jdg -.-> judge

  classDef tier fill:#172120,stroke:#4ade9b,color:#dfe7e4
  classDef sut fill:#111716,stroke:#e8a13a,color:#dfe7e4,stroke-width:2px
  classDef model fill:#0b0f0e,stroke:#9bb0aa,color:#dfe7e4
  class det,jdg,red,e2e tier
  class app sut
  class llm,judge model
  style harness fill:transparent,stroke:#4ade9b,stroke-dasharray:4 4,color:#4ade9b
```

The harness knows nothing about the app's internals. It tests the deployed contract, so it catches a regression introduced anywhere between the route handler and the model, and every response names the model that actually served it.

## What each layer proves

| Layer               | Tool                  | Runs                  | Proves                                                                          |
| ------------------- | --------------------- | --------------------- | ------------------------------------------------------------------------------- |
| Unit and route      | Vitest                | every PR              | Error mapping, schemas, prompt assembly, the disclaimer is always appended      |
| Contract            | Playwright (requests) | every PR              | The built API honours its contract, byte-identical across runs                  |
| Deterministic evals | pytest                | every PR, weekly live | 36 documented behaviours: figures, refusals, classifications, policy boundaries |
| Judge evals         | DeepEval              | weekly live           | Answer relevancy, and correctness against a reference on a fixed rubric         |
| Red team            | Promptfoo             | every PR, weekly live | 24 attacks end without a leaked prompt, an unauthorised promise, invented facts |
| Browser             | Playwright + axe      | every PR              | Chromium, Firefox, WebKit, and mobile; every view passes WCAG 2.1 AA            |

Pull requests run everything except the judge tier, in fake mode, with no key and no network. A [scheduled workflow](.github/workflows/live-evals.yml) runs the eval tiers and the red team against live free-tier models every week.

<details>
<summary><b>What each layer cannot prove</b></summary>

<br>

- **Unit and route tests** say nothing about HTTP, booting, or a real model.
- **The contract suite and browser suite** run against the fake model, so they say nothing about what a real model does.
- **The deterministic tier** proves a documented behaviour held, not that the answer was good. A passing regex is not a good answer.
- **The judge tier** is a noisier instrument, which is why it is not a pull request gate.
- **The red team** is twenty-four hand-written attacks, not a generated or adaptive campaign.

</details>

## A regression, caught

[`evals/examples/`](evals/examples/) holds two live runs. Between them, one line changed: the annual refund window in the grounding facts went from 14 days to 15. The run report names exactly what that cost.

```text
$ python3 evals/harness/report.py evals/examples/baseline.json evals/examples/regression.json
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

`edge-002`, a customer on day 15, was told they still qualified. Its pair, `edge-001` on day 14, kept passing. Boundary cases come in pairs so that a window edit shows up on one side. The pair was recorded before the six multi-turn cases were added, and a unit test checks that the block above is the real output of the command.

## Running against a real model

Requires Node 22+ and pnpm 10+. The default provider is OpenRouter, and switching to any other OpenAI-compatible provider only takes environment variables.

```bash
cp .env.example .env.local   # then set the key
pnpm dev
```

<details>
<summary><b>Provider configuration</b></summary>

<br>

```bash
GROUNDTRUTH_BASE_URL=https://openrouter.ai/api/v1
GROUNDTRUTH_MODEL=google/gemma-4-31b-it:free
GROUNDTRUTH_API_KEY=sk-or-v1-...
# Tried in order when the primary errors or is throttled. Every id must end in ":free"
# unless GROUNDTRUTH_ALLOW_PAID_MODELS=1. Responses name the serving model in x-groundtruth-model.
GROUNDTRUTH_FALLBACK_MODELS=google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3-super-120b-a12b:free,nex-agi/nex-n2.5-pro:free

# Or run fully offline with Ollama:
GROUNDTRUTH_BASE_URL=http://localhost:11434/v1
GROUNDTRUTH_MODEL=qwen2.5:3b
GROUNDTRUTH_API_KEY=ollama
```

Every variable is described in [`.env.example`](.env.example). Running the eval tiers against a live app is covered in [`evals/README.md`](evals/README.md).

</details>

## Eval design

<details>
<summary><b>Dataset, tiers, red team, and drift</b></summary>

<br>

- **Dataset.** 36 golden cases in [`evals/dataset.jsonl`](evals/dataset.jsonl), six per category: `factual`, `triage`, `out_of_scope`, `adversarial`, `multi_turn`, and `edge`. Each case targets a failure mode worth catching, and boundaries such as exactly 14 days or exactly 48 hours are tested on both sides.
- **Deterministic first.** Disclaimers, schema validity, refusals, and the absence of undocumented promises are regex and parser checks: fast, free, and with no threshold to tune. Text is normalised for typographic spaces and dashes before matching.
- **Judge second.** [DeepEval](https://github.com/confident-ai/deepeval) scores answer relevancy and a `GEval` correctness metric against each case's reference, on a rubric fixed in [`evals/harness/judge.py`](evals/harness/judge.py). It sits behind the `judge` pytest marker, so `pytest -m "not judge"` stays a deterministic gate. The judge is checked against sixteen answers of known quality before its scores are trusted, and its thresholds come from calibration runs documented in [`evals/README.md`](evals/README.md).
- **Red team.** A [Promptfoo](https://github.com/promptfoo/promptfoo) suite in [`redteam/`](redteam/promptfooconfig.yaml) covers instruction override, claimed authority, prompt extraction, refund social engineering, hidden instructions, obfuscation, and hallucination bait. Its first live run found the agent would summarise its own rules, which led to the output guard in [`lib/guardrails.ts`](lib/guardrails.ts).
- **Honest outcomes.** A throttled or unavailable provider is reported as its own outcome, not as a failed case. Repeated runs list the cases that did not hold every time, and each run prints its delta against the previous one.

</details>

## Limitations

> [!NOTE]
>
> - **The judge is a small free model.** Its thresholds are statements about this judge, not about the agent, and it is no substitute for a frontier judge.
> - **Live results come from one provider and few runs.** The checked-in reports in [`docs/results/`](docs/results/) name the model that served every case.
> - **No retrieval, persistence, or auth.** The grounding block is a curated fact list compiled from twelve markdown files, and conversations are not stored.
> - **Guardrails are mostly prompt-level,** plus one output guard. The adversarial cases measure how far that goes, which is a narrower claim than "the agent is safe".
>
> The reasoning behind each trade-off is in [DECISIONS.md](DECISIONS.md).

<details>
<summary><b>Repository layout</b></summary>

<br>

```
app/                    Next.js App Router
  api/                  chat, triage, health route handlers
  components/           chat panel, triage panel, health badge, view tabs, shared primitives
lib/                    Domain code with no framework dependency
  llm/                  client (rotation, retries), models (routing, free-model guard), fake fixtures
  corpus/               docs loader and the pinned facts the grounding block is built from
  env.ts                every GROUNDTRUTH_* variable is read here and nowhere else
  guardrails.ts         output guard against disclosing the agent's own rules
  prompts.ts  schemas.ts  limits.ts
docs-corpus/            Twelve markdown files the grounding block is compiled from
scripts/                Developer tools (print the grounding block and its budget)
tests/                  Every TypeScript test, one folder per layer
  unit/                 Vitest, mirrors lib/ and app/api/
  contract/             Black-box verifier against the built app in fake mode
  e2e/                  Playwright: fixtures.ts, pages/ (page objects), specs/
redteam/                Promptfoo adversarial suite for the chat endpoint
evals/                  Python eval harness (its own README)
  dataset.jsonl         The thirty-six golden cases
  harness/              dataset, http, contract, text, report, judge, reporting plugin
  suites/               The deterministic and judge tiers
  tests/                Unit tests for the harness itself
  tools/                validate_dataset, judge_spread
  examples/             Baseline and regression run pair behind the worked example
docs/results/           Two checked-in live run reports, referenced from Limitations
DECISIONS.md            Design decisions and their reasoning
```

</details>

## Contributing

Setup, the full check list, and where new code goes are in [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities through [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).
