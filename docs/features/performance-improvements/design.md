# Performance Overhaul — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

No schema change is required. `convex/schema.ts` is already correctly indexed for every
query this work touches — 80 `withIndex` calls across `convex/`, and every list query used by
an organizer screen has a `by_event` index:

```ts
submissions: defineTable({ ... })
  .index("by_event", ["eventId"]).index("by_form", ["formId"])
  .index("by_form_idempotency", ["formId", "idempotencyKey"]).index("by_speaker", ["speakerId"]),
speakers:    defineTable({ ... }).index("by_event", ["eventId"]).index("by_event_email", ["eventId", "email"]),
evaluations: defineTable({ ... }).index("by_event", ["eventId"]).index("by_submission", ["submissionId"]) ...,
comms:       defineTable({ ... }).index("by_event", ["eventId"]),
events:      defineTable({ ... }).index("by_slug", ["slug"]),
```

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| — | NONE | — | — | The slowness is a client transport problem, not a data-model problem. |

Per the global rule on database caution: **no schema or migration work is authorized by this
plan.** If the pagination phase later reveals a missing composite index (e.g.
`by_event_status` for server-side status filtering), that is raised with Naya as a separate
decision before any `schema.ts` edit.

### Migration

N/A — no migration. Convex `paginate()` in Phase 5 operates on the existing `by_event` index.

---

## Backend / API

### Affected Existing Convex Functions

| Function | Change |
|----------|--------|
| `events:list` | None. Called once at the shell instead of once per page. |
| `submissions:list` | None. Kept as-is for portal/public callers that legitimately need the full set. |
| `speakers:list`, `evaluations:list`, `comms:list`, `tags:list`, `forms:list` | None. |
| All queries | **No auth change.** `assertOrganizer(ctx)` and every existing identity check stay exactly as written. |

The reactive client authenticates with the same Clerk session token the HTTP client sends
today. `convex/auth.config.ts` is **not** touched, and `CLERK_JWT_ISSUER_DOMAIN` is not
introduced — auth continues through the existing Clerk↔Convex plugin wiring.

### New Convex Functions (Phase 5 only)

| Function | Args | Returns |
|----------|------|---------|
| `submissions:listPaginated` | `{ eventId: Id<"events">, status?: SubmissionStatus, search?: string, paginationOpts: PaginationOptions }` | `{ page: Doc<"submissions">[], isDone: boolean, continueCursor: string }` |
| `submissions:statusCounts` | `{ eventId: Id<"events"> }` | `{ all: number, accepted: number, pending: number, declined: number, withdrawn: number, draft: number, accept_queue: number, decline_queue: number }` |
| `speakers:listPaginated` | `{ eventId, paginationOpts }` | paginated page of speakers |

**Why `statusCounts` is mandatory, not optional:** `/program/abstracts` renders status tabs
whose counts are computed today by scanning every row in memory
(`Abstracts.tsx:257` — `rows.filter(row => row.status === value).length`). The moment
submissions are server-paginated those counts become wrong, because the client only holds one
page. Server-paginating without shipping `statusCounts` in the same change is a correctness
regression, not just an incomplete optimization.

**Why search must move server-side in the same phase:** `Abstracts.tsx:194` filters on
title/speaker/description/tags across the full in-memory row set. With pagination, client-side
search silently only searches the current page. The `search` arg on `listPaginated` closes
this. If full-text search proves to need a Convex search index (a schema change), Phase 5
stops and the index decision goes to Naya first.

### Validation & Business Logic

Unchanged. All server-side validation, idempotency handling, and the organizer boundary stay
where they are. This work does not move any authorization decision to the client.

---

## Frontend Components

### Modified Files

| File Path | Change |
|-----------|--------|
| `src/main.tsx` | Mount `ConvexProviderWithClerk` + `ConvexQueryCacheProvider` + `QueryClientProvider` above `<App />` |
| `src/data/convex/index.ts` | Export `normalize`/`normalizeInput`/`convexFunction` for reuse; add reactive read implementation; keep `ConvexHttpClient` for writes |
| `src/data/airtable/index.ts` | Add reactive read implementation over the existing `/api/data` transport via TanStack Query. **No change to which operations it supports.** |
| `src/data/provider.tsx` | Provide the reactive transport alongside the existing promise `Repository` |
| `src/data/transport.ts` | Add `ReactiveTransport` interface next to `DataTransport` |
| `src/App.tsx` | Convert protected routes to a layout route; add per-route `handle.title`; replace the bare `Loading…` fallback |
| `src/components/AppLayout.tsx` | Becomes the shell rendered once by the layout route; renders `<Outlet />`; sidebar links gain hover/focus prefetch |
| All 14 pages importing `AppLayout` | Stop rendering `AppLayout`; return page content only |
| All 20 pages under `src/pages/` | Replace `useState`/`useEffect`/`loadRows` with `useRepoQuery`; delete manual refetch calls after mutations |
| `vite.config.ts` | Keep `vendor-query` only if react-query is genuinely used; otherwise remove the chunk and the dependency |

