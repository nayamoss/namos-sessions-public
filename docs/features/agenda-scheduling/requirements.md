# Agenda Scheduling Hardening — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-12

## Problem Statement

Agenda & Scheduling (Program > Agenda, Written Brief #5) has real shipped functionality — six
schedule views, server-side conflict detection, and basic drag-and-drop — but is not yet a
production-quality scheduling tool. Verified gaps in the running app:

- "Add Session" hardcodes an `"Untitled session"` at 09:00 in the first room instead of opening a
  real builder pane (`Agenda.tsx:467-489`).
- Clicking a session from the Conflicts tab sets a `?selected=` URL param that nothing consumes —
  a dead click, not a resolution path (`Agenda.tsx:237-247`, no `detail` prop passed to
  `AppLayout` at line 565).
- Rooms-grid drag-and-drop only targets **existing session start-time rows**
  (`slots` derived from `items`, `Agenda.tsx:910`), so organizers cannot drop a session onto a
  genuinely empty 15-minute slot.
- No keyboard-operable or touch-operable equivalent to drag exists — a WCAG 2.2 SC 2.5.7
  violation (dragging movements must have a non-drag alternative).
- No visible "saved" confirmation after a successful move.
- Conflict detection (`convex/agenda.ts: conflictRows`) covers `room_overlap` and
  `speaker_overlap` only — no `track_overlap` despite `agenda_items.trackId` already existing on
  the schema.
- Toolbar buttons Saved Views, Columns, Sort, Filter, and the overflow "More" menu render with no
  `onClick` at all (`Agenda.tsx:616-635`) — fully decorative.
- No automated test covers move → persist → refresh, rollback on failed save, or the full
  conflict create/resolve cycle; no organizer-authenticated browser walkthrough evidence exists
  for the hardened journey.

This matters because the shipped feature demos well but isn't trustworthy for a real organizer
building a live conference schedule — a stub "Add Session," a dead conflict-resolution link, and
drag that only half-works are the kind of gaps that surface in front of a judge or a paying
customer, not in code review.

## User Stories

**As an** event organizer **I want to** create a real session with an accepted submission or as a
standalone break/keynote **so that** I don't have to hand-edit a generic "Untitled session" record
after the fact.

**Acceptance Criteria:**
- GIVEN I click "Add Session" WHEN I choose an accepted submission THEN title, speakers, and track
  are pre-filled and still editable before I save.
- GIVEN I click "Add Session" WHEN I choose "Standalone" THEN I can enter a title, speakers, track,
  room, date, and time manually with no linked submission.
- GIVEN I submit the form with a missing title or an end time before the start time WHEN I click
  Save THEN inline validation blocks the save and my entered values remain in the pane.

**As an** event organizer **I want to** drag a session onto any empty time slot in the Rooms grid,
or move it with a keyboard or on a touch device **so that** I can actually rearrange the schedule
visually regardless of input device.

**Acceptance Criteria:**
- GIVEN the Rooms view WHEN I drag a session onto a room/time cell with no existing session THEN
  the drop succeeds and the session persists at the new room/time.
- GIVEN I am using only a keyboard WHEN I focus a session card and activate its Move control THEN
  I can choose a new room and time and the move completes identically to a drag.
- GIVEN a move fails to persist WHEN the server rejects it THEN the session visibly reverts to its
  original room/time and an error is shown, distinct from the success confirmation shown on a
  completed move.

**As an** event organizer **I want to** see when two sessions in the same track overlap **so that**
I'm aware of parallel-track scheduling, without being blocked from publishing intentional parallel
programming.

**Acceptance Criteria:**
- GIVEN two sessions share a track and overlapping times WHEN I open Conflicts THEN a
  "Track overlap" entry appears, worded neutrally (not as an error), and does not block Publish.

**As an** event organizer **I want to** click a session referenced in a Conflicts entry **so that**
I land directly on its editable record instead of a dead click.

**Acceptance Criteria:**
- GIVEN a conflict entry names two sessions WHEN I click one THEN its detail pane opens with the
  current room/time/speakers pre-filled and editable.

## Functional Requirements

- FR-001: Replace the Add Session stub with a `DetailPane`-mounted builder supporting
  submission-linked and standalone entry, mirroring `Abstracts.tsx`'s `addOpen`/`DetailPane`
  pattern.
- FR-002: Wire the existing but unconsumed `?selected=` param to open the same builder in edit
  mode, closing the dead Conflicts-tab click-through.
- FR-003: Replace the Rooms grid's session-start-time-derived row set with a fixed 15-minute time
  axis (scoped to a selected day) so every `(room, slot)` cell is a valid drop target.
- FR-004: Add a keyboard- and touch-operable "Move" control per session card that opens a
  room + time picker and calls the same move path as drag, satisfying WCAG 2.2 SC 2.5.7.
- FR-005: Add a visible success confirmation (toast) on successful create, edit, and move; a
  visually distinct confirmation/error on rollback.
- FR-006: Add a `track_overlap` conflict class to `convex/agenda.ts: conflictRows`, surfaced in
  the Conflicts tab with neutral (non-error) wording, and never blocking Publish.
- FR-007: Implement minimal real Sort (Time/Title/Room) and Filter (Room/Track/Published state)
  on the toolbar, operating on the already-loaded dataset with no new fetch.
- FR-008: Remove the decorative Saved Views and Columns toolbar buttons.
- FR-009: Implement the "More" overflow menu with three real actions: export schedule
  (CSV/PDF), print schedule, and duplicate day / copy sessions to another day.
- FR-010: Add automated test coverage for move → persist → refresh, rollback-on-failure, and
  `track_overlap` detection; record a manual organizer-authenticated browser walkthrough of the
  full journey per `USER_JOURNEY.md`.

## Non-Functional Requirements

- NFR-001: View tabs remain client-side renderings of one fetched dataset — Sort/Filter/Export
  must not introduce a per-action network fetch.
- NFR-002: Drag/move interactions satisfy WCAG 2.2 SC 2.5.7 (non-drag alternative required) with
  ARIA live-region announcements of move start/success/failure for screen reader users.
- NFR-003: All time math (slot generation, snapping, validation) goes through
  `src/lib/event-time.ts` and `event.timezone` — never raw browser-local `Date` math.

## Out of Scope

- ~~Month view (not shipped, not requested).~~ Superseded: Month view shipped and is live in the
  view tabs (`Agenda.tsx`, `AgendaView`). See `AUDIT-2026-08-16.md`.
- `capacity` conflict class (attendance vs. room capacity — no capacity field currently modeled).
- Saved Views as a real per-user feature (no saved-view infrastructure exists anywhere in this
  app; a dedicated future feature if requested).
- Resize handles / free-form pixel positioning on drag (Cut line already excludes this).
- Replacing native HTML5 drag with `@dnd-kit` (explicit decision: native + Move control).
- Introducing a project-wide E2E framework (Playwright/Cypress) — this plan follows the existing
  manual/agent-driven browser-walkthrough convention already used across `docs/features/INDEX.md`.

## Success Metrics

- Every step of `USER_JOURNEY.md` passes in an organizer-authenticated browser, including
  refresh, event-switch, and logout/login persistence.
- Zero decorative (non-functional) buttons remain in the Agenda toolbar.
- `track_overlap` is detected and displayed without blocking Publish.
- New vitest coverage for move/rollback/track-overlap passes in `npm run test`.
