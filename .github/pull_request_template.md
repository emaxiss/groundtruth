## What

<!-- What changes, in one or two sentences. -->

## Why

<!-- The reason this change exists. Link an issue if there is one. -->

## Verification

<!-- The commands you ran and what they returned. Paste real output, not claims. -->

```

```

## Notes

<!-- Trade-offs, deviations, follow-ups. Delete if none. -->

---

- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, and `pnpm build` pass
- [ ] `pnpm test:contract` and `pnpm test:e2e` pass against the built app in fake mode
- [ ] `ruff check evals`, `ruff format --check evals`, `pnpm evals:typecheck`, `pnpm evals:unit`, and `pytest evals -m "not judge"` pass
- [ ] Behaviour changes are covered by a check that would fail without them
- [ ] Docs updated if the contract, environment, or setup changed
