# AI Usage Gating — Implementation Plan

## Phase 1: Global Kill Switch
- [x] T001: Add `MANAGED_AI_DISABLED` to `.env.example` with a comment explaining scope (managed-mode only, not BYOK)
- [x] T002: Gate both `agentRuns.create` (before row creation) and `agentRuntime.ts:executeSegment` (before every managed provider segment), mapping the internal disabled sentinel to the user-facing temporary-disable message
- [x] T003: In `convex/agentProviderSettings.ts:status`, compute `managedAvailable: Boolean(process.env.OPENAI_API_KEY) && !process.env.MANAGED_AI_DISABLED`, return `status: "disabled"`, and render distinct disabled-state copy in the existing settings form
- [x] T004: Confirm BYOK-mode code paths in both files never read `MANAGED_AI_DISABLED` (they shouldn't touch it at all — verify by inspection, not by adding a check)

## Phase 2: Schema — AI Assessments Billing Fields
- [x] T005: Add `providerMode`, `billingOwnerUserId`, `managedAllowanceId`, `managedReservedTokens` as optional fields to `ai_assessments` in `convex/schema.ts`, matching the types already on `agent_runs`
- [x] T006: Run `npx convex dev` (or the project's schema push command) to confirm the schema change deploys cleanly against existing data with no migration needed

## Phase 3: Gate AI Assessments
- [x] T007: Convert `aiAssessments.request` to an action, resolve the event provider-mode snapshot (default `"managed"`), and use a narrow Node internal action for Clerk allowance resolution
- [x] T008: When managed, check `MANAGED_AI_DISABLED` first, require the billing owner, resolve allowance terms, then invoke an internal mutation that revalidates auth/settings and atomically reserves quota with assessment insertion
- [x] T009: Write `providerMode`, `billingOwnerUserId`, `managedAllowanceId`, `managedReservedTokens` onto the inserted `ai_assessments` row when managed
- [x] T010: Generalize the shared allowance transaction helpers; settle actual assessment token usage atomically with successful completion
- [x] T011: Release assessment quota atomically with failure, with the queued-status transition providing idempotency
- [x] T012: Update shared allowance-exhausted error strings from "Operations Agent" to "AI usage"

## Phase 4: Frontend — No New UI, Verify Existing Error Surface

> This phase intentionally has no new components — see design.md's "Frontend Components"
> section: every message this plan produces routes through error-handling paths that already
> exist and already render server-thrown messages. This phase is verification, not construction.

### UI Spec (what already exists and must keep working)
- **Location:** Operations Agent page (`src/pages/program/AgentOperations.tsx`), `AgentComposer` at
  the bottom of the page
- **Existing elements used (no changes):**
  - `error` state (line ~60), set in `submit()`'s `catch` block, passed to `AgentComposer`'s
    `error` prop — renders inline below the composer
  - Same path for proposal approve/reject/cancel/retry actions via `decide()`
- **Behavior:** Any error thrown by `agentRuns.create`/`agentRuns.respond` (including the new
  kill-switch and shared-allowance messages) surfaces exactly like today's allowance-exhausted
  message does — no new behavior to build, only to verify.
- **Data:** unchanged — same `repo.agentRuns.*` calls, same Convex error propagation.

### Tasks
- [ ] T013: In the browser, temporarily set `MANAGED_AI_DISABLED=1` in the local Convex dev env, start a new Operations Agent run in managed mode, confirm the composer shows "Managed AI is temporarily disabled..." inline and no run is created
- [ ] T014: Unset `MANAGED_AI_DISABLED`, confirm a managed run starts normally again
- [ ] T015: With an event that has no `billingOwnerUserId`, confirm both the Operations Agent (existing behavior) and — once any future UI calls `aiAssessments.request` — the same "needs a billing owner" message would surface (Assessments has no UI yet, so verify this via a direct Convex mutation call from the dashboard/CLI, not the browser)
- [ ] T016: Confirm a BYOK-mode event is completely unaffected by `MANAGED_AI_DISABLED=1` — run an Operations Agent request against a BYOK-configured event with the kill switch on and confirm it succeeds

## Task Dependencies
- T001–T004 (kill switch) can proceed independently of T005–T012 (Assessments gating)
- T005 (schema) must land before T007–T011 (code that writes the new fields)
- T010–T011 depend on inspecting `agentBilling.ts`'s existing `settle`/`release` internals (T010's note) before deciding generalize-vs-duplicate
- T013–T016 depend on all of Phase 1–3 being deployed to a testable environment

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met (FR-001 through FR-006)
- [ ] Kill switch verified live in a real Convex dev/staging environment, not just read in code
- [ ] BYOK events confirmed unaffected by the kill switch
- [ ] AI Assessments cannot run in managed mode without a billing owner + allowance
- [ ] No stranded reservations after a simulated assessment failure (check `agent_managed_allowances.reservedTokens` returns to baseline)
- [ ] Existing Operations Agent behavior unchanged for events not exercising the kill switch
- [ ] No regressions introduced
- [ ] Docs updated if needed
