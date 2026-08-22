# Speaker Availability — Half-Hour Slots — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
`speaker_availability` (Convex table, see `convex/schema.ts`):
```
speaker_availability: {
  eventId: Id<"events">,
  speakerId: Id<"speakers">,
  unavailable: Array<{ date: number, hour?: number, part?: "morning"|"afternoon"|"evening" }>,
  notes?: string,
  createdAt: number,
  updatedAt: number,
}
```
No Convex schema validators currently constrain the shape of `unavailable` beyond what
`convex/availability.ts`'s `v.object(...)` and `validateSlots()` enforce at the mutation
boundary — there's no `schema.ts` table-level validator for this array to update, only the
mutation-arg validator.

### Required Changes
| Table | Action | Field | Type | Notes |
|-------|--------|-------|------|-------|
| speaker_availability | no column change | `unavailable[].minute` | `optional(union(literal(0), literal(30)))` | Convex mutation-arg shape only, not a schema migration |

### Migration
None. This is purely additive at the application layer — a document written before this change
has `unavailable` entries with `hour` and no `minute`; those are read as "both `:00` and `:30`
blocked" everywhere they're interpreted (grid render, agenda conflict check). No backfill script,
no schema migration, no data rewrite. New writes from the updated editor always include `minute`.

---

## Backend / API

### Affected Existing Endpoints
| Function | File | Change |
|----------|------|--------|
| `upsert` mutation | `convex/availability.ts` | `unavailable` arg validator gains `minute: v.optional(v.union(v.literal(0), v.literal(30)))`; `validateSlots()` validates it |
| `submit` (or equivalent CFP submission mutation) | `convex/publicForms.ts` | same `unavailable` shape + validation duplicated here today (see current `slot.hour`/`slot.part` checks around line 210) — mirror the same `minute` rule |
| conflict/placement check | `convex/agenda.ts` | `unavailableSlotKeys()` keys by half-hour bucket, not by hour; blocked-lookup at ~lines 132–134 and ~231–233 checks `minute` when present |

No new endpoints.

### Validation & Business Logic
`validateSlots()` in `convex/availability.ts` (and the parallel inline check in
`convex/publicForms.ts`) gets one more rule:
```ts
if (slot.minute !== undefined && slot.hour === undefined)
  throw new Error("A minute requires an hour.");
if (slot.minute !== undefined && slot.minute !== 0 && slot.minute !== 30)
  throw new Error("Availability minutes must be 0 or 30.");
```
Dedup key in `publicForms.ts` (`${slot.date}:hour:${slot.hour}` at line 213) becomes
`${slot.date}:hour:${slot.hour}:${slot.minute ?? "all"}` so `{hour:14}` and `{hour:14,minute:0}`
aren't treated as distinct-but-overlapping without a clear rule — legacy hour-only slots keep
their own bucket and are never mixed with a half-hour-specific one in the same record (the UI
never produces both for the same hour once resaved).

