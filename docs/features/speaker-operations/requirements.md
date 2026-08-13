# Speaker Operations Workspace — Requirements

**Type:** Feature correction / workflow redesign

**Status:** Implemented and locally verified

**Priority:** High

**Last updated:** 2026-08-11

**GitHub issue:** [#70](https://github.com/nayamoss/namos-sessions/issues/70)

**Related:** [dashboard](../dashboard/plan.md) · [portal tasks](../portal-tasks/plan.md) · [speaker portal](../speaker-portal/plan.md)

## Problem statement

The current `Speaker Tracking` surface is duplicated in two places: a Dashboard tab and a
standalone sidebar route. Both render the same report-heavy component. The standalone page
occupies primary navigation space but does not let an organizer perform the work it identifies.

The page also presents four oversized metrics above the actual speaker list, repeats the same
zero values across several sections, and labels a delivered email as speaker confirmation even
though the domain has no persisted confirmation field. This makes the page look unfinished and
can communicate a false state.

Repository evidence confirms this is not only a visual defect:

- `src/pages/dashboard/SpeakerTracking.tsx:27-52` builds the current report and infers confirmation
  from communication delivery or an inactive account instead of a speaker response.
- `src/pages/dashboard/DashboardHome.tsx:1-160` embeds that same report behind a Dashboard tab,
  while `src/App.tsx:23-59` also exposes it as a standalone route.
- `src/components/AppLayout.tsx:22-39` places the standalone route in `DASHBOARD`, separate from
  the Program workflows it depends on.
- `convex/schema.ts:51-69` has no confirmation field, while `convex/schema.ts:131-145` already has
  the task model needed to make the replacement operational.

The correction is to make speaker tracking a Program workflow, not another dashboard. The page
must help an organizer answer and act on three questions:

1. Which speakers need attention, including people added before a session is linked?
2. What exactly is missing or overdue for each person?
3. Can I update the status or task without leaving the page?

## User stories and acceptance criteria

### US-001 — Find speakers who need attention

**As an** organizer, **I want** one searchable and filterable speaker roster **so that**
I can find the next person who needs follow-up.

- GIVEN speakers exist WHEN I open `/program/speakers` THEN the speaker table is the
  primary surface and appears above supplementary reporting.
- GIVEN the page has loaded WHEN I view the workspace THEN the toolbar and production-style data
  table appear immediately; no redundant KPI strip competes with the queue.
- GIVEN I type a name or email WHEN the query changes THEN the table filters client-side.
- GIVEN I activate any column heading WHEN its sort changes THEN rows reorder in ascending or
  descending order, `aria-sort` reflects the direction, and the URL preserves the choice.
- GIVEN the roster is visible WHEN I open Columns THEN I can hide or restore any column while at
  least one remains visible, and the URL preserves the choice.
- GIVEN I select `Needs attention`, `Overdue`, `Awaiting response`, or `Profile incomplete` WHEN
  the filter changes THEN only matching speakers remain and the URL records the view.
- GIVEN no row matches a search/filter WHEN the table renders THEN the empty state explains how
  to clear the view; it does not imply there are no accepted speakers.

### US-002 — Work one speaker without losing queue context

**As an** organizer, **I want** a speaker work panel **so that** I can inspect and update their
onboarding state without navigating through several pages.

- GIVEN I select a row WHEN the detail pane opens THEN it shows contact information, accepted
  submissions, confirmation, profile completeness, and every onboarding task for that speaker.
- GIVEN I change confirmation status WHEN the save succeeds THEN the new persisted status is
  visible in both the pane and table without a full-page refresh.
- GIVEN I create a task with title and optional due date WHEN the save succeeds THEN the task is
  scoped to the selected speaker and current event and appears immediately.
- GIVEN an open task WHEN I mark it complete THEN it persists through `repo.tasks.setStatus`, its
  completion state and row data update immediately.
- GIVEN a mutation fails WHEN the request rejects THEN the prior state remains, an inline error
  names the failed action, and the control can be retried.
- GIVEN I close the pane WHEN focus returns THEN it returns to the originating table row.

### US-003 — Represent confirmation honestly

**As an** organizer, **I want** confirmation to be explicit **so that** a sent email is not
mistaken for an affirmative response.

- GIVEN an accepted speaker has never been updated WHEN the row renders THEN confirmation is
  `Awaiting response`.
- GIVEN an organizer chooses `Confirmed` or `Declined` WHEN the mutation succeeds THEN that value
  is stored on the event-scoped speaker record.
- GIVEN a communication was sent WHEN no response is recorded THEN it may be shown as activity,
  but it must not change confirmation automatically.

### US-004 — Put the workflow in the correct information architecture

**As an** organizer, **I want** speaker operations grouped with Program work **so that** the
navigation reflects the lifecycle from acceptance through event readiness.

- The sidebar label is `Speakers` under `PROGRAM`, adjacent to Abstracts and Availability.
- `/program/speakers` is canonical. `/dashboard/speakers` redirects while preserving search
  parameters so existing links do not break.
- Dashboard no longer duplicates the full Speaker Tracking page or shows a one-item tab bar.
- Dashboard may show a concise needs-attention nudge linking to
  `/program/speakers?view=needs-attention`.

### US-005 — Add a speaker before a submission exists

**As an** organizer, **I want** to add a speaker manually **so that** invited people can enter the
onboarding workflow before or without an accepted abstract.

- GIVEN I choose Add speaker WHEN the inline creation pane opens THEN first name, last name,
  email, and explicit confirmation status are available without losing roster context.
- GIVEN valid unique details WHEN creation succeeds THEN the event-scoped speaker appears
  immediately in the roster with zero sessions and can be opened like any other row.
- GIVEN a duplicate event/email or invalid input WHEN creation fails THEN the pane stays open and
  presents the server validation error without adding an optimistic row.

## Functional requirements

- FR-001: Start from the event speaker roster, then join accepted submissions by speaker id and
  deduplicate session links; speakers without accepted sessions remain visible.
- FR-002: Add persisted `confirmationStatus: awaiting | confirmed | declined` to `Speaker` with
  `awaiting` as the read default for existing records.
- FR-003: Add an organizer-authorized repository mutation for confirmation updates in every
  supported adapter; do not write directly from the page to Convex or Airtable.
- FR-004: Fetch speakers, accepted submissions, onboarding tasks, and communication activity once
  per event load; derive filters and summaries locally.
- FR-005: Use the existing `DataGrid`, `DetailPane`, `ContentToolbar`, app `Select`, `Input`,
  `Button`, and date control patterns. Do not introduce another component system.
- FR-006: Search/filter/selected-speaker state is URL-addressable through `q`, `view`, and
  `selected` search parameters; table sorting uses `sort` and `direction`, column visibility uses
  `hidden`, and the creation pane uses `mode=add`.
- FR-007: Task creation requires a non-blank title and may include a due date; created tasks use
  `targetType: contact` and the selected `speakerId`.
- FR-008: All organizer writes refresh local state from their mutation result or a scoped reload;
  no manual browser refresh is required.
- FR-009: Confirmation persistence uses the canonical storage values `awaiting`, `confirmed`, and
  `declined` in Convex and Airtable; UI labels may be sentence case.
- FR-010: The page does not expose a reminder button, organizer profile editor, or delete-task
  control because none has a supported repository mutation.
- FR-011: Add an organizer-authorized `speakers.create` operation to each supported adapter. It
  normalizes email, rejects event-scoped duplicates, and persists an active speaker record.

## Non-functional requirements

- NFR-001: Page header remains identity-only. Search, filters, and actions live in the toolbar
  below it.
- NFR-002: At 1106×964, the first table rows must be visible without scrolling past a chart or
  large card grid.
- NFR-003: Interactive controls are keyboard reachable, have visible focus, and expose accessible
  names and mutation status.
- NFR-004: Mobile composes into a full-width toolbar, horizontally scrollable table, and full-width
  detail content; desktop uses the existing inline detail pane.
- NFR-005: No native `<select>`, decorative shadow, divider, gradient, or new design token.
- NFR-006: No new runtime dependency.

## Empty, loading, and error states

- No event: explain that an event must be configured and link to Event settings.
- Event with no speakers: explain that the organizer can add one manually or accept an abstract.
- Filtered empty: preserve the toolbar and offer `Clear filters`.
- Loading: table-shaped skeleton plus disabled toolbar controls; never four zero-valued cards.
- Read failure: page-level alert with Retry.
- Mutation failure: action-local error in the detail pane; keep the pane open.

## Out of scope

- Sending reminder email from this page. `CommsRepo` is read-only today; do not ship a fake send
  button or bypass the communications workflow.
- Organizer editing of speaker-owned profile fields, headshots, or documents.
- Bulk task creation or bulk confirmation updates.
- New charts, dashboard builder, or customizable widgets.
- Deleting onboarding tasks; the current repository exposes create and status changes only.

## Confirmed planning decisions

- The user approved an organizer-controlled, persisted confirmation status on 2026-08-11.
- The user approved keeping real email delivery out of this issue rather than presenting a fake
  or untestable action.
- The user's page feedback establishes the information-architecture change: the full workflow
  moves out of Dashboard and becomes `Program > Speakers`.
- The user's 2026-08-11 browser feedback adds manual speaker creation, separate first/last-name
  columns, consistent single-arrow sorting, and user-controlled column visibility.

## Success measures

- A seeded organizer can add and search a speaker, open the pane, set confirmation, create a task,
  and complete it without leaving `/program/speakers`.
- The table begins within 160px of the content surface top at the 1106×964 reference viewport.
- No communication delivery event changes confirmation without an explicit organizer action.
- Dashboard and Speakers share no duplicated `SpeakerTrackingContent` render path.
