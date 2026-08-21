# AI Review Assessment UI — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement

The application has `ai_assessments`, a structured OpenAI action, organizer/assigned-reviewer read
authorization, managed/BYOK key resolution, and billing controls, but no clear product workflow for
requesting or interpreting a non-binding assessment. Issue #253's “dead flag” assumption is stale
and must be reconciled rather than deleting the assessment gate.

## User Stories

**As a** chair or assigned reviewer **I want to** request a first-pass assessment beside the human
scorecard **so that** I can consider its reasoning without delegating the decision.

**Acceptance Criteria:**
- GIVEN a configured eligible plan WHEN an authorized user requests an assessment THEN queued,
  completed, failed, stale, and retry states are visible without leaving Evaluation.
- GIVEN an AI result WHEN a human scores or changes status THEN the human action remains authoritative.

## Functional Requirements

- FR-001: Configure AI assistance per evaluation plan with managed/BYOK readiness and plain-language
  allowance/provider errors.
- FR-002: Permit organizers to request; permit assigned reviewers to read results only for their
  assigned submission/plan. Reviewer request permission is a deliberate plan setting, default off.
- FR-003: Show total score, criterion rationales, overall rationale, model, prompt version, timestamp,
  and stale-input status in the evaluation detail body.
- FR-004: Never copy AI values into `evaluations` automatically and never transition submission status.
- FR-005: Keep human and AI scores visually and semantically distinct; support dismiss/retry.
- FR-006: Deduplicate queued/current-input requests and rate-limit retries server-side.
- FR-007: Recompute staleness when submission or plan input changes.

## Non-Functional Requirements

- NFR-001: Submission content is untrusted data; structured output can reference only known criteria.
- NFR-002: Provider keys and allowance internals never reach the browser.
- NFR-003: The workflow remains usable when AI is disabled or unavailable.

## Out of Scope

- Automatic accept/reject, model-authored reviewer comments, and bulk autonomous decisions.

## Success Metrics

- Assessment happy/error/stale journeys pass for organizer and assigned reviewer roles.
- Human evaluation and decision rows remain byte-identical until a human explicitly saves them.
