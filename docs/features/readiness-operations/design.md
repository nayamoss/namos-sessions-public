# Readiness — Technical Design

Companion to [`requirements.md`](./requirements.md). Ordered work lives in [`plan.md`](./plan.md).

## Product and information architecture

```text
App header: Readiness
Toolbar row: Day filter pills (All · event days...)         [no primary action]
Content surface
└─ five stacked category cards, always rendered in this order:
   1. Agenda conflicts
   2. Speaker confirmations
   3. Onboarding tasks
   4. Proposal decisions
   5. Comms delivery
   each card:
   ├─ heading + count badge + status icon (never color alone)
   ├─ non-empty → compact row list, each row → outbound link to the source record
   └─ empty → "All clear" state (icon + one line), rendered every time, not omitted
```

This is a punch list, not a workspace — rows are single-line and link out to the existing
page that already handles that record (Agenda, Speakers, Portals > Tasks, Program >
Evaluation/Abstracts, Program > Communications). Readiness never duplicates editing UI.

## Current-system evidence

| Layer | Current evidence | Required change |
|---|---|---|
| Route/nav | `src/App.tsx:49-58` lists every Program route; `src/components/AppLayout.tsx:44-53` defines the Program nav section | Add `/program/readiness` route and a "Readiness" nav item in Program, after Agenda |
| Conflict detection | `src/lib/agenda-conflicts.ts` (pure fn) and `convex/agenda.ts:16-38` (`conflictRows`) already compute room/speaker overlaps; `AgendaRepo.detectConflicts` (`src/data/repo.ts:85`) is the client entry point | Call the existing `repo.agenda.detectConflicts` — no new logic |
| Speaker confirmation | `src/lib/speaker-operations.ts` already projects `SpeakerOperationsRow` with `confirmationStatus` and accepted-submission linkage, and computes a `needsAttention` summary; `DashboardHome.tsx:99` already consumes it | Reuse this projection directly — do not re-derive confirmation logic |
| Onboarding tasks | `OnboardingTask` (`src/data/types.ts:109`) has `status` and `dueDate`; `TasksRepo.list` (`src/data/repo.ts:89`) returns the event's tasks; `speaker-operations.ts:80-83` already computes `overdueTaskCount` per speaker | Reuse the same overdue definition (`status !== "completed" && dueDate < now`) at the event level, not just per-speaker |
| Undecided proposals | `Submission.status` (`src/data/types.ts:10-12`); `DashboardHome.tsx:104` already computes `awaitingDecision = pending + accept_queue + decline_queue` | Reuse the same status set; readiness needs the actual list, not just the count |
| Unscheduled accepted sessions | `DashboardHome.tsx:100-103` already computes `unscheduledAccepted` by diffing accepted submissions against `agenda.submissionId` | Reuse the same computation; readiness needs the list, DashboardHome keeps the count-only nudge |
| Comms delivery | `Comm.status` (`src/data/types.ts:110`, values `"queued" \| "sent" \| "failed"`); `CommsRepo.list` (`src/data/repo.ts:90`); `Communications.tsx:204-216` already renders a `failed` badge | Reuse the same status field; filter to `status === "failed"` |
| Event days | `Event.startDate` / `Event.endDate` (`src/data/types.ts:15`); `agendaEventDays()` (`src/pages/program/Agenda.tsx:94`) already derives the list of calendar days for the event | Reuse `agendaEventDays` for the day-filter pills instead of inventing a second day-enumeration helper |
| Data layer | `Repository` (`src/data/repo.ts:121`) already exposes every method this feature needs (`agenda.list`, `agenda.detectConflicts`, `speakers.list`, `submissions.list`, `tasks.list`, `comms.list`) | No new repo methods, no new Convex queries, no schema change |
| Auth | `convex/functions.ts:24-30` `assertOrganizer` already gates every list/detectConflicts call this page uses | No new authorization surface — the page is organizer-only like the rest of Program |
| Deployment | `wrangler.jsonc` serves the Vite build through Cloudflare Workers, with no server rendering | No deployment topology change |
| Verification | `package.json` `dev`, `build`, `typecheck`, `test`, `check` | Use existing commands; no new dependency |

No AI SDK or model call participates in this feature.

## Data aggregation

New pure module `src/lib/readiness.ts`, following the exact shape of
`src/lib/speaker-operations.ts` and `src/lib/agenda-conflicts.ts` (pure functions, unit
tested, no framework or fetch code):

