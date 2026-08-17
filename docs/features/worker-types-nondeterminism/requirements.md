# Worker Types Non-Determinism — Requirements

**Type:** Bug
**Status:** In Review
**Priority:** Low
**Last Updated:** 2026-08-16

## Problem Statement

`npm run check:worker-types` (`wrangler types worker-configuration.d.ts --env-interface Env
--check`) does not produce the same output in every environment. `wrangler types` reads local
`.env`/`.env.local` when generating types: any var it finds there gets emitted as a literal
string type on `CloudflareEnv` and dropped from the generic-`string` `ProcessEnv` pick list;
when those files are absent, the same vars stay generic and the pick list differs. `.env`/
`.env.local` are gitignored and never present in CI.

Re-verified 2026-08-16 against current `main`, after `wrangler.jsonc`'s `VITE_CLERK_PUBLISHABLE_KEY`
was fixed from a placeholder to the real `pk_live_...` value (a separate fix, unrelated to this
issue). **The non-determinism is unaffected by that fix and still reproduces identically** — a
clean `npm ci` with no `.env` files fails `--check` against the file currently committed on
`main`, even though the *values* in `wrangler.jsonc` and `.env` now match exactly. The bug is
about whether `.env` exists at generation time, not about whether its values agree with
`wrangler.jsonc`. This rules out "fix the placeholder" as a solution on its own — see design.md.

There is no single committed state of `worker-configuration.d.ts` that satisfies `--check` both
in CI (no `.env`) and in a normal dev checkout (`.env` present). The check disagrees with itself
depending on where it runs.

Originally surfaced while adding this check to CI as part of #204 — it was pulled back out of
`.github/workflows/ci.yml` specifically because of this, keeping only the (deterministic) `lint`
step.

## Steps to Reproduce

1. In a normal dev checkout with `.env` present, run
   `npx wrangler types worker-configuration.d.ts --env-interface Env` and diff against the
   committed file — no diff, looks fine.
2. `rm -rf node_modules && mv .env /tmp && mv .env.local /tmp && npm ci`
3. `npm run check:worker-types` → fails.
4. Restore the `.env` files; regenerate types again; the file now differs from what step 1
   produced.

## Expected vs Actual

**Expected:** `check:worker-types` gives the same answer regardless of which machine or CI
runner invokes it, since the source of truth (`wrangler.jsonc`) hasn't changed.

**Actual:** The answer flips depending on the presence of local, gitignored `.env` files —
independent of whether those files' values agree with `wrangler.jsonc`.

## Functional Requirements

- FR-001: `npm run check:worker-types` gives the same pass/fail result whether run from a clean
  `npm ci` (no `.env`) or from a normal dev checkout (`.env` present).
- FR-002: Whatever the fix, it doesn't silently drop the check from ever running anywhere — a
  fix that just deletes the script without replacing its value (catching a real
  `wrangler.jsonc`/binding drift) is a regression, not a fix.

## Out of Scope

- Re-adding this check to CI. That's #204's concern once this is fixed, not this issue's.
- The `wrangler.jsonc` placeholder-vars question generally (#203) — related, but that issue
  covers different fields and a different validation mechanism.

## Success Metrics

- `npm run check:worker-types` passes or fails identically from a clean `npm ci` and from a
  normal dev checkout, verified both ways before closing
