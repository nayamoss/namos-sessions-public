# Agenda Scheduling Hardening — Technical Design

## Reuse check (searched before designing anything new)

Per house rule, searched Naya's own prior projects for reusable scheduling code before designing
from scratch:

- **`/Users/nieoln/GitHub/sites/01-active-projects/servicehq-main/servicehq/src/pages/Schedule.tsx`**
  — a day-column × employee-row grid (`grid grid-cols-8`) with `onDragOver`/`onDrop` on each day
  cell and a click-to-add pattern. Cells are day-sized containers holding stacked shift cards, not
  a proportional time-slot grid — so it does **not** solve the "empty 15-minute slot as a drop
  target" problem Namos Sessions has (neither app has built true time-proportional geometry
  before). Reusable: the `onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(...)}`
  cell pattern itself, which Namos Sessions' `RoomsView` already uses in the same shape.
- **`/Users/nieoln/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/Schedule.tsx`**
  — directly reusable patterns, adapted (not copied verbatim, different domain — shifts/employees
  vs. sessions/rooms):
  - `shiftsOverlap` + a `publishConflicts` `useMemo` that dedups overlapping pairs via a
    `Set<string>` of sorted `"idA:idB"` keys (`Schedule.tsx:315-329`) — the same dedup shape
    `conflictRows` in `convex/agenda.ts` already uses for `room_overlap`/`speaker_overlap`; extend
    it identically for `track_overlap` rather than inventing a new dedup strategy.
  - `useToast()` fired on every save/delete/publish outcome, including failure with
    `variant: 'destructive'` (`Schedule.tsx:442-664`) — this is exactly the visible
    confirmation/rollback pattern FR-005 requires. Namos Sessions already has `sonner` mounted and
    unused (`src/App.tsx`); use `toast.success(...)` / `toast.error(...)` the same way Clockwork
    uses its toast hook for the same event types (created/updated/deleted/published/error).
  - `draggable={isManager}` gating drag by permission (`Schedule.tsx:858`) — same shape as
    gating Agenda's Move control by organizer role, if a future non-organizer view is added.
- Neither app has a keyboard- or touch-accessible move control — that part of this design has no
  prior-project precedent and is new.

## Database / Schema Changes

### Current Schema (affected tables)

```ts
// convex/schema.ts:250
agenda_items: defineTable({
  eventId: v.id("events"),
  submissionId: v.optional(v.id("submissions")),
  title: v.string(),
  roomId: v.id("rooms"),
  trackId: v.optional(v.id("tracks")),
  startTime: v.number(),
  endTime: v.number(),
  speakerIds: v.array(v.id("speakers")),
  isPublished: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
  .index("by_room", ["roomId"])
  .index("by_submission", ["submissionId"]),
```

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|---------------|------|-------|
| agenda_items | none | — | — | `trackId` already exists; `track_overlap` is computed, never stored |

### Migration

None required. Conflicts (including the new `track_overlap`) are derived at query time by
`conflictRows` in `convex/agenda.ts` — a stored field would go stale on every edit, which is why
the existing three classes are already computed-not-stored.

---

## Backend / API

### Affected Existing Endpoints

| Method | Path (Convex function) | Change |
|--------|--------------------------|--------|
| query | `agenda:detectConflicts` | Add `track_overlap` to the returned reason set (via `conflictRows`) |
| mutation | `agenda:save` | No signature change — already accepts optional `id`, `submissionId`, `trackId` |

### New Endpoints

None. `AgendaRepo` (`src/data/repo.ts:431-436`) already exposes `list`, `detectConflicts`, `save`,
`publishSchedule` — sufficient for the Add Session builder, Move control, and Filter/Sort (all
client-side over the same fetched dataset). Export/print/duplicate-day (FR-009) are client-side
transforms of already-loaded data — no new backend endpoint.

### Validation & Business Logic

`convex/agenda.ts: save` (existing) already validates: room/track belong to the event, speakers
belong to the event, `startTime < endTime`. The Add Session builder mirrors these checks
client-side before submit so errors are shown inline instead of after a round trip; server
validation remains the source of truth.

