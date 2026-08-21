# SessionBoard Evaluation Evidence — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement

Namos publishes release tests and direct proof routes but no result from the same SessionBoard
evaluation harness used by Cicero. Without a preserved, coverage-qualified run, feature gaps and
competitive scores are not directly comparable.

## User Stories

**As an** evaluator **I want to** inspect a reproducible score and its evidence **so that** I can
distinguish demonstrated capability from product claims.

**Acceptance Criteria:**
- GIVEN an isolated resettable deployment WHEN all reachable scenarios are browsed and judged THEN
  the report preserves score, coverage, defects, manual results, screenshots, and tested SHA.
- GIVEN a blocked or unjudged item WHEN proof renders THEN it is never displayed as PASS.

## Functional Requirements

- FR-001: Run all 18 required scenarios and both optional CRM scenarios from `sbek-eval`.
- FR-002: Use isolated demo personas/data and reset between contaminating scenarios.
- FR-003: Capture meaningful screenshots and observations for every attempted scenario.
- FR-004: Judge from a fresh context and use `cannot_judge` rather than guessing after a blocker.
- FR-005: Complete applicable manual checks and finalize the report.
- FR-006: Publish immutable JSON/HTML artifacts with run ID, evaluated URL, SHA, timestamp, harness
  commit, headline score, coverage, area scores, and defect counts.
- FR-007: Add an evaluation section to `/demo/proof` with a report link and freshness state.

## Non-Functional Requirements

- NFR-001: At least 60% rubric weight must be judged before showing a headline score; target 95%.
- NFR-002: Evaluation artifacts must contain no real credentials or personal data.
- NFR-003: A new release must mark older evidence stale until rerun.

## Out of Scope

- Changing product behavior during evidence collection.
- Editing the rubric to improve Namos's score.

## Success Metrics

- Report coverage is at least 95%, or every remaining blocker is explicitly documented.
- Every public verdict resolves to evidence from the named run and SHA.
