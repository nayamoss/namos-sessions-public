# Competitive Proof Publishing — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement

The production proof page is strong, but the public mirror/README understate the private product and
the default demo can appear empty. Evaluators need one-click role entry, realistic deterministic
scale, comparable evaluation data, current release evidence, and candid limitations at the top.

## User Stories

**As a** new evaluator **I want to** enter a populated role workflow immediately **so that** I can
verify Namos depth without assembling infrastructure or reading stale claims.

**Acceptance Criteria:**
- GIVEN the public README WHEN opened THEN demo, proof, role links, release SHA, tests, evaluation
  score/coverage, setup, and limitations are visible before the long feature inventory.
- GIVEN small/medium/large reset profiles WHEN chosen THEN each creates deterministic fictional data
  with stable counts and no external email dependency.

## Functional Requirements

- FR-001: Consume #249 judgeable seed and #257 evidence; do not fork their acceptance criteria.
- FR-002: Add small/medium/large fictional seed profiles with documented stable counts and isolated
  reset behavior.
- FR-003: Provide direct Organizer, Reviewer, Speaker, Attendee, inbox, public program, and proof links.
- FR-004: Show deployed SHA, verification time, release totals, evaluation score/coverage/report,
  walkthrough video/transcript, and known limitations consistently in README and `/demo/proof`.
- FR-005: Mark evidence stale when it does not match the deployed SHA or freshness policy.
- FR-006: Sync public mirror through its existing PR/safety workflow, preserving public-only fixes and
  redacting private config, credentials, and real fixture data.
- FR-007: Support an inbox-free local demo path and a clear one-command startup route where feasible;
  otherwise state external setup prerequisites honestly.

## Non-Functional Requirements

- NFR-001: All fixtures are fictional, idempotent, tenant-isolated, and safe for public source.
- NFR-002: Public proof is accessible, responsive, and usable without authentication.
- NFR-003: No stale “coming soon” item may describe an already-shipped capability.

## Out of Scope

- Copying Cicero's visual design, claiming unsupported one-command self-hosting, or hiding limitations.

## Success Metrics

- Evaluator reaches a populated role workflow in one click and verifies a complete journey.
- README, proof page, deployment, report, and mirror all name consistent SHA/status metadata.
