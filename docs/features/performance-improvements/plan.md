# Performance Overhaul — Implementation Plan

Incremental rollout. Each phase is independently shippable and independently revertible.
The old promise `Repository` and the new `useRepoQuery` coexist until Phase 4 completes.

**No demos, no mocks, no placeholder data.** Every task below produces real working code
against the real Convex deployment. A task is not done because a component renders — it is
done when the real data flows through it in the running app.

---

## Phase 1: Reactive Read Layer (no page changes yet)

Foundation only. After this phase the app behaves identically to today — the new layer exists
but nothing consumes it. That is deliberate: it makes Phase 1 trivially safe to merge.

- [x] T001: Export `normalize`, `normalizeInput`, and `convexFunction` from `src/data/convex/index.ts` so the reactive path reuses them verbatim. Do not duplicate this logic.
- [x] T002: Add `ReactiveTransport` and `ReadState<T>` to `src/data/transport.ts`, next to the existing `DataTransport`.
- [x] T003: Create `src/data/reactive.ts` — `ReactiveContext`, and the `useRepoQuery(operation, input | "skip")` hook that reads it.
- [x] T004: Create `src/data/convex/reactive.tsx` — implement `useRead` via `useQuery` from `convex-helpers/react/cache`, piping results through the exported `normalize`.
- [x] T005: Create `src/data/airtable/reactive.tsx` — implement `useRead` via TanStack `useQuery` over the existing `/api/data` transport. Preserve every existing `throw new Error("...not implemented")` guard exactly. Airtable must not gain or lose a single supported operation.
- [x] T006: Mount `ConvexProviderWithClerk`, `ConvexQueryCacheProvider`, and `QueryClientProvider` in `src/main.tsx`. Do not touch `convex/auth.config.ts`. Do not introduce `CLERK_JWT_ISSUER_DOMAIN`.
- [x] T007: Update `src/data/provider.tsx` to publish the reactive transport alongside the existing promise `Repository`.
- [x] T008: Unit test — for every `ReadOperation`, assert the HTTP path and the reactive path return identical normalized shapes. This is the guard against the two paths drifting.
- [x] T009: Verify in the running app that a signed-out caller is still rejected by every organizer-gated query over the WebSocket. Auth must not regress.

## Phase 2: Persistent Shell (visible win, no data changes)

- [ ] T010: Create `src/components/AppShell.tsx` — sidebar + top bar + `PageHeader` + `<Suspense fallback={<PageSkeleton/>}>` + `<Outlet />`. Move `Navigation` out of `AppLayout` into it unchanged.
- [ ] T011: Create `src/components/shared/PageSkeleton.tsx` per the UI Spec below.
- [ ] T012: Restructure `src/App.tsx` — wrap all protected routes in `<Route element={<AppShell />}>`. Add `handle: { title }` to each route. Replace the bare `<p>Loading…</p>` fallback (`App.tsx:38`).
- [ ] T013: **Verify `/submit/:eventSlug/:formId` and `/e/:eventSlug/:feed` are still outside `AppShell` and `RequireAuth`.** Load both in a clean signed-out browser profile and confirm they render. This is the single highest-risk step in the phase.
- [ ] T014: Remove the `AppLayout` wrapper from all 14 pages that render it. Pages return content only; the shell supplies the chrome.
- [ ] T015: Create `src/lib/route-prefetch.ts` and wire `onMouseEnter` / `onFocus` prefetch to every sidebar link.
- [ ] T016: Verify in the running app: click through every sidebar link and confirm the sidebar, top bar, and account menu never unmount or flash.

## Phase 3: Event Scope (deletes the two-trip waterfall)

- [ ] T017: Create `src/data/EventScope.tsx` — `EventScopeProvider` + `useEventScope()`, subscribing to `events.list` exactly once.
- [ ] T018: Mount `EventScopeProvider` inside `AppShell`, above `<Outlet />`.
- [ ] T019: Handle the no-event-yet case with the empty state defined in the UI Spec below.
- [ ] T020: Verify in the running app via the Network tab: `events:list` is requested **once** per session, not once per navigation.

