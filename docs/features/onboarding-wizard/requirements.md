# Organizer Onboarding Wizard — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-12

## Problem Statement
A brand-new organizer who signs up today lands directly on `/dashboard` with an empty stat grid
and a scrappy "Claim owner access" banner (`src/pages/dashboard/DashboardHome.tsx`, marked
`// TEMPORARY` in the code). There is no guided path to:
- confirm who they are and claim organizer access (today this is a manual banner click)
- name/create the conference they're organizing (today they must find Settings > Event Details
  themselves, with no signal that this is the first thing to do)
- connect email delivery so submission/decision emails actually send
- bring over speakers and past talks from a prior conference instead of re-entering everything

Every one of these exists as a capability already (`organizers.claimOwner`, `events.save`,
`email_integrations`, `speakers.create`) but there is no onboarding surface that sequences them
for a first-time organizer. The result: new organizers either get stuck, or skip email/import
setup entirely because they never see it.

## User Stories

**As a** brand-new organizer who just signed up
**I want to** be walked through claiming access, naming my conference, connecting email, and
optionally importing my speaker/session list from a prior event
**so that** I have a working, populated event instead of an empty dashboard.

**Acceptance Criteria:**
- GIVEN a signed-in user with no `organizers` row AND no completed onboarding
  WHEN they land on any authenticated route
  THEN they are redirected to `/onboarding` and the first step claims organizer access for them
- GIVEN a signed-in organizer who has not finished onboarding
  WHEN they visit any authenticated **organizer-facing** route other than `/onboarding`
  (`/dashboard`, `/program/*`, `/settings/*`, `/portals/forms`, `/portals/tasks`)
  THEN they are redirected to `/onboarding` at their current (or first incomplete) step
- GIVEN a signed-in **speaker** (no `organizers` row, using `/portal/*`)
  WHEN they visit the speaker portal
  THEN they are never redirected to `/onboarding` — the wizard is organizer-only and must not
  gate the speaker-facing portal route
- GIVEN an organizer on the "Conference details" step
  WHEN they submit a conference name (and default dates/timezone are pre-filled)
  THEN an `events` row is created and reused for every later step
- GIVEN an organizer on the "Connect email" step
  WHEN they choose to skip
  THEN onboarding proceeds and they can connect email later from Settings > Email Delivery
- GIVEN an organizer on the "Import from a previous conference" step
  WHEN they upload a CSV of speakers/talks and confirm the preview
  THEN speaker records (and, where a talk title is present, submission records) are created for
  the event, duplicates by email are skipped and reported, and invalid rows are reported without
  blocking the valid ones
- GIVEN an organizer finishes or explicitly skips every step
  WHEN they click "Finish" / "Go to dashboard"
  THEN `organizers.onboardingCompletedAt` is set and they land on `/dashboard`
- GIVEN an organizer already finished onboarding
  WHEN they open `/onboarding` again (e.g. via a "Setup" link in Settings)
  THEN the wizard opens pre-filled with their current data so they can redo/import more later

## Functional Requirements
- FR-001: New route `/onboarding` (auth-required, outside `AppLayout`) hosting a 4-step wizard:
  Welcome & claim → Conference details → Connect email → Import previous conference data.
- FR-002: Step 1 auto-displays the organizer's email from the Clerk session (read-only) and, if
  no `organizers` row exists yet for this account, claims owner access automatically when the
  user continues (replaces the manual banner in `DashboardHome.tsx`).
- FR-003: Step 2 creates/updates a single `events` row with name (required), slug
  (auto-slugified from name, editable), type, timezone (defaulted from the browser), start/end
  dates (defaulted to today + 90 days, one day long). Full room/track/theme detail stays in
  Settings > Event Details — not duplicated here.
- FR-004: Step 3 lets the organizer connect a Resend or SES email integration for the event
  using the same fields/validation as Settings > Email Delivery, extracted into a shared
  component. Skippable.
- FR-005: Step 4 lets the organizer upload one CSV file containing speakers and, optionally,
  one past talk per speaker. Parsed rows render in a preview table with per-row validation
  errors before anything is written. Confirming imports valid rows; skippable entirely.
- FR-006: A route guard redirects any authenticated route other than `/onboarding` to
  `/onboarding` whenever the signed-in user has no `organizers` row, or has one but
  `onboardingCompletedAt` is unset.
- FR-007: Every step past step 1 has an explicit "Skip" action. A "Finish" action is always
  reachable and marks onboarding complete regardless of which steps were skipped.
- FR-008: `/onboarding` remains reachable after completion (e.g. a "Resume setup" / "Import more
  data" link from Settings) and re-opens pre-filled with current event/integration state.

## Non-Functional Requirements
- NFR-001: CSV parsing happens client-side; only validated rows are sent to Convex mutations —
  no raw file upload to the server, no server-side CSV parsing dependency.
- NFR-002: CSV import is capped at 500 rows per upload with a clear inline error above the cap
  (protects a single Convex mutation call from an unbounded payload).
- NFR-003: The redirect guard must not create a redirect loop on `/onboarding` itself, and must
  not block the public `/submit/*`, `/e/*`, `/sign-in`, `/sign-up` routes.
- NFR-004: All new server functions follow the existing `assertOrganizer`/`requireIdentity`
  pattern in `convex/functions.ts` — no new auth pattern introduced.

## Naming Note
This feature's "onboarding" is **organizer onboarding** (claiming access, setting up an event).
It is unrelated to the existing `onboarding_tasks` table / `/portals/tasks` admin page, which
tracks **speaker** onboarding tasks (document collection, confirmations, etc.) for an event
already in progress. Do not conflate the two — no schema, route, or component here should touch
`onboarding_tasks`.

## Out of Scope
- Drag-and-drop / arbitrary CSV column mapping UI. v1 requires the documented header names
  (`firstName,lastName,email,bio,talkTitle,talkAbstract`); a downloadable CSV template covers
  this instead of a mapping step.
- Importing agenda/schedule, tags, tracks, rooms, or evaluation data from CSV.
- Any integration other than email delivery (no Slack/calendar/etc. connectors — none exist in
  the app today; do not stub placeholder cards for integrations that don't exist yet).
- Multi-event organizations / choosing which event to onboard into — this wizard always targets
  the organizer's first (or most recently created) event, matching the existing single-event
  assumption in `DashboardHome`/`EventDetails` (`repo.events.list()[0]`).
- Airtable backend support for onboarding — the wizard requires Convex (organizer claim, storage,
  encrypted email credentials); explicitly blocked on the Airtable adapter with a clear error,
  matching the existing pattern in `src/data/airtable/index.ts`.

## Success Metrics
- A new organizer can go from first sign-in to a named, published-ready event with email
  connected and speakers imported without leaving `/onboarding`.
- Zero organizers land on an empty `/dashboard` with the old manual "Claim owner access" banner
  (that banner is removed once the wizard ships).

## Research Notes
Spreadsheet-import UX in 2026 converges on a **file → map → validate → submit** flow, with
"map" simplified to a documented template when arbitrary column mapping isn't worth the scope
(csvbox.io). General SaaS onboarding guidance for 2026 favors a short, skippable, outcome-driven
flow over a forced tour — every step here is skippable except the mandatory identity claim and
conference name, and the flow ends in a real "Finish" action rather than trailing off.

Sources:
- [Best UX flow for spreadsheet imports — CSVBox](https://blog.csvbox.io/spreadsheet-import-ux/)
- [SaaS Onboarding UX: Best Practices, Patterns & Examples (2026)](https://www.designstudiouiux.com/blog/saas-onboarding-ux/)
