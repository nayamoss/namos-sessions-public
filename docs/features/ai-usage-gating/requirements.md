# AI Usage Gating — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-19

## Problem Statement
Namos Sessions already gates the Operations Agent (`convex/agentRuntime.ts`) behind a Clerk
billing plan + monthly allowance (`convex/agentBilling.ts`, `agentBillingResolver.ts`). Two gaps
remain:

1. **AI Assessments has no billing gate at all.** `convex/aiAssessmentActions.ts` and
   `convex/aiAssessments.ts:request` only check organizer access and that an API key is
   configured — any event organizer can queue unlimited managed (Namos-paid) AI assessments for
   free, with no plan, no allowance, no quota. No frontend currently calls this action, so the
   hole is invisible today but will be live the moment a UI is wired to it.
2. **There is no global kill switch.** If managed AI needs to be shut off instantly (cost spike,
   OpenAI incident, abuse), the only lever today is unsetting `OPENAI_API_KEY`, which surfaces a
   generic "not configured" error rather than a clear, intentional "AI is temporarily disabled"
   state, and requires an env redeploy rather than a flip that can be toggled and verified fast.

## Functional Requirements
- FR-001: `aiAssessments.request` reserves against the same per-billing-owner monthly allowance
  used by the Operations Agent (shared quota, not a second independent pool) before an assessment
  is queued.
- FR-002: `aiAssessmentActions.run` settles or releases that reservation on completion/failure,
  mirroring `agentRuntime.executeSegment`'s reserve → settle/release lifecycle.
- FR-003: A single environment variable (`MANAGED_AI_DISABLED`) acts as a global kill switch for
  **managed-mode** AI calls only. When set truthy, both the Operations Agent and AI Assessments
  refuse to start a new managed run and return a clear, user-facing "Managed AI is temporarily
  disabled" message — checked first, before allowance/billing logic, unconditional and
  short-circuiting.
- FR-004: **Bring-your-own-key (BYOK) runs are unaffected by the kill switch** — those events pay
  their own OpenAI bill, so an incident affecting Namos-managed AI must not block them.
- FR-005: `agentProviderSettings.status` reflects the kill switch (`managedAvailable: false` when
  set) so the Operations Agent settings/composer UI can show the disabled state instead of a raw
  error, reusing the existing `managedAvailable` field the frontend already reads.
- FR-006: Reservation/settlement failures never strand a quota reservation — same invariant
  `agentBilling.release` already enforces for the Operations Agent must hold for AI Assessments.

## Non-Functional Requirements
- NFR-001: Kill switch check must be a plain env var read (no DB round trip) so it can be flipped
  and take effect on the next Convex deploy/env change with no data migration.
- NFR-002: No behavior change for BYOK-mode events in either feature.
- NFR-003: No behavior change to existing Operations Agent managed-mode gating — this only adds
  the same pattern to AI Assessments and layers the kill switch in front of both.

## Out of Scope
- Building the frontend UI that triggers AI Assessments (none exists yet — this plan only closes
  the server-side billing gap so it's safe whenever that UI ships).
- Per-feature (Assessments vs Operations Agent) separate quotas — they share one monthly
  allowance per billing owner, consistent with today's design.
- A kill switch for BYOK-mode AI (explicitly out of scope per product decision).
- Stripe/Clerk plan/pricing changes — the plan and allowance model already exist and are reused
  as-is.

## Success Metrics
- AI Assessments cannot run in managed mode without a billing owner + active allowance, verified
  by a queued assessment failing with the same allowance-exhausted message the Operations Agent
  already produces.
- Setting `MANAGED_AI_DISABLED=1` stops new managed runs on both surfaces within one deploy cycle
  and produces a clear disabled-state message, without affecting any BYOK event.
- Unsetting it restores normal behavior with no data loss (no stranded reservations from runs that
  were blocked mid-flight).