## Phase 4: Migrate Pages Off `useEffect` (batched)

Each batch: delete `useState`/`useEffect`/`loadRows`, replace with `useRepoQuery`, delete the
manual refetch after every mutation, and replace the page's loading branch with `PageSkeleton`.
Each batch is a separate PR.

- [ ] T021: Batch A — `DashboardHome`, `SpeakerTracking`
- [ ] T022: Batch B — `Abstracts`, `SubmissionForms`, `SubmissionFormBuilder`
- [ ] T023: Batch C — `Evaluation`, `Agenda`, `Availability`, `Communications`
- [ ] T024: Batch D — `EventDetails`, `Library`, `EmailDelivery`
- [ ] T025: Batch E — `PortalHome`, `PortalForms`, `TasksAdmin`, and the remaining portal pages
- [ ] T026: Batch F — `SubmissionPage`, `EmbedPage` (public, unauthenticated — verify signed-out rendering after this batch)
- [ ] T027: Add optimistic updates to the four writes that change a visible row: `submissions.decide`, `submissions.setStatus`, `submissions.setTags`, `tasks.setStatus`. Each needs an explicit rollback path and an inline error. Leave every other mutation pessimistic.
- [ ] T028: Delete every now-dead `loadRows`/`reload` function and confirm no `useEffect` remains that fetches data.
- [ ] T029: Resolve `@tanstack/react-query` per FR-012 — it is genuinely used by the Airtable path now, so confirm the `vendor-query` chunk in `vite.config.ts` is still correct rather than dead weight.
- [ ] T030: Verify in the running app with two browser windows signed in as two organizers: accepting a submission in window A updates window B within one second, with no refresh.

## Phase 5: Server-Side Pagination (last — has correctness prerequisites)

Do not start this phase until Phase 4 is merged. `statusCounts` and server-side `search` are
hard prerequisites, not follow-ups — shipping `listPaginated` without them silently breaks the
status tab counts and the search box.

- [ ] T031: Add `submissions:statusCounts` returning counts per status for the event.
- [ ] T032: Add `submissions:listPaginated` with `status`, `search`, and `paginationOpts` args, over the existing `by_event` index.
- [ ] T033: Add `speakers:listPaginated`.
- [ ] T034: Extend `useRepoQuery` (or add `useRepoPaginatedQuery`) to expose Convex `usePaginatedQuery`. The Airtable path returns a single page and reports `isDone: true` — Airtable pagination is out of scope.
- [ ] T035: Migrate `/program/abstracts` to paginated data. Tab counts come from `statusCounts`. Search and status filter move to server args. Confirm the existing `DataGrid` footer (`src/components/shared/DataGrid.tsx:162`) still reads correctly against server totals.
- [ ] T036: Migrate `/dashboard/speakers` to paginated data.
- [ ] T037: **If a Convex search index turns out to be required for `search`, STOP.** That is a `schema.ts` change and must be raised with Naya before any edit — per the standing database-caution rule.
- [ ] T038: Verify in the running app with the 500-row demo seed: the network payload for `/program/abstracts` contains one page of rows, tab counts match the full dataset, and search returns matches from outside the current page.

---

## Phase 2/3 Frontend UI Spec

The visual design does not change. This work is structural — what changes is *what stays
mounted* and *what the user sees while waiting*. Three components need explicit specs.

### AppShell

- **Location:** Wraps every protected route. Rendered once per session by the layout route in `src/App.tsx`.
- **Elements:**
  - Sidebar, left. Existing `navSections` from `AppLayout.tsx:23-57`, unchanged: Dashboard (Dashboard, Speaker Tracking), Program (Forms, Abstracts, Evaluation, Agenda, Communications, Availability), Portals (Forms, Tasks), Configure (Event settings, Library, Email delivery). Same background as the page in light mode. Collapse toggle (`PanelLeft` icon button) at the top. **No border, no divider between sections** — section grouping is `mt-6` whitespace and a `text-sm text-muted-foreground` section label.
  - Top bar, right-aligned: `NotificationBell`, `AccountMenu`. No border-bottom.
  - `PageHeader` below the top bar: H1 (`text-xl font-semibold`) from the matched route's `handle.title`; optional subtitle (`text-sm text-muted-foreground`). **No buttons, no filters, no search input, no tab bar in the header** — every page keeps its own toolbar row below it.
  - Content area: `<Suspense fallback={<PageSkeleton variant={...} />}><Outlet /></Suspense>`
  - Loading state: only the `<Outlet />` subtree shows a skeleton. The sidebar, top bar, and header are always painted.
  - Error state: existing `ErrorBoundary` continues to wrap the app in `main.tsx`.
