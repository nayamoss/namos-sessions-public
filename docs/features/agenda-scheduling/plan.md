# Agenda Scheduling Hardening — Implementation Plan

Route: `/events/:eventSlug/program/agenda` · Event organizer only
Requirements: [requirements.md](./requirements.md) · Design: [design.md](./design.md)
Authoritative interface/QA contract: [USER_JOURNEY.md](./USER_JOURNEY.md) — this feature is not
complete until an organizer executes that journey through the running app and the result survives
refresh, event switching, and a new authenticated session.

## Phase 1: Add Session builder + conflict click-through

- [x] T001: Build `AgendaSessionForm` (`src/pages/program/AgendaSessionForm.tsx`) per design.md's
      component spec — submission/standalone toggle, all fields, inline validation.
- [x] T002: Wire `AppLayout`'s `detail` prop on the Agenda page (`Agenda.tsx:565` currently passes
      none) to `addOpen ? addDetail : selectedDetail`, following `Abstracts.tsx`'s exact
      `addOpen`/`DetailPane` pattern.
- [x] T003: Replace the `addSession` stub (`Agenda.tsx:467-489`) with opening `addDetail` in create
      mode.
- [x] T004: Derive `selectedRow` from the existing `?selected=` param (currently unconsumed) and
      render the same `AgendaSessionForm` in edit mode as `selectedDetail` — this closes the dead
      Conflicts-tab click-through described in requirements.md.
- [x] T005: Wire save/cancel: success calls `repo.agenda.save`, `load()`, closes the pane, fires a
      success toast (Phase 2 dependency — stub the toast call now, finish wiring in Phase 2).
      Failure keeps the pane open with entered values and shows the server error inline.

## Phase 2: Drag-and-drop hardening

- [x] T006: Replace `RoomsView`'s `slots` derivation (`Agenda.tsx:910`, currently one row per
      existing session start time) with a fixed 15-minute time axis for the selected day, so every
      `(room, slot)` cell — occupied or not — is a valid `onDrop` target.
- [x] T007: Render session cards as CSS-grid blocks spanning `ceil(duration / 15)` rows instead of
      one row per session.
- [x] T008: Build `AgendaMoveControl` (`src/pages/program/AgendaMoveControl.tsx`) per design.md's
      spec — Move button on every session card (Rooms grid and List view row), popover with
      Room + start-time picker, calls the same `moveSession` function drag's `onDrop` calls.
- [x] T009: Add `aria-live="polite"` announcements for move start/success/failure alongside the
      Move control, satisfying WCAG 2.2 SC 2.5.7.
- [x] T010: Wire `toast.success`/`toast.error` (sonner, already mounted app-wide and unused in
      this file) into `moveSession` (`Agenda.tsx:423-466`), `updateRoom`, `updateTime`, and the
      Phase 1 Add Session save path — one consistent confirmation mechanism.
- [x] T011: Verify `snapToAgendaInterval` (`Agenda.tsx:142-162`) still correctly snaps moves onto
      the new empty-slot grid; add a unit test for boundary cases if not already covered.

## Phase 3: Track collision detection

- [x] T012: Extend `ConflictReason` and `conflictRows` in `convex/agenda.ts` (lines 16-17, 26-34,
      ~44-50) to add `track_overlap`, per design.md's exact diff.
- [x] T013: Widen `AgendaConflict["reason"]` in `src/data/types.ts:121`.
- [x] T014: Add a `track_overlap` branch to `Agenda.tsx`'s `conflictSummary`, worded neutrally
      ("scheduled in the same track at the same time," not "conflict"), and confirm it never
      blocks the Publish action.
- [x] T015: Add a seeded track-overlap example to demo/QA seed data alongside the existing room and
      speaker-overlap seeds; update `USER_JOURNEY.md`'s seed-data line.

## Phase 4: Toolbar cleanup

- [x] T016: Remove the decorative Saved Views and Columns buttons (`Agenda.tsx:617-621`).
- [x] T017: Wire Sort (`Agenda.tsx:624-626`) to a `sortKey` state (Time/Title/Room) narrowing
      `visibleItems` client-side before render.
