# DataGrid Pagination — Implementation Plan

## Phase 1: Core paging in DataGrid

- [x] T001: In `src/components/shared/DataGrid.tsx`, add `paginated?: boolean` (default `false`) and `defaultPageSize?: 25 | 50 | 100` (default `25`) to the props type and destructure — see design.md for the exact signature.
- [x] T002: Add `const [page, setPage] = useState(1)` and `const [pageSize, setPageSize] = useState<number>(defaultPageSize)`.
- [x] T003: Add derived values `total`, `pageCount`, `safePage`, `start`, `visible`, `rangeStart`, `rangeEnd` exactly as written in design.md.
- [x] T004: Reset to page 1 when the page size or filtered row identity changes.
- [x] T005: Change the `<tbody>` map at `DataGrid.tsx:12` to iterate `visible` instead of `rows`. Change nothing else in that line — keep `colgroup`, `table-fixed`, `truncate px-4 py-3`, the `selected` highlight, and the `?selected=` `onClick` byte-identical.

## Phase 2: Frontend UI — the pagination footer

> A feature is NOT done until it is visible and usable in the UI.

### UI Spec

- **Location:** inside `DataGrid`, rendered as a sibling **below** the `overflow-x-auto` table wrapper. Appears on `/program/abstracts`, `/program/agenda`, `/program/communications` — directly under the grid, where the deleted hand-written footers used to sit.
- **Render condition:** `paginated && !loading && total > 0`. When `pageCount === 1`, render the range text only and hide the button cluster and page-size select.
- **Elements:**
  - Container `<footer className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3 text-sm text-muted-foreground">` — no background, no border, no shadow, no top rule
  - Range text `<span>` — content `` `${rangeStart} — ${rangeEnd} of ${total} rows` `` (em dash)
  - Control cluster `<div className="flex items-center gap-2">` containing, in order:
    - Page-size `Select` from `@/components/ui/select` — `SelectTrigger` `className="h-8 w-[5.5rem]"` `aria-label="Rows per page"`; three `SelectItem`s with values `25` / `50` / `100` and labels `Show 25` / `Show 50` / `Show 100`. **Never a native `<select>`** (banned — audit R-10/R-11)
    - Previous `<Button variant="outline" size="sm" aria-label="Previous page">` with `<ChevronLeft className="h-4 w-4" />`, `disabled={safePage === 1}`
    - Page indicator `<span className="tabular-nums">{`Page ${safePage} of ${pageCount}`}</span>`
    - Next `<Button variant="outline" size="sm" aria-label="Next page">` with `<ChevronRight className="h-4 w-4" />`, `disabled={safePage === pageCount}`
  - Empty state: none — footer is not rendered at `total === 0`; the table's existing empty `<tr>` covers it
  - Loading state: none — the `loading` branch returns early at `DataGrid.tsx:11` before the footer
  - Error state: none — page-level `loadError` banners already handle this upstream
- **Behavior:**
  - Previous → `setPage(p => Math.max(1, p - 1))`; disabled on page 1
  - Next → `setPage(p => Math.min(pageCount, p + 1))`; disabled on the last page
  - Page-size change → `setPageSize(Number(v))`, which resets to page 1 via the effect
  - Clicking a row still sets `?selected=` and does not change the page
- **Data:** none — pure client-side slice of the `rows` prop. No API call, no repo call.
- **Do not** use `variant="accent"` on either button (audit S-5: one accent button per page, already spent on `Add Abstract`).

### Tasks

- [x] T006: Build the footer with every element listed in the UI Spec above.
- [x] T007: Import `ChevronLeft`, `ChevronRight` from `lucide-react`; `Button` from `@/components/ui/button`; `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`. All already in `package.json` — install nothing.
- [x] T008: Gate the button cluster and select behind `pageCount > 1`.

## Phase 3: Migrate the three consumers

- [x] T009: `src/pages/program/Abstracts.tsx:241` — add `paginated` to `<DataGrid>`, delete the trailing `<footer>` element containing the `1 — N of N rows` span and the dead `Show 25` span.
- [x] T010: `src/pages/program/Agenda.tsx:90` — read the line, add `paginated`, delete only the hand-written footer.
- [x] T011: `src/pages/program/Communications.tsx:170` — same.
- [x] T012: Leave `src/pages/dashboard/SpeakerTracking.tsx` and `src/pages/program/Evaluation.tsx` untouched — they have no footer and must not gain pagination in this issue.
- [x] T013: The former hardcoded `Show 25` span is removed; the same text now appears only as a functional page-size option.

## Phase 4: Verify in the running app

- [ ] T014: `npm run dev`, seed present (`npx convex run seed:demo` if the grid is empty — R-18 proved empty-state auditing hides defects).
- [ ] T015: On `/program/abstracts`, assert `document.querySelectorAll('tbody tr').length === 25` with 500 seeded rows.
- [ ] T016: Assert footer reads `1 — 25 of 500 rows`; click Next; assert `26 — 50 of 500 rows` and Previous is now enabled.
- [ ] T017: Jump to the last page; assert Next is disabled.
- [ ] T018: Change page size to 50; assert page resets to 1 and 50 rows render.
- [ ] T019: On page 3, type in the search box; assert the grid returns to page 1 and does not render empty.
- [ ] T020: Select a row on page 2; assert the detail pane opens and the grid stays on page 2.
- [ ] T021: Repeat T015–T016 on `/program/agenda` and `/program/communications`.
- [ ] T022: Confirm no border, rule, divider, or shadow renders on the footer (computed `box-shadow` is `none`, no `border-top`).

## Task Dependencies

- T001–T005 before T006–T008 (footer needs the derived values)
- T006–T008 before T009–T011 (consumers must not lose their footer before the shared one exists)
- T009–T011 before T014–T022

## Verification Checklist

- [ ] All acceptance criteria in requirements.md met
- [ ] Feature is accessible and usable in the UI, verified in the browser with 500 seeded rows — not just implemented
- [ ] `npm run typecheck` clean, `npm run lint` 0 errors, `npm run test` passing
- [ ] `SpeakerTracking` and `Evaluation` render identically to before (no regression)
- [ ] No banned styling introduced (no border, divider, shadow, gradient, blue, radius > 14px)
- [ ] `docs/DESIGN-AUDIT.md` D-05 marked resolved