`conflictRows` change (the only backend logic change in this plan):

```ts
// convex/agenda.ts:16-17 — widen the reason union
type ConflictReason =
  "room_overlap" | "speaker_overlap" | "speaker_unavailable" | "track_overlap";

// convex/agenda.ts:26-34 — widen the generic constraint conflictRows<T> accepts
function conflictRows<
  T extends {
    _id: unknown;
    roomId: unknown;
    trackId: unknown;          // NEW
    speakerIds: unknown[];
    startTime: number;
    endTime: number;
  },
>(items: T[]) { /* ... */ }

// inside the existing nested loop, alongside the room_overlap push (agenda.ts:~44-50):
if (
  first.trackId !== undefined &&
  second.trackId !== undefined &&
  first.trackId === second.trackId
) {
  conflicts.push({ itemA: first._id, itemB: second._id, reason: "track_overlap" });
}
```

No change needed to the dedup shape — `conflictRows` already returns one row per pair per reason,
matching Clockwork's `Set<"idA:idB">` dedup pattern by construction (the outer double loop already
visits each pair once).

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/pages/program/Agenda.tsx` | Pass `detail={addOpen ? addDetail : selectedDetail}` to `<AppLayout>` (currently no `detail` prop, line 565); replace `addSession` stub (467-489) with pane-open handler; wire `selectedRow` from `?selected=` (currently unconsumed); replace `RoomsView`'s `slots` derivation (910) with a fixed 15-minute axis; add Move control to session cards (985-1002); add `toast.success`/`toast.error` calls in `moveSession` (423-466), `updateRoom`, `updateTime`; add `sortKey`/`filter` state feeding `visibleItems`; remove Saved Views/Columns buttons (617-621); wire Sort/Filter buttons (624-630) to real state; wire the More menu (632-635) to a dropdown with Export/Print/Duplicate day. |
| `convex/agenda.ts` | `conflictRows` + `ConflictReason` change described above (16-17, 26-34, ~44-50). |
| `src/data/types.ts` | Widen `AgendaConflict["reason"]` union (line 121) to add `"track_overlap"`. |

### New Components

**AgendaSessionForm**
- File: `src/pages/program/AgendaSessionForm.tsx`
- Props: `{ event: EventSummary, rooms: Room[], tracks: Track[], speakers: Speaker[], submissions: Submission[], initial?: AgendaItem (edit mode), onSave: (draft) => Promise<void>, onCancel: () => void }`
- Location: Rendered inside a `<DetailPane>` mounted via `AppLayout`'s `detail` prop on the Agenda
  page — appears as a right-side panel, List view stays visible to its left (per the flex-sibling
  detail-panel layout rule, never `position: fixed`).
- Elements:
  - Segmented control: "From submission" / "Standalone" (only shown in create mode; edit mode
    skips straight to the field form)
  - Submission `<Select>` (create + "From submission" mode only) — populated from accepted
    submissions for the event
  - Title `<Input>` (required)
  - Speakers multi-select (locked/read-only when a submission is selected, editable otherwise)
  - Track `<Select>` (optional)
  - Room `<Select>` (required)
  - Date `<Input type="date">` constrained to the event's day range
  - Start time / End time (reuse existing `TimeInput`, `Agenda.tsx:163-188`)
  - Published/draft `<Switch>`
  - Inline field-level error text under each invalid field
  - Save button (label "Create session" / "Save session" depending on mode), Cancel button
  - Empty state: N/A (form always has fields)
  - Loading state: Save button shows a spinner + "Saving…" while the mutation is in flight
  - Error state: a banner at the top of the pane showing the server error message on save failure,
    entered values preserved
- Behavior: selecting a submission pre-fills and locks Title/Speakers/Track (still overridable by
  switching back to editable fields is NOT supported — locked fields stay locked while a
  submission is selected; deselecting the submission clears the lock). Save validates client-side
  first; on success calls `onSave`, which the parent uses to call `repo.agenda.save`, `load()`,
  close the pane, and fire a success toast. On failure, pane stays open with entered values and
  shows the server's error message.
- Third-party: none new — built from existing shadcn `Select`, `Input`, `Switch` primitives already
  used elsewhere in this codebase.

**AgendaMoveControl**
- File: `src/pages/program/AgendaMoveControl.tsx`
- Props: `{ session: AgendaItem, rooms: Room[], onMove: (roomId, startTime) => Promise<void>, onClose: () => void }`
- Location: A small popover/inline panel anchored to a session card in the Rooms grid (and,
  reused, a "Move" action on the List view row for parity).
- Elements:
  - Trigger: a "Move" button visible on every session card (not just on hover — must be reachable
    by keyboard focus and by touch, so it cannot be hover-only)
  - Popover content: Room `<Select>`, Start time `<TimeInput>` (End time derives from the
    session's existing duration, preserved across the move)
  - Confirm button, Cancel button
  - Loading state: Confirm button shows "Moving…" while in flight
  - Error state: inline error text in the popover if the move fails, popover stays open with the
    entered values so the organizer can retry without re-entering them
- Behavior: Enter/Space activates the trigger (keyboard), tap activates it (touch). Calls the same
  `moveSession` function drag's `onDrop` handler calls — one code path for drag, keyboard, and
  touch moves, so optimistic-update and rollback behavior (already implemented in `moveSession`,
  `Agenda.tsx:423-466`) is shared automatically.
- Accessibility: `aria-label` on the trigger describes the session's current room/time
  ("Move: {title}, currently {room} at {time}"); an `aria-live="polite"` region announces move
  start/success/failure so screen reader users get the same feedback sighted users get from the
  toast (WCAG 2.2 SC 2.5.7 requires this non-drag path to exist, not just be present in markup).
- Third-party: none new.

**AgendaExportMenu** (folds into the existing overflow-menu button, not a separate visible trigger)
- File: co-located in `Agenda.tsx` or a small `AgendaToolbarMenu.tsx` if it grows past ~40 lines
- Props: `{ items: AgendaItem[], rooms: Room[], tracks: Track[], timeZone: string }`
- Location: replaces the current empty `MoreHorizontal` button's click target with a
  `DropdownMenu` (existing Radix primitive already in `package.json`)
- Elements: three menu items — "Export as CSV", "Export as PDF", "Print schedule", and
  "Duplicate day…" (opens the page's sanctioned detail pane to pick a source day and target day)
- Behavior: CSV export builds a client-side CSV Blob from `items` and triggers a download (uses
  the already-installed `papaparse` dependency, consistent with any other CSV export in this
  app). PDF export uses the already-installed `jspdf` dependency. Print opens `window.print()`
  against a print-scoped stylesheet on the current view. Duplicate day reads sessions for the
  source day, offsets their `startTime`/`endTime` to the target day (same timezone-safe
  `eventDateTimeToEpoch` helper), and calls `repo.agenda.save` once per copied session as drafts
  (`isPublished: false`) so the organizer reviews before publishing duplicates.
- Third-party: `papaparse` (already a dependency) for CSV, `jspdf` (already a dependency) for PDF
  — both already installed in `package.json`, no new dependency added.

---

## State / Data Flow

Unchanged at the top level: `Agenda.tsx`'s `load()` fetches `agenda.list`, `detectConflicts`,
`events.listRooms`, `events.listTracks`, `speakers.list` once per event-scope change and stores
them in local state (`items`, `rooms`, `conflictRecords`, etc.); every view tab renders from that
one fetched dataset client-side. This plan adds:

- `addOpen: boolean` + `selectedRow` (derived from `?selected=` via `useSearchParams`) driving
  which `DetailPane` content is passed to `AppLayout`'s `detail` prop.
- `sortKey`/`filterState` local state narrowing `visibleItems` before render — no new fetch.
- Move/save success and failure funnel through the same `moveSession`/`persist` functions that
  already exist, with `toast.success`/`toast.error` calls added at their existing resolve/reject
  points — no new state machine.

---

## Auth / Permissions

Unchanged: Agenda is organizer-only, gated the same way it already is (event-scoped via
`useCurrentEvent`/`EventProvider`, same as every other Program page). No new permission checks are
introduced by this plan — Add Session, Move, Export, and Duplicate day all reuse the same
`repo.agenda.save`/`repo.agenda.list` calls already gated server-side in `convex/agenda.ts`.

---

## Edge Cases & Error States

- **API call fails (create/edit/move):** inline error in the open pane/popover; entered values
  preserved; distinct error toast/banner from the success case.
- **Loading state:** Save/Confirm buttons show a spinner + disabled state while their mutation is
  in flight; the Rooms grid does not block interaction elsewhere during a single move.
- **Empty states:** no rooms/tracks configured → existing actionable empty state pointing to Event
  Settings (already implemented, unchanged); no accepted submissions → "Standalone" remains
  available in the Add Session builder.
- **Track overlap wording:** phrased as an informational overlap ("scheduled in the same track at
  the same time"), never as an error, and never blocks Publish — per the confirmed product
  decision, since parallel-track programming is often intentional.
- **Duplicate day onto a day with existing sessions:** duplicated sessions are created as drafts
  (`isPublished: false`); any resulting overlaps surface normally in Conflicts rather than being
  silently prevented — the organizer resolves them the same way as any other conflict.

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drag/keyboard/touch strategy | Native HTML5 DnD (mouse) + a shared `AgendaMoveControl` for keyboard and touch | Confirmed with Naya. Zero new dependencies (`package.json` has no dnd library), satisfies WCAG 2.2 SC 2.5.7's non-drag-alternative requirement directly, reuses existing form components. |
| Track overlap severity | Informational, never blocks Publish | Confirmed with Naya. Parallel same-track sessions across rooms are often intentional multi-track programming, unlike room/speaker overlaps which are never intentional. |
| "More" menu scope | Export (CSV/PDF), Print, Duplicate day | Confirmed with Naya. All three are client-side transforms of already-loaded data using dependencies (`papaparse`, `jspdf`) already installed — no new backend work. |
| E2E test strategy | Manual/agent-driven browser walkthrough, not a new Playwright/Cypress suite | No E2E framework exists in this repo (`package.json` has neither); every other completed feature in `docs/features/INDEX.md` was closed out the same way. Introducing a first project-wide E2E framework is a separate, larger decision than this feature warrants. |
| Reuse from prior projects | Adapted (not copied) conflict-dedup shape and toast-confirmation pattern from Clockwork's `Schedule.tsx` | Confirmed via local search per house rule — Clockwork already solved "dedup overlapping pairs" and "toast on every mutation outcome" for a structurally similar (shift-based) scheduling problem. |

## Dependencies

**Requires:** none blocking — all underlying repo/mutation calls already exist.
**Enables:** a genuinely demo-ready Agenda feature; closes the gap between `docs/features/INDEX.md`'s
claimed status and the actual organizer-facing journey.

## Risks & Mitigations

- **Risk:** the Rooms grid's empty-slot geometry change (fixed 15-minute axis instead of
  session-derived rows) is the largest single UI change in this plan and could regress the
  existing working drag-to-existing-row behavior. **Mitigation:** cover with the new
  `moveSession` rollback/persist test before touching the grid, so a regression fails a test
  immediately rather than surfacing only in manual QA.
- **Risk:** a prior QA pass (`test-artifacts/e2e-real-user-current-main-20260811-114457/REPORT.md`)
  recorded that agenda time edits did not survive a hard reload — a regression that may have since
  been fixed, but is unverified. **Mitigation:** the manual browser walkthrough for this plan
  explicitly re-checks hard-reload persistence, not just soft in-app navigation.
- **Risk:** locking Speakers when a submission is selected in `AgendaSessionForm` could frustrate
  an organizer who wants to add a co-speaker not on the original submission. **Mitigation:**
  deselecting the submission clears the lock and switches to standalone mode, preserving already
  entered values — no data loss, just an explicit mode switch.
