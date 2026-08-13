# Performance Overhaul — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-11

## Problem Statement

The client's stated reason for replacing Sessionize/Sessionboard is that both are **extremely slow**.
Namos Sessions currently reproduces the exact architecture that makes them feel slow.

The root cause is a single line of architecture: `src/data/convex/index.ts:56` constructs a
**`ConvexHttpClient`** — Convex's stateless, one-shot HTTP client — instead of the reactive
`ConvexReactClient`. Every page then consumes it through hand-rolled
`useState` + `useEffect` + `loadRows()` (`src/pages/program/Abstracts.tsx:158-192`, and the
same shape repeated across all 20 pages under `src/pages/`).

Four measurable consequences:

1. **No client-side cache.** Navigating Abstracts → Agenda → back to Abstracts refetches all
   six queries from scratch and shows a full-page loading state. There is no memory of the
   previous visit. `@tanstack/react-query` is a declared dependency but is **never imported
   anywhere in `src/`** — it is dead weight in the bundle and its own `vendor-query` chunk.

2. **A guaranteed two-trip waterfall on every page mount.** Every page begins with
   `const events = await repo.events.list(); const event = events[0];` and only *then* fires
   its `Promise.all` (`Abstracts.tsx:161-176`). The event lookup is serial and identical on
   every page, so no page can render before two full round trips complete.

3. **Every mutation reloads the page's entire dataset.** Approving one abstract calls
   `loadRows()`, which re-runs all six queries and re-renders the table from empty. There is
   no optimistic update path, so the UI is unresponsive for the duration of the round trip.

4. **The application shell unmounts on every navigation.** `AppLayout` is rendered *inside*
   each page component (14 pages import it) rather than as a React Router layout route. On
   every navigation the sidebar, header, notification bell, and account menu are destroyed and
   rebuilt. The lazy-chunk `Suspense` fallback is a bare `<p>Loading…</p>`
   (`src/App.tsx:38`), so the entire chrome disappears and the screen goes blank between routes.

Additionally, `submissions.list`, `speakers.list`, `evaluations.list`, and `comms.list` all
end in `.collect()` (58 `.collect()` calls across `convex/`, zero `paginate()` calls), so the
full table crosses the wire even though `DataGrid` renders only 25 rows client-side.

## User Stories

**As an** organizer moving between Abstracts, Agenda, and Evaluation
**I want** previously-visited screens to appear instantly
**so that** reviewing a program does not mean waiting through a loading state on every click.

**Acceptance Criteria:**
- GIVEN I have already visited `/program/abstracts` WHEN I navigate away and back THEN the table renders from cache with no loading state
- GIVEN I am on any protected route WHEN I click a different sidebar link THEN the sidebar, header, and account menu remain mounted and visible throughout
- GIVEN a route's data is not yet cached WHEN the page mounts THEN skeleton rows render inside the persistent shell — never a blank screen

**As an** organizer approving an abstract
**I want** the row to update the instant I click
**so that** decisions feel immediate rather than submitted-and-awaited.

**Acceptance Criteria:**
- GIVEN I click Accept on a submission WHEN the click registers THEN the row's status updates immediately, before the server confirms
- GIVEN the mutation succeeds WHEN the server result arrives THEN the row reflects the server value with no visible flash or table re-render
- GIVEN the mutation fails WHEN the error returns THEN the row reverts to its prior status and an inline error appears

**As a** second organizer reviewing the same event
**I want** to see my colleague's decisions appear without refreshing
**so that** two people can review a program simultaneously without duplicating work.

**Acceptance Criteria:**
- GIVEN two organizers have `/program/abstracts` open WHEN organizer A accepts a submission THEN organizer B's row updates within one second with no refresh

**As an** organizer running a real conference with thousands of submissions
**I want** the abstracts screen to stay responsive at that size
**so that** the app does not degrade as the event grows.

**Acceptance Criteria:**
- GIVEN 5,000 submissions exist WHEN I open `/program/abstracts` THEN the initial payload contains at most one page of rows, not all 5,000
- GIVEN I page forward WHEN the next page is requested THEN it loads without refetching prior pages

