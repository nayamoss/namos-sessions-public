# DataGrid Pagination — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-09

## Problem Statement

`DataGrid` has no pagination. Every consuming page renders every row it is handed, while
three of them print a footer that claims otherwise.

Measured on `/program/abstracts` with the 500-row demo seed: `tbody tr` count = **500**,
while the footer reads `1 — 500 of 500 rows` and, next to it, the literal string `Show 25`.
`Show 25` is not a control — it is a hardcoded `<span>` (`src/pages/program/Abstracts.tsx:241`).
It reads as a page-size selector, does nothing, and is contradicted by the row count beside it.

This matters on two axes:

1. **Correctness** — the footer states something untrue on the most-clicked screen.
2. **Speed** — 500 rows × 9 columns = ~4,500 cells mounted at once, each row carrying an
   `onClick` closure. Judging criteria explicitly score speed.

Source of the finding: `docs/DESIGN-AUDIT.md` § D-05.

## User Stories

**As an** organizer reviewing abstracts **I want** the grid to load a page at a time **so that**
the screen stays responsive with a real conference's worth of submissions.

**Acceptance Criteria:**
- GIVEN 500 submissions WHEN I open `/program/abstracts` THEN at most 25 `tbody tr` are in the DOM
- GIVEN 500 submissions WHEN I read the footer THEN it says `1 — 25 of 500 rows`
- GIVEN I am on page 1 WHEN I click Next THEN rows 26–50 render and the footer reads `26 — 50 of 500 rows`
- GIVEN I am on page 1 WHEN I look at Previous THEN it is disabled
- GIVEN I am on the last page WHEN I look at Next THEN it is disabled
- GIVEN I change page size to 50 WHEN the grid re-renders THEN I am returned to page 1 and 50 rows render
- GIVEN I am on page 3 WHEN I type in the search box THEN I am returned to page 1 (results would otherwise be out of range)
- GIVEN I change the status tab WHEN the grid re-renders THEN I am returned to page 1
- GIVEN I select a row on page 2 WHEN the detail pane opens THEN the grid stays on page 2
- GIVEN fewer rows than one page WHEN the grid renders THEN pagination controls are hidden entirely

## Functional Requirements

- FR-001: `DataGrid` accepts optional pagination and owns the slicing — consumers pass the full filtered array, unchanged.
- FR-002: Default page size is 25. Page size options: 25, 50, 100.
- FR-003: The footer is rendered by `DataGrid`, not hand-written per page — the three existing hand-written footers are deleted.
- FR-004: Page state resets to 1 whenever the incoming `rows` identity changes length or content (filter/search/tab change).
- FR-005: Pagination is opt-in via a `paginated` prop so grids with inherently small row counts are unaffected.
- FR-006: Row selection (`?selected=` search param) is unaffected by paging.

## Non-Functional Requirements

- NFR-001: At most `pageSize` rows in the DOM at any time.
- NFR-002: Paging is client-side only — no new API calls, no repo/adapter changes.
- NFR-003: Controls are keyboard reachable and screen-reader labelled.

## Out of Scope

- Server-side / cursor pagination in the Convex or Airtable adapters.
- Sorting and filtering (the `Sort` and `Filter` buttons on Abstracts remain non-functional — separate work).
- Virtualised scrolling.
- Adding pagination to `SpeakerTracking` and `Evaluation` (they may opt in later via the same prop).

## Success Metrics

- `document.querySelectorAll('#abstracts tbody tr').length` ≤ 25 with the 500-row seed.
- Footer string matches the rendered range on every page.
- No `Show 25` string remains anywhere in `src/`.
