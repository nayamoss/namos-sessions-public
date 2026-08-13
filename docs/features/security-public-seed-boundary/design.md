# Public Demo Seeder Boundary — Technical Design

## Current state

`convex/seed.ts:1,8` imports and uses the public `mutation` wrapper. The handler writes events, forms, fields, sponsors, speakers, submissions, evaluations, tasks, agenda fixtures, and comms logs.

## Proposed design

- Replace the public wrapper with `internalMutation` from `./_generated/server`.
- Preserve `npm run seed:demo` as the approved operator entrypoint; verify the exact Convex CLI syntax after the visibility change and update package/docs if required.
- Add a source-level regression test or lint assertion that `convex/seed.ts` exports no public `query`, `mutation`, or `action`.
- Verify deployment logs before release for unexpected historical `seed:demo` calls.

## Data and migrations

No schema migration. Existing fixtures remain untouched. Rollback is limited to reverting function visibility; never restore public access as an incident workaround.

## Security invariants

- Seed writes exist only inside the Convex internal trust boundary.
- No browser-delivered secret or shared seeding token is introduced.
- Idempotency remains a correctness guard, not an authorization mechanism.

