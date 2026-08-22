# Speaker Availability — Half-Hour Slots — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-22

## Problem Statement
The speaker availability grid (Program > Availability, and the matching public CFP submission
form field) only lets a speaker block off whole hours. A speaker who is unavailable 2:00–2:30pm
but free the rest of the hour has to block the entire 2:00–3:00 hour, which then makes the
scheduler treat them as unavailable for sessions that would have fit in the free half. Naya
flagged this directly from `https://your-project.example/events/example-conference-fixture/program/availability`
— "there are not 15-30mins intervals only hrly."

Scoped to **30-minute** granularity (not 15) per Naya's direction — halves the current block size
without doubling grid density past what's usable in the existing UI.

## User Stories
**As a** speaker filling out my availability **I want to** block off just the half-hour I'm
unavailable **so that** the organizer/scheduler can still place a session in the other half of
that hour.

**As an** organizer scheduling sessions **I want to** the auto-placement conflict check to
respect half-hour blocks **so that** I don't get a false "speaker unavailable" conflict for a
session that only overlaps the free half of an hour a speaker partially blocked.

**Acceptance Criteria:**
- GIVEN a speaker on the Availability grid WHEN they click a half-hour cell THEN only that
  30-minute slot toggles unavailable, not the full hour.
- GIVEN a speaker's existing availability record with hour-only slots (created before this
  change) WHEN it's loaded in the new grid THEN both halves of that hour render as blocked
  (no silent data loss / no silent availability change).
- GIVEN a session placement check (agenda scheduling / conflict detection) WHEN a session
  overlaps only the free half of a partially-blocked hour THEN it is NOT reported as a
  speaker-availability conflict.
- GIVEN the public CFP/speaker submission form's availability step WHEN a speaker submits
  half-hour selections THEN the same validation and storage rules as the organizer-side editor
  apply (shared slot shape).

## Functional Requirements
- FR-001: `AvailabilitySlot` gains an optional `minute` field constrained to `0 | 30`. `hour`
  remains required alongside it (a slot is always `{ date, hour, minute }` for new records, or
  legacy `{ date, hour }` / `{ date, part }` for old ones).
- FR-002: Convex validation (`convex/availability.ts`, `convex/publicForms.ts`) rejects any
  `minute` value other than `0` or `30`, and rejects `minute` without `hour`.
- FR-003: `AvailabilityEditor` renders 2 rows per conference hour (`:00` and `:30`) instead of 1,
  keeps the existing paint/drag-to-block interaction, day-header "Block day" toggle, and
  conference-time/local-time view toggle working at half-hour resolution.
- FR-004: Legacy hour-only slots (`{ date, hour }`, no `minute`) continue to display and behave
  as "both halves of this hour are blocked" — never migrated destructively, never dropped.
- FR-005: `convex/agenda.ts`'s conflict-key generation (`unavailableSlotKeys`) is updated to key
  by half-hour instead of by hour, so a session's actual start/end (which may already be
  half-hour aligned) is checked against the correct half.

## Non-Functional Requirements
- NFR-001: No destructive migration — existing `speaker_availability` rows are read as-is;
  half-hour semantics are purely additive interpretation in code, not a backfill.
- NFR-002: Grid must stay usable at 48 rows (2x current 24) — reuse the existing `DataGrid`
  virtualization/scroll behavior, no new dependency.

## Out of Scope
- 15-minute granularity (explicitly deferred by Naya).
- Migrating/rewriting existing hour-only or day-part records in the database.
- Changing the attendee-facing session/agenda display granularity (this only affects the
  speaker-unavailability input, not how session times are shown elsewhere).

## Success Metrics
- Speakers can block a single 30-minute slot without blocking the adjacent half.
- Agenda placement/conflict logic never regresses on the existing hourly test cases
  (`src/test/speaker-availability.test.ts`, `src/test/availability-editor.test.tsx`).
