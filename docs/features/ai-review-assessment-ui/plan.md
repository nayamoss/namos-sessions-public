# AI Review Assessment UI — Implementation Plan

## Phase 1: Contract reconciliation

- [ ] T001: Reconcile #253 and preserve/migrate the now-live plan gate.
- [ ] T002: Add assessment repository types/normalizers and optional reviewer-request setting.
- [ ] T003: Centralize request authorization, allowance, provider readiness, cooldown, and input hash.

## Phase 2: Backend behavior

- [ ] T004: Support organizer requests and opt-in assigned-reviewer requests with identical validation.
- [ ] T005: Validate structured criterion IDs/scores and derive current/stale state.
- [ ] T006: Add tests for tenant/assignment isolation, blind review payloads, duplicate queueing,
  allowance/provider errors, timeout, malformed output, and edited inputs.

## Phase 3: Frontend UI

### UI Spec

- **Location:** Evaluation detail body below the human scorecard; plan configuration stays in its
  owned content section. Page header contains identity only.
- **Elements:** `Bot` icon/title, non-binding label, request button, readiness copy, queued spinner,
  score/criterion rationale, comparison text, model/version/timestamp, stale warning, disabled empty
  card, inline failure/retry, and loading skeleton.
- **Behavior:** request/retry leaves human fields untouched; stale result remains readable; keyboard
  focus returns to panel status; no native select or decorative sparkle icon.
- **Data:** assessment query/request mutation plus existing provider/billing readiness projection.

### Tasks

- [ ] T007: Build `AiAssessmentPanel` with all listed states.
- [ ] T008: Add organizer plan setting and organizer/reviewer entry points in content toolbars.
- [ ] T009: Wire live announcements, disabled reasons, mobile, keyboard, light, and dark states.

## Phase 4: Verification

- [ ] T010: Prove requesting/viewing AI changes no human evaluation or submission status.
- [ ] T011: Browser-test organizer, assigned reviewer, unrelated reviewer, disabled, BYOK, managed,
  failed, retry, stale, refresh, and navigation states.
- [ ] T012: Run release gate and update README/index only after deployed verification.

## Task Dependencies

Contract reconciliation precedes UI. Authorization/provider tests precede reviewer enablement.

## Verification Checklist

- [ ] All acceptance criteria pass and human authority is explicit.
- [ ] Error/empty/loading/stale states are browser verified.
- [ ] UI invariants and tenant boundaries pass.
