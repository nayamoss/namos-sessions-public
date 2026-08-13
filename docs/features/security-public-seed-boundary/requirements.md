# Public Demo Seeder Boundary — Requirements

**Type:** Security  
**Status:** Planned  
**Priority:** High  
**Audit finding:** SEC-WEB-001

## Problem

`convex/seed.ts` exports `seed:demo` as a public Convex mutation. It performs privileged bulk writes without authentication or authorization.

## Requirements

- FR-001: The seeder must not be callable through the public Convex API.
- FR-002: Maintainers must retain a documented, repeatable CLI/deployment seeding workflow.
- FR-003: Seeding must remain idempotent and preserve stable fixture totals.
- FR-004: Production must reject unauthenticated and ordinary authenticated attempts to invoke the seeder.
- NFR-001: Do not weaken authorization on any adjacent function.
- NFR-002: Add a regression check that detects future public seed exports.

## Out of scope

- Redesigning fixture content.
- Adding an organizer-facing reset button.

## Success criteria

- `seed:demo` is internal-only and the CLI workflow succeeds three times with stable totals.
- A public Convex client cannot resolve or invoke the function.

