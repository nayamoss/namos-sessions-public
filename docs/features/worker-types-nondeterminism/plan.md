# Worker Types Non-Determinism — Implementation Plan

## Investigation already done (2026-08-16, this planning session)

Before writing tasks, three fix candidates from the original issue were actually tried against
a clean `npm ci` (no `.env`) versus the normal dev checkout (`.env` present), not just reasoned
about:

1. **Fix `wrangler.jsonc`'s placeholder values so they match `.env`.** Already true as of
   current `main` — `VITE_CLERK_PUBLISHABLE_KEY` now holds the real `pk_live_...` value in both
   places. **Does not fix it.** Re-tested and the diff is identical to before: `.env` presence
   still changes which vars appear in the generated `CloudflareEnv`/`ProcessEnv` interfaces at
   all (e.g. `CLERK_JWT_ISSUER_DOMAIN`, `CONVEX_DEPLOYMENT`, `CLERK_SECRET_KEY` — vars that live
   *only* in `.env`, never in `wrangler.jsonc` — leak into the generated types when `.env` is
   present, and are absent when it isn't). This is not a values-mismatch problem.
2. **`--strict-vars=false`.** Tested. Narrows the difference (literal types become generic
   `string`) but does not close it — `.env`-only vars are still merged into `CloudflareEnv` when
   present and absent when not. Still non-deterministic.
3. **`--env-file` pointed at an explicit, controlled file.** Tested and confirmed: generating
   with `--env-file <empty-file>` from both a clean `npm ci` and a normal dev checkout with
   `.env` present produces **byte-identical output** in both places (confirmed with `diff`,
   zero lines). This is the fix. It works because it stops `wrangler types` from doing its own
   ambient discovery of whatever `.env`/`.env.local` happen to be sitting in the working
   directory, and pins generation to one deterministic input every time, everywhere.

## Phase 1: Apply the fix

- [ ] T001: Add a committed, tracked file — e.g. `wrangler.types.env` — containing nothing (or
      only a comment explaining its purpose). It exists purely so `--env-file` has a stable,
      repo-relative, non-gitignored target instead of a `/tmp` scratch path.
- [ ] T002: Update `package.json`'s `check:worker-types` script to
      `wrangler types worker-configuration.d.ts --env-interface Env --env-file wrangler.types.env --check`.
- [ ] T003: Regenerate the committed `worker-configuration.d.ts` using the same flag (drop
      `--check` for the write): `wrangler types worker-configuration.d.ts --env-interface Env
      --env-file wrangler.types.env`. Commit the result.
- [ ] T004: Add a one-line comment at the top of `wrangler.types.env` (or in `package.json` next
      to the script) explaining why it exists and linking this issue — otherwise it reads as
      dead weight and someone deletes it, silently reintroducing the bug.

## Phase 2: Verify both directions (do not skip — this is what was actually broken)

- [ ] T005: From a clean checkout with **no** `.env`/`.env.local` (mirrors CI exactly — the
      easiest way is `git worktree add` or the `/tmp` clean-copy approach used during planning),
      run `npm ci && npm run check:worker-types`. Must pass.
- [ ] T006: From the normal dev checkout, with `.env`/`.env.local` present as usual, run
      `npm run check:worker-types`. Must **also** pass, against the exact same committed file.
- [ ] T007: This is the test that actually matters — T005 alone would have looked like a fix
      last time and wasn't. Both must pass against one committed file before this is done.

## Phase 3: Re-add to CI (only after Phase 2 passes both ways)

- [ ] T008: Add the `Worker types` step back to `.github/workflows/ci.yml`, right where it was
      before being pulled out.
- [ ] T009: Push a branch, confirm the step passes in an actual GitHub Actions run — not just
      locally. The original failure was caught precisely because a real CI run disagreed with
      every local check; don't trust local output alone this time either.
- [ ] T010: Deliberately break it once on that branch — edit a binding in `wrangler.jsonc`
      without regenerating types — and confirm CI fails. Revert.

## Phase 4: Frontend UI

N/A — dev-tooling fix, no application UI surface.

## Task Dependencies

```
T001 → T002 → T003 → T004
T004 → T005,T006 → T007
T007 → T008 → T009 → T010
```

## Verification Checklist

- [ ] `npm run check:worker-types` passes from a clean `npm ci` with no `.env`
- [ ] `npm run check:worker-types` passes from a normal dev checkout with `.env` present —
      against the same committed file, not a different one
- [ ] `wrangler.types.env`'s purpose is documented inline so it isn't mistaken for cruft
- [ ] The step is back in `.github/workflows/ci.yml` and observed to pass on a real Actions run
- [ ] The step was observed to *fail* on a deliberate break, then reverted
