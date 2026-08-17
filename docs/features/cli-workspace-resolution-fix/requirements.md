# PR #186 CI fix — CLI workspace resolution — Requirements

**Type:** Bug Fix
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-15

## Problem Statement

PR #186 (`feature/178-phase4-cli`, Phase 4 of #178 — `@namos-sessions/cli`) has a real GitHub
Actions CI failure, confirmed via `gh run view --log-failed` on the actual run (not a guess):

```
Failed to resolve import "@namos-sessions/sdk" from "packages/cli/src/cli.ts". Does the file exist?
```

**Root cause:** CI's `check` script is `npm run check:worker-types && npm run typecheck && npm run
test && npm run build`. Nothing in that pipeline builds `packages/sdk` before `npm run test` runs.
`packages/cli` depends on `@namos-sessions/sdk` via the npm workspace symlink
(`node_modules/@namos-sessions/sdk -> packages/sdk`), and `packages/sdk/package.json`'s `exports`
field points at `./dist/index.js` / `./dist/index.d.ts` — files that only exist after someone runs
`npm run build --workspace @namos-sessions/sdk`. On a clean `npm ci` checkout (exactly what CI
does — `dist/` is gitignored, never committed), that build never happens, so the import fails.

This is a pre-existing gap that Phase 3 (#180, the SDK) also had implicitly, but nothing exercised
it until Phase 4 added a second package that imports the SDK at runtime, not just at typecheck
time.

## Functional Requirements

- FR-001: `npm run test` must pass against a clean checkout (`node_modules` and every
  `packages/*/dist` removed) — i.e. tests must not depend on a package having been built first.
- FR-002: `npm run typecheck` must independently cover `packages/cli` (it currently only covers
  `packages/sdk`, `tsconfig.app.json`, `convex/tsconfig.json`, `tsconfig.worker.json` — the CLI's
  own `tsconfig.json` is never invoked from the root script, so a typecheck-only regression in
  `packages/cli` would silently pass CI today).
- FR-003: The fix must not reintroduce the bug already fixed once in commit `14be5b4` on this same
  PR — `packages/cli/tsconfig.build.json` (the config that actually emits files via
  `npm run build --workspace @namos-sessions/cli`) must keep resolving `@namos-sessions/sdk`
  through real npm workspace resolution against built `dist/` output, never a `paths` alias to
  source. That alias, when present on the build config, made `tsc` compile and emit a duplicate
  copy of the SDK's source into `dist/sdk/src/*`, and the resulting `dist/` layout didn't match
  `package.json`'s declared `"bin": "./dist/bin.js"` path at all.
- FR-004: `npm run check:worker-types` must pass — regenerate `worker-configuration.d.ts` via
  `npx wrangler types worker-configuration.d.ts --env-interface Env` if `main` has moved since the
  last regeneration (it has moved repeatedly during this session; expect to need this again).
- FR-005: The fix must be verified against a simulated clean CI checkout locally
  (`rm -rf node_modules packages/*/dist && npm install && npm run check`) before pushing — not
  just against whatever partial local state happens to exist in the worktree already.
- FR-006: The fix must be verified against the **real** GitHub Actions run for the pushed commit
  (`gh run watch --exit-status <run-id>`, or equivalent polling until `status=completed`), not
  against Codex's or any agent's own self-reported "tests passed" — this exact PR already had two
  bugs (`workspace:*` protocol, the build-duplication bug above) that passed a self-report and
  failed for real.

## Non-Functional Requirements

- NFR-001 (CI hygiene): No change here should make `npm run check` slower in a way that matters —
  this is a resolution-configuration fix, not a new build step.
- NFR-002 (No regressions): The already-merged `packages/sdk` (Phase 3, #180) and the rest of the
  app/convex/worker test suite must keep passing unchanged.

## Out of Scope

- Phase 5 (MCP server) — not part of this fix.
- Publishing `@namos-sessions/cli` or `@namos-sessions/sdk` to npm — this fix only concerns
  in-repo CI/build correctness, not the publish pipeline.
- Redesigning the workspace/build tooling (e.g. switching to a proper monorepo build tool like
  Turborepo/Nx) — out of scope for this bug fix, even though it would prevent this class of bug
  more generally. Worth a separate improvement ticket if it recurs.

## Success Metrics

- The real GitHub Actions check run for the pushed fix commit on `feature/178-phase4-cli`
  completes with `conclusion: success`, confirmed via `gh run view`/`gh run watch`, not assumed.
- `npm run check` passes locally from a simulated clean checkout.
- PR #186 becomes mergeable (`gh pr view 186 --json mergeable,mergeStateStatus` shows
  `MERGEABLE`/non-`DIRTY`) and can be merged to `main` with real CI green.