## Functional Requirements

- **FR-001:** The Convex data path uses `ConvexReactClient` over WebSocket, not `ConvexHttpClient`.
- **FR-002:** A single reactive read hook (`useRepoQuery`) replaces `useState`/`useEffect`/`loadRows` in every page. It is backend-agnostic: it resolves to Convex `useQuery` for the Convex backend and to a TanStack Query subscription over the existing promise transport for the Airtable backend.
- **FR-003:** The `Repository` interface remains the sole translation point between feature code and a backend. No page imports `convex/react` or any Airtable module directly.
- **FR-004:** The Airtable backend keeps working through the new hook for every operation it currently supports. No operation that works today may stop working.
- **FR-005:** Query subscriptions survive component unmount for a bounded period, so returning to a recently-visited route renders from cache with no loading state.
- **FR-006:** The current event is resolved once at the shell level and read from context by every page. No page performs a serial `events.list()` before its own queries.
- **FR-007:** `AppLayout` is a React Router layout route wrapping all protected routes. It mounts once per session and persists across navigation.
- **FR-008:** Every route-level loading state is a skeleton rendered inside the persistent shell. No route renders a bare text fallback or a blank screen.
- **FR-009:** Mutations that change a visible row apply optimistically and roll back on failure.
- **FR-010:** Sidebar links prefetch their route's lazy chunk on hover and focus.
- **FR-011:** Large list queries (`submissions`, `speakers`, `evaluations`, `comms`) are server-paginated via Convex `paginate()` and consumed with `usePaginatedQuery`.
- **FR-012:** `@tanstack/react-query` is either genuinely used (per FR-002) or removed from `package.json` and from the `vendor-query` manual chunk. It may not remain an unused dependency.

## Non-Functional Requirements

- **NFR-001:** Return navigation to a previously-visited route renders cached content in under 100ms with no loading state.
- **NFR-002:** First render of an uncached protected route shows the persistent shell plus skeletons within 200ms of the click. The shell never unmounts.
- **NFR-003:** An optimistic mutation reflects in the UI within one animation frame of the click.
- **NFR-004:** `/program/abstracts` initial data payload does not grow with total submission count beyond one page size.
- **NFR-005:** No regression to the security boundary. Every Convex query keeps its existing `assertOrganizer(ctx)` / identity check. Reactive subscriptions are authenticated with the same Clerk token the HTTP client sends today.
- **NFR-006:** No regression in bundle size. Removing the unused react-query chunk or putting it to work must not increase total shipped JS.

## Out of Scope

- **Closing the Airtable feature gap.** `src/data/airtable/index.ts` is a 24-line HTTP proxy that throws "not implemented" for roughly 30 of ~70 operations (all tag operations, the public/portal form boundary, speaker profile and documents, evaluation plans and assignments, organizers/RBAC, and email integrations). The client wants Airtable to be a real backend option; that is a substantial separate body of work and must be its own issue. This plan only guarantees that Airtable does not *regress* and that it inherits the new caching layer for the operations it already supports.
- Server-side rendering or moving off the Vite SPA.
- Convex schema redesign or index changes — the schema is already well-indexed (80 `withIndex` calls).
- Redesigning any screen's visual layout. Skeleton and shell work is structural only.
- Image/asset optimization and font loading.

## Success Metrics

- Return navigation to a visited route: **no loading state at all** (currently a full refetch every time)
- Round trips before first paint on a protected route: **2 → 0** when cached, **2 → 1** when cold
- Queries re-run after a single-row mutation: **6 → 0** on `/program/abstracts`
- Shell remounts per navigation: **1 → 0**
- Rows transferred for `/program/abstracts` at 5,000 submissions: **5,000 → 25**
- Two organizers see each other's decisions without a manual refresh: **not possible → under 1s**
- Unused dependencies shipped in the bundle: **1 (`@tanstack/react-query`) → 0**
