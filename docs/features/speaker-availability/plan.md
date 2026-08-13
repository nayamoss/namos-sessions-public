# Speaker Availability

**Phase 9 · ~2h** · **Not in the competition brief** — added from research

## Why this exists

[Pretalx](https://pretalx.com/), the closest open-source analogue, collects speaker
availability at submission time and treats it as a **hard scheduling constraint**, including
intersecting availability across co-speakers. Sessionboard's screenshots don't show it and the
brief never mentions it — but any conference organizer will notice its absence immediately,
because scheduling someone into a slot they said they can't make is the classic failure.

Concretely: without it, the [Conflicts tab](../agenda-scheduling/plan.md) catches only **2 of
4** conflict classes.

Two hours for a feature that (a) completes the flagship Conflicts view and (b) demonstrates
the "subjective judgment call" the tiebreaker explicitly rewards. Good trade.

## Scope — exact-hour data, calendar timetable interaction

The visible editor uses the established scheduling-canvas pattern: event dates are columns,
conference hours (7 AM–9 PM) are shown, and users can click or drag to paint exact unavailable
ranges. Each date header provides a
whole-day shortcut. Timezone stays adjacent to the date range, while month navigation appears
only when the event actually spans multiple months. On narrow screens the timetable scrolls
within its own surface rather than widening the page. Available cells are intentionally quiet;
only unavailable cells carry a visible state mark. Legacy morning/afternoon/evening records
remain readable and are expanded to their exact constituent hours the next time a user edits them.

## Schema

```ts
speaker_availability: defineTable({
  eventId: v.id("events"),
  speakerId: v.id("speakers"),
  unavailable: v.array(v.object({
    date: v.number(),
    hour: v.optional(v.number()), // 0–23, event-local; required for new records
    part: v.optional(v.union(v.literal("morning"), v.literal("afternoon"), v.literal("evening"))), // legacy
  })),
  notes: v.optional(v.string()),     // "flying in late Tuesday"
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_speaker", ["speakerId"]),
```

Storing **un**availability (rather than availability) means the default — no record — is
"available for everything", which is the right default and avoids forcing every speaker to
fill it in.

## Where it appears

1. **Public CFP form, Participant step** — a compact grid of day × part checkboxes per
   participant, with an optional note. Skippable.
2. **Speaker portal → Profile** — editable after the fact; travel plans change.
3. **Agenda → Conflicts tab** — as the `speaker_unavailable` conflict class.
4. *(Optional)* Agenda Add/Edit Session — warn at assignment time rather than after.

## Conflict rule

For each `agenda_item`, for each speaker on it: map `[startTime, endTime)` into the event's
timezone, derive which day-part(s) it touches, and flag if any intersects that speaker's
`unavailable` set. Same pure-function treatment as the other conflict classes.

New conflict checks intersect exact event-local hours. Legacy records keep the old local
day-part boundaries: morning < 12:00, afternoon 12:00–17:00, evening ≥ 17:00.

## Tasks

1. `AvailabilityRepo`: `getForSpeaker`, `upsert`, `listForEvent`
2. Month-navigable, day-column, 24-hour timetable component (shared between the CFP form and portal)
3. Wire into the CFP Participant step
4. Wire into portal Profile
5. Add the `speaker_unavailable` class to `detectConflicts`
6. Seed at least one availability conflict

## Verification

- [ ] Availability captured at submission appears on the speaker's profile
- [ ] Scheduling a speaker into a marked-unavailable slot appears in Conflicts
- [ ] A speaker with no record is treated as fully available
- [ ] Day-part derivation respects the event timezone, not the browser's

## Cut line

Droppable — it isn't in the brief. But it's the cheapest credibility win available, so cut it
only after the other optional items are already gone.
