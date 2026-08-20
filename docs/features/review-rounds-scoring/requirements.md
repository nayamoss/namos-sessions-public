# Reviewer Rounds, Assignments, Scoring, and AI-Assist Boundaries — Requirements

**Type:** Improvement (surfacing + seeding) plus one new mutation and one explicit go/no-go
**Status:** Planned — not implemented
**Priority:** High (brief requirement 4)
**Last Updated:** 2026-08-17
**Related packages:** `evaluation-scoring/`, `evaluation-scorecards/` (#56), `blind-review/` (#57),
`reviewer-assignment-by-filter/`, `reviewer-progress/` (#59), `review-scoring-improvements/`
(#195/#198)

## Problem Statement

Multi-round, rubric-based, optionally blind human review is **built and well tested** here.
`evaluation_plans` carries `rounds`, `scoringScaleMax`, weighted `criteria[]` and `anonymized`;
`evaluation_assignments` is unique per `(plan, submission, reviewer, round)`;
`evaluations.criteriaScores[]` is keyed by criterion id rather than array position, so reordering
criteria cannot silently reassign a recorded score; and `evaluations.myQueue` strips speaker
identity by **removing the key**, not blanking the value.

Three things undercut it.

1. **The demo shows none of it.** The seeded plan is `rounds: 1`, has no `criteria`, is not
   anonymized, and every assignment is round 1. A judge sees a flat single-score review surface and
   concludes rounds and rubrics do not exist.
2. **The UI contradicts the server.** `savePlan` validates 1–5 rounds; the rounds `Select` in
   `src/pages/program/Evaluation.tsx:726-733` offers only `1` and `2`. Anyone using the UI cannot
   create the three-round plan the server supports.
3. **There is no round-advancement workflow.** Nothing promotes a submission from round 1 to
   round 2. A chair must hand-assign every round-2 assignment, which is exactly the manual work the
   product exists to remove.

Separately, `evaluation_plans.aiAssistEnabled` is a stored boolean that **nothing reads**. It is
honestly commented as a stub at `convex/schema.ts:313`, and the plan editor hardcodes `false`
(`Evaluation.tsx:399`). The brief permits optional AI assistance. It also says AI must not displace
the human workflow. Shipping a suggestion feature purely to tick a box is the failure mode; so is
leaving a dead flag in the schema pretending to be a feature.

## User Stories

**As a program chair** I want to run a first round across many reviewers and a second round over
only the shortlist **so that** senior reviewers spend their time on genuine contenders.

**As a program chair** I want weighted criteria **so that** "relevance" can matter more than
"novelty" without asking reviewers to do arithmetic.

**As a program chair** I want to know which reviewers are behind **so that** I can nudge them
before the decision deadline.

**As a reviewer** I want to score against the same rubric every time **so that** my scores are
comparable to everyone else's.

**As a reviewer on a blinded plan** I want to be sure I cannot see the speaker **so that** my score
is defensible.

**As a program chair considering AI help** I want any machine suggestion to be visibly a suggestion
that I must accept **so that** the decision remains mine and is recorded as mine.

### Acceptance Criteria

- GIVEN the plan editor WHEN a chair opens the rounds control THEN options 1 through 5 are offered,
  matching `savePlan`'s validation.
- GIVEN a plan with 2 rounds and completed round-1 scores WHEN the chair advances a selected set of
  submissions THEN round-2 assignments are created for the chosen reviewers, round-1 assignments and
  scores are untouched, and re-running the advance creates no duplicates.
- GIVEN a submission with no round-1 score WHEN the chair tries to advance it THEN it is either
  excluded with a stated reason or requires an explicit override; it is never silently advanced.
- GIVEN a plan with weighted criteria WHEN a reviewer submits a scorecard THEN the stored row keys
  every value by criterion id and the computed total reflects the weights.
- GIVEN an anonymized plan WHEN a reviewer loads their queue THEN the response payload contains no
  `speakerNames` key and no identifying answer keys.
- GIVEN the seeded demo WHEN an organizer opens the evaluation surface THEN a 2-round weighted plan
  with assignments in both rounds, a separate blinded plan, and at least one reviewer visibly behind
  are all present.
- GIVEN AI assist is enabled on a plan (if built at all) WHEN a suggestion is generated THEN it is
  labelled as a suggestion, is never written into `evaluations` without an explicit human action,
  and the recorded score's author is the human reviewer.

## Functional Requirements

- FR-001: Do not rebuild scorecards, blind review, assignment-by-filter, or reviewer progress. All
  four shipped (#56, #57, #59, #195/#198) and are covered by tests.
- FR-002: Raise the rounds control to 1–5 to match the server contract.
- FR-003: Add an idempotent `advanceRound` mutation that creates round-N+1 assignments from an
  explicit submission set and reviewer set.
- FR-004: Seed a 2-round weighted plan, a blinded plan, and assignments spanning both rounds.
- FR-005: Any AI assist must be per-plan opt-in, produce a suggestion object distinct from an
  `evaluations` row, be labelled in the UI as a suggestion, and require an explicit human accept to
  become a score. It must never auto-decide status.
- FR-006: If AI assist is not built, `aiAssistEnabled` must not be left as a silent dead flag — it
  is either removed or surfaced as an explicitly disabled control with honest copy.

## Non-Functional Requirements

- NFR-001 (idempotency): `advanceRound` keys on the existing
  `by_plan_submission_reviewer_round` index (`convex/schema.ts:336`); a repeat call is a no-op per
  already-existing assignment.
- NFR-002 (blind-review integrity): No new field may reach `myQueue`'s projection without passing
  the same key-removal treatment. The known limitation — a free-text abstract that names its own
  author survives — stays documented in `blind-review/requirements.md` and is not oversold.
- NFR-003 (authorization): Round advancement is organizer-only. `listAssignments` keeps its current
  behaviour: a reviewer may only request their own `reviewerUserId`
  (`convex/evaluations.ts:142-163`).
- NFR-004 (data safety): Advancing a round never mutates an existing `evaluations` row.
- NFR-005 (AI cost): If built, AI assist runs through the existing `agent_provider_settings` /
  `agent_usage_records` metering, not a new provider path, and honours managed-allowance limits.

## Out of Scope

- Automatic decisioning from scores. Status changes stay a human action.
- Reviewer conflict-of-interest declarations and recusal.
- Cross-event reviewer pools.
- Changing the 5/10 scoring scale options or the criterion model.
- Reviewer-facing analytics beyond the existing progress panel.

## Success Metrics

- A chair can create a 3-round plan through the UI without touching the database.
- Advancing a 10-submission shortlist creates exactly the expected assignments, twice in a row,
  with no duplicates.
- A judge sees rounds, weights, blind review, and reviewer progress within one minute of opening the
  evaluation surface.
- Zero AI-authored rows in `evaluations`.
</content>
