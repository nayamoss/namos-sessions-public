# Agent-native Operations Foundation — Technical Design

## Evidence and Scope Decisions

- The app is React/Vite and route-code-splits organizer pages in `src/App.tsx:26-58`; event routes live under `EventProvider` at `src/App.tsx:302-355`.
- `AppLayout` owns a title-only `PageHeader` and inline flex detail pane (`src/components/AppLayout.tsx:261-310`), matching `docs/DESIGN-SYSTEM.md:117-146`. Agent controls therefore belong in page content, never the header.
- Product code must use `Repository` (`src/data/repo.ts:580-602`), with backend translation centralized in `src/data/transport.ts:197-200` and Convex mapping in `src/data/convex/index.ts:5-28`.
- Current event authorization is Clerk identity plus organizer/event membership (`convex/functions.ts:12-64`). Actions use propagated identity through an existing action-side pattern (`convex/emailDelivery.ts:37-51`).
- Current readiness already composes agenda, conflicts, speakers, submissions, tasks, and communications (`src/pages/program/Readiness.tsx:66-149`). The agent must reuse the same domain rules rather than invent competing readiness truth.
- `onboarding_tasks.source` currently permits only `manual | auto` (`convex/schema.ts:219-234`; `src/data/types.ts:123`). This feature adds `agent` and updates visible labels.
- No AI/agent SDK was installed when this design was written. npm peer resolution on 2026-08-13 confirmed the compatible set is `@convex-dev/agent@0.6.4`, `@convex-dev/workflow@0.4.5`, `ai@6.0.64`, and `@ai-sdk/openai@3.0.96`; Agent 0.6.4 requires AI SDK 6 and rejects the originally researched AI SDK 7 pairing.
- Cloudflare Workers hosts the Vite build. The agent runtime belongs in Convex, where durable workflows and reactive state avoid edge-request timeout coupling. Convex documents its Workflow component as durable, retryable, and resumable: [Convex Workflows](https://docs.convex.dev/agents/workflows).
- OpenAI function tools use JSON schemas and explicit tool-call/result continuation ([official function-calling guide](https://developers.openai.com/api/docs/guides/function-calling)). The Responses API is the current reasoning/tool workflow API, and the selected AI SDK OpenAI provider uses it by default.

## Database / Schema Changes

### Current Schema (affected table)

```ts
onboarding_tasks: defineTable({
  eventId: v.id("events"),
  targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission"), v.literal("sponsor")),
  submissionId: v.optional(v.id("submissions")),
  speakerId: v.optional(v.id("speakers")),
  sponsorId: v.optional(v.id("sponsors")),
  title: v.string(),
  description: v.optional(v.string()),
  source: v.union(v.literal("manual"), v.literal("auto")),
  linkedFormId: v.optional(v.id("submission_forms")),
  status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
  dueDate: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
```

### Required Changes

```ts
const agentRunStatus = v.union(
  v.literal("queued"), v.literal("running"), v.literal("needs_input"),
  v.literal("needs_approval"), v.literal("completed"),
  v.literal("failed"), v.literal("cancelled"),
);

agent_runs: defineTable({
  eventId: v.id("events"),
  threadId: v.optional(v.string()),
  requestedByUserId: v.string(),
  objective: v.string(),
  status: agentRunStatus,
  model: v.string(),
  idempotencyKey: v.string(),
  stepCount: v.number(),
  maxSteps: v.number(),
  finalSummary: v.optional(v.string()),
  error: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_event_status", ["eventId", "status"])
  .index("by_requester_idempotency", ["requestedByUserId", "idempotencyKey"]),

agent_run_events: defineTable({
  eventId: v.id("events"),
  runId: v.id("agent_runs"),
  sequence: v.number(),
  type: v.union(
    v.literal("user_message"), v.literal("assistant_message"),
    v.literal("progress"), v.literal("tool_call"), v.literal("tool_result"),
    v.literal("clarification"), v.literal("proposal"),
    v.literal("approval"), v.literal("error"),
  ),
  message: v.string(),
  toolName: v.optional(v.string()),
  toolCallId: v.optional(v.string()),
  detailsJson: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_run_sequence", ["runId", "sequence"])
  .index("by_event", ["eventId"]),

agent_action_proposals: defineTable({
  eventId: v.id("events"),
  runId: v.id("agent_runs"),
  kind: v.literal("create_tasks"),
  tasks: v.array(v.object({
    title: v.string(),
    targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission"), v.literal("sponsor")),
    speakerId: v.optional(v.id("speakers")),
    submissionId: v.optional(v.id("submissions")),
    sponsorId: v.optional(v.id("sponsors")),
    linkedFormId: v.optional(v.id("submission_forms")),
    dueDate: v.optional(v.number()),
    reason: v.string(),
  })),
  payloadHash: v.string(),
  summary: v.string(),
  status: v.union(v.literal("pending"), v.literal("rejected"), v.literal("applying"), v.literal("applied"), v.literal("failed"), v.literal("superseded")),
  proposedByToolCallId: v.string(),
  decidedByUserId: v.optional(v.string()),
  decisionReason: v.optional(v.string()),
  decidedAt: v.optional(v.number()),
  appliedAt: v.optional(v.number()),
  createdTaskIds: v.optional(v.array(v.id("onboarding_tasks"))),
  error: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_run", ["runId"])
  .index("by_event_status", ["eventId", "status"]),
```

Change `onboarding_tasks.source` to `v.union(v.literal("manual"), v.literal("auto"), v.literal("agent"))`. No existing value is rewritten.

### Migration

Add three new tables and one new union member. This is additive and requires no backfill. Deploy schema before functions. Component-owned Agent/Workflow tables are installed through `convex/convex.config.ts` and generated by `npx convex dev`. Existing `manual` and `auto` task rows remain valid.

## Backend / API

### Affected Existing Functions

| Function | Current behavior | Change |
|---|---|---|
| `tasks:create` mutation (`convex/tasks.ts:26-69`) | Authenticates, validates, inserts manual task | Extract `validateAndCreateTask(ctx, input, source)`; public mutation calls it with `manual`, proposal application calls it with `agent`. |
| `tasks:list` query (`convex/tasks.ts:8-23`) | Event/speaker-scoped list | No contract change; now returns possible `source: agent`. |
| `Readiness` projection (`src/lib/readiness.ts:25-40`) | Derives five categories client-side | Extract/share pure projection DTO rules where needed; agent tool returns the same categories/counts. |

### New Convex Functions

| Function | Type | Args | Return / behavior |
|---|---|---|---|
| `agentRuns:canUse` | query | `{ eventId: Id<"events"> }` | `boolean`; true only for global organizer/admin or event member role organizer. Used for nav gate. |
| `agentRuns:list` | query | `{ eventId, limit?: number }` | `AgentRun[]`, newest first, limit 1–100 default 30; organizer authorization. |
| `agentRuns:get` | query | `{ eventId, runId }` | `{ run, events, proposals } | null`; verifies stored `eventId`, reads indexed ordered events/proposals. |
| `agentRuns:create` | mutation | `{ eventId, objective: string, idempotencyKey: string }` | `{ runId }`; validates 1–4,000 chars, checks organizer access, dedupes requester/key, inserts queued state and schedules runtime. |
| `agentRuns:respond` | mutation | `{ eventId, runId, message: string, idempotencyKey: string }` | `void`; only `needs_input`, appends user message and schedules continuation. |
| `agentRuns:retry` | mutation | `{ eventId, runId }` | `void`; only failed runs, clears terminal error and schedules next segment. |
| `agentRuns:cancel` | mutation | `{ eventId, runId }` | `void`; allowed nonterminal statuses; updates status and event. |
| `agentRuns:approveTaskProposal` | mutation | `{ eventId, proposalId, expectedPayloadHash }` | `{ createdTaskIds }`; atomic exact-payload validation/application and idempotent repeat result. |
| `agentRuns:rejectProposal` | mutation | `{ eventId, proposalId, reason?: string }` | `void`; pending only, stores actor/reason and event. |
| `agentRuntime:executeSegment` | internal action/workflow step | `{ runId }` | Loads stored run, checks cancellation/authorization snapshot, creates/continues component thread, executes max 12 total steps, persists terminal state. |
| `agentState:*` | internal queries/mutations | typed run/event/proposal checkpoint inputs | Sole write boundary used by action/tools; validates sequence and legal status transitions. |

No new HTTP endpoint is created. Browser writes use the existing authenticated Convex transport. No edge function, webhook, cron, or public route is required.

### Runtime and Tool Definitions

Create `convex/convex.config.ts` installing `@convex-dev/agent` and `@convex-dev/workflow`. Create `convex/agentRuntime.ts` (`"use node"`) with:

- `Agent` from `@convex-dev/agent`.
- `WorkflowManager` from `@convex-dev/workflow`.
- `openai.responses(process.env.OPENAI_AGENT_MODEL ?? "gpt-5.6-terra")` from `@ai-sdk/openai`.
- `stepCountIs(12)` from `ai`; run-level checks also enforce stored `maxSteps`.
- Each event chooses `managed` or `bring_your_own` in Settings → Integrations. Managed runs consume `OPENAI_API_KEY` only in the server runtime. Before dispatch, the event creator’s immutable Clerk user ID is checked for an active plan and required feature, then one run and a bounded token budget are atomically reserved for the UTC month. Actual reported tokens settle the reservation; failed or cancelled runs release it. BYOK is live-verified, encrypted with AES-256-GCM using the dedicated `AI_INTEGRATION_ENCRYPTION_KEY`, never returned to the browser, and is not charged by Namos. The run snapshots this choice so a settings change cannot switch payer mid-run. The default model is `gpt-5.6-terra` with medium reasoning effort; `OPENAI_AGENT_MODEL` may override it in a protected environment.

Create run-bound tools in `convex/agentTools.ts`. Each closure receives stored `{ runId, eventId, requestedByUserId }`; model-visible args never contain those fields.

| Tool | Model-visible args | Return cap |
|---|---|---|
| `get_event_overview` | `{}` | Event identity/timezone/dates and aggregate counts only. |
| `list_submissions` | `{ statuses?: SubmissionStatus[], tagId?: string, trackId?: string, limit?: number }` | Max 200 summaries; no reviewer private notes. |
| `get_submission` | `{ submissionId: string }` | One scoped submission, answer summary, speaker display names, tags/track. |
| `list_speakers` | `{ confirmationStatus?: "awaiting"|"confirmed"|"declined", needsAttentionOnly?: boolean, limit?: number }` | Max 200 operational summaries; include email only when needed to diagnose missing contact, never credentials. |
| `list_onboarding_tasks` | `{ statuses?: ("pending"|"in_progress"|"completed")[], overdueOnly?: boolean, speakerId?: string, submissionId?: string, limit?: number }` | Max 200. |
| `list_agenda` | `{ from?: number, to?: number, roomId?: string, trackId?: string, limit?: number }` | Max 200; event timezone in result. |
| `detect_schedule_conflicts` | `{}` | Existing conflict projection and linked item summaries. |
| `list_review_coverage` | `{ evaluationPlanId?: string }` | Counts by reviewer/round and unassigned submission IDs, max 200 detail rows. |
| `list_failed_communications` | `{ limit?: number }` | Max 100 failed log summaries; no provider credentials. |
| `request_clarification` | `{ question: string }` | Persists question, changes run to `needs_input`, stops segment. |
| `propose_create_tasks` | `{ summary: string, tasks: AgentProposedTask[] }` | Validates 1–50, canonicalizes, hashes, stores pending proposal, changes run to `needs_approval`; no task write. |

Tool results follow progressive disclosure (counts → summaries → one-record detail), matching Every’s bounded-context advice and OpenAI’s function-calling model. The system prompt explicitly prohibits AI scoring, decisions, sends, schedule/config writes, deletion, credential access, hidden-reasoning disclosure, and cross-event inference.

### Validation and Idempotency

- `agentRuns:create` and `respond` dedupe on authenticated user + client UUID.
- Proposal payload is canonical JSON with keys in fixed order; hash is SHA-256 server-side.
- Approval compares `expectedPayloadHash`, stored hash, pending/applied status, run/event relationship, and actor permissions.
- All task linked records are loaded and checked against proposal `eventId` before insertion.
- All tasks insert inside one mutation; any invalid task aborts all inserts.
- Applied proposals return stored IDs on retry.

## Frontend Components

### Modified Components

| File | Change |
|---|---|
| `src/App.tsx` | Lazy import `AgentOperations`; add `program/agent` under event routes. |
| `src/components/AppLayout.tsx` | Add Program nav entry after Readiness: `{ to: "/program/agent", label: "Operations Agent", icon: Bot }`; hide unless reactive `agentRuns.canUse` is true. Do not add a header control. |
| `src/data/types.ts` | Add branded run/proposal IDs and exact run/event/proposal DTOs; extend `OnboardingTask.source` with `agent`. |
| `src/data/repo.ts` | Add `AgentRunsRepo` and `agentRuns` to `Repository`. |
| `src/data/transport.ts` | Add read/write operation names and mappings. |
| `src/data/convex/index.ts` | Map agent operations and normalize documents/nested arrays. Mark no client-callable agent operation as an action; create/respond schedule internal work from mutations. |
| `src/data/airtable/index.ts` | Fail `agentRuns.*` with exact Convex-required message. |
| `src/pages/portal/TasksAdmin.tsx` | Extend source type and render Manual / Automatic / Operations Agent. |
| `src/pages/portal/PortalPages.tsx` | Render “Created by Operations Agent” for `source === "agent"`. |

### New Components

**`AgentOperations`**

- File: `src/pages/program/AgentOperations.tsx`
- Props: none.
- Location: Program > Operations Agent, `/events/:eventSlug/program/agent`.
- State: `objective: string`, `selectedRunId: AgentRunId | null` from `?run=`, `isSubmitting: boolean`, `submitError?: string`, `historyOpen: boolean`, `decisionProposalId?: AgentProposalId`.
- Data: reactive `agentRuns.canUse`, `agentRuns.list`, and selected `agentRuns.get`; writes through `repo.agentRuns`.
- Layout: `<AppLayout title="Operations Agent" detail={selectedRun ? <AgentRunInspector ... /> : undefined}>`; inner root `flex min-h-[calc(100vh-10rem)] flex-col gap-4`.
- Elements: shared `AgentWorkspace` with purpose copy, History, Start a review, event-derived suggestions, outcome-first run view, collapsed review activity, inline approvals, and composer.
- Behavior: a suggestion fills the composer; Start review creates and selects a run; Enter submits, Shift+Enter adds a newline; Start a review clears `?run`; history selection changes the URL; selected runs survive refresh. Technical activity is disclosed only on demand.

**`AgentComposer`**

- File: `src/components/agent/AgentComposer.tsx`
- Props: `{ value: string; onChange(value: string): void; onSubmit(): void; mode: "new" | "reply"; disabled: boolean; error?: string }`.
- Elements: `Label` text “Objective” or “Reply to continue”; `Textarea` class `min-h-[96px] resize-y bg-background`; helper `text-xs text-muted-foreground`; error `role="alert" text-sm text-destructive`; `Button variant="accent" size="sm"` with `Send` icon and label Run/Continue.
- Disabled: whitespace-only, >4,000 chars, or submitting/running without input request.

**`AgentTimeline`**

- File: `src/components/agent/AgentTimeline.tsx`
- Props: `{ events: AgentRunEvent[]; isLoading: boolean }`.
- Elements: ordered list `space-y-3`; user/assistant message surfaces `rounded-lg bg-muted/60 p-4`; progress/tool rows `flex gap-3 text-sm`; contextual icons (`Bot`, `Search`, `Wrench`, `CircleAlert`, never Sparkles); source links in assistant markdown; skeleton rows `animate-pulse`; empty `EmptyState`.
- Tool results show name, duration, and result count/redacted summary. Never render hidden reasoning.

**`AgentRunInspector`**

- File: `src/components/agent/AgentRunInspector.tsx`
- Props: `{ run: AgentRun; proposals: AgentTaskProposal[]; onApprove(id, hash): Promise<void>; onReject(id, reason?): Promise<void>; onCancel(): Promise<void>; decisionPendingId?: AgentProposalId }`.
- Elements: status badge; objective; model/step count/timestamps passive metadata; progress summary; proposal cards; Cancel button; inline decision errors.
- Proposal card classes `rounded-lg bg-background p-4 space-y-3`; each task row displays title, target, linked display label, due date in event timezone, and reason. Pending controls are `Button variant="outline" size="sm"` Approve & create and `Button variant="ghost" size="sm"` Reject. Applied state shows task links. No dialog/sheet.

**`AgentHistoryPopover`**

- File: `src/components/agent/AgentHistoryPopover.tsx`
- Props: `{ runs: AgentRun[]; selectedRunId?: AgentRunId; onSelect(id): void; isLoading: boolean }`.
- Uses existing `Popover` + `Command`; trigger `Button variant="outline" size="sm"`; items display truncated objective, status badge, relative timestamp. Empty message “No agent runs yet.” This is a styled app menu, not a native select.

## State / Data Flow

```text
agent_runs / agent_run_events / agent_action_proposals
  → agentRuns:list/get Convex queries (event organizer auth)
  → convex reactive transport + normalize
  → useRepoQuery in AgentOperations
  → AgentTimeline + AgentRunInspector

Run submit
  → repo.agentRuns.create
  → durable row/event insert + schedule workflow
  → Agent component Responses/tool loop
  → internal checkpoint mutations after each meaningful step
  → reactive UI update

Approval
  → proposalId + expected hash
  → atomic server validation
  → shared task insert helper(source="agent")
  → proposal applied + event append
  → agent page and Tasks pages update
```

Component thread messages are execution context; app tables are the stable user/audit projection. The UI never reads component-private tables directly.

## Auth / Permissions

- Public: none.
- Page/nav: `agentRuns.canUse` hides entry from reviewer/speaker roles; direct route renders access denied.
- Every query/mutation: `assertEventOrganizerAccess`; never trusts browser event membership claims.
- Internal runtime: operates only from stored run/event/requester; scheduled functions have no user auth, so internal functions verify the originating run and immutable actor/event binding before every stateful tool/application step.
- OpenAI receives a stable hashed safety identifier, not Clerk token/email. API key stays server-only.

## Edge Cases & Error States

| Scenario | Handling |
|---|---|
| No runs | Suggested-objective empty state and usable composer. |
| Missing API key | Durable failed run with configuration message; previously completed real runs remain readable. No canned response or simulated history is generated. |
| 500 submissions | Read tools paginate/cap; overview first; no full dump in prompt. |
| Context/step limit | Stop at 12, store partial summary/error, offer Retry. |
| Tool partial failure | Store failed tool result; final answer labels missing evidence. |
| Duplicate submit | Idempotency index returns existing run. |
| Concurrent approval | First mutation applies; later calls return stored IDs. |
| Proposal data changed/deleted | Hash or linked-record validation fails before insert. |
| Cancel during external call | Result may finish, but next checkpoint sees cancelled and cannot propose/apply. |
| Event switched/copied URL | Query verifies run.eventId; returns null/forbidden. |
| Inactive/deleted linked record | Proposal cannot apply; no partial tasks. |
| Rate limit/provider outage | Failed/retry state with exponential Workflow retry only for transient errors. |
| Airtable mode | Explicit unsupported state; no edge request. |

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| First outcome | Readiness investigation + proposed tasks | Broad read value, bounded reversible write, builds on existing Readiness truth. |
| Runtime | Convex Agent + Workflow components | Fits current backend, reactive UI, durable checkpoints/retries; avoids edge-request timeout coupling. |
| Model/API | OpenAI Responses via AI SDK, default `gpt-5.6-terra` | Current official guidance recommends Responses for tool workflows and Terra for cost/capability balance. |
| Approval | Exact immutable payload hash | Approval cannot drift after review; prevents stale-client and confused-deputy writes. |
| Write surface | Proposal only; shared task validator applies | Model never receives direct task mutation authority. |
| User-visible trace | Append-only summaries, no chain-of-thought | Trust/debuggability without exposing hidden reasoning or secrets. |
| Airtable | Explicitly unsupported in v1 | Its current adapter lacks the required auth/reactive/durable execution boundary. |
| Prior #66 | Prior art only | Closed, unmerged external MCP spike solves a different user journey. |
| Stub policy | No product stubs or pre-baked runs | Every visible execution, tool result, proposal, approval, and task must traverse the real persisted runtime and domain paths; unavailable behavior fails honestly. |

## Dependencies

- Install exact compatible baselines: `@convex-dev/agent@0.6.4`, `@convex-dev/workflow@0.4.5`, `ai@6.0.64`, and `@ai-sdk/openai@3.0.96`.
- Managed mode requires Convex deployment `OPENAI_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_AGENT_REQUIRED_FEATURE`, and `CLERK_AGENT_PLAN_ALLOWANCES`; BYOK requires its own `AI_INTEGRATION_ENCRYPTION_KEY` and never falls back to email-integration encryption. `CLERK_AGENT_PLAN_ALLOWANCES` is server-only JSON keyed by Clerk Billing plan slug with `runs`, `tokens`, and `perRunTokens` monthly terms; no limit is hard-coded in app code. `OPENAI_AGENT_MODEL` is optional.
- Live acceptance uses `npm run eval:agent:live` with the versioned 25-case `evals/operations-agent.v1.json` dataset. The command requires `AGENT_EVAL_AUTH_TOKEN` and `AGENT_EVAL_EVENT_ID`, executes only real durable runs, records model, reasoning effort, steps, latency, token usage, estimated cost, source/tool correctness, and prohibited-action rate, and fails below 90% correctness or above 0% prohibited-action rate.
- Requires existing events, submissions, speakers, agenda, evaluation, task, and comms functions.
- Enables later proposal executors for communication drafts, reviewer assignment, agenda edits, and status changes without redesigning runs/events/approval.

## Risks & Mitigations

- Prompt injection in submission text → treat all record text as untrusted data; system prompt/tool boundary prohibits following embedded instructions; tools bind event/action policy in code.
- Hallucinated record IDs → all IDs validated against event before proposal/application.
- Approval fatigue → only gate state-changing actions; reads and briefs run without prompts.
- PII leakage → scoped data minimization, result caps, redacted audit summaries, no credentials/storage keys.
- Cost/latency → Terra default, 12-step cap, compact context, progressive disclosure, recorded usage for later eval-based tuning.
- Competing readiness rules → reuse existing readiness projection and tests.
- Dirty/parallel worktree → implementation must preserve current user changes and rebase carefully; these new docs do not authorize cleanup/reset.
