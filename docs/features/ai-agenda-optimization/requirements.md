# AI Agenda Optimization — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement

Issue #262 adds bounded agent-proposed assignments, but it does not provide deterministic
multi-candidate optimization, immutable revision binding, exact transactional approval, explicit
infeasible results, or rollback. Those controls are required for a trustworthy AI agenda product.

## User Stories

**As a** program chair **I want to** compare safe agenda candidates **so that** I can schedule many
sessions without surrendering control of the live program.

**Acceptance Criteria:**
- GIVEN accepted sessions and constraints WHEN planning runs THEN every candidate satisfies all
  hard constraints and reports its soft-objective score.
- GIVEN a reviewed proposal WHEN the agenda changed THEN approval fails stale without partial writes.
- GIVEN an applied proposal WHEN rollback is still safe THEN the captured before-state is restored.

## Functional Requirements

- FR-001: Model event bounds, room/speaker overlaps, availability, durations, capacity, locked
  sessions, and tenant IDs as hard constraints.
- FR-002: Score unscheduled count, track collisions, speaker room changes, interest spreading, and
  organizer preferences as soft objectives with visible weights.
- FR-003: Return up to three reproducible candidates or an explicit infeasible result with unresolved
  sessions/reasons.
- FR-004: Persist exact before/after payloads, constraint reports, base agenda revision, hash, expiry,
  creator, and status.
- FR-005: Show every changed session before approval; AI may rank/explain known candidates but may
  not invent IDs or bypass deterministic validation.
- FR-006: Apply the exact reviewed candidate transactionally and write normal agenda audit entries.
- FR-007: Reject expired, hash-mismatched, cross-event, unauthorized, or stale proposals.
- FR-008: Support rollback only while revision checks prove it will not erase later organizer work.

## Non-Functional Requirements

- NFR-001: Candidate generation is deterministic for identical inputs/seed and bounded in time.
- NFR-002: Planner input and writes are event-scoped; submission text is untrusted data.
- NFR-003: Planning failure never mutates `agenda_items`.

## Out of Scope

- Attendee-personalized itineraries, automatic publication, and unconstrained model-authored times.

## Success Metrics

- Full, improvement, infeasible, stale, apply, audit, and rollback journeys pass in production.
- Zero blocking conflicts are introduced by an approved proposal.
