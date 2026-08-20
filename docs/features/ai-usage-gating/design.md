# AI Usage Gating — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
```ts
// convex/schema.ts
agent_runs: defineTable({
  ...
  providerMode: v.optional(v.union(v.literal("managed"), v.literal("bring_your_own"))),
  billingOwnerUserId: v.optional(v.string()),
  managedAllowanceId: v.optional(v.id("agent_managed_allowances")),
  managedReservedTokens: v.optional(v.number()),
  ...
})

ai_assessments: defineTable({
  eventId: v.id("events"),
  submissionId: v.id("submissions"),
  evaluationPlanId: v.id("evaluation_plans"),
  status: v.union(v.literal("queued"), v.literal("completed"), v.literal("failed")),
  score: v.optional(v.number()),
  rationale: v.optional(v.string()),
  criteria: v.optional(v.array(...)),
  model: v.string(),
  promptVersion: v.string(),
  inputHash: v.string(),
  requestedByUserId: v.string(),
  error: v.optional(v.string()),
  requestedAt: v.number(),
  completedAt: v.optional(v.number()),
}) // no providerMode / billingOwnerUserId / allowance fields today
```

### Required Changes
| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| ai_assessments | ADD COLUMN | providerMode | `v.optional(v.union(v.literal("managed"), v.literal("bring_your_own")))` | mirrors `agent_runs.providerMode`; optional so existing rows stay valid |
| ai_assessments | ADD COLUMN | billingOwnerUserId | `v.optional(v.string())` | set only for managed-mode assessments |
| ai_assessments | ADD COLUMN | managedAllowanceId | `v.optional(v.id("agent_managed_allowances"))` | which monthly bucket this reservation landed in |
| ai_assessments | ADD COLUMN | managedReservedTokens | `v.optional(v.number())` | reserved token count, released/settled same as `agent_runs` |

### Migration
No backfill needed — every new field is optional and defaults to `undefined` on existing rows,
identical to how `agent_runs.providerMode` was introduced. Old `ai_assessments` rows (there are
none in production yet since no UI calls `request`) simply never populate these fields.

---

## Backend / API

### Affected Existing Endpoints (Convex functions)
| Function | Change |
|----------|--------|
| `convex/aiAssessments.ts:request` (action) | Resolve `providerMode`, call the Node-based Clerk allowance resolver when managed, then invoke one internal mutation that revalidates access/settings and atomically reserves allowance, inserts the row, and schedules `aiAssessmentActions.run` |
| `convex/aiAssessmentActions.ts:run` (internalAction) | Use the provider-mode snapshot stored on the assessment and re-check `MANAGED_AI_DISABLED` before a managed provider call. Completion/failure mutations settle or release the shared allowance atomically with the assessment status transition. |
| `convex/agentRuntime.ts:executeSegment` (internalAction) | Add the same `MANAGED_AI_DISABLED` short-circuit at the very top of the managed-mode branch, before `resolveManagedAllowance` is called |
| `convex/agentProviderSettings.ts:status` (query) | `managedAvailable` becomes `Boolean(process.env.OPENAI_API_KEY) && !process.env.MANAGED_AI_DISABLED`; when the kill switch is set, also return `status: "disabled"` (new literal) instead of `"ready"`/`"error"` so the UI can render a distinct message |

### New Endpoints
No new public endpoint names. `aiAssessments.request` changes from a mutation to an action because
Clerk Billing resolution is external Node work. Narrow internal query/action/mutation boundaries
bridge that work to the atomic database transaction.

### Validation & Business Logic
- `MANAGED_AI_DISABLED` check: `Boolean(process.env.MANAGED_AI_DISABLED)` — any truthy string
  (`"1"`, `"true"`) disables; unset or empty string leaves managed AI on. Read directly from
  `process.env` at call time (no caching) so a Convex env var change takes effect on next
  invocation with no redeploy of code.
- The check is placed **before** `resolveManagedAllowance`/allowance reservation in both request
  flows. `aiAssessmentActions.run` re-checks the flag defensively in case it changes between
  reservation and scheduled execution; that failure atomically releases the reservation.
- BYOK-mode runs/assessments never read or check `MANAGED_AI_DISABLED` — the branch is only
  entered when `providerMode === "managed"`, identical to how `resolveManagedAllowance` is only
  called in the managed branch today.
