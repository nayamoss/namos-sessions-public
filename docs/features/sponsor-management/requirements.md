# Sponsor Management — Requirements

**Type:** Feature
**Status:** Implemented (live UI verification pending authenticated browser session)
**Priority:** Medium
**Last Updated:** 2026-08-12

## Problem Statement
`events.sponsorsEnabled` exists as a toggle on Event Settings but is wired to nothing — flipping
it changes no behavior anywhere in the app. There is no sponsor record, no sponsor contact, no
tier, and no link between a sponsor and the sessions/speakers they nominate. The only trace of
"sponsor" in the product today is a raw tag/track an organizer can hang off a submission via
category routing, and a seeded task-template example ("Sponsor-Nominated Speaker").

`docs/research/competitors.md` already made a deliberate scope call: namos-sessions is
explicitly **not** building sponsor/exhibitor CRM parity with Sessionboard (pipeline, renewal
automation, ROI analytics, SMS, white-labeling — the $40k/yr feature set). That call stands.
This feature is the minimal slice that makes the existing `sponsorsEnabled` toggle mean
something: track who the sponsors are, what tier they're in, who to contact, whether their
deliverables are done, and route their nominated speakers through the CFP without exposing
organizer routing rules publicly. It reuses the onboarding-task system that already exists for
speakers rather than building a second checklist engine.

## User Stories

**As an** organizer **I want to** record each sponsor as a named record with a tier and a
primary contact **so that** I stop tracking sponsors in a spreadsheet next to the tool that
already runs my CFP.

**Acceptance Criteria:**
- GIVEN a published event WHEN I open Sponsors THEN I see a list of sponsor records with name,
  tier, status, and primary contact.
- GIVEN no sponsors exist yet WHEN I open Sponsors THEN I see an empty state with a clear "Add
  sponsor" call to action.

**As an** organizer **I want to** define sponsor tiers with a name and ordering **so that** I can
group sponsors (Platinum/Gold/Bronze, or whatever this event calls them) and reuse those tiers
across sponsor records.

**Acceptance Criteria:**
- GIVEN I create a tier WHEN I assign it to a sponsor THEN the sponsor list and detail panel show
  that tier.
- GIVEN a tier still has sponsors assigned WHEN I try to delete it THEN the delete is blocked with
  a clear reason.

**As an** organizer **I want to** add multiple contacts to one sponsor (a primary rep plus
others) **so that** I know who to email for logo assets vs. who to email for booth logistics.

**Acceptance Criteria:**
- GIVEN a sponsor WHEN I add a contact THEN it appears in that sponsor's contact list with name,
  email, phone, and role.
- GIVEN a sponsor has one or more contacts WHEN exactly one is marked primary THEN that contact is
  what shows in the sponsor list row.

**As an** organizer **I want to** assign onboarding tasks to a sponsor (contract signed, logo
received, booth confirmed) using the same task system speakers already use **so that** I have one
place to see what's outstanding across speakers and sponsors.

**Acceptance Criteria:**
- GIVEN a sponsor WHEN I add a task with target type "Sponsor" THEN it appears on that sponsor's
  detail panel and in the event-wide Tasks admin view.
- GIVEN a task template WHEN it's applied to a sponsor THEN its items are created as sponsor tasks.

**As an** organizer **I want** a submitter who selects "I'm submitting on behalf of a sponsor" on
the CFP form to be automatically linked to that sponsor record and routed to the accept queue
**so that** guaranteed sponsor sessions don't sit in the general review queue and I can see which
sponsor a submission came from without cross-referencing a spreadsheet.

**Acceptance Criteria:**
- GIVEN a routing rule maps a dropdown value to a sponsor WHEN a public submission matches that
  value THEN the resulting submission has `sponsorId` set and follows the rule's existing
  tag/track/status behavior unchanged.
- GIVEN the public CFP form WHEN a submitter views it THEN they see only the dropdown options the
  organizer configured — no internal sponsor routing configuration is exposed.

## Functional Requirements
- FR-001: Organizers can create, edit, and delete sponsor tiers (name, sort order, optional
  color, optional benefits description) scoped to an event.
- FR-002: Organizers can create, edit, and delete sponsor records (name, tier, status: prospect /
  confirmed / declined, website, notes) scoped to an event.
- FR-003: Organizers can add, edit, and remove contacts on a sponsor (name, email, phone, role,
  primary flag). Exactly one contact per sponsor can be marked primary.
- FR-004: `onboarding_tasks.targetType` gains a `"sponsor"` value; tasks can be created against a
  sponsor the same way they're created against a speaker today, including from task templates.
- FR-005: A submission-form routing rule can optionally assign a `sponsorId` to a matching public
  submission, in addition to its existing tag/track/status/reviewer effects.
- FR-006: The Sponsors nav item and page are visible only when `events.sponsorsEnabled` is true
  for the current event (mirrors how other optional sections gate on event settings).
- FR-007: Deleting a tier that still has sponsors assigned is blocked with an explanatory error.
  Deleting a sponsor removes its contacts and unassigns (does not delete) any linked tasks and
  submissions.

## Non-Functional Requirements
- NFR-001: All sponsor data is scoped by `eventId` and gated behind `assertOrganizer`, matching
  every other admin-only table in this schema — no new auth pattern.
- NFR-002: No new information is exposed on the public CFP form beyond the dropdown option labels
  the organizer already configures today; sponsor names/tiers/contacts stay internal.

## Out of Scope
- Sponsor pipeline/deal stages, renewal workflows, or ROI/analytics reporting (Sessionboard-tier
  CRM — explicitly rejected in `docs/research/competitors.md`).
- Public-facing sponsor logo wall / sponsor section on the event page (deferred; internal-only
  for this pass per stakeholder decision).
- Sponsor invoicing, contracts, or payment tracking.
- Airtable data-adapter implementation (the Airtable adapter has not tracked recent features —
  e.g. task templates — and is out of scope here too; Convex-only for v1).
- Bulk sponsor import (CSV), unlike the existing speaker bulk import.

## Success Metrics
- An organizer can fully replace a "sponsors" spreadsheet with this feature: record every
  sponsor, its tier, its contacts, and its outstanding deliverables without leaving the app.
- At least one live event's sponsor-nominated CFP submissions are correctly auto-linked to a
  sponsor record and land in the accept queue with zero manual tagging.