```ts
export type ReadinessCategory =
  | "agenda_conflicts"
  | "speaker_confirmations"
  | "onboarding_tasks"
  | "proposal_decisions"
  | "comms_delivery";

export interface ReadinessItem {
  id: string;                 // stable key for React lists
  title: string;               // e.g. "Room clash: Opening Keynote vs. Panel A"
  detail?: string;              // e.g. "Main Stage · 9:00–9:30 AM"
  to: string;                   // route to the source record
  eventDate?: number;           // UTC-midnight day this item belongs to; undefined = not date-attributable
}

export interface ReadinessGroup {
  category: ReadinessCategory;
  label: string;                // "Agenda conflicts"
  items: ReadinessItem[];
}

export function projectReadinessGroups(input: {
  event: Event;
  agenda: AgendaItem[];
  agendaConflicts: AgendaConflict[];
  speakerRows: SpeakerOperationsRow[];   // from projectSpeakerOperationsRows — do not recompute
  submissions: Submission[];
  tasks: OnboardingTask[];
  comms: Comm[];
  now: number;
}): ReadinessGroup[];

// Items whose `eventDate` matches the selected day, plus every item with `eventDate === undefined`
// (always shown, labeled separately by the page — see plan.md UI Spec).
export function filterReadinessGroupsByDay(groups: ReadinessGroup[], day: number | "all"): ReadinessGroup[];
```

Category derivation (all pure, no I/O):

