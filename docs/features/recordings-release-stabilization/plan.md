# Recordings Release Stabilization — Implementation Plan

## Phase 1: Preserve and classify

- [ ] T001: Work from an isolated branch; inventory the active recordings commits and preserve all
  unrelated modifications in the shared checkout.
- [ ] T002: Re-run focused and full tests and classify each failure as implementation regression,
  stale contract, missing fixture, or environment-only failure.
- [ ] T003: Map every remaining unchecked task in `recordings-manager/plan.md` to code and evidence.

## Phase 2: Repair contracts

- [ ] T004: Restore list/get normalization parity, including absent optional storage IDs and
  reactive adapter behavior.
- [ ] T005: Fix the published public projection so draft, replacement, unavailable, cross-event,
  and storage-incomplete rows fail closed.
- [ ] T006: Replace raw product inputs/buttons and non-canonical card/shadow styling with existing
  app components without moving controls into page headers.
- [ ] T007: Reconcile dashboard, settings, and agent-workspace tests only where recordings truly
  changed their contract; do not bless unrelated WIP.
- [ ] T008: Finish bounded bulk results, migration idempotency, readiness, and activity coverage.

## Phase 3: Browser and migration closeout

- [ ] T009: Run the existing app on its configured port and verify missing, attach, upload, hosted
  URL, draft, publish, early-publish rejection/override, replacement, unpublish, and detach states.
- [ ] T010: Verify loading skeletons, empty coverage card, inline errors/retry, upload failure,
  partial bulk failure, refresh, direct links, mobile, keyboard, and dark mode.
- [ ] T011: Run migration on a disposable deployment, record before/after counts, rerun for a
  zero-change result, then execute the production runbook.
- [ ] T012: Run the full release gate from the same commit and update the feature index/proof data.

## Task Dependencies

T001–T003 precede repairs. Public projection and migration tests must pass before deployment.

## Verification Checklist

- [ ] All acceptance criteria in this package and `recordings-manager/requirements.md` pass.
- [ ] No visible native select, sparkle/starburst icon, header action, or overlay detail pane ships.
- [ ] No unrelated working-tree files are staged or committed.
- [ ] Production SHA and release evidence are recorded.
