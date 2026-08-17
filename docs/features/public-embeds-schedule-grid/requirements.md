# Public Embeds — Schedule Grid View — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Low
**Last Updated:** 2026-08-15

## Problem Statement

Uncommitted work already sitting on `main`'s working tree adds a new public embed view,
`schedule_grid` — a day-by-day timetable with rooms as columns and time slots as rows, alongside the
existing `agenda`, `schedule_itinerary`, `session_list`, `speaker_gallery`, `speaker_list` views. The
implementation looks essentially complete (renderer, type, labels, builder UI wiring, and matching
tests all present and passing — 13/13 in `embed-renderer.test.tsx` + `public-embed-saved.test.ts`), but
it has never been committed, pushed, or verified live in a browser. This is small, low-risk, and mostly
a "finish and ship" task rather than new design work.

## Functional Requirements
- FR-001: Commit the existing uncommitted changes (`EmbedRenderer.tsx`, `types.ts`, `public-embed.ts`,
  and their test files) as a real, reviewable change
- FR-002: Verify live in a browser that an organizer can select "Schedule grid" as an embed view in the
  embed builder (`EmbedEditorPage.tsx`) and that the public embed page renders it correctly
- FR-003: Confirm the grid correctly groups sessions by day → room (column) → time slot (row), including
  sessions with no room assigned (falls back to "General" per the existing code)

## Out of Scope
- Any new embed view types beyond `schedule_grid`
- Changes to the embed builder's other fields (theme, colors, field visibility) — untouched by this work

## Success Metrics
- `schedule_grid` is a real, committed, shipped feature — selectable in the builder, correctly rendered
  publicly, covered by passing tests, and confirmed working in a live browser (not just unit tests)
