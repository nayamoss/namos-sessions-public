# AI Agenda Optimization — Implementation Plan

## Phase 1: Revision-safe foundation

- [ ] T001: Define planning DTO, candidate, diff, constraint, status, and fixture contracts.
- [ ] T002: Add agenda revision and proposal schema with additive migration/backfill.
- [ ] T003: Route every agenda write through revision increment + audit helpers; add concurrency tests.

## Phase 2: Deterministic optimization

- [ ] T004: Implement slot enumeration and hard constraints for bounds, rooms, speakers,
  availability, capacity, duration, fixed/locked sessions, timezones, and existing assignments.
- [ ] T005: Implement bounded candidate search and reproducible soft-objective scoring.
- [ ] T006: Return explicit FEASIBLE, OPTIMAL-within-bound, INFEASIBLE, and TIMEOUT results with
  unresolved reasons; never silently drop a session.

## Phase 3: Proposal lifecycle and AI ranking

- [ ] T007: Persist immutable candidates, reports, before-state, base revision, hash, and expiry.
- [ ] T008: Let the agent rank/explain only known candidate/session IDs; sanitize content and handle
  provider timeout/malformed output while retaining deterministic candidates.
- [ ] T009: Implement select/reject/apply/rollback with exact hash/revision checks and one transaction.

## Phase 4: Frontend UI

### UI Spec

- **Location:** Agenda toolbar below the identity-only header opens a flex-sibling planning workspace.
- **Elements:** objective styled listbox, lock controls, preference weights, generate button, progress,
  candidate label-only tabs, hard/soft summaries, before/after rows, unresolved empty/error card,
  inline stale warning, apply/reject body actions, confirmation dialog, and safe rollback action.
- **Behavior:** inputs survive failure; keyboard/touch selection works; apply requires confirmation;
  stale/expired proposals disable apply and offer regeneration; no native select is visible.
- **Data:** proposal functions above; Agenda refreshes from normal reactive data after apply/rollback.

### Tasks

- [ ] T010: Build workspace, diff, summaries, loading, empty, infeasible, stale, and error states.
- [ ] T011: Wire Agenda toolbar and Agent inspector deep links without header actions.
- [ ] T012: Add accessible confirmations/live announcements and responsive layouts.

## Phase 5: Verification

- [ ] T013: Test full, improve, locked, impossible, DST, stale, hash mismatch, cross-event, timeout,
  apply, audit, refresh, and rollback scenarios.
- [ ] T014: Run authenticated browser acceptance at desktop/mobile, keyboard, light, and dark modes.
- [ ] T015: Run release gate and publish deployed proof from the same SHA.

## Task Dependencies

Revision coverage precedes proposal apply. Deterministic candidates precede model ranking and UI.

## Verification Checklist

- [ ] Every hard constraint is deterministically validated.
- [ ] No write occurs before exact approval; apply is transactional and reversible.
- [ ] Page structure, dropdown, icon, panel, card, and error-state invariants pass.
- [ ] All acceptance criteria and production browser journeys pass.
