# Agenda Scheduling — Kill My SaaS Brief Addendum

**Date:** 2026-08-17
**Covers:** brief requirement 5 — *drag-and-drop agenda scheduling with automatic room/speaker
conflict detection and list, day, week, track, and room views.*
**Relationship to this package:** the existing `requirements.md` / `design.md` / `plan.md` /
`USER_JOURNEY.md` describe the agenda hardening work and remain the authoritative documents. This
addendum records only the brief-coverage audit and the one gap it found. Nothing here rewrites them.

---

## Requirements coverage

| Brief clause | Implementation | Verdict |
|---|---|---|
| Drag-and-drop scheduling | Native HTML5 DnD in the room grid: `draggable` + `onDragStart` on the session article (`src/pages/program/Agenda.tsx:1432-1444`), `onDragEnter` / `onDragOver` / `onDrop` per room×slot cell (`:1396-1419`), 15-minute snapping via `snapToAgendaInterval`, drop-target highlighting, drag opacity | **PASS (source)** |
| Keyboard equivalent | `src/pages/program/AgendaMoveControl.tsx`, rendered on every session card (`Agenda.tsx:1455`) | **PASS (source)** — drag is not the only path |
| Automatic room conflict detection | `conflictRows` `room_overlap` (`convex/agenda.ts:43-49`) | **PASS (source)** |
| Automatic speaker conflict detection | `conflictRows` `speaker_overlap` (`:50-60`) | **PASS (source)** |
| — beyond the brief | `track_overlap` (`:61-63`) as informational, plus `speaker_unavailable` cross-referenced against `speaker_availability` in event-local time (`detectConflicts`, `:174-198`) | Exceeds |
| Re-detection after a move | `repo.agenda.detectConflicts` re-run on every move (`Agenda.tsx:584-587`) | **PASS (source)** |
| Publish safety | `publishSchedule` refuses when any `room_overlap` or `speaker_overlap` exists; track overlaps stay informational (`convex/agenda.ts:296-314`) | **PASS (source)** |
| List view | `Agenda.tsx:938` | **PASS (source)** |
| Day view | `:969` | **PASS (source)** |
| Week view | `:969-971` | **PASS (source)** |
| Track view | `:981-985`, with conflicts surfaced inline | **PASS (source)** |
| Room view | `:953-961` — the room×time grid that hosts drag-and-drop | **PASS (source)** |
| — beyond the brief | Month view (`:971-981`) and a dedicated Conflicts view (`:89-97`, `:1511+`) with a count badge on the view switcher | Exceeds |
| View persisted in the URL | `:299` | **PASS (source)** |
| Audit trail | Every create/update/publish/delete writes `agenda_items_audit`; a missing delete entry distinguishes an out-of-band dashboard edit from app code (`convex/schema.ts:556-567`) | Exceeds |

Test coverage: `src/test/agenda-conflicts.test.ts`, `agenda-views.test.ts`, `agenda-audit.test.ts`,
`agenda-session-form.test.tsx`, `calendar-schedule.test.ts`, `speaker-availability.test.ts`.

**Requirement 5 is the strongest-covered requirement in the brief.** No new agenda feature work is
proposed.

## The one gap: the demo, not the code

`convex/seed.ts` creates **three** agenda items:

| Seeded item | Room | Track | Note |
|---|---|---|---|
| Opening keynote | Grand Hall | Keynote | |
| Reliable AI agents | Grand Hall | Engineering | Overlaps the keynote in room **and** speaker — a deliberate conflict fixture |
| Engineering systems clinic | Studio 1 | Engineering | Track overlap with the above |

Against ~63 accepted submissions, that means:

- The **week view** renders a single day with three items.
- The **room view** renders four rooms of which two are empty.
- The **track view** renders four tracks of which one is empty.
- The dashboard's "scheduled vs accepted" figure reads roughly 3 / 63, which looks like a product
  that cannot schedule rather than one that can.
- The seeded speaker-unavailability fixture exists (`speakers[0]`, 15 Sep morning) but the
  conflicting session is at 14:00, so the availability conflict may never actually trigger — worth
  verifying during Phase 0.

The deliberate room/speaker conflict pair is genuinely good and must be **kept**: it is what makes
the conflict banner and the publish gate demonstrable.

## Proposed seed change (Phase 1.7 of `kill-my-saas-brief/plan.md`)

`convex/seed.ts` only. No schema change, no code change.

1. Schedule 11–14 accepted submissions across the event's three days
   (15–17 Sep 2026), spread over all four seeded rooms and all four tracks.
2. Keep the existing conflict pair exactly as it is.
3. Add one session that genuinely collides with the seeded speaker-unavailability window, so the
   `speaker_unavailable` reason appears in the conflicts view rather than only existing in code.
4. Leave 2–3 accepted submissions **unscheduled**, so the dashboard's "needs a time slot" figure is
   non-zero and clickable.
5. Publish most items (`isPublished: true`) but leave one unpublished, so the public embed's
   published-only projection is provable by absence.
6. Preserve idempotency: the existing fixture loop skips by title, so new fixtures follow the same
   find-then-insert shape.

## Verification gate (browser, not self-attested)

1. Room grid: drag a session to a different room and time; reload; the move persisted and a new
   `agenda_items_audit` row exists.
2. Drag a session onto an occupied slot: the conflict banner appears naming room or speaker, and
   `Publish schedule` refuses with the blocking-conflict message.
3. Resolve the conflict; publishing succeeds and `events.programPublishedAt` is set.
4. Cycle list → day → week → track → room → conflicts; all populated; the view survives a reload
   because it lives in the URL.
5. Use `AgendaMoveControl` with the keyboard only; the same move works without a mouse.
6. Confirm the `speaker_unavailable` conflict appears and is presented as informational rather than
   blocking.
7. Confirm the unpublished session is absent from `/embed/:id` and from `/e/:eventSlug`.

## Status

**PASS (source) · DEMO underpopulated · E2E good · Live/browser evidence NOT VERIFIED.**
Reported as PASS only after the verification gate above is walked.
</content>
