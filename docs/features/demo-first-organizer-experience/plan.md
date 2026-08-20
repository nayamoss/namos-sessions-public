# Demo-First Organizer Experience — Plan

**Status:** Planned — DO NOT IMPLEMENT YET
**Phase in `kill-my-saas-brief/plan.md`:** 2
**Blocked on:** Phase 0.3 (measure the reactive-transport defect) and decision D-5 (landing-page
scope), plus confirmation of the rollup-query approach — `design.md` option (b).

## Task breakdown

### T0 — Measure before building

Run the landing page against a seeded deployment for ten minutes. Record: how often subscriptions
resolve, whether any stays unresolved, and how the page behaves across a socket drop. This decides
whether "real-time" is claimable (NFR-004) and whether the stale threshold of 120s is right.

Output: a short note appended to this plan. If subscriptions routinely stall, requirement 6 is
reported as `BLOCKED` in the umbrella status table, not `PARTIAL`.

### T1 — Server rollup

**Files:** `convex/dashboard.ts` (new), `src/data/repo.ts`, `src/data/types.ts`

`programState({ eventId })` guarded by `assertEventAccess`. Returns the four figure groups plus
`computedAt`. Uses existing `by_event` indexes on `submissions`, `agenda_items`, `speakers`,
`onboarding_tasks`, `evaluation_assignments`, and `evaluations`, and reuses `conflictRows` from
`convex/agenda.ts:34` for the blocking-conflict count rather than reimplementing overlap logic.

Counts only. No documents returned.

### T2 — Pure projection

**Files:** `src/lib/program-state.ts` (new)

`projectProgramState` per `design.md`. Even with the rollup, this module owns figure labels, link
targets, and the `undefined` vs `0` distinction, so it is unit-testable without Convex.

### T3 — Header component

**Files:** `src/components/dashboard/ProgramStateHeader.tsx` (new),
`src/pages/dashboard/DashboardHome.tsx`

1. One `Card`, responsive row of four groups, stacking at ≤768px.
2. Each figure is a `Link` with an accessible name containing the number and its meaning.
3. Skeletons that preserve layout height.
4. `As of` indicator with the stale threshold and a manual refresh.
5. Mounted above the existing flex row. First-run path (`cfpCount === 0 && !dataPending`) renders
   the existing setup steps instead.

**Do not** touch `AppLayout`, the sidebar, colour tokens, or spacing scale (NFR-001).

### T4 — Filter query parameters

**Files:** `src/pages/program/Abstracts.tsx`, `src/pages/program/Evaluation.tsx`,
`src/pages/program/Agenda.tsx`, `src/pages/portal/TasksAdmin.tsx`

Verify or add: `?status=awaiting`, `?view=progress`, `?view=conflicts`, `?view=overdue`.
`Agenda` already stores its view in the URL (`Agenda.tsx:299`) — check before adding.
`?view=profile-incomplete` and `?view=needs-attention` already exist on the speaker list.

Each parameter must be a real filter on load, not a scroll-to.

### T5 — Quick access

**Files:** `src/pages/dashboard/DashboardHome.tsx`

Add `Readiness` to the `quickAccess` array.

### T6 — Walkthrough re-walk

**Files:** `docs/features/kill-my-saas-brief/USER_JOURNEY.md`

After T1–T5 land, walk every step and annotate what was observed. This is the artifact that
replaces "we believe it works".

## Test cases

| ID | Type | Case | Expected |
|---|---|---|---|
| TC-1 | unit | `projectProgramState` with all inputs `undefined` | Every figure `value: undefined`; `pending: true` |
| TC-2 | unit | Empty arrays for all inputs | Every figure `0`; `pending: false` |
| TC-3 | unit | Mixed — submissions resolved, agenda undefined | Submission figures numeric, schedule figures `undefined` |
| TC-4 | unit | 38 submissions, 24 in awaiting statuses | `awaitingDecision: 24` |
| TC-5 | unit | 14 accepted, 11 with agenda items | `scheduled: 11 / 14` |
| TC-6 | unit | Accepted submission scheduled twice | Counted once |
| TC-7 | unit | Task overdue by `dueDate < now` and not completed | Counted overdue |
| TC-8 | unit | Completed task with a past due date | Not counted overdue |
| TC-9 | unit | Review completion with multi-round assignments | Denominator counts all assignments across rounds |
| TC-10 | unit | Blocking conflicts | Only `room_overlap` and `speaker_overlap` counted, matching `agenda.publishSchedule`'s gate |
| TC-11 | component | Header at `pending: true` | Renders `—` with "not yet known", never `0` |
| TC-12 | component | Header with `cfpCount === 0` | Setup steps render instead of figures |
| TC-13 | component | `computedAt` older than the threshold | Stale indicator and refresh control present |
| TC-14 | component | Figure accessible names | Include number and meaning, not a bare numeral |
| TC-15 | component | Composer presence | Textarea, dictation, voice, and send still rendered |
| TC-16 | component | Rail presence and collapse behaviour | Unchanged |
| TC-17 | contract | `dashboard.programState` by a non-member | Rejected |
| TC-18 | contract | Rollup payload | Counts only; no submission titles, speaker names, or emails |
| TC-19 | e2e-ish | Each figure link | Lands on the owning page with the filter applied on load |

Existing suites that must stay green: `app-layout`, `event-context`, `route-guard`,
`keyboard-layer`, `shortcuts`, `voice-chat-button`, `use-dictation`, `analytics-workflows`,
`speaker-operations`, `readiness`.

## Browser verification steps

1. Load the landing page at 1280px. Time how long until four true facts about the event are
   readable. Target: under 15 seconds.
2. Repeat at 1024px and 768px. The header must remain visible at all three without expanding
   anything.
3. Collapse the rail entirely and reload. The header is still there.
4. Click all eight figures in turn. Each lands on the owning page with the filter already applied.
5. Complete a task in a second tab, return to the dashboard. Either the figure updates, or the
   stale indicator appears. Record which — this is the honest answer to "real-time".
6. Throttle or interrupt the connection. Confirm figures do not silently drop to zero.
7. Open a brand-new event with no CFP. Confirm setup steps render instead of a wall of zeroes.
8. Confirm the composer still sends, dictation still records, `Alt+V` still toggles voice, and the
   rail shortcut still works.
9. Keyboard-only pass: tab through every figure, confirm names are announced with meaning.
10. Confirm `Readiness` is reachable from quick access.

## Rollback

The header is one component mounted in one place. Removing that mount restores today's page
exactly. `convex/dashboard.ts` is standalone. The query parameters are additive filters that
default to today's behaviour when absent.
</content>
