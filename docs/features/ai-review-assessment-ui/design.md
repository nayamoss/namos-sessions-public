# AI Review Assessment UI — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

- `ai_assessments`: event/submission/plan, queued/completed/failed, score/rationale/criteria, model,
  promptVersion, inputHash, requester, error, and timestamps; indexed by submission+plan and event.
- `evaluation_plans`: includes `aiAssistEnabled`; criteria/scales define structured assessment bounds.
- `evaluations`: human score/comments/criterion values; remains the authoritative human record.

### Required Changes

| Table | Action | Column | Type | Notes |
| --- | --- | --- | --- | --- |
| `evaluation_plans` | ADD | `reviewerAiRequestsEnabled` | optional boolean | Default false. |

No AI field is added to `evaluations`; separation is intentional.

### Migration

Deploy the optional plan setting with default-false reads. Preserve `aiAssistEnabled` until a later
compatible rename/backfill; coordinate #253 so it is not removed as unused.

---

## Backend / API

### Affected Existing Endpoints

N/A — Convex functions `aiAssessments.get/request`, `aiAssessmentActions.run`, plan save, and
billing/provider settings are extended.

### New Endpoints

| Function | Request | Response |
| --- | --- | --- |
| `aiAssessments.requestForReview` | eventId, submissionId, planId | assessment id/status |
| `aiAssessments.dismiss` | eventId, assessmentId | dismissed acknowledgement |

`requestForReview` reuses request logic and adds assigned-reviewer permission when enabled. Dismiss
may be client-local initially; persist only if product requirements need shared dismissal.

### Validation & Business Logic

Validate event ownership, submission/plan relationship, assignment, plan flags, allowance, provider
readiness, known criterion IDs, score range, input hash, cooldown, and one queued row per current input.

---

## Frontend Components

### Modified Components

| File Path | Change |
| --- | --- |
| `src/pages/program/Evaluation.tsx` | Plan configuration and assessment panel in detail body. |
| reviewer evaluation/queue detail component | Read/request assessment for assigned work. |
| `src/data/types.ts` and Convex repository adapter | Add assessment contract and operations. |

### New Components

**AiAssessmentPanel**
- File: `src/components/evaluation/AiAssessmentPanel.tsx`
- Props: `{ eventId; submissionId; plan; humanScore?; canRequest; assessment; onRequest; onRetry }`
- Location: evaluation detail content below the human scorecard, never in the page header/tab bar.
- Elements: `Bot` icon, “AI assessment — non-binding” title, provider readiness note, request button,
  queued spinner, score comparison, criterion rationale list, overall rationale, model/version/time,
  stale warning, failed inline error with retry, disabled/unavailable card, and no-assessment empty card.
- Behavior: request/retry does not alter human fields; stale results remain visible but clearly marked.
- Third-party: existing app primitives and styled listboxes only.

---

## State / Data Flow

Plan/submission → request mutation → scheduled model action → `ai_assessments` row → reactive get →
panel. Human scorecard writes only `evaluations`; changes to inputs make prior `inputHash` stale.

---

## Auth / Permissions

Event organizer can configure/request/read. Assigned reviewer can read only their assignment and may
request only when the plan opts in. Speakers and unrelated reviewers have no access.

---

## Edge Cases & Error States

Disabled allowance, managed kill switch, missing BYOK key, expired provider credential, rate limit,
timeout, malformed output, submission edited mid-run, criteria changed, duplicate click, unassigned
reviewer, blind review, zero criteria, legacy plan, and route navigation all fail visibly and safely.

---

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Authority | Separate AI and human records | Prevents automation from masquerading as review. |
| Staleness | Input-hash comparison | Old reasoning stays inspectable without appearing current. |
| Reviewer request | Explicit opt-in | Controls cost and avoids surprise model use. |

## Dependencies

#241 billing/kill switch, provider settings, evaluation scorecards, and coordination with #253.

## Risks & Mitigations

Anchoring bias is mitigated by non-binding copy, visual separation, and optional reviewer access.
Cost/retry abuse is bounded by allowance checks, cooldowns, deduplication, and audit metadata.
