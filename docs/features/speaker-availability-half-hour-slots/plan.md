# Speaker Availability — Half-Hour Slots — Implementation Plan

## Phase 1: Data Model & Backend Validation
- [ ] T001: Add `minute?: 0 | 30` to `AvailabilitySlot` in `src/data/types.ts` with a doc
      comment explaining legacy hour-only records mean "both halves blocked."
- [ ] T002: Update the `unavailable` arg validator and `validateSlots()` in
      `convex/availability.ts` to accept and validate `minute` (must be `0`/`30`, must not
      appear without `hour`).
- [ ] T003: Mirror the same validator + validation rule in `convex/publicForms.ts` (CFP
      submission's `availability.unavailable` shape), including the dedup-key update so
      half-hour slots dedupe correctly against each other and against legacy hour-only slots.
- [ ] T004: Update `unavailableSlotKeys()` in `convex/agenda.ts` to emit half-hour buckets
      (`${date}:hour:${hour}:${minute}`) instead of whole-hour buckets, and update both
      conflict-lookup call sites to check the half-hour key when `entry.minute` is present, or
      both halves when it's a legacy hour-only entry.

## Phase 2: Pure Logic — `speaker-availability.ts`
- [ ] T005: Add `minute?: 0 | 30` to `DayPartUnavailability`.
- [ ] T006: Update `isSpeakerAvailableByDayPart()`'s `blockedHours` keying to half-hour
      granularity, with the legacy-hour-blocks-both-halves fallback.
- [ ] T007: Add/extend unit tests in `src/test/speaker-availability.test.ts` covering: a
      half-hour-only block does not conflict with a session in the other half; a legacy
      hour-only block still conflicts with a session in either half; a session spanning an hour
      boundary only conflicts with the specific half-hours it actually overlaps.

## Phase 3: Frontend — Availability Grid

### UI Spec (required — be explicit about every element)

**Component:** `AvailabilityEditor` — `src/components/availability/AvailabilityEditor.tsx`
(used by both `src/pages/program/Availability.tsx` — organizer-facing Program > Availability
page — and `src/pages/portal/PortalAvailability.tsx` — speaker portal — plus the public CFP
submission form's availability step).

- **Location:** unchanged — same grid, same pages. No new entry point.
- **Elements:**
  - Month label + timezone label (unchanged)
  - "Conference time" / "Your time" toggle button group (unchanged)
  - "Reset" button, shown only when something is blocked (unchanged)
  - Month prev/next chevrons, shown only when the event spans >1 month (unchanged)
  - **Grid — CHANGED:** 48 rows instead of 24, two per conference hour (`:00` then `:30`),
    covering the same 7am–9pm conference-hours window as today
  - Each row's time-column label: e.g. "7 AM", "7:30 AM", "8 AM", "8:30 AM" — half-hour rows
    show minutes, on-the-hour rows keep the current no-minutes format
  - Each day column: unchanged "Block day" header button that blocks/clears the whole day
    (now toggling all 48 half-hour cells for that day, not 24 hourly cells)
  - Each grid cell: unchanged unavailable/available toggle button (red-tinted with an X icon
    when blocked, muted when available), same click-to-toggle and click-drag-to-paint behavior
  - Notes textarea below the grid: unchanged
- **Behavior:**
  - Click a cell: toggles that single half-hour slot (was: single hour)
  - Click-and-drag across cells: paints the same block/clear state across every cell dragged
    over, at half-hour resolution now
  - Click "Block day": blocks/clears all 48 half-hour cells in that day's column
  - A legacy hour-only record (from before this change) renders BOTH the `:00` and `:30` row
    for that hour as blocked when the grid first loads; toggling just one of the two rows
    splits it into explicit half-hour entries on save (the other half stays blocked as its own
    explicit entry)
  - Conference-time / local-time toggle: unchanged, still recomputes displayed hour+minute
    labels per row when switching to "Your time"
- **Data:** reads/writes `AvailabilityDraft.unavailable: AvailabilitySlot[]` via the existing
  `value`/`onChange` controlled-component props — no new props, no new API calls added at the
  component level (parents already call the `upsert` mutation on save).
- **Loading state:** unchanged (parent pages already handle their own loading skeletons before
  rendering `AvailabilityEditor`).
- **Empty state:** unchanged ("No event hours are available." — `DataGrid`'s existing `empty`
  prop, shown only if the event has zero conference-hours dates).
- **Error state:** unchanged — Convex mutation errors from `upsert`/CFP submission surface
  through the parent page's existing save-error handling; add the new
  "Availability minutes must be 0 or 30." / "A minute requires an hour." messages as thrown
  `Error`s from the shared validator (Phase 1, T002/T003) so they display the same way existing
  validation errors do.

### Tasks
- [ ] T008: Build the 48-row grid in `AvailabilityEditor.tsx` per the UI Spec above —
      `halfHours` row source, minute-aware `slotKey`/`exactSlots`/`setSlot`/`toggle`/
      `toggleDay`/`hourLabel`/`eventSlotEpoch`/`displayHour`.
- [ ] T009: Verify `src/pages/program/Availability.tsx` and
      `src/pages/portal/PortalAvailability.tsx` need no structural changes (they pass
      `Availability` records through unchanged) — patch only if slot construction/defaults are
      found to live in either file during implementation.
- [ ] T010: Find and update the public CFP/speaker submission form's availability step
      (wherever it renders `AvailabilityEditor` or an equivalent) so it submits the same
      `minute`-aware shape validated in T003.
- [ ] T011: Update/extend `src/test/availability-editor.test.tsx` for: 48 rows render, clicking
      a `:30` cell blocks only that half, "Block day" blocks all 48 cells, a legacy hour-only
      fixture renders both halves of its hour as blocked.
- [ ] T012: Verify the full flow end-to-end in a real browser: open Program > Availability for
      an event, block a single half-hour, confirm only that cell shows blocked; reload and
      confirm it persisted; block a full day via "Block day" and confirm all 48 cells per day
      toggle; open an existing speaker's availability that predates this change (or seed one
      with an hour-only record) and confirm both halves render blocked.

## Task Dependencies
- T002/T003 (backend validation) block T008 (frontend can't safely round-trip `minute` until
  the mutation accepts it).
- T004 (agenda conflict keys) can proceed in parallel with T005–T007 (pure `speaker-availability.ts`
  logic) — different files, same underlying half-hour-key concept, no shared code.
- T008 depends on T001 (type) and should land before T011 (tests target the new grid shape).
- T010 (public form) depends on T003 (backend accepts the shape) and can reuse whatever
  `AvailabilityEditor` changes T008 made if the public form renders the same component.

## Verification Checklist
- [ ] All acceptance criteria in `requirements.md` met
- [ ] Feature is accessible and usable in the UI (Program > Availability, Portal > Availability,
      and the public CFP submission form's availability step)
- [ ] Legacy hour-only availability records still block correctly (both halves) — no existing
      speaker's stated unavailability silently narrows
- [ ] Agenda placement conflict check respects half-hour blocks, verified with a session placed
      in the free half of a partially-blocked hour
- [ ] `npm test` (or the project's test command) passes, including new/updated tests in
      `speaker-availability.test.ts` and `availability-editor.test.tsx`
- [ ] No regressions introduced elsewhere in Program > Availability or Portal > Availability
- [ ] Docs updated if needed (this folder)
