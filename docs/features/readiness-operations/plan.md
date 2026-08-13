# Readiness — Implementation Plan

## Phase 1: Foundation — data aggregation

- [x] T001: Create `src/lib/readiness.ts` with `ReadinessCategory`, `ReadinessItem`,
      `ReadinessGroup` types and `projectReadinessGroups()` per design.md's derivation table
      (agenda conflicts, speaker confirmations, overdue tasks, undecided proposals, failed
      comms). Reuse `projectSpeakerOperationsRows` from `speaker-operations.ts` for the
      speaker-confirmation input — do not re-derive confirmation logic.
- [x] T002: Add `filterReadinessGroupsByDay(groups, day)` — returns items where
      `eventDate === day` plus every item with `eventDate === undefined`.
- [x] T003: Unit tests in `src/lib/readiness.test.ts` (or wherever `speaker-operations.test.ts`
      / `agenda-conflicts` tests currently live — match the existing test file convention)
      covering: each category's derivation rule, the zero-items "all clear" shape, and the
      day-filter's "not date-specific" fallback behavior.

## Phase 2: Backend / data

- N/A — no schema change, no new Convex query/mutation, no new `Repository` method. This
  phase reuses `repo.agenda.list`, `repo.agenda.detectConflicts`, `repo.speakers.list`,
  `repo.submissions.list`, `repo.tasks.list`, `repo.comms.list` exactly as `DashboardHome.tsx`
  already does. Confirm during implementation that no method signature needs to change —
  if one does, stop and update design.md first rather than silently expanding scope.

## Phase 3: Frontend UI (REQUIRED — do not skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI. Build exactly what's
> listed below — every element, every state.

### UI Spec

**Page: `Readiness`**
- File: `src/pages/program/Readiness.tsx`
- Location: new route `/program/readiness`, inside the existing authenticated Program route
  group in `src/App.tsx`
- Elements:
  - `PageHeader` title: "Readiness"
  - Toolbar row (below header, not inside it): day filter pills, left-aligned —
    "All" (default/selected) + one pill per `agendaEventDays(event.startDate, event.endDate)`
    day, each labeled with a short date (e.g. "Aug 14"). No right-side action button.
  - Five `ReadinessCategoryCard` sections, always rendered in this fixed order: Agenda
    conflicts, Speaker confirmations, Onboarding tasks, Proposal decisions, Comms delivery.
  - Load error: `role="alert"` red inline text above the cards if any category's fetch fails
    (per-category — see Phase 3 behavior below), matching `DashboardHome.tsx`'s error pattern.
  - Loading state: five skeleton cards (label placeholder + shimmer bar) while the initial
    fetch is in flight — never a blank page or spinner-over-nothing.
  - Empty event (no event configured): reuse the existing "no organizer has claimed this
    deployment" banner if that's the cause; otherwise render all five cards in their "all
    clear" state.
- Behavior:
  - On mount: `Promise.allSettled([repo.events.list(), repo.agenda.list(scope),
    repo.agenda.detectConflicts(scope), repo.speakers.list(scope),
    repo.submissions.list(scope), repo.tasks.list(scope), repo.comms.list(scope)])` — a single
    rejected category shows its own inline error inside that `ReadinessCategoryCard` (per
    design.md Edge Cases) rather than blanking the whole page.
  - Selecting a day pill calls `filterReadinessGroupsByDay` client-side — no refetch, no
    loading flicker.
  - Every item row is a `<Link to={item.to}>` navigating to the exact source record.
- Data: reads via `useRepo()`; no writes from this page — Readiness never edits records, it
  only routes to where they're edited.

**Component: `ReadinessCategoryCard`**
- File: `src/components/shared/ReadinessCategoryCard.tsx`
- Props: `{ label: string; icon: LucideIcon; items: ReadinessItem[]; notDateSpecificCount?: number; loadError?: string }`
- Location: rendered five times on the Readiness page
- Elements:
  - Card: `bg-neutral-100 rounded-[12px] p-5`, no border, no shadow
  - Header row: icon + `label` + count badge (`bg-neutral-200` pill showing `items.length`)
  - `loadError` present → inline red text row, category otherwise renders its last-known items
    (if any) beneath it rather than nothing
  - `items.length === 0` (and no error) → "All clear" row: check-circle icon + "Nothing
    outstanding here."
  - `items.length > 0` → list of rows, each: `title` (font-medium) + optional `detail`
    (text-sm text-muted-foreground), entire row wrapped in `<Link to={item.to}>`
  - `notDateSpecificCount` present and `> 0` (only shown when a day filter other than "All" is
    active) → note line: "+N more not tied to a specific day" linking back to the "All" pill
- Behavior: purely presentational + navigation; no local state, no mutations
- Third-party: `lucide-react` icons only (already a dependency)

### Tasks
- [x] T004: Build `ReadinessCategoryCard` with every element and state listed in the UI Spec
      above (all clear / populated / error / not-date-specific note).
- [x] T005: Build `Readiness` page: header, day-filter toolbar, five cards in fixed order,
      loading skeletons, per-category error handling via `Promise.allSettled`.
- [x] T006: Wire `Readiness` to `readiness.ts`'s `projectReadinessGroups` /
      `filterReadinessGroupsByDay` — verify counts match the existing Dashboard nudges for the
      same event (same underlying data, same rules).
- [x] T007: Add route `/program/readiness` in `src/App.tsx` inside the existing Program
      authenticated route group.
- [x] T008: Add nav entry `{ to: "/program/readiness", label: "Readiness", icon: ShieldCheck }`
      to the Program section in `src/components/AppLayout.tsx`, positioned after Agenda.
- [ ] T009: (Optional, only if it doesn't expand scope) Update `DashboardHome.tsx`'s `nudges`
      array to add one more entry linking to `/program/readiness` once
      `projectReadinessGroups` is available, so Dashboard and Readiness never disagree.
- [ ] T010: Verify the full flow in the browser end-to-end against seeded demo data
      (`npm run seed:demo`): every category populated, every category empty, day-filter
      switching, and every item link landing on the correct real record. **Blocked locally
      2026-08-12:** this checkout has no `VITE_CLERK_PUBLISHABLE_KEY` or configured Convex
      deployment, so the app fails before it can render the authenticated route. `npm run check`
      is green (45 files / 251 tests plus production build).

> ⚠️ A feature is NOT done until it is visible and usable in the UI. Backend-only work with no
> UI entry point is incomplete — this feature has no backend-only component, so there is no
> exception to invoke here.

## Task Dependencies

T001 → T002 → T003 (aggregation before tests). T004 and T001–T003 can proceed in parallel once
the `ReadinessItem`/`ReadinessGroup` types are fixed. T005 depends on T004 and T001–T002. T006
depends on T005. T007–T008 can happen any time before T010. T009 is optional and independent.
T010 is last and gates "done."

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` met
- [ ] Feature is accessible and usable in the UI at `/program/readiness`, reachable from the
      Program nav — not just implemented in `readiness.ts`
- [ ] All five categories verified against seeded demo data with both zero and non-zero counts
- [ ] Day filter verified: date-attributable items scope correctly; non-date-specific items
      always remain visible with their note
- [ ] Every item link verified to land on the real source record (no dead links, no generic
      list page)
- [ ] No regressions to `DashboardHome.tsx`'s existing nudges or `/program/agenda`,
      `/program/speakers`, `/program/abstracts`, `/program/communications`,
      `/portals/tasks`
- [ ] `npm run check` passes (typecheck, tests, production build)
- [ ] Docs updated if the implementation deviates from design.md (update design.md, don't
      leave it stale)
