# Public Demo Seeder Boundary — Implementation Plan

## Phase 1: Contain

- [ ] T001: Check Convex logs for `seed:demo` invocations and record whether incident cleanup is required.
- [ ] T002: Change `convex/seed.ts` from public `mutation` to `internalMutation`.
- [ ] T003: Confirm generated API types no longer expose the function to public clients.

## Phase 2: Preserve operations

- [ ] T004: Verify and document the operator-only CLI command against a local/dev deployment.
- [ ] T005: Run the seeder three times and assert stable event/form IDs plus 60 speakers and 500 submissions.

## Phase 3: Prevent regression

- [ ] T006: Add a test/source assertion that the seed module has no public Convex exports.
- [ ] T007: Run `npm run check` and deploy to a non-production environment.
- [ ] T008: Attempt public invocation with signed-out and ordinary signed-in clients; both must fail before handler execution.

## Dependencies

T001 can run independently. T002 blocks T003-T008. No database migration is required.

## Rollback

Rollback the deployment if CLI seeding breaks, but keep the public function disabled; repair the operator path separately.