### New Modules

**`src/data/reactive.ts` — the backend-agnostic reactive read contract**

- File: `src/data/reactive.ts`
- Exports:
  - `type ReadState<T> = { data: T | undefined; isLoading: boolean; error: Error | undefined }`
  - `interface ReactiveTransport { useRead<T>(operation: ReadOperation, input: object | "skip"): ReadState<T> }`
  - `const ReactiveContext = createContext<ReactiveTransport | null>(null)`
  - `function useRepoQuery<T>(operation, input | "skip"): ReadState<T>`
- Behavior: `useRepoQuery` is the **only** read API feature code uses. Passing `"skip"`
  suspends the subscription — this is how pages avoid firing queries before the event scope
  resolves. It never returns a promise, so no page can reintroduce a `useEffect` fetch.
- Third-party: none directly.

**`src/data/convex/reactive.tsx` — Convex reactive implementation**

- File: `src/data/convex/reactive.tsx`
- Behavior: maps `ReadOperation` → Convex function name using the **existing**
  `convexFunction` record, subscribes via `useQuery` imported from
  `convex-helpers/react/cache`, then runs the result through the **existing exported**
  `normalize(operation, value)`.
- Why the existing `normalize` must be reused rather than reimplemented: it strips
  Convex system fields and remaps `_id → id`, `internalName → name`, `channel → type`,
  `firstName+lastName → name`, and `speakerId → speakerIds[]`. A parallel copy would drift and
  produce two different shapes for the same operation.
- Third-party: `convex@^1.42.3` (`convex/react`), `convex-helpers@^0.1.120`
  (`convex-helpers/react/cache` — `ConvexQueryCacheProvider`, cached `useQuery`).

**`src/data/airtable/reactive.tsx` — Airtable reactive implementation**

- File: `src/data/airtable/reactive.tsx`
- Behavior: wraps the existing promise `read` in TanStack Query —
  `useQuery({ queryKey: [operation, input], queryFn: () => transport.read(operation, input), enabled: input !== "skip" })`.
- Airtable has no push channel, so it gets cache + dedupe + background revalidation but not
  live updates. That is the correct and expected difference; it is not a gap to close.
- Operations Airtable throws on today throw identically through this path. **No supported
  operation regresses.**
- Third-party: `@tanstack/react-query@^5.83.0` — this is where the currently-dead dependency
  starts earning its place in the bundle.

**`src/data/EventScope.tsx` — resolve the current event once**

- File: `src/data/EventScope.tsx`
- Exports: `<EventScopeProvider>`, `useEventScope(): { event: Event | undefined; eventId: EventId | "skip"; isLoading: boolean }`
- Location: mounted inside the protected layout route, above `<Outlet />`
- Behavior: calls `useRepoQuery("events.list", {})` exactly once for the whole session and
  publishes `events[0]` via context. Pages read `eventId` and pass it straight into their own
  `useRepoQuery` calls, or pass `"skip"` while it is still resolving. This is what deletes the
  serial two-trip waterfall — the event is resolved once per session, not once per navigation.
- Elements: renders nothing of its own; children only.

**`src/components/AppShell.tsx` — the persistent layout route**

- Location: wraps every protected route in `src/App.tsx` via `<Route element={<AppShell />}>`
- Elements:
  - Sidebar (existing `Navigation` from `AppLayout`, unchanged nav sections)
  - Top bar: `NotificationBell`, `AccountMenu`, sidebar collapse toggle
  - `PageHeader`: H1 page title (`text-xl font-semibold`) + optional subtitle
    (`text-sm text-muted-foreground`). Title comes from the matched route's
    `handle.title` via `useMatches()`. **No buttons, no filters, no search, no tabs in the
    header** — per the layout rules, those belong in each page's own toolbar row.
  - `<Suspense fallback={<PageSkeleton />}>` wrapping `<Outlet />`
  - Content area: `<Outlet />`
