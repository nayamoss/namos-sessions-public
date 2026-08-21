# Competitive Proof Publishing — Implementation Plan

## Phase 1: Evidence contract

- [ ] T001: Define one release metadata schema for SHA, tests, build, eval, video, profile, freshness,
  limitations, and artifact URLs.
- [ ] T002: Generate metadata from CI and fail closed on missing/SHA-mismatched evidence.
- [ ] T003: Inventory private/public README claims and remove stale capability status.

## Phase 2: Deterministic demo profiles

- [ ] T004: Extract fictional idempotent seed primitives and define stable small/medium/large counts.
- [ ] T005: Extend isolated demo reset with allowlisted profile, rate/concurrency protection, progress,
  rollback/cleanup, and no external inbox requirement.
- [ ] T006: Add fixture tests for counts, relationships, conflicts, role visibility, rerun idempotency,
  tenant isolation, and performance budgets.

## Phase 3: Frontend UI

### UI Spec

- **Location:** `/demo` body/setup card and `/demo/proof` body evidence sections; public page headers
  remain identity/navigation only.
- **Elements:** styled small/medium/large chooser with counts, explicit Reset demo button, confirmation
  dialog, progress, inline error/retry, role cards using contextual icons, release/eval metadata,
  stale/unavailable states, report/video/transcript links, and limitations list.
- **Behavior:** profile selection alone is non-destructive; confirmed reset returns populated role links;
  SHA mismatch removes PASS; keyboard/touch/mobile work without native selects.
- **Data:** isolated demo endpoints and CI-generated proof metadata.

### Tasks

- [ ] T007: Build chooser/reset states and role-link handoff.
- [ ] T008: Reconcile proof page with release/eval/freshness metadata and candid limitations.
- [ ] T009: Browser-test signed-out, each role/profile, reset failure/retry, mobile, keyboard, light/dark.

## Phase 4: README and mirror publication

- [ ] T010: Rewrite private/public README openings with demo/proof/role links, current matrix, SHA,
  test/eval totals, setup, and known limitations.
- [ ] T011: Run guarded public sync from current tips, preserve public-only fixes, redact private
  config/real fixtures, scan the full diff, and open a PR.
- [ ] T012: Require public CI and verify all README links against the deployed release.

## Phase 5: Final proof

- [ ] T013: Run #257 and #264 against the exact deployed SHA and publish immutable artifacts.
- [ ] T014: Record/update the 90-second walkthrough and transcript from the same seeded workflow.
- [ ] T015: Verify README, proof, app, report, and mirror metadata are mutually consistent.

## Task Dependencies

#249/#263 precede profile publication; #264 precedes score claims; metadata precedes README PASS.

## Verification Checklist

- [ ] All acceptance criteria, reset isolation, and profile budgets pass.
- [ ] No stale/unsupported claim, secret, private backend value, or real fixture reaches public.
- [ ] Public CI, links, browser flows, and UI invariants pass from the named SHA.