`convex/agenda.ts`'s `unavailableSlotKeys(startTime, endTime, timeZone)` currently emits
`${date}:hour:${hour}` once per hour touched by the 30-min-stepped cursor loop. Change it to
also emit `${date}:hour:${hour}:${minute}` per half-hour bucket the session actually overlaps
(`minute` = `0` if cursor's minute `< 30` else `30`). The lookup side (currently
`entry.hour !== undefined ? blocked.has(`${entry.date}:hour:${entry.hour}`) : ...`) becomes:
```ts
entry.hour !== undefined
  ? entry.minute !== undefined
    ? blocked.has(`${entry.date}:hour:${entry.hour}:${entry.minute}`)
    : blocked.has(`${entry.date}:hour:${entry.hour}:0`) || blocked.has(`${entry.date}:hour:${entry.hour}:30`)
  : entry.part !== undefined && blocked.has(`${entry.date}:part:${entry.part}`)
```
i.e. a legacy hour-only entry still blocks if *either* half of that hour overlaps the session
being checked — matches FR-004 (never silently narrows an existing speaker's blocked time).

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/data/types.ts` | `AvailabilitySlot.minute?: 0 \| 30` added, with doc comment |
| `src/components/availability/AvailabilityEditor.tsx` | grid rows go from 24 (hour) to 48 (hour+minute); `slotKey`, `exactSlots`, `setSlot`, `toggle`, `toggleDay`, `hourLabel`/`displayHour`, `eventSlotEpoch` all take/derive `minute` |
| `src/lib/speaker-availability.ts` | `DayPartUnavailability` gains `minute?: 0 \| 30`; `isSpeakerAvailableByDayPart`'s `blockedHours` keying and the hour-only fallback logic both need the half-hour + legacy-hour-blocks-both-halves rule from the design note above |
| `src/pages/program/Availability.tsx` | no structural change expected — it renders `AvailabilityEditor` and passes through `Availability` records; only touches this file if slot construction/defaults live here (verify during implementation) |
| `convex/agenda.ts` | see Backend section |
| `convex/availability.ts` | see Backend section |
| `convex/publicForms.ts` | see Backend section |

### New Components
None — this is a resolution change to an existing grid, not a new UI surface.

### Grid layout detail (`AvailabilityEditor.tsx`)
- `hours` (24 entries) stays as the set of whole hours for the day-header "Block day" toggle and
  for `conferenceHours` filtering (7am–9pm stays the visible window).
- New `halfHours = conferenceHours.flatMap(hour => [{hour, minute: 0}, {hour, minute: 30}])`
  drives `timetableRows` instead of `conferenceHours` directly — 48 rows within the 7am–9pm
  window (30 hours × 2) instead of 15.
- `slotKey(date, hour, minute)` → `${date}:${hour}:${minute}`.
- `hourLabel` needs a minute-aware sibling (or an updated signature) so `:30` rows render e.g.
  "2:30 PM" instead of repeating "2 PM" — use `Intl.DateTimeFormat` with both `hour` and
  `minute` parts, formatted from `Date.UTC(2026, 0, 1, hour, minute)`.
- `eventSlotEpoch(date, hour, timezone)` → add a `minute` param, pass through to
  `eventDateTimeToEpoch` as `${hour}:${minute}` instead of hardcoded `:00` (that helper already
  supports minutes — see `src/lib/event-time.ts`, no change needed there).
- Row height stays `h-9`; 48 rows in the existing `DataGrid` scroll container is the same
  virtualization path already used for 24 — verify scroll performance isn't degraded, no new
  affordance planned if it isn't.
- `toggleDay(date)` still blocks/clears the *whole* day — iterate `halfHours` instead of `hours`
  when building the full-day slot list.
- Pointer paint-drag interaction (`onPointerDown`/`onPointerEnter`) is unchanged in kind — same
  handlers, just operating on smaller rows.

---

## State / Data Flow
Unchanged shape: `AvailabilityEditor` is a controlled component (`value` / `onChange` of
`AvailabilityDraft`), same as today. `Availability.tsx` and `PortalAvailability.tsx` read/write
through the existing `upsert` Convex mutation and `list` query — no new data flow, only the slot
shape flowing through it changes (adds `minute`).

---

## Auth / Permissions
Unchanged — `assertOrganizerOrOwnsSpeaker` / `assertEventOrganizerAccess` already gate the
`upsert`/`list` calls; no new permission surface.

---

## Edge Cases & Error States
- Legacy hour-only record loaded into the new grid: both `:00` and `:30` rows for that hour
  render as blocked (per FR-004). If the speaker clears just one half, the legacy hour-only
  entry is replaced by two explicit half-hour entries (or one, if only one half stays blocked) —
  `exactSlots()`'s normalization already does this kind of expand-then-rewrite for `part`, same
  pattern applies to `hour`-only.
- Day-part-only legacy record (`{ date, part: "morning" }`): still expands via `legacyHours`
  exactly as today — day-part legacy behavior is untouched, only per-hour legacy behavior gets
  the "blocks both halves" treatment.
- Public CFP submission form: same validation must reject `minute` values other than `0`/`30`
  server-side (never trust client-side-only validation on a public, unauthenticated-until-submit
  form endpoint).
- Session exactly spanning an hour boundary at `:30` (e.g. 10:30–11:30): `unavailableSlotKeys`'s
  existing 30-min-stepped cursor loop already visits both hours; with half-hour keys it now
  correctly flags conflicts only for the `10:30` and `11:00` buckets it actually overlaps, not
  the whole 10:00 and 11:00 hours as it does today.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Granularity | 30 min, not 15 | Explicit scope from Naya — halves block size without doubling grid rows again |
| Legacy hour-only semantics | Blocks both halves, never re-split automatically | No silent narrowing of an existing speaker's stated unavailability |
| Schema change | Additive optional field, no migration | Lowest-risk path; Convex documents are schemaless-flexible here already (arg-validator-only shape) |
| `part` (day-part) legacy field | Left as-is, not touched | Out of scope — only whole-hour legacy records get the half-hour interpretation upgrade |

## Dependencies
**Requires:** none (self-contained within `namos-sessions-webapp`).
**Enables:** more accurate auto-scheduling / conflict detection once speakers start submitting
half-hour-precise availability.

## Risks & Mitigations
- **Risk:** a bug in the "legacy hour blocks both halves" fallback silently narrows a speaker's
  availability window during the transition period. **Mitigation:** cover it with a unit test in
  `speaker-availability.test.ts` before touching the editor UI.
- **Risk:** grid becomes visually dense/harder to scan at 48 rows. **Mitigation:** keep the
  7am–9pm conference-hours window (unchanged) rather than expanding to all 24 hours × 2; revisit
  row height only if it's actually reported as cramped after shipping.