- Behavior: mounts once per session. Route changes swap only the `<Outlet />` subtree — the
  sidebar, top bar, and header never unmount, so nothing flashes and sidebar scroll position
  is preserved.
- Data: reads `useEventScope()` for the event name in the header.

**`src/components/shared/PageSkeleton.tsx`**

- File: `src/components/shared/PageSkeleton.tsx`
- Props: `{ variant: "table" | "form" | "board" (required); rows?: number (optional, default 8) }`
- Location: `Suspense` fallback in `AppShell`, and the loading branch of every page
- Elements:
  - `variant="table"`: a toolbar-height skeleton bar, then `rows` skeleton rows, each a
    full-width `Skeleton` at row height, inside a `bg-neutral-100 rounded-[12px] p-4` card
  - `variant="form"`: 4 stacked label+field skeleton pairs in the same card
  - `variant="board"`: 3 skeleton cards in a `grid gap-4`
  - No border, no shadow, no divider between rows — vertical rhythm is `space-y-2` only
- Behavior: purely presentational, no interaction.
- Third-party: existing `@/components/ui/skeleton` (shadcn), already used in 10 pages.

**`src/lib/route-prefetch.ts`**

- File: `src/lib/route-prefetch.ts`
- Exports: `prefetchRoute(path: string): void`
- Behavior: holds the same `() => import(...)` thunks used by `React.lazy` in `App.tsx`, keyed
  by path. Calling it triggers the dynamic import; the browser and Vite both dedupe repeat
  calls, so it is safe to fire on every hover. Sidebar `<Link>`s call it on `onMouseEnter`
  and `onFocus`. Failures are swallowed — a prefetch that fails must never surface an error,
  the real navigation will retry.

---

## State / Data Flow

**Today (per page, on every mount):**

```
page mounts → useEffect → loadRows()
  → await repo.events.list()          ← HTTP round trip 1 (serial, blocks everything)
  → await Promise.all([6 queries])    ← HTTP round trip 2
  → setState × 4 → render
navigate away → all state discarded
navigate back → repeat from the top, full loading state
mutation → await write → loadRows() → both round trips again → table re-renders from empty
```

**After:**

```
session start → ConvexProviderWithClerk opens one WebSocket
  → EventScopeProvider subscribes to events.list once   ← resolved once per session
page mounts → useRepoQuery(op, { eventId })
  → cache hit  → renders synchronously, zero round trips, no loading state
  → cache miss → skeleton inside the persistent shell, one round trip, all queries parallel
server data changes (any organizer) → Convex pushes → subscribed components re-render
navigate away → ConvexQueryCacheProvider holds the subscription for its expiry window
navigate back → renders from cache instantly
mutation → optimistic update applies in the same frame
  → server confirms → subscription pushes the authoritative value (no refetch, no reload)
  → server rejects → optimistic update rolls back, inline error shown
```

Writes keep going through the existing promise-based `Repository`. Only the **read** side
becomes hook-based. This is what keeps the blast radius contained and keeps `Repository` as
the single translation point (`src/data/transport.ts`).

---

## Auth / Permissions

- **Unchanged.** Every Convex query keeps its `assertOrganizer(ctx)` / `ctx.auth.getUserIdentity()`
  check exactly as written. No authorization decision moves to the client.
- Identity continues to be derived server-side from the Clerk session — never from a
  client-supplied id or email argument.
- The WebSocket carries the same Clerk token the HTTP client attaches today, via
  `ConvexProviderWithClerk`. `convex/auth.config.ts` is untouched and
  `CLERK_JWT_ISSUER_DOMAIN` is not introduced.
- `RequireAuth` (`src/App.tsx:34`) stays exactly where it is. The public routes
  (`/submit/:eventSlug/:formId`, `/e/:eventSlug/:feed`) must remain **outside** both
  `RequireAuth` and `AppShell` — converting protected routes to a layout route must not
  accidentally pull a public route under it.
- Reactive subscriptions are per-user. A signed-out visitor on a public route opens no
  authenticated subscription.

---

## Edge Cases & Error States

