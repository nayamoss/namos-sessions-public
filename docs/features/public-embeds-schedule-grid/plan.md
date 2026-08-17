# Public Embeds — Schedule Grid View — Implementation Plan

## Phase 1: Land the Existing Work
- [ ] T001: Review the uncommitted diff on `main` (`EmbedRenderer.tsx`, `types.ts`, `public-embed.ts`,
  both test files) for correctness — it appears complete, but read it fresh rather than assuming
- [ ] T002: Run `npm run typecheck` and `npm run lint` — confirm both clean
- [ ] T003: Run the full test suite (not just the two touched files) — confirm no unrelated regressions
- [ ] T004: Commit on this issue's branch with a clear message; do not commit directly to `main`

## Phase 2: Frontend UI Verification (required — never skip)

### UI Spec
- **Location:** Embed builder (`EmbedEditorPage.tsx`) view-type `<Select>` — "Schedule grid" should
  appear as an option; the public embed page at that embed's URL should render the grid
- **Elements:** day section headers, a table per day with a "Time" column + one column per room, session
  cards placed in their `[hour, room]` cell, each card showing title + time/room meta + speaker names
- **Behavior:** selecting "Schedule grid" in the builder and saving should make the public embed render
  the grid layout instead of whatever it rendered before
- **Data:** same public embed session data every other view uses — no new fetch

### Tasks
- [ ] T005: Create a real embed on a test event, set its view to "Schedule grid," save
- [ ] T006: Open the public embed URL in a browser, confirm the grid renders correctly with real session
  data (multiple rooms, multiple time slots)
- [ ] T007: Test a session with no room assigned — confirm it lands in the "General" column, not
  dropped or erroring
- [ ] T008: Spot-check the iframe embed snippet (`iframeSnippet` helper) still generates a valid
  `<iframe>` with the new 900px height for this view
- [ ] T009: Check a narrow viewport — confirm the grid scrolls horizontally rather than breaking layout

## Task Dependencies
None — this is entirely self-contained, no blocking external dependency.

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [ ] Feature is accessible and usable in the UI (selectable in the builder, visible on the public page)
- [ ] No regressions introduced to the other five embed views
- [ ] Full test suite passes, not just the two touched files