- **Behavior:** Navigating swaps only the `<Outlet />` subtree. Sidebar scroll position and collapse state persist. Sidebar links call `prefetchRoute(to)` on `onMouseEnter` and `onFocus`; a failed prefetch is swallowed silently.
- **Data:** `useMatches()` for the title; `useEventScope()` for the event name in the subtitle.

### PageSkeleton

- **Location:** `Suspense` fallback in `AppShell`, and the loading branch of every migrated page.
- **Elements:**
  - Wrapper card: `bg-neutral-100 rounded-[12px] p-4`. No border, no shadow, no outline.
  - `variant="table"`: one toolbar-height `Skeleton` bar, then `rows` (default 8) full-width `Skeleton` bars at row height, `space-y-2`. No divider between rows.
  - `variant="form"`: four stacked pairs of a short label `Skeleton` above a full-width field `Skeleton`, `space-y-4`.
  - `variant="board"`: three `Skeleton` cards in `grid gap-4`.
- **Behavior:** Presentational only. No interaction, no timers, no fade-in that delays first paint.
- **Data:** None. Props only.

### Empty state — no event exists yet

- **Location:** Content area of any page when `useEventScope()` resolves to no event.
- **Elements:** Inside `bg-neutral-100 rounded-[12px] p-8` — Lucide `CalendarDays` icon (size 40, `text-muted-foreground`), heading "No event yet" (`text-base font-medium`), subtext "Create your event to start collecting submissions." (`text-sm text-muted-foreground`), CTA button "Create event" → `/settings/event`.
- **Behavior:** CTA navigates to event settings. No modal.
- **Data:** `useEventScope()`.

---

## Task Dependencies

```
Phase 1 (T001–T009)  ─┬─→ Phase 3 (T017–T020) ─→ Phase 4 (T021–T030) ─→ Phase 5 (T031–T038)
                      │                              ↑
Phase 2 (T010–T016)  ─┴──────────────────────────────┘
```

- Phases 1 and 2 are independent and can land in either order.
- Phase 3 requires Phase 1 (needs `useRepoQuery`) and Phase 2 (the provider mounts in `AppShell`).
- Phase 4 requires Phase 3 (pages read `eventId` from context).
- Phase 5 requires Phase 4 and must not begin before it merges.
- T031 and T032 must ship together. T037 is a hard stop, not a warning.

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` met
- [ ] Return navigation to a visited route renders with **no loading state** (NFR-001)
- [ ] The shell never unmounts on navigation — verified by clicking every sidebar link (NFR-002)
- [ ] `events:list` fires once per session, not once per navigation (FR-006)
- [ ] Accepting a submission updates the row in the same frame and rolls back on failure (FR-009, NFR-003)
- [ ] Two organizers in two windows see each other's decisions within one second (FR-002)
- [ ] Airtable backend: every operation that works today still works; unsupported ones throw identically (FR-004)
- [ ] `/submit/:eventSlug/:formId` and `/e/:eventSlug/:feed` render signed-out in a clean profile
- [ ] Every Convex query still rejects a signed-out caller (NFR-005)
- [ ] No `useEffect` remains anywhere in `src/pages/` that fetches data (FR-002)
- [ ] `@tanstack/react-query` is genuinely used, not dead weight (FR-012)
- [ ] Total shipped JS did not increase (NFR-006)
- [ ] `npm run check` passes (typecheck + tests + build)
- [ ] No visible border, shadow, gradient, `<hr>`, or `divide-` utility introduced by any new component
- [ ] Feature is verified in the **running application** against real Convex data — not asserted from code review
