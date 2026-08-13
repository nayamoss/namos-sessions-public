# Evaluation Scorecards — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-11

## Problem Statement

A reviewer records exactly one number per submission. `convex/schema.ts` defines
`evaluations.score: v.optional(v.number())`, and `evaluation_plans.scoringScaleMax` is
constrained to `5 | 10`. There is no way for a program chair to say *what* is being scored.

Sessionboard's Call for Papers page — named by the host as a primary interest — lists
"scoring rubrics and weighted evaluation criteria". Its abstract-management page goes
further: each round carries its own scorecard with numeric ratings, text responses and
dropdowns. A bare 1–5 with no named dimensions tells a program committee very little,
which is the same conclusion reached by current guidance on abstract review design.

Requirement 4 ("submission evaluation workflows") is structurally present but is the
thinnest graded area relative to what the host actually pointed at, and it sits in the
middle of his stated priority order: *"evaluate them, put them on the schedule, communicate
them, make them show up."*

## User Stories

**As a** program chair **I want to** define named scoring criteria with individual weights
**so that** reviewers score the dimensions I care about and the totals reflect what matters
most to my programme.

**Acceptance Criteria:**
- GIVEN I am editing an evaluation plan WHEN I add a criterion with a label, max value and weight THEN it is saved on the plan and applies to every round of that plan
- GIVEN a plan has three criteria WHEN a reviewer opens their queue THEN they see one input per criterion, not a single score box
- GIVEN a reviewer has scored every criterion WHEN the review is saved THEN a weighted average is computed and shown to the chair
- GIVEN a plan has no criteria configured WHEN a reviewer opens their queue THEN the existing single-score input is shown unchanged

**As a** reviewer **I want to** score each criterion separately **so that** my assessment is
recorded with the nuance the chair asked for.

**Acceptance Criteria:**
- GIVEN a scorecard with a required criterion left blank WHEN I try to submit THEN submission is blocked with inline text naming the missing criterion
- GIVEN I reopen a review I already submitted THEN every criterion value I entered is prefilled

## Functional Requirements

- FR-001: An evaluation plan stores an ordered array of criteria. Each criterion has an id, a label, a type, a maximum value and a weight.
- FR-002: Supported criterion types are `number` (integer 0..max) and `text` (free response, not scored).
- FR-003: Weight is a positive number, default `1`. Only `number` criteria carry weight.
- FR-004: Criteria are defined **per evaluation plan** and apply to all of that plan's rounds.
- FR-005: An evaluation stores a value per criterion, keyed by criterion id.
- FR-006: The weighted total is `sum(value_i × weight_i) / sum(weight_i × max_i) × max_scale`, computed over `number` criteria only.
- FR-007: The existing `evaluations.score` field is retained and displayed as "Legacy score" for reviews recorded before this change. It is never written by the new scorecard path.
- FR-008: A plan with zero criteria falls back to the current single-score behaviour, unchanged.
- FR-009: Deleting a criterion from a plan does not delete already-recorded values for it; orphaned values are ignored on read.
- FR-010: The organizer-facing submission grid sorts and displays the weighted total.

## Non-Functional Requirements

- NFR-001: No data migration runs. Existing rows remain valid, since new fields are optional.
- NFR-002: The adapter contract is honoured — every new operation is reflected in all adapter files, or it fails at runtime rather than compile time.
- NFR-003: Weighted-total computation lives in a pure function in `src/lib/` and is unit-tested independently of React.

## Out of Scope

- Per-round scorecards (each round having a different criteria set). Criteria are per plan.
- Blind or anonymous review. Tracked separately.
- Dropdown and file-upload criterion types.
- Reviewer calibration flows.
- AI-suggested scores — the AI clause is struck from the brief and `aiAssistEnabled` stays a visible stub.
- Migrating or backfilling existing `score` values into criteria.

## Success Metrics

- A chair defines criteria and a reviewer scores all of them, end to end in the browser.
- The weighted total shown to the chair matches hand calculation for a weighted example.
- Reviews recorded before the change still render, labelled as legacy, with no errors.
- No regression: a plan with no criteria behaves exactly as it does today.
