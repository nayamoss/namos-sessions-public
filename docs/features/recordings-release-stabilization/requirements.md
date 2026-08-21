# Recordings Release Stabilization — Requirements

**Type:** Fix
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement

The active Recordings Manager implementation has substantial working product code, but it is not
releaseable while the full suite reports ten failures across reactive normalization, public embed
projection, layout/agent contracts, and component-canon rules. The existing recordings package is
the source of truth; this issue closes it without adding provider sync, transcripts, or editing.

## Functional Requirements

- FR-001: Reconcile every current failure against `docs/features/recordings-manager/` and fix the
  implementation or update a genuinely superseded test contract with an explicit rationale.
- FR-002: Preserve the active published recording until a replacement is successfully promoted.
- FR-003: Project only active, published, available recordings to attendee and embed surfaces.
- FR-004: Complete legacy `agenda_items.videoUrl` migration idempotently without deleting source
  values until production counts are verified.
- FR-005: Keep all event IDs, storage IDs, assets, and recording mutations tenant-scoped.
- FR-006: Finish readiness/activity integration and exact deep links into the manager.
- FR-007: Keep the page header identity-only; controls remain in the toolbar/body, with styled app
  dropdowns and contextual video icons.

## Out of Scope

- Transcoding, captions, transcripts, chapters, analytics, paywalls, and provider ingestion.
- Unrelated dashboard or settings redesign.

## Success Metrics

- `npm run check`, lint, component-canon guards, and all TypeScript targets pass from one SHA.
- The full recordings journey passes at 1280px, 390px, keyboard-only, light, and dark modes.
- Deployment proof records the exact SHA, migration counts, and release totals.