- Error message on kill switch: `"Managed AI is temporarily disabled. Bring your own key in Settings, or contact support."` — mirrors the existing `MANAGED_KEY_MISSING` message style in `safeProviderError`/`safeError` so behavior is consistent with what users already see when managed AI is unavailable for other reasons.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/program/AgentOperations.tsx` | None required — `error` state already renders whatever message the mutation throws (see `submit()`'s catch block, line ~110). The kill-switch and allowance-exhausted messages surface automatically through the existing error path. |
| Any future AI Assessments UI | Must surface `aiAssessments.request`'s thrown error the same way (no new component needed for this plan since no such UI exists yet) |

### New Components
None. No new UI surface is required — every user-facing message this plan adds routes through
error paths that already exist and already render server-thrown messages.

---

## State / Data Flow
1. Frontend calls `repo.agentRuns.create` or (once wired) the AI Assessment request action.
2. Convex mutation/action reads `process.env.MANAGED_AI_DISABLED` first — if set and mode is
   managed, throws immediately before either feature inserts a new run/assessment row.
3. If not disabled, proceeds to `resolveManagedAllowance` (Clerk plan lookup) →
   `agentBilling.reserve` (atomic Convex mutation) → provider call → `agentBilling.settle` or
   `agentBilling.release`.
4. Thrown errors propagate through Convex's normal mutation/action error channel → frontend
   `catch (cause)` → `setError(cause.message)` → rendered inline, exactly as allowance-exhausted
   errors already do today for the Operations Agent.

---

## Auth / Permissions
- No change. `assertEventOrganizerAccess` continues to gate who can trigger either AI surface.
- The kill switch and billing gate are orthogonal to auth — they gate *whether a request that
  already passed auth is allowed to spend managed AI budget*, not *who* can ask.

---

## Edge Cases & Error States
- **Kill switch on, managed mode:** immediate rejection, no allowance reserved, no partial DB
  writes. Message: "Managed AI is temporarily disabled. Bring your own key in Settings, or
  contact support."
- **Kill switch on, BYOK mode:** unaffected, runs normally.
- **Kill switch flipped on mid-run:** the defensive re-check in `aiAssessmentActions.run` /
  `agentRuntime.executeSegment` only guards *new* run starts. A run already past that check
  continues — this plan does not attempt to cancel in-flight provider calls, matching how the
  existing allowance check also only guards run start.
- **No billing owner assigned to the event, AI Assessment requested in managed mode:** same
  message the Operations Agent already produces — "This event needs a billing owner before
  Namos-managed AI can run."
- **Allowance exhausted:** identical existing message — "Your Namos plan has reached its monthly
  Operations Agent run/token allowance." (message text unchanged; it already covers both features
  sharing the pool, no need to rename since it says "Operations Agent" today — rename to
  "AI usage" in both `agentBilling.ts` error strings while touching this code, so the message is
  accurate for a shared quota used by two features.)
- **Reservation succeeds, provider call fails:** `agentBilling.release` returns the reservation to
  the pool — verified pattern already in `agentRuntime.executeSegment`'s catch block, reused
  verbatim for `aiAssessmentActions.run`.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Kill switch scope | Managed mode only, not BYOK | BYOK events pay their own bill; blocking them during a Namos-side incident has no cost-control benefit and breaks unaffected customers |
| Shared vs separate quota for AI Assessments | Shared with Operations Agent (`agent_managed_allowances`, keyed by `billingOwnerUserId` + month) | Simpler, matches product's existing "managed AI allowance" framing as one monthly budget per event's billing owner, not per-feature |
| Kill switch mechanism | Plain env var, checked live, no caching | No DB round trip, no redeploy needed to flip, matches the "unconditional, short-circuiting, checked first" pattern from feature-flag kill-switch best practice |
| Where AI Assessments reserves allowance | The public request action resolves Clerk terms, then an internal mutation reserves and creates atomically | Convex mutations cannot call Clerk. Splitting external resolution from a revalidating transaction preserves both runtime boundaries and the no-unbilled-row invariant. |

## Dependencies
**Requires:** existing `agentBilling.ts` (reserve/settle/release), `agentBillingResolver.ts`
(`resolveManagedAllowance`), `agentProviderSettings.ts` (`getInternal`, `status`) — all reused
as-is, no changes to their internals beyond the `status` query's kill-switch check.
**Enables:** any future AI Assessments UI can ship without a follow-up billing-gate PR — the gate
already exists server-side.

## Risks & Mitigations
- **Risk:** `MANAGED_AI_DISABLED` typo/unset assumptions cause it to silently do nothing.
  **Mitigation:** use `Boolean(process.env.MANAGED_AI_DISABLED)` (any non-empty string disables),
  document the exact var name in both `.env.example` and the issue, and verify by toggling it in
  a real Convex deploy env before calling this done — not just reading the code.
- **Risk:** Sharing one quota pool means AI Assessments usage could exhaust the Operations Agent's
  allowance for the same event and vice versa. **Mitigation:** this is an explicit product
  decision (see requirements.md) — flagged here so it's not accidentally "discovered" later as a
  bug.
