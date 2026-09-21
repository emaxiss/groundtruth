# Contributing

## Setup

Requires Node 22 (see `.node-version`), pnpm 10, and Python 3.12.

```bash
pnpm install
pnpm exec playwright install chromium
python3 -m venv evals/.venv && evals/.venv/bin/pip install -r evals/requirements.txt
cp .env.example .env.local
```

Fake mode needs no key: `GROUNDTRUTH_FAKE_LLM=1 pnpm dev`. A live run needs an OpenRouter key in `.env.local` and a model id ending in `:free` (or an explicit opt-in to paid models, see `.env.example`).

## Checks

Every pull request runs these in CI. Run them locally first.

| Check                                      | Command                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Format, lint, types                        | `pnpm format:check && pnpm lint && pnpm typecheck`                                         |
| Unit and route tests, coverage floor       | `pnpm test:coverage`                                                                       |
| Build                                      | `pnpm build`                                                                               |
| Contract suite (starts the app itself)     | `pnpm test:contract`                                                                       |
| Browser suite (starts the app itself)      | `pnpm test:e2e`                                                                            |
| Harness lint, format, types, unit coverage | `ruff check evals && ruff format --check evals && pnpm evals:typecheck && pnpm evals:unit` |
| Adversarial suite (needs a running app)    | `GROUNDTRUTH_APP_URL=http://localhost:3000 pnpm redteam`                                   |
| Dataset validation                         | `pnpm evals:validate`                                                                      |
| Deterministic eval tier (fake)             | `GROUNDTRUTH_FAKE_LLM=1 pnpm start & pnpm evals:deterministic`                             |

The judge tier (`pnpm evals:judge`) needs a key and a running live app; it is not a CI gate. Re-run its three-run calibration when the judge model changes (see `evals/README.md`).

## Where things go

- App code: `app/` (routes, components) and `lib/` (domain code, no framework imports).
- Every `GROUNDTRUTH_*` variable is read in `lib/env.ts`; input limits live in `lib/limits.ts`.
- Browser locators use roles and labels first; a test id only where the UI has no accessible handle. New views get an axe check in `tests/e2e/specs/accessibility.spec.ts`.
- TypeScript tests: `tests/unit/` mirrors `lib/` and `app/api/`; `tests/e2e/` uses page objects in `pages/` and fixtures in `fixtures.ts`; `tests/contract/` is the black-box verifier.
- Harness code: `evals/harness/`; suites in `evals/suites/`; harness unit tests in `evals/tests/`.
- A new golden case goes in `evals/dataset.jsonl` with a `why` line, and `pnpm evals:validate` must still pass (six cases per category).

## Pull requests

- Branch from `main`; one change per pull request.
- Conventional commit titles: `type(scope): description`, single line.
- Fill in the template: what, why, and the verification output you actually saw.
- A behaviour change comes with a check that would fail without it.
- Update `README.md`, `evals/README.md`, or `DECISIONS.md` when the contract, environment, or a design choice changes.