| Case | Behavior |
|------|----------|
| Event scope still resolving | Pages pass `"skip"`; shell renders with skeleton content. No query fires with an undefined `eventId`. |
| No event exists yet | Shell renders; page shows empty state: Lucide icon (size 40, muted) + heading + subtext + accent CTA, inside `bg-neutral-100 rounded-[12px] p-8`. |
| Query error | Inline error text in the content area, below the toolbar. Never a modal, never a toast for a read failure. Retry link re-subscribes. |
| WebSocket drops | Convex reconnects automatically and replays subscriptions. Cached data stays on screen throughout — the user sees stale-but-correct data, not a blank screen. |
| Optimistic mutation fails | Row reverts to its prior value; inline red text appears near the row's action. No modal. |
| Two organizers edit the same row | Last write wins at the server, as today. Both clients converge because both are subscribed. No new locking. |
| Airtable backend selected | Reads go through TanStack Query: cache + dedupe, no live push. Unsupported operations throw exactly as they do today. |
| Prefetch fails (offline, chunk 404) | Swallowed silently. Real navigation retries and surfaces the error through the existing `ErrorBoundary`. |
| Route lazy chunk still loading | `PageSkeleton` inside the shell. The sidebar and header stay visible. |

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Read API shape | Hook (`useRepoQuery`), not promise | A promise API cannot express a live subscription. Making it a hook is what structurally prevents pages from reintroducing `useEffect` fetching. |
| Keep the `Repository` abstraction | Yes | Naya confirmed the client wants Airtable as a real backend option. `Repository` is the only thing that makes that possible; a Convex-native rewrite would delete it. |
| Writes stay promise-based | Yes | Mutations are one-shot by nature. Converting them buys nothing and would double the diff. |
| Query cache layer | `convex-helpers/react/cache` | Already a dependency (`^0.1.120`). Persists subscriptions past unmount, which is exactly the "instant back-navigation" requirement (NFR-001). No new package. |
| Airtable caching layer | `@tanstack/react-query` | Already a declared dependency and currently unused dead weight. This gives it a real job and satisfies FR-012 without adding anything. |
| Event scope | React context at the shell | The `events.list()[0]` waterfall is per-page today. Context resolves it once per session — the single highest-leverage latency fix after the transport. |
| Persistent shell | React Router layout route | Standard, no library needed. `react-live-route`-style keep-alive hacks are unnecessary once the shell is hoisted correctly. |
| Page titles | Route `handle.title` + `useMatches()` | Native to React Router v7. Avoids threading a `title` prop through a shell the pages no longer render. |
| Pagination timing | Last phase, after `statusCounts` + server-side search | Paginating first would silently break tab counts and search. Correctness before throughput. |
| Airtable feature gap | Separate issue | Roughly 30 unimplemented operations is its own project. Bundling it here would make this plan unreviewable and unshippable. |

## Dependencies

**Requires:**
- Nothing new installed. `convex`, `convex-helpers`, and `@tanstack/react-query` are all already in `package.json`.
- Convex deployment reachable over WebSocket (`VITE_CONVEX_URL` — already configured).

**Enables:**
- Live multi-organizer collaboration (two people reviewing one program simultaneously).
- Real-scale events — the app stops degrading as submission count grows.
- A genuine Airtable backend option, since the caching layer is backend-agnostic by construction.
- Closing the Airtable feature gap as a clean follow-up issue, against a stable read contract.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| 20 pages migrated at once produces an unreviewable diff | Naya chose incremental rollout. `useRepoQuery` and the old promise `Repository` coexist; pages migrate in batches, each independently shippable. |
| Normalization drifts between HTTP and reactive paths | Export and reuse the single existing `normalize()`. Do not reimplement it. Add a unit test asserting both paths return identical shapes for each operation. |
| Auth regression when switching to WebSocket | `ConvexProviderWithClerk` is the official binding. No server-side auth code changes. Verify every organizer-gated query still rejects a signed-out caller before merging Phase 1. |
| Optimistic updates leave the UI lying after a failure | Only the four write operations that change a visible row get optimistic treatment, each with an explicit rollback path and an inline error. Everything else stays pessimistic. |
| Server pagination silently breaks tab counts and search | `statusCounts` and server-side `search` ship in the same phase as `listPaginated`, as hard prerequisites. Phase 5 does not merge partially. |
| Public routes accidentally pulled under the authenticated shell | Explicit verification step: `/submit/:eventSlug/:formId` and `/e/:eventSlug/:feed` must render signed-out in a clean browser profile before Phase 2 merges. |
| Convex query cache serves stale data after a mutation | Convex pushes authoritative results over the same subscription — the cache is invalidated by the server, not by a client TTL guess. This is the specific reason for choosing the Convex cache over a hand-rolled one. |
