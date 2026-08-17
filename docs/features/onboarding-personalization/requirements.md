# Onboarding Personalization — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-14

## Problem Statement

The onboarding wizard (`src/pages/onboarding/OnboardingWizard.tsx`) is a 4-step **setup form**,
not an onboarding: Welcome → conference logistics (name, slug, event type, timezone, start/end
date+time) → connect email → import data. It captures zero information about the human signing
up — no role, no team size, no referral source — so there is no acquisition attribution and no
way to personalize the product for who actually showed up.

It also front-loads low-value, high-friction fields. Timezone and exact start/end date+time are
asked before the organizer has even named their conference, on step 2 of 4, as required-feeling
fields in a dense form. 2026 SaaS onboarding research is consistent: max 2 questions at signup,
each must be actionable, everything else deferred to progressive profiling, and no field should
be on the critical path unless the product literally cannot function without it. Competitor
event platforms that are rated easiest to set up (Bizzabo, Swapcard) get organizers to a working
event fast using templates/smart defaults; the platforms with reputations for painful onboarding
(Cvent) front-load configuration the way this flow currently does.

## User Stories

**As a new organizer**, I want to get to a working conference in the fewest possible steps, so
that I feel momentum instead of filling out a form before I've seen any value.

**As the product owner**, I want to know how new organizers found the product and whether
they're running events solo or with a team, so that I can measure acquisition channels and
tailor later nudges (e.g. "invite your team") instead of guessing.

**Acceptance Criteria:**
- GIVEN a brand-new organizer reaches onboarding WHEN they land on the second step THEN they
  are asked exactly 2 questions about themselves ("solo or team", "how did you hear about us"),
  both skippable, before anything about the conference itself.
- GIVEN an organizer proceeds to conference setup WHEN the step loads THEN only the conference
  name is required; timezone is pre-filled from the browser, dates default to two weeks out for
  a one-day event, and all of it is editable inline without leaving the step.
- GIVEN an organizer skips or answers the identity questions WHEN they finish onboarding THEN
  their answers (if given) are saved on their organizer record and visible to the product owner
  via the existing organizers data path (no new admin UI required for v1).
- GIVEN the existing email-connect and import-data steps THEN they are unchanged in behavior,
  only renumbered.

## Functional Requirements
- FR-001: Insert a new onboarding step between "Welcome" and "Your conference" that asks two
  questions: "Are you running this solo or with a team?" (Solo / With a team) and "How did you
  hear about us?" (single-select from a short fixed list + "Other"). Both optional/skippable.
- FR-002: Persist answers on the current user's `organizers` row: `signupRole: "solo" | "team"`
  (optional) and `referralSource: string` (optional).
- FR-003: Collapse the "Your conference" step to one required field (Conference name). Timezone,
  start/end date+time, URL slug, and event type become smart defaults, still visible and
  editable, but never block Continue.
- FR-004: Update step numbering/copy (`stepMeta`, "N / 5" indicator, keyboard-shortcut footer)
  to reflect 5 total steps.
- FR-005: Fix the underlying time-input clipping bug in `DateTimeField.tsx` (narrow fixed width
  clipped the native 12-hour time control) — already patched, ship as part of this change.

## Non-Functional Requirements
- NFR-001: No new required round trip before the organizer sees value — the identity step must
  not block on a network call; it saves opportunistically when they continue.
- NFR-002: Answering the identity questions must never be a prerequisite for creating a
  conference — skipping must work identically to answering.

## Out of Scope
- Building admin-facing analytics/dashboards on top of `signupRole`/`referralSource` (data
  capture only, v1).
- Redesigning the email-connect or import-data steps.
- Progressive profiling beyond this one signup-time step (e.g. asking team size later, in
  context) — noted as a natural follow-up, not built here.

## Success Metrics
- 100% of new organizer signups have a `signupRole` or `referralSource` value (answered or
  explicitly skipped, distinguishable from never-asked).
- Time-to-first-conference-created (step 0 → event saved) decreases, since the conference-setup
  step now only requires one field.
