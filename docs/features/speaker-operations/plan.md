# Speaker Operations Workspace — Implementation Plan

**Status:** Complete — automated gates and local Codex browser verification passed 2026-08-11

**Estimate:** 6–8 hours

**GitHub issue:** [#70](https://github.com/nayamoss/namos-sessions/issues/70)

**Requirements:** [`requirements.md`](./requirements.md)

**Design:** [`design.md`](./design.md)

## Phase 1 — Domain and adapter contract

- [x] T001: Add `SpeakerConfirmationStatus` and required normalized `confirmationStatus` to the shared speaker
  type; normalize missing values to `awaiting` at adapter boundaries.
- [x] T002: Add `speakers.setConfirmationStatus({ eventId, speakerId, status })` to `repo.ts`,
  `transport.ts`, provider implementations, and test doubles.
- [x] T003: Add the Convex schema field and organizer-only mutation. Verify the selected speaker
  belongs to `eventId`; reject unauthenticated, non-organizer, missing-speaker, and cross-event
  requests.
- [x] T004: Add Airtable read/write support for canonical `awaiting`, `confirmed`, and `declined`
  values in `confirmationStatus`; load and verify event ownership before PATCH, and normalize
  unknown/blank legacy values to `awaiting`.
- [x] T005: Add adapter contract tests covering all three values, legacy defaulting, and failed
  authorization. Do not add a migration or new table.

## Phase 2 — Pure speaker-operations model

- [x] T006: Extract `projectSpeakerOperationsRows` from the page. Accept speakers, submissions,
  tasks, comms, and explicit `now`; return the read model in `design.md`.
- [x] T007: Remove the current `sent communication => confirmed` inference. Preserve communication
  timestamps as activity only when available.
- [x] T008: Add pure helpers for summary counts, normalized search, `view` validation, and all five
  view predicates.
- [x] T009: Add unit coverage for accepted-only rows, co-speaker deduplication, multiple accepted
  sessions, dangling speaker ids, task state/overdue boundaries, profile completeness, and honest
  confirmation behavior.

## Phase 3 — Canonical route and navigation

- [x] T010: Add canonical `/program/speakers` route and redirect `/dashboard/speakers` while
  preserving the full query string.
- [x] T011: Move the sidebar item into `PROGRAM` after Abstracts and rename it `Speakers`; update
  matching keyboard navigation metadata if that feature has landed.
- [x] T012: Remove the Dashboard `StatusTabs` switcher and the duplicated
  `SpeakerTrackingContent` render path. Keep Today as the only Dashboard body.
- [x] T013: Add a compact Dashboard needs-attention nudge linking to
  `/program/speakers?view=needs-attention`; do not reintroduce speaker charts/cards there.
- [x] T014: Add routing and navigation tests for canonical path, legacy redirect, query
  preservation, sidebar grouping, and Dashboard de-duplication.

## Phase 4 — Rebuild the Speakers page around the queue

> UI acceptance gate: at 1106×964 the first speaker rows are visible in the initial viewport.

- [x] T015: Replace the four `StatCard`s, ranking list, confirmation chart, overdue section, and
  redundant summary strip with the framed production table specified in `design.md`.
- [x] T016: Add a `ContentToolbar` inside the table surface with a labelled search `Input` and styled app
  `Select`. Synchronize `q` and `view` with URL search parameters; never use native `<select>`.
- [x] T017: Make `DataGrid` the primary surface with separate Name and Email columns plus
  Confirmation, Open tasks, Profile, and Sessions. Keep rows dense; add sortable header buttons,
  `aria-sort`, `aria-selected`, an accessible row action, selected-row highlighting, and a
  focus-restoration ref without converting it to an ARIA grid.
- [x] T018: Implement distinct no-event, no-accepted-speaker, filtered-empty, loading, and read
  failure states, including Retry and the correct Event settings/Abstracts links.
- [x] T019: Ensure filters and the selected row are fully keyboard reachable and
  use visible focus styles; invalid `view` parameters fall back to All.

## Phase 5 — Working selected-speaker pane

- [x] T020: Expand the existing inline `DetailPane` with email, accepted session titles,
  confirmation editor, profile checklist, and every task for the selected speaker.
- [x] T021: Persist confirmation changes through `repo.speakers.setConfirmationStatus`; disable
  unchanged/saving controls, update the table on success, and preserve prior state on error.
- [x] T022: Add an inline `Add task` disclosure with required title and optional due date. Create
  `targetType: contact` tasks scoped to the selected event/speaker, then reload the speaker task
  slice and reset the form.
- [x] T023: Wire task state controls through `repo.tasks.setStatus` for Pending → In progress →
  Completed. Recompute open/overdue counts without a browser refresh.
- [x] T024: Add action-local live feedback, retryable errors, double-submit guards, pane-close URL
  cleanup, and focus restoration to the originating row.
- [x] T025: Add component tests for confirmation success/failure, task validation/create/failure,
  status progression, count refresh, and focus restoration.

## Phase 6 — Responsive and visual quality

- [x] T026: Verify desktop composition at 1106×964: toolbar and table read as one framed surface,
  with first data rows visible immediately.
- [x] T027: Verify mobile composition: full-width toolbar controls,
  horizontally scrollable table, and selected-speaker detail replacing the queue body with a
  Back control; verify dropdowns are not clipped.
- [x] T028: Verify light/dark contrast, long names/emails/session titles, zero/large task counts,
  visible focus, and reduced-motion behavior. Introduce no shadow, divider, gradient, native
  select, header action, or new design token.
- [x] T029: Run the repository design detector on changed UI files and fix relevant findings.

## Phase 7 — Local verification and documentation

- [x] T030: Run typecheck, lint, full tests, production build, and any Convex validation/type
  generation required by the schema change.
- [x] T031: Seed at least four accepted speakers covering confirmed, awaiting, declined, missing
  profile, open task, overdue task, and multiple-session cases. Seed data must be idempotent.
- [x] T032: In the local Codex browser, complete the desktop workflow: search, filter, select,
  change confirmation, reload for persistence, create/start/complete a task, and confirm summaries
  update after every mutation.
- [x] T033: Repeat structural checks at a narrow mobile viewport, exercise empty/read-error/
  mutation-error states, inspect the console, and self-correct all reproducible failures.
- [x] T034: Update `docs/features/INDEX.md`, `docs/PAGES.md`, `docs/UI-INVENTORY.md`, and the
  dashboard plan to make `/program/speakers` the single owner of Speaker Operations.
- [x] T035: Commit only after T030–T034 pass. Mark the task title complete only after local browser
  verification and self-correction are complete.

## Dependencies

- T001–T005 before confirmation UI work (T020–T021).
- T006–T009 before summary, filters, table, or Dashboard nudge (T013, T015–T19).
- T010–T014 before browser navigation verification.
- T015–T019 before pane work so selection and URL ownership are stable.
- T020–T025 before responsive and end-to-end verification.
- T030 and T031 before T032–T033.

## Definition of done

- [x] Every acceptance criterion in `requirements.md` has an automated or named browser check.
- [x] Confirmation is persisted and never inferred from email delivery.
- [x] Organizers can create and complete a speaker task from the selected-speaker pane.
- [x] Dashboard contains no duplicate Speaker Tracking workspace.
- [x] `/program/speakers` is canonical; the old route redirects without breaking deep links.
- [x] Desktop and mobile local browser walkthroughs pass with realistic and empty states.
- [x] Full repository check and adapter authorization tests pass.
- [x] Documentation index and route inventory agree with the implementation.

## Phase 8 — Browser-feedback correction

- [x] T034: Add organizer-only `speakers.create` to Convex, transport/repository, and Airtable,
  including normalized email and event-scoped duplicate validation.
- [x] T035: Keep manually added speakers in the roster before they have accepted sessions.
- [x] T036: Split First name and Last name, make all seven headers sortable with one consistent
  arrow, add URL-backed column visibility, and fit the default table at the reference viewport.
- [x] T037: Add the inline Add speaker workflow and verify validation, persistence, zero-session
  rendering, desktop layout, and narrow-screen completion in the local Codex browser.