| Category | Source | Rule | `eventDate` |
|---|---|---|---|
| Agenda conflicts | `agenda.detectConflicts` result + `agenda.list` for titles/times | One item per conflict pair | The overlapping agenda items' shared calendar day (their `startTime`, in the event's `timezone`) |
| Speaker confirmations | `speakerRows` (`projectSpeakerOperationsRows`) | `confirmationStatus !== "confirmed"` AND `submissions.length > 0` (has at least one accepted session) | The speaker's earliest scheduled agenda item's day, if scheduled; otherwise `undefined` |
| Onboarding tasks | `tasks` | `status !== "completed"` AND `dueDate !== undefined` AND `dueDate < now` (overdue only — matches `speaker-operations.ts`'s existing definition) | The task's `dueDate`'s calendar day |
| Proposal decisions | `submissions` | `status` in `{pending, accept_queue, decline_queue}` (same set `DashboardHome.tsx` already uses for `awaitingDecision`) | `undefined` — an undecided submission is not yet scheduled, so it cannot belong to a day |
| Comms delivery | `comms` | `status === "failed"` | `undefined` — a delivery failure's timestamp is when the email was sent, not an event day; conflating the two would misrepresent it as "trouble on day X" when it is trouble in the mail pipeline |

The "unscheduled accepted sessions" signal `DashboardHome.tsx` already computes is deliberately
folded into the same page rather than duplicated as a sixth category with different plumbing —
see plan.md Phase 1 for whether it becomes a 5th distinct category or a sub-list under Agenda
conflicts. (Decision: it is out of scope for this pass's five FR-001 categories — recorded here
so it isn't silently dropped; DashboardHome's existing nudge continues to link to
`/program/agenda` unchanged. Revisit as a 6th Readiness category in a follow-up if the punch
list proves incomplete without it.)

## Frontend components

### Modified components

| File Path | Change |
|-----------|--------|
| `src/App.tsx` | Add `<Route path="/program/readiness" element={<Readiness />} />` inside the authenticated Program route group |
| `src/components/AppLayout.tsx` | Add `{ to: "/program/readiness", label: "Readiness", icon: ShieldCheck }` to the Program nav section, positioned after Agenda |
| `src/pages/dashboard/DashboardHome.tsx` | No structural change. The existing `nudges` array already links to `/program/agenda`, `/program/abstracts`, and `/program/speakers?view=needs-attention` — leave those as-is (they jump straight to the record); optionally add one more nudge line "N items need attention → /program/readiness" once category counts are available from the same `readiness.ts` module, to keep Dashboard and Readiness numerically consistent |

### New components

**`Readiness`**
- File: `src/pages/program/Readiness.tsx`
- Props: none (route-level page, reads `useRepo()` like every other Program page)
- Location: Program section, new route `/program/readiness`
- Elements:
  - `PageHeader` title "Readiness" (no subtitle needed — the toolbar below explains scope)
  - Toolbar row (below header, per layout rules): day filter pills, left-aligned, no right-side
    action button. Pills: "All" (default, selected) + one pill per `agendaEventDays(event.startDate, event.endDate)` entry, labeled with the short date (e.g. "Aug 14")
  - Five `ReadinessCategoryCard` sections in fixed order (see table above)
  - Top-level load error: `role="alert"` red inline text, same pattern as `DashboardHome.tsx:121`
  - Loading state: while the initial `Promise.all` fetch is in flight, render five skeleton
    cards (label + shimmer bar), matching the loading pattern already used elsewhere (no
    spinner-over-blank-page)
- Behavior:
  - On mount, loads `event`, `agenda`, `agenda.detectConflicts`, `speakers`, `submissions`,
    `tasks`, `comms` via `Promise.all` (same shape as `DashboardHome.tsx:43-77`)
  - Selecting a day pill re-filters client-side via `filterReadinessGroupsByDay` — no refetch
  - Clicking any item navigates via `<Link>` to its `to` route; no client-side state is lost
    on the destination page since each destination is that page's normal entry point

**`ReadinessCategoryCard`**
- File: `src/components/shared/ReadinessCategoryCard.tsx`
- Props: `{ label: string; icon: LucideIcon; items: ReadinessItem[]; notDateSpecificCount?: number }`
- Location: rendered five times on the Readiness page, one per category
- Elements:
  - Card container: `bg-neutral-100 rounded-[12px] p-5` (no border, no shadow, per UI layout rules)
  - Header row: icon + category label + count badge (`bg-neutral-200` pill, never a bare color dot as the only signal)
  - If `items.length === 0`: "All clear" row — check-circle icon (not color-only; icon shape
    itself signals success) + "Nothing outstanding here."
  - If `items.length > 0`: compact list, each row = title (font-medium) + optional detail
    (text-sm text-muted-foreground) + implicit link (whole row is the `<Link>`, per existing
    row-click patterns in `Speakers.tsx`)
  - If a day filter is active and `notDateSpecificCount > 0`: one small note line below the
    list — "+N more not tied to a specific day" — linking to the "All" pill rather than hiding
    the count
- Behavior: entire row is a `<Link to={item.to}>` (button-less, matches the "punch list, not a
  workspace" principle — no inline resolve actions here, resolution happens on the destination
  page)
- Third-party: none — plain Tailwind + `lucide-react` icons already in the dependency tree

## State / Data flow

`Readiness.tsx` fetches directly from `useRepo()` on mount (same pattern as every existing
Program page — no global store, no React Query despite it being in `package.json`'s
dependency list for other features). Data flows: Convex/Airtable adapter → `Repository`
methods → local `useState` → `projectReadinessGroups` (pure, recomputed via `useMemo` on every
relevant state change) → `filterReadinessGroupsByDay` (pure, recomputed on day-pill selection)
→ `ReadinessCategoryCard` props. Selecting a day pill triggers a re-render only, never a
refetch.

## Auth / Permissions

Organizer-only, identical to every other Program page — gated by the existing
`RequireAuth`/`assertOrganizer` chain already wrapping `/program/*` routes in `src/App.tsx`.
No new permission surface.

## Edge cases & error states

- **No event configured yet**: same `needsOwnerClaim`/empty-event handling as
  `DashboardHome.tsx` — render the existing "no organizer has claimed this deployment" banner
  pattern if that's the actual cause; otherwise render all five categories in their "all
  clear" state (there is nothing to be behind on) rather than a blocking empty page.
- **Any repo call fails**: same `role="alert"` inline error as `DashboardHome.tsx:121`; the
  categories that did load still render (fail soft per-category if one Promise in the
  `Promise.all` rejects — use `Promise.allSettled` here specifically, unlike
  `DashboardHome.tsx`'s all-or-nothing `Promise.all`, since a Communications outage should not
  hide an already-loaded Agenda conflict).
- **Zero outstanding items across all categories**: this is the success state the copy
  promises — every card shows "All clear," no banner needed above them (the five green cards
  already say it).
- **Day filter selected with no event days configured** (event has no `startDate`/`endDate`):
  fall back to "All" only — do not render an empty pill row.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| New page vs. expand Dashboard | New page at `/program/readiness` | Confirmed with Naya. Keeps Dashboard as the at-a-glance landing page; gives readiness room for a real list-with-owners UI instead of count badges. |
| Missing materials category | Deferred (out of scope, see requirements.md) | Confirmed with Naya. No "required" flag exists on submissions/forms; flagging it now would repeat the same honesty gap this feature exists to close. |
| Day filter | Included, with an explicit "not date-specific" fallback grouping | Confirmed with Naya. Directly answers the "Event day" copy claim; the fallback keeps items honest instead of silently disappearing when they can't be attributed to a day. |
| Reuse `speaker-operations.ts` for confirmation logic | Yes, no re-derivation | `speaker-operations.ts` already has tested, correct logic for "accepted speaker not yet confirmed" — duplicating it risks the two surfaces disagreeing. |
| "Unscheduled accepted sessions" | Not a 6th category this pass | Requirements.md scoped exactly five categories from the copy audit; adding a sixth mid-design would silently expand scope. Recorded as a likely follow-up instead. |

## Dependencies

**Requires:** nothing new — depends only on existing `AgendaRepo.detectConflicts`,
`SpeakersRepo.list`, `SubmissionsRepo.list`, `TasksRepo.list`, `CommsRepo.list`, and
`agendaEventDays`.
**Enables:** an honest basis for the "Event day — you already know it's handled" and
"Readiness operations" copy claims; a future day-of/live-refresh mode could build on this
same aggregation without redesigning it.

## Risks & Mitigations

- **Risk:** Category logic drifts from `DashboardHome.tsx`'s existing nudge counts, producing
  two different numbers for the same underlying fact. **Mitigation:** `readiness.ts` is the
  single source of truth; `DashboardHome.tsx`'s nudges should read from it too when this ships
  (see Modified Components above), not maintain parallel logic.
- **Risk:** The day-filter's "not date-specific" fallback is confusing if it's not clearly
  explained inline. **Mitigation:** the UI Spec above requires an explicit note line, not a
  silent inclusion, whenever the fallback applies.
