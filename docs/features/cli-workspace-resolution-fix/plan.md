# PR #186 CI fix — CLI workspace resolution — Implementation Plan

No UI surface — this is a build/test-tooling fix for a Node CLI package. The Frontend UI phase
requirement doesn't apply (N/A — no user-facing component touched).

## Phase 1: Verify and complete the resolution fix

There is an **uncommitted, unverified** partial fix already sitting in this exact worktree
(`.worktrees/feature/178-phase4-cli`) from a prior session. Read it before touching anything —
don't redo work that's already there, but don't trust it's correct either, since it was never
run against `npm run check`.

- [ ] T001: Read the current (possibly already-edited) `vitest.config.ts` at the repo root. It
      should have `resolve.alias` mapping `"@namos-sessions/sdk"` to
      `path.resolve(rootDir, "./packages/sdk/src/index.ts")`. If that alias is missing, add it —
      this makes `npm run test` resolve the SDK from source, so tests never depend on a prebuilt
      `packages/sdk/dist`.
- [ ] T002: Read the current `packages/cli/tsconfig.json`. It should have `baseUrl: "."` and
      `paths: { "@namos-sessions/sdk": ["../sdk/src/index.ts"] }`. If missing, add it — this is
      the **typecheck-only** config (`noEmit: true`), safe to alias to source.
- [ ] T003: Read `packages/cli/tsconfig.build.json`. Confirm it does **NOT** inherit or redeclare
      the `paths` alias from T002 — it must resolve `@namos-sessions/sdk` through real npm
      workspace resolution (i.e. against `packages/sdk/dist`, which must actually be built before
      anyone runs `npm run build --workspace @namos-sessions/cli` for real — that's expected and
      fine, unlike the test/typecheck paths which must never require a prebuilt dist). If it *does*
      inherit the alias, fix it so it doesn't — this is exactly the bug fixed once already in
      commit `14be5b4` on this PR; do not reintroduce it.
- [ ] T004: Add `packages/cli` to the root `package.json`'s `typecheck` script. It currently reads:
      `tsc --noEmit -p tsconfig.app.json && tsc -p convex/tsconfig.json --noEmit && tsc --noEmit -p tsconfig.worker.json && tsc -p packages/sdk/tsconfig.json --noEmit`
      — append `&& tsc -p packages/cli/tsconfig.json --noEmit` so the CLI's own typecheck is
      actually enforced by CI (today it silently isn't).

## Phase 2: Clean-checkout verification (do this before pushing anything)

- [ ] T005: Simulate a clean CI checkout locally:
      `rm -rf node_modules packages/sdk/dist packages/cli/dist`
- [ ] T006: `npm install` — confirm it succeeds and creates real workspace symlinks:
      `ls -la node_modules/@namos-sessions/` should show `cli -> ../../packages/cli` and
      `sdk -> ../../packages/sdk`.
- [ ] T007: Regenerate worker types if stale — run
      `npx wrangler types worker-configuration.d.ts --env-interface Env` and check the diff isn't
      empty before deciding whether it's needed; `npm run check:worker-types` will tell you if it
      failed.
- [ ] T008: Run `npm run check` from the repo root (this now runs `check:worker-types`,
      `typecheck` — including the new `packages/cli` step from T004 — `test`, and `build`, in that
      order). All four must pass with **no** manual pre-build step for `packages/sdk` or
      `packages/cli` — that's the whole point of this fix. If `npm run test` still fails to
      resolve `@namos-sessions/sdk`, the alias from T001 isn't actually working; debug that before
      moving on, don't work around it by manually building first.
- [ ] T009: Additionally, manually build and smoke-test the actual CLI binary once (this exercises
      the real, non-aliased path a published package would use):
      `npm run build --workspace @namos-sessions/sdk && npm run build --workspace @namos-sessions/cli && node packages/cli/dist/bin.js events list`
      — expect `Run \`namos-sessions login\` first.` with exit code 1 (no credentials stored).
      Confirm `packages/cli/dist/` contains only `bin.js`, `cli.js`, `credentials.js`,
      `format.js` and their `.d.ts` files — no `dist/sdk/` subfolder (that would mean T003's fix
      didn't take).

## Phase 3: Push and verify against real CI

- [ ] T010: `git add -A && git status --porcelain` — confirm only the intended files changed
      (`vitest.config.ts`, `packages/cli/tsconfig.json`, `package.json`,
      `worker-configuration.d.ts` if regenerated, `package-lock.json` if `npm install` touched it,
      plus this plan's `docs/features/cli-workspace-resolution-fix/` folder). No `dist/` output,
      no stray `node_modules`.
- [ ] T011: Commit with a message that names the actual root cause (CI never builds `packages/sdk`
      before running tests) and references this doc folder + PR #186.
- [ ] T012: `git push` (branch is already `feature/178-phase4-cli`, already tracking
      `origin/feature/178-phase4-cli` — no new branch, no new PR).
- [ ] T013: Get the new run id:
      `gh run list --branch feature/178-phase4-cli --limit 1 --json databaseId -q '.[0].databaseId'`
- [ ] T014: **Watch the real run to completion** — `gh run watch --exit-status <run-id>` — and
      check its actual exit code. Do not report this done on a self-report or on "I pushed it, CI
      should pass now." If it fails, read `gh run view <run-id> --log-failed`, fix, and repeat
      from T005.
- [ ] T015: Once the real run's conclusion is `success`, confirm PR #186 is mergeable:
      `gh pr view 186 --json mergeable,mergeStateStatus`. If `main` has moved since this branch was
      last synced (it has moved repeatedly during this project — check first), merge `origin/main`
      into this branch, resolve any conflicts, and repeat Phase 2 + Phase 3 verification before
      declaring done. Do not merge PR #186 to `main` as part of this fix unless explicitly asked —
      leave that decision to whoever is driving the merge.

## Task Dependencies

T001–T004 (the fix itself) → T005–T009 (clean-checkout local verification) → T010–T012 (commit and
push) → T013–T015 (real CI verification, and re-loop back to T005 on failure).

## Verification Checklist

- [ ] `npm run check` passes from a simulated clean checkout (T005–T008), not just incrementally
      on top of leftover local build artifacts
- [ ] The actual CLI binary runs and correctly resolves the real SDK package at runtime (T009)
- [ ] `packages/cli` is covered by the root `typecheck` script (T004), not silently skipped
- [ ] The real GitHub Actions run for the pushed commit is green — verified by watching it, not
      inferred (T014)
- [ ] No regressions to the existing `packages/sdk`/app/convex/worker test suite
- [ ] This doc's own `requirements.md` success metrics are met
