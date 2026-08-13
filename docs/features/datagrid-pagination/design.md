# DataGrid Pagination — Technical Design

## Database / Schema Changes

**N/A — paging is client-side over an array already in memory.** No Convex table, index, or
migration is touched. `convex/schema.ts` is not modified.

---

## Backend / API

**N/A — no endpoint changes.** Confirmed the data path: pages call the repo abstraction
(`src/data/repo.ts` via `useRepo()`), receive a full array, and filter it in a `useMemo`
(`src/pages/program/Abstracts.tsx:179`). Pagination slices that same array after filtering.
No new fetches, no adapter (`src/data/convex/`, `src/data/airtable/`) changes.

**Deployment constraint checked:** `wrangler.jsonc` — irrelevant here, no server work.

**Packages checked against `package.json`:** every import below (`react`, `react-router-dom`,
`lucide-react`, `@/components/ui/button`, `@/components/ui/select`) already exists. **No new
dependency is required — do not install anything.**

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/components/shared/DataGrid.tsx` | Add pagination props, internal page state, row slicing, and a footer |
| `src/pages/program/Abstracts.tsx:241` | Pass `paginated`; delete the hand-written `<footer>` incl. the `Show 25` span |
| `src/pages/program/Agenda.tsx:90` | Delete the hand-written footer; pass `paginated` |
| `src/pages/program/Communications.tsx:170` | Delete the hand-written footer; pass `paginated` |

`src/pages/dashboard/SpeakerTracking.tsx` and `src/pages/program/Evaluation.tsx` also use
`DataGrid` but have **no footer** — leave them alone; they simply don't pass `paginated`.

### Modified: `DataGrid`

File: `src/components/shared/DataGrid.tsx`

Current signature (line 5), verbatim:

```ts
export function DataGrid<Row extends { id: string }>({ rows, columns, empty, loading = false, skeletonRows = 5 }: { rows: Row[]; columns: DataGridColumn<Row>[]; empty: string; loading?: boolean; skeletonRows?: number })
```

New signature — add exactly two optional props, do not remove or rename any existing one:

```ts
export function DataGrid<Row extends { id: string }>({
  rows, columns, empty, loading = false, skeletonRows = 5,
  paginated = false,
  defaultPageSize = 25,
}: {
  rows: Row[];
  columns: DataGridColumn<Row>[];
  empty: string;
  loading?: boolean;
  skeletonRows?: number;
  paginated?: boolean;          // opt-in; when false behaviour is byte-identical to today
  defaultPageSize?: 25 | 50 | 100;
})
```

Internal state — exactly these two:

```ts
const [page, setPage] = useState(1);              // 1-indexed
const [pageSize, setPageSize] = useState<number>(defaultPageSize);
```

Derived values:

```ts
const total = rows.length;
const pageCount = Math.max(1, Math.ceil(total / pageSize));
const safePage = Math.min(page, pageCount);        // guards a stale page after rows shrink
const start = (safePage - 1) * pageSize;
const visible = paginated ? rows.slice(start, start + pageSize) : rows;
const rangeStart = total === 0 ? 0 : start + 1;
const rangeEnd = Math.min(start + pageSize, total);
```

Reset-to-page-1 effect (**required** — without it, filtering to 3 results while on page 5
renders an empty grid):

```ts
useEffect(() => { setPage(1); }, [total, pageSize]);
```

Render `visible` in the existing `<tbody>` map instead of `rows`. **Everything else in the
existing table markup — `colgroup`, `table-fixed`, `truncate px-4 py-3`, the `selected`
row highlight, the `onClick` that sets `?selected=`, the empty-state `<tr>` — stays exactly
as it is today.** Do not restyle the table.

### New sub-component: pagination footer

Rendered inside `DataGrid`, **outside** the `overflow-x-auto` wrapper, as a sibling below it.
Rendered only when `paginated && !loading && total > 0`. When `total <= pageSize`, render the
range text but **hide the Previous/Next buttons and the page-size select** (`pageCount === 1`).

- **Container:** `<footer className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3 text-sm text-muted-foreground">`
  — no background, no border, no shadow, no top rule. Separation is whitespace only.

