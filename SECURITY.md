# Security

## Reporting

Report a vulnerability through GitHub's private advisory form for this repository (Security tab, "Report a vulnerability"). Do not open a public issue for it. Expect an acknowledgement within a week.

## Scope

- The app has no authentication, persistence, or user accounts. It is an evaluation target, not a hosted product, and it should not be exposed to the internet with a real API key.
- The prompt-injection defences are prompt-level. The adversarial eval cases measure how far they go; a bypass of them is a finding worth reporting, but not a vulnerability in the usual sense.
- The client refuses to call a model whose id does not end in `:free` unless `GROUNDTRUTH_ALLOW_PAID_MODELS=1` is set. A way around that guard is in scope.
- API keys belong in `.env.local`, which is gitignored. Nothing in the repository should ever contain one; if you find one, report it the same way.

## Dependencies

Dependabot opens weekly pull requests for npm, pip, and GitHub Actions. DeepEval's telemetry is disabled in the harness, in `.env.example`, and in CI.
