# Form Templates — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-12

## Problem Statement
Both form builders (`/program/forms` — CFP/abstract forms, and `/portals/forms` — post-acceptance
portal forms) currently start every new form completely blank. "+ Add" jumps straight into an
empty wizard with no fields pre-filled. Admins setting up a new conference have to rebuild the
same common form shapes (abstract CFP, sponsor application, A/V requirements, etc.) from scratch
every time, field by field. This is slow, error-prone (locked/required fields are easy to forget),
and gives no guidance on what a good CFP or portal form actually contains.

## User Stories

**As an** event organizer **I want to** start a new submission form from a ready-made template
**so that** I don't have to rebuild the same common field sets by hand every event.

**Acceptance Criteria:**
- GIVEN I click "+ Add" on `/program/forms` WHEN the gallery opens THEN I see 6 CFP-side
  templates plus a "Start from blank" option
- GIVEN I click "+ Add" on `/portals/forms` WHEN the gallery opens THEN I see 6 portal-side
  templates plus a "Start from blank" option
- GIVEN I pick a template WHEN the wizard opens THEN every step is pre-filled with that
  template's sections, fields, and settings, and every field remains fully editable
- GIVEN a template field matches an existing entry in the shared field library (by label) WHEN
  the template is applied THEN the existing `field_definitions` row is reused, not duplicated
- GIVEN I pick "Start from blank" WHEN the wizard opens THEN behavior is unchanged from today

## Functional Requirements
- FR-001: Define exactly 6 CFP-side templates (Standard Abstract CFP, Full Session Proposal,
  Workshop Proposal, Lightning Talk, Panel Discussion Proposal, Sponsor Session Application) for
  `/program/forms`.
- FR-002: Define exactly 6 portal-side templates (Speaker Contact & Bio, A/V & Tech
  Requirements, Travel & Logistics, Headshot & Bio Confirmation, Sponsor/Exhibitor
  Deliverables, Payment/W-9 Info) for `/portals/forms`.
- FR-003: "+ Add" on both pages opens a template gallery step before the existing wizard, not a
  separate route — cancelling the gallery returns to the forms list with nothing created.
- FR-004: Selecting a template creates field-library entries (reusing existing ones with a
  matching label) and a draft `submission_forms` row pre-populated with that template's sections,
  fields, and default settings, then opens the existing wizard on that draft, editable end to end.
- FR-005: "Start from blank" preserves current behavior exactly (empty draft, wizard step 1).
- FR-006: Template definitions are static, versioned in source (not admin-editable, not stored
  per-event) — the same 12 templates are offered on every event.

## Non-Functional Requirements
- NFR-001: Applying a template must not create duplicate `field_definitions` rows for fields that
  already exist with the same label in the org's field library.
- NFR-002: Gallery must render with skeleton/loading parity matching the existing forms list
  pages (no flash of unstyled content).

## Out of Scope
- Admin-authored/custom templates (only the 12 fixed presets ship in this feature)
- Per-event or per-org template libraries
- Template preview/thumbnail images beyond a short description
- Changes to the underlying wizard steps themselves — templates only pre-fill existing steps

## Success Metrics
- New form creation on both pages defaults to the gallery instead of a blank wizard
- All 12 templates produce a valid, save-able draft form with no manual fixups required
- No duplicate `field_definitions` rows created when two templates share a field label (e.g. both
  "Speaker Contact & Bio" and "Sponsor/Exhibitor Deliverables" using "Email")
