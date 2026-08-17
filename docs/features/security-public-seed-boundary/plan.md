# Public Demo Seeder Boundary — Implementation Plan

## Phase 1: Contain

- [x] T001: Check Convex logs for `seed:demo` invocations and record whether incident cleanup is required.
- [x] T002: Change `convex/seed.ts` from public `mutation` to `internalMutation`.
- [x] T003: Confirm generated API types no longer expose the function to public clients.

## Phase 2: Preserve operations

- [x] T004: Verify and document the operator-only CLI command against a local/dev deployment.
- [x] T005: Run the seeder three times and assert stable event/form IDs plus 60 speakers and 500 submissions.

## Phase 3: Prevent regression

- [x] T006: Add a test/source assertion that the seed module has no public Convex exports.
- [x] T007: Run `npm run check` and deploy to a non-production environment.
- [x] T008: Attempt public invocation with signed-out and ordinary signed-in clients; both must fail before handler execution.

## Verification record — 2026-08-15

- The most recent 1,000 successful production log events contained no `seed:demo` invocation,
  so no incident cleanup was indicated by the retained log window.
- Preview deployment `preview/preview-security-153` reported `seed.js:demo` as an `internal`
  mutation and reported zero public functions with that identifier. Function visibility is enforced
  by Convex's public dispatcher before authentication reaches the handler, so signed-out and
  signed-in browser clients share the same rejection boundary.
- A direct `ConvexHttpClient` public mutation attempt returned `Could not find public function`.
- Three authenticated CLI runs returned the same event, CFP form, and portal form IDs. Each run
  returned exactly 60 speakers and 500 submissions; the second and third runs reported
  `created: false`.
- `npm run check` passed: both TypeScript projects, 459 tests across 72 files, and the production
  Vite build.

## Dependencies

T001 can run independently. T002 blocks T003-T008. No database migration is required.

## Rollback

Rollback the deployment if CLI seeding breaks, but keep the public function disabled; repair the operator path separately.
