# Task Templates + Automated Onboarding — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-12

## Problem Statement
Speaker onboarding tasks are created two ways today, and neither scales: (1) a hardcoded 4-item
array (`Upload headshot`, `Confirm bio`, `Upload slides`, `Sign speaker agreement`) fires once
when a submission is accepted, with no way to change it per event or speaker type; (2)
organizers otherwise add every task one at a time through a manual form. A keynote speaker needs
a different checklist than a panelist, and there's currently no way to express that without
editing code. Organizers are stuck doing manual, repetitive setup for something that should be
config.

## User Stories

**As an** organizer **I want to** define reusable task templates for different speaker types
**so that** I don't hand-build the same checklist for every submission.

**Acceptance Criteria:**
- GIVEN an event with no templates configured WHEN a submission is accepted THEN the existing
  4-item default list is still applied (no regression, no silent breakage).
- GIVEN an organizer has created a template and set it as the event default WHEN a submission is
  accepted THEN that template's items are applied instead of the hardcoded list.
- GIVEN an organizer is viewing a submission's tasks WHEN they choose "Copy from…" and pick a
  template THEN that template's items are added, skipping any item whose title already exists as
  an auto-created task for that submission.
- GIVEN an organizer opens Event Settings WHEN they view the Task Templates section THEN they see
  all templates for the event, can create/edit one, and can mark one as the default.

## Functional Requirements
- FR-001: New `task_templates` table, event-scoped, holding an ordered list of task items (title,
  description, targetType, linkedFormId, dueDate offset in days).
- FR-002: Six starter templates seeded per event: Standard Speaker Onboarding, Keynote Speaker,
  Workshop Facilitator, Panelist, Virtual/Remote Speaker, Sponsor-Nominated Speaker.
- FR-003: `submissions.decide` applies the event's default template on acceptance instead of the
  hardcoded array. Falls back to the existing 4-item behavior if no default template is set.
- FR-004: "Copy from…" control in `TasksAdmin.tsx`'s Add Task panel applies a chosen template's
  items to the current submission/speaker context, skipping title collisions with existing
  `source: "auto"` tasks for that submission (same idempotency rule already used on accept).
- FR-005: New Event Settings page with a Task Templates section: list templates, create, edit,
  delete, and set the event default.

## Out of Scope
- Cross-event / global template library (templates stay scoped to one event).
- Template versioning or edit history.
- Adaptive/behavior-based checklist reordering (noted in 2026 UX research, not needed here).

## Success Metrics
- Zero manual one-by-one task creation needed for the 6 seeded speaker types.
- Existing accepted-submission flow keeps working with no default template configured.

## Research Notes
2026 onboarding UX research confirms checklists scoped to one activation event (e.g. "submission
accepted") outperform broad always-on checklists, and state-based triggers ("has X happened?")
beat session-count triggers — both already match this design (trigger = acceptance, not a timer).
Sources: [SaaS Onboarding Flows 2026](https://www.saasui.design/blog/saas-onboarding-flows-that-actually-convert-2026), [Onboarding UX Patterns](https://www.chameleon.io/blog/onboarding-ux-patterns)