- **Left: range text**
  - Element: `<span>`
  - Content: `` `${rangeStart} — ${rangeEnd} of ${total} rows` `` (em dash, matching today's copy)
  - When `total === 0`: `"0 rows"` — but note the empty state already renders inside the table, and the footer is skipped entirely at `total === 0`.

- **Right: control cluster** — `<div className="flex items-center gap-2">`

  1. **Page-size select** — shadcn `Select` from `@/components/ui/select` (already used on
     `Evaluation.tsx` after audit fix R-10; **do not use a native `<select>`** — banned, see
     `docs/DESIGN-SYSTEM.md` and audit R-10/R-11).
     - `<Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>`
     - `<SelectTrigger className="h-8 w-[5.5rem]" aria-label="Rows per page">`
     - `<SelectValue />` renders `Show 25` / `Show 50` / `Show 100`
     - `<SelectContent>` with three `<SelectItem value="25|50|100">Show 25|50|100</SelectItem>`
     - This is what replaces the dead `Show 25` span — same words, now a real control.

  2. **Previous button**
     - `<Button variant="outline" size="sm" aria-label="Previous page" disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>`
     - Content: `<ChevronLeft className="h-4 w-4" />` from `lucide-react`
     - `variant="outline"` maps to `bg-background hover:bg-muted text-foreground` (`button.tsx:15`) — no border renders, per the global border override.

  3. **Page indicator**
     - `<span className="tabular-nums">{`Page ${safePage} of ${pageCount}`}</span>`

  4. **Next button**
     - Same as Previous but `aria-label="Next page"`, `disabled={safePage === pageCount}`,
       `onClick={() => setPage(p => Math.min(pageCount, p + 1))}`, `<ChevronRight />`

  **Do not use `variant="accent"`** on either button — audit S-5 requires exactly one accent
  button per page, and Abstracts already spends it on `Add Abstract`.

### Consumer changes — exact edits

**`src/pages/program/Abstracts.tsx:241`** — currently ends with:

```tsx
<DataGrid rows={visibleRows} columns={columns} empty="No abstracts match this view." loading={loading} /><footer className="flex items-center justify-between text-sm text-muted-foreground"><span>{visibleRows.length ? `1 — ${visibleRows.length} of ${visibleRows.length} rows` : "0 rows"}</span><span>Show 25</span></footer>
```

Replace with:

```tsx
<DataGrid rows={visibleRows} columns={columns} empty="No abstracts match this view." loading={loading} paginated />
```

The `<footer>` is deleted entirely. Apply the same deletion pattern at `Agenda.tsx:90` and
`Communications.tsx:170` — read each one first and remove only the footer element, keeping
surrounding JSX intact.

---

## State / Data Flow

```
Abstracts: useRepo() → repo.listSubmissions() → rows: AbstractRow[]  (all 500)
  → useMemo filterSubmissionsByStatus(rows, status) + query substring match  (Abstracts.tsx:179)
  → visibleRows: AbstractRow[]                                      (still all matches)
  → <DataGrid rows={visibleRows} paginated />
      → DataGrid slices rows.slice(start, start + pageSize)         (≤ 25 in DOM)
      → user clicks Next → setPage(p+1) → re-slice → re-render
      → user changes tab/search → visibleRows.length changes → useEffect resets page to 1
```

Local state introduced, both inside `DataGrid`:
- `page: number` (1-indexed, default 1)
- `pageSize: number` (default 25)

Row selection stays where it is: `useSearchParams()` `?selected=<id>` at `DataGrid.tsx:6`.
It is **not** page state and must not be reset when the page changes.

---

## Auth / Permissions

**N/A — no auth boundary is crossed.** `DataGrid` is a presentational component; every page
that uses it is already behind whatever gate its route has. No `ctx.auth` check involved.

---

## Edge Cases & Error States

| Scenario | Handling |
|---|---|
| `rows` empty (`total === 0`) | Footer not rendered; existing empty-state `<tr>` with `empty` message shows, unchanged |
| `total <= pageSize` | Range text renders; Prev/Next and page-size select hidden (`pageCount === 1`) |
| Filter shrinks results while on page 5 | `useEffect([total])` resets to page 1; `safePage` also clamps in the same render, so no empty frame |
| Page size raised 25 → 100 while on page 4 | `useEffect([pageSize])` resets to page 1 |
| `loading === true` | Existing skeleton branch returns early (`DataGrid.tsx:11`) — footer never renders during load |
| Row selected on page 2, then Next clicked | `?selected=` untouched; detail pane keeps showing that row even though it left the viewport. Acceptable — matches how the pane already behaves across tab changes |
| `paginated` not passed (SpeakerTracking, Evaluation) | `visible === rows`, no footer, zero behavioural change |
| API failure | Already handled upstream by each page's `loadError` banner — not DataGrid's concern |

---

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where paging lives | Inside `DataGrid` | Three pages had three hand-written footers that drifted from reality; one owner fixes all three and prevents the next drift |
| Opt-in via `paginated` | Yes | `SpeakerTracking`/`Evaluation` have small row counts and no footer today; opting them in silently would be an unrequested UI change |
| Client-side slicing | Yes | Data already fully in memory; server pagination would mean adapter changes in both Convex and Airtable backends for no user-visible gain at this scale |
| Page-size control | shadcn `Select` | Native `<select>` is banned (audit R-10/R-11); `Select` is already the established replacement in this codebase |
| Keep the words "Show 25" | Yes | Same copy the footer used, now attached to a real control instead of a lie |

## Dependencies

**Requires:** nothing — all imports already present in `package.json`.
**Enables:** functional `Sort` / `Filter` buttons on Abstracts later (they will want page reset too).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Stale page renders an empty grid after filtering | Both a reset `useEffect` **and** a `safePage` clamp — belt and braces, verified by an acceptance criterion |
| Silently changing grids that didn't ask for it | `paginated` defaults to `false`; the non-paginated path returns `rows` untouched |
| Footer reintroduces a banned divider | Design spec above explicitly forbids border-top/`<hr>`; separation is `pt-3` whitespace |