- [x] T018: Wire Filter (`Agenda.tsx:627-629`) to Room/Track/Published-state filters over the
      already-loaded dataset, same pattern as the existing search `query`.
- [x] T019: Replace the empty `MoreHorizontal` button (`Agenda.tsx:632-635`) with a `DropdownMenu`
      exposing Export as CSV, Export as PDF, Print schedule, and Duplicate day — per design.md's
      `AgendaExportMenu` spec, using the already-installed `papaparse`/`jspdf` dependencies.

## Phase 5: Frontend UI (REQUIRED — do not skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI. This phase is where Phases
> 1-4's components actually get placed, and where the full click-through happens.

### UI Spec

**Agenda toolbar** (`Agenda.tsx`, existing `AppLayout` header)
- Location: Program > Agenda, header row (search left, actions right) — unchanged structure, per
  the page-header/toolbar-row layout rule (no buttons in the H1 header row itself; this toolbar
  already lives below it via `AppLayout`'s `utilities`/`primaryAction` slots).
- Elements: Search input (existing) · Publish schedule button (existing) · Sort button → opens a
  small dropdown with Time/Title/Room radio options · Filter button → opens a popover with Room
  checkboxes, Track checkboxes, Published/Draft toggle · overflow "More" button → `DropdownMenu`
  with Export as CSV / Export as PDF / Print schedule / Duplicate day… · **+ Add Session** button
  (existing, now opens the real builder instead of the stub).
- Behavior: Sort/Filter apply instantly to the loaded dataset, no fetch, no loading spinner needed
  beyond the initial `load()`. Duplicate day opens in the existing `DetailPane` (not a page
  navigation or overlay) with
  source-day and target-day `<Select>`s and a Confirm button.
- Loading/error/empty states: unchanged from existing toolbar (Publish button's existing
  "Publishing…" disabled state is the model to match for any new async action here).

**Add Session / Session detail pane** (`AgendaSessionForm` inside `DetailPane`)
- Location: right-side flex-sibling panel (never `position: fixed`), pushes List view content
  left, matches `Abstracts.tsx`'s existing `DetailPane` usage exactly.
- Elements: segmented control (From submission / Standalone, create mode only) · submission
  `<Select>` · Title `<Input>` · Speakers multi-select · Track `<Select>` · Room `<Select>` ·
  Date `<Input type="date">` · Start/End `TimeInput` · Published `<Switch>` · inline per-field
  error text · top-of-pane error banner (server failures) · Save button (spinner + "Saving…"
  while in flight) · Cancel button.
- Behavior: see design.md's `AgendaSessionForm` spec verbatim — submission selection locks
  Speakers/Title/Track, deselecting unlocks; validation blocks Save with entered values intact;
  successful save closes the pane, refreshes the list, and fires a toast.

**Rooms grid** (`RoomsView`)
- Location: Program > Agenda > Rooms tab, existing route.
- Elements: day selector (new — matches Day view's) · fixed 15-minute-row × room-column grid ·
  session cards spanning rows by duration · a "Move" button visible on every card (not hover-only)
  · empty-slot cells are visually distinct-but-subtle drop targets (background hover state on
  `onDragOver`, no visible border per the no-borders rule — use a soft background tint instead).
- Behavior: drag from any card to any cell (occupied or empty) triggers the same `moveSession`
  path as the new keyboard Move control; a successful move shows a toast and the card animates to
  its new position; a failed move visibly snaps back with an error toast.
- Loading state: grid shows existing skeleton/loading pattern already used elsewhere in Agenda
  while `load()` is in flight.
- Empty state: unchanged existing "no rooms configured" state.

**AgendaMoveControl popover**
- Location: anchored to the triggering session card, in both Rooms grid and List view row.
- Elements: Room `<Select>`, Start time `<TimeInput>`, Confirm button, Cancel button, inline error
  text on failure.
- Behavior: keyboard-activatable (Enter/Space on the trigger), touch-activatable (tap), calls
  `moveSession` — identical optimistic-update/rollback behavior as drag.

### Tasks
- [x] T020: Place `AgendaSessionForm` and `AgendaMoveControl` into the Agenda page exactly per the
      UI Spec above (locations, elements, behaviors) — no ad-libbing omitted states.
- [x] T021: Wire every new control to its Phase 1-4 backing logic; confirm no control is
      decorative when this phase is done (zero dead buttons remaining in the toolbar).
- [ ] T022: Verify the full user flow end-to-end in a real browser: create a session, drag it,
      move it by keyboard, resolve a room/speaker/track conflict via the now-working
      click-through, export/print/duplicate a day, publish, and refresh — every step in
      [USER_JOURNEY.md](./USER_JOURNEY.md).

## Phase 6: Test coverage + docs sync

- [x] T023: Extend `src/test/agenda-conflicts.test.ts` with `track_overlap` cases (same-track
      overlap, same-track no-overlap, different-track overlap, missing `trackId` on either side).
- [ ] T024: Add a test covering `moveSession`'s optimistic-then-rollback sequence against a mocked
      repo — this is a direct regression guard for the "move didn't persist" failure recorded in a
      prior `test-artifacts/` browser-QA report.
- [x] T025: Add validation + submission-prefill tests for `AgendaSessionForm`.
- [ ] T026: Run the full manual/agent-driven browser walkthrough of `USER_JOURNEY.md` (per the
      confirmed no-new-E2E-framework decision), record findings in `docs/features/INDEX.md`'s
      Agenda row with the verification date.
- [x] T027: Update `docs/CONTEXT.md`'s D10 note ("no drag-and-drop") to reflect that DnD was
      hardened, not avoided.

## Task Dependencies

Phase 1 (Add Session) and Phase 2 (drag hardening) can proceed in parallel — they touch different
parts of `Agenda.tsx` (detail pane vs. Rooms grid) and only share the `toast` wiring in T005/T010.
Phase 3 (track conflicts) is independent and can start anytime. Phase 4 (toolbar) depends on
nothing else finishing but its Export/Duplicate actions read from the same `items` Phase 1-2
already load, so sequence it after at minimum Phase 1 lands to avoid rebasing conflicts in
`Agenda.tsx`. Phase 5 depends on Phases 1-4 all being in place — it's where they get placed and
click-through-verified together. Phase 6 depends on Phases 1-5 (tests target the finished
behavior; the walkthrough exercises the finished UI).

## Verification Checklist

- [ ] All acceptance criteria in requirements.md met
- [ ] Feature is accessible and usable in the UI, not just implemented in the backend
- [ ] Add Session opens a real pane; clicking a Conflicts-tab session opens its editable record
- [ ] Dragging to an **empty** slot succeeds and snaps to 15 minutes
- [ ] Keyboard and touch users can move a session via `AgendaMoveControl` and reach the same result
      as drag, with `aria-live` announcements
- [ ] A visible saved confirmation appears after create, edit, and move; a distinct one on rollback
- [ ] Creating a track overlap surfaces in Conflicts immediately, worded informationally, and does
      not block Publish; resolving it clears only that entry
- [ ] Sort and Filter act on the toolbar without a refetch
- [ ] Export CSV/PDF, Print, and Duplicate day all work from the "More" menu
- [ ] Times render identically regardless of browser timezone
- [ ] Tab switching stays client-side, <200ms
- [ ] Execute every step in [USER_JOURNEY.md](./USER_JOURNEY.md) through an organizer-authenticated
      browser, including refresh, event-switch isolation, and logout/login persistence
- [ ] No regressions introduced (existing List/Day/Week/Track views, existing room/speaker
      conflict detection, existing publish flow)
- [ ] Docs updated: INDEX.md Agenda row, CONTEXT.md D10, USER_JOURNEY.md's gap section

## Cut line

Keep: List, Day, Week, Track, Rooms, Conflicts, the Add Session builder, the hardened drag/move
journey (mouse drag + keyboard/touch Move control), track/room/speaker/availability conflict
detection, minimal Sort/Filter, and the three "More" menu actions (Export CSV/PDF, Print,
Duplicate day).

Droppable: Month view, `capacity` conflict class, Saved Views as a real feature, Columns
customization, resize handles, free-form pixel positioning, `@dnd-kit` adoption, and a new
project-wide E2E framework.
