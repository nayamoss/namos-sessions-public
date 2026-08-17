# Event Creation Wizard — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-15

## Problem Statement
Creating an event today is a bare 4-field inline form (`EventEditor` in `EventsLanding.tsx`) with no guidance on what to fill in next. Timezone, location, type, branding, and team are all deferred to a separate Settings page the organizer has to discover on their own, and CFP creation is a completely disconnected flow they have to find from a different tab. There's no single path that takes an organizer from "I need to run a conference" to "event exists, CFP is live" in one sitting. The goal: a wizard that gets a full event **and**, optionally, its CFP stood up in under 10-15 minutes total, without losing anything if they stop partway.

## User Stories

**As an** organizer creating a new event **I want to** walk through one guided wizard for the consequential setup decisions **so that** I don't have to hunt through Settings afterward to make the event usable.

**Acceptance Criteria:**
- GIVEN I click "New event" WHEN the wizard opens THEN I land on a Basics step (name, slug, dates, timezone, location, type) — not the old 4-field form
- GIVEN I complete Basics WHEN I click Next THEN the event is created immediately (draft status) and I'm on the CFP fork step
- GIVEN I'm on the CFP fork step WHEN I choose "Yes, add a CFP" THEN the wizard continues into the CFP template picker and builder, scoped to the event I just created
- GIVEN I'm on the CFP fork step WHEN I choose "Skip for now" THEN the wizard moves to Branding without creating a CFP
- GIVEN I'm on Branding or Team WHEN I click Next without filling anything in THEN the wizard proceeds — these steps are optional
- GIVEN I close the wizard partway through (after Basics) WHEN I reopen the event later THEN my partial progress (event fields already entered) is preserved, because the event row already exists
- GIVEN I reach Review WHEN I click "Create event" (or "Finish") THEN I land on the event workspace, or inside the CFP builder if I chose to add a CFP

## Functional Requirements
- FR-001: Replace `EventEditor`'s "new event" mode with a `WizardShell`-based multi-step wizard. Keep the existing quick "Duplicate event" action (from an existing event) as-is — it is not part of this wizard's scope.
- FR-002: Step 1 — Basics: name, slug (auto-derived, editable), start date, end date, timezone, location, type. On "Next," call `repo.events.save` with these fields plus the existing hardcoded defaults (`exhibitorsEnabled: false`, `sponsorsEnabled: false`, `status: "draft"`) to create the event row and capture `eventId`.
- FR-003: Step 2 — CFP fork: "Add a call for proposals now?" Yes/No choice.
  - Yes → embed the existing `TemplateGallery` inline as the next step; selecting a template calls `repo.forms.createFromTemplate(templateId, eventId)` and the wizard's remaining steps become the existing `SubmissionFormBuilder` step flow (reuse its `WizardShell` steps in place, scoped to the new form).
  - No → skip directly to Branding.
- FR-004: Step 3 — Branding (optional/skippable): logo upload, theme selection. Patches the same `eventId` via `repo.events.save({ eventId, ...patchedFields })`.
- FR-005: Step 4 — Team (optional/skippable): invite collaborators by email (reuse `repo.eventMembers.add`), or copy team from an existing event (reuse the `pullTeamFromEventId` path already on `events.save` — note this only works at creation time per the existing mutation, so if Basics already created the event, expose team-copy as calls to `eventMembers.add` per copied member instead, sourced from the selected event's member list via `repo.eventMembers.list`).
- FR-006: Step 5 — Review: summary of all entered fields with edit-in-place links back to earlier steps, plus a final confirm action that navigates to the event workspace (or into the CFP flow if one was started).
- FR-007: All non-Basics steps operate on an already-created `eventId` (save-early-patch-later) — no step after Basics should be able to lose data by navigating away.
- FR-008: Wizard entry point replaces the current "+ New event" trigger in `EventsLanding.tsx` (currently opens `EventEditor` in `{ mode: "new" }`).

## Non-Functional Requirements
- NFR-001: A first-time organizer with no prior event should be able to complete Basics + skip CFP + skip Branding + skip Team + Review in well under 5 minutes; completing a full CFP inline should keep total wizard time under 15 minutes.
- NFR-002: No step may silently discard entered data — every "Next" that mutates state must complete before advancing, with inline error text on failure (matching the existing `cleanErrorMessage` pattern in `EventEditor`).

## Out of Scope
- The existing "Duplicate event" quick action / dialog (untouched, remains a separate fast path off the events list).
- `OnboardingWizard.tsx` (first-run-only organizer setup flow) — not touched, not merged with this wizard.
- `src/pages/settings/EventDetails.tsx` — remains the long-tail editor for fields not covered in this wizard (description, website URL, exhibitors/sponsors toggles, etc.). This wizard does not need to cover every field Settings exposes.
- Changing the CFP builder's own 7-step internals (setup/welcome/abstract/participant/routing/settings/notifications) — this feature only chains into it, doesn't redesign it.

## Success Metrics
- Organizers can go from "New event" click to a published-ready event + live CFP without leaving the wizard or visiting Settings.
- Reduction in support/confusion around "where do I set timezone/logo/team" (currently scattered across Settings).
