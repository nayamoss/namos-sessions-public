# Readiness — Requirements

**Type:** Feature
**Status:** In Progress
**Priority:** High
**Last Updated:** 2026-08-12

## Problem Statement

The public product copy claims two things the app does not currently do:

1. **"Readiness operations — see what could go wrong while you can still fix it. Overdue
   tasks, undecided proposals, unscheduled sessions, and bounced emails become short lists
   with owners — instead of surprises on event day."** Today each of those signals is real,
   tracked data, but it lives on four separate surfaces (Program > Evaluation, Program >
   Agenda, Portals > Tasks, Program > Communications). There is no single rolled-up list.
2. **"Event day — you already know it's handled."** There is no run-of-show, day-of view, or
   "everything's confirmed" check anywhere in the app. Nothing currently shows an organizer
   that state on the day itself.

A copy-vs-code audit confirmed both gaps (see conversation record). This feature closes them
with one screen: a **Readiness** roll-up that surfaces existing outstanding-work data as a
single list of items with owners, plus a day filter so it also stands in for the "event day"
promise.

This is a synthesis view over data that already exists (`agenda.detectConflicts`,
`speakers.list`, `submissions.list`, `tasks.list`, `comms.list`). It introduces no new tracked
state and no schema changes.

## User Stories

**As an** event organizer **I want to** see every unresolved item across conflicts, speaker
confirmations, onboarding tasks, proposal decisions, and comms delivery in one place **so
that** I can work a single punch list instead of checking four separate pages, and can say
with a straight face that nothing is a surprise on event day.

**Acceptance Criteria:**
- GIVEN an event with unresolved agenda conflicts, unconfirmed speakers on accepted sessions,
  overdue onboarding tasks, undecided proposals, or failed comms deliveries, WHEN I open
  Readiness, THEN I see every one of them listed under its category, each linking back to
  where I fix it.
- GIVEN an event with none of the above outstanding, WHEN I open Readiness, THEN every
  category shows a clear "all clear" state — not a hidden/empty section — so the zero is
  visibly earned rather than merely absent.
- GIVEN I select a specific event day, WHEN the filter is applied, THEN date-attributable
  items (agenda conflicts and tasks due that day) are scoped to that day, and items that
  cannot honestly be attributed to a single day (undecided proposals, bounced comms, speakers
  with no scheduled session yet) remain visible under an explicit "not date-specific" grouping
  rather than being silently hidden by the filter.
- GIVEN I click an item, WHEN I land on the destination, THEN it is the exact existing record
  (the agenda item, the speaker, the task, the submission, or the comms log entry) — never a
  dead link or a generic list.

## Functional Requirements

- FR-001: A new page at `/program/readiness` aggregates five categories: unresolved agenda
  conflicts, unconfirmed speakers on accepted submissions, overdue/incomplete onboarding
  tasks, undecided proposals, and failed comms deliveries.
- FR-002: Each category shows a count and a list of concrete items; each item names what's
  wrong and links to the record that resolves it (agenda item, speaker, task, submission, or
  comms log row).
- FR-003: A day filter (All + one pill per event day) scopes date-attributable items to the
  selected day. Non-date-attributable items always display, labeled as such, regardless of
  the selected day.
- FR-004: An empty category renders an explicit "all clear" state, not an omitted section.
- FR-005: A nav entry ("Readiness") is added under the Program section, and the existing
  Dashboard nudges continue to link into it (`/program/readiness`) instead of, or in addition
  to, their current per-item destinations — see design.md for the exact change.

## Non-Functional Requirements

- NFR-001: No new persisted state. This is a client-side aggregation over existing repo reads,
  matching the pattern already used by `DashboardHome.tsx` and `src/lib/speaker-operations.ts`.
- NFR-002: Must work for events with zero outstanding items without extra requests or a
  different code path — the "all clear" state is the default render of the same data, not a
  special case.
- NFR-003: Keyboard operable, visible focus, and non-color-only status per PRODUCT.md
  Accessibility & Inclusion — category status is never conveyed by color alone (pair with an
  icon and a text count).

## Out of Scope

- **Missing/required speaker materials.** There is no "materials required" flag anywhere in
  the data model — slide/doc uploads are always optional and per-submission. Flagging "zero
  uploads" as a gap when nothing was ever required would be the same kind of dishonest claim
  this feature exists to fix. Deferred until a real requirement flag exists on the submission
  form (see `docs/features/submission-form-builder/`).
- Any new "confirmed"/"resolved" persisted status on readiness items — this is a live
  recomputed view, not a checklist with its own state.
- A day-of/run-of-show live dashboard with real-time updates, push notifications, or a
  presentation/kiosk mode — out of scope for this pass. The day filter on the existing
  aggregation is the whole "event day" answer for now.

## Success Metrics

- All five categories render correctly against seeded demo data with both zero and non-zero
  counts (verified in `npm run seed:demo` data and in the browser).
- Every item in every category links to a real, existing record — zero dead links.
- The existing Dashboard nudges and this page never disagree about counts (same underlying
  data, same category logic) — verified by sharing the same `src/lib/readiness.ts` projection
  from both places where practical.
