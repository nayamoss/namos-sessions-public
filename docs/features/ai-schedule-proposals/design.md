# AI Schedule Proposals — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

`convex/schema.ts:643` — `agent_action_proposals`:
```ts
agent_action_proposals: defineTable({
  eventId: v.id("events"),
  runId: v.id("agent_runs"),
  kind: v.union(v.literal("create_tasks"), v.literal("prepare_message_drafts")),
  tasks: v.optional(v.array(v.object({ /* ... */ }))),
  messages: v.optional(v.array(v.object({ /* ... */ }))),
  payloadHash: v.string(),
  summary: v.string(),
  status: v.union(v.literal("pending"), v.literal("rejected"), v.literal("applying"), v.literal("applied"), v.literal("failed"), v.literal("superseded")),
  proposedByToolCallId: v.string(),
  decidedByUserId: v.optional(v.string()),
  decisionReason: v.optional(v.string()),
  decidedAt: v.optional(v.number()),
  appliedAt: v.optional(v.number()),
  createdTaskIds: v.optional(v.array(v.id("onboarding_tasks"))),
  createdDraftIds: v.optional(v.array(v.id("communication_drafts"))),
  error: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_run", ["runId"])
  .index("by_event_status", ["eventId", "status"]),
```

`convex/schema.ts:739` — `agenda_items` (unchanged, referenced for context):
```ts
agenda_items: defineTable({
  eventId: v.id("events"),
  submissionId: v.optional(v.id("submissions")),
  title: v.string(),
  roomId: v.id("rooms"),
  trackId: v.optional(v.id("tracks")),
  startTime: v.number(),
  endTime: v.number(),
  speakerIds: v.array(v.id("speakers")),
  videoUrl: v.optional(v.string()),
  locationDetails: v.optional(v.string()),
  calendarUid: v.optional(v.string()),
  calendarSequence: v.optional(v.number()),
  sanityDocId: v.optional(v.string()),
  isPublished: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_room", ["roomId"])
  .index("by_submission", ["submissionId"]),
```

`convex/schema.ts:762` — `agenda_items_audit` (unchanged, already append-only; reused as-is):
```ts
agenda_items_audit: defineTable({
  eventId: v.id("events"),
  agendaItemId: v.id("agenda_items"),
  operation: v.union(v.literal("create"), v.literal("update"), v.literal("publish"), v.literal("delete")),
  actorUserId: v.string(),
  source: v.string(),
  snapshot: v.any(),
  createdAt: v.number(),
})
  .index("by_event_createdAt", ["eventId", "createdAt"])
  .index("by_agendaItem_createdAt", ["agendaItemId", "createdAt"]),
```

### Required Changes

| Table | Action | Field | Type | Notes |
|-------|--------|-------|------|-------|
| agent_action_proposals | CHANGE | `kind` | add `v.literal("schedule_assignments")` to the union | |
| agent_action_proposals | ADD FIELD | `scheduleAssignments` | `v.optional(v.array(scheduleAssignmentValidator))` — see below | mirrors `tasks`/`messages` optional-array pattern |
| agent_action_proposals | ADD FIELD | `createdAgendaItemIds` | `v.optional(v.array(v.id("agenda_items")))` | mirrors `createdTaskIds`/`createdDraftIds`, set on apply |
| agent_action_proposals | ADD FIELD | `skippedAssignments` | `v.optional(v.array(v.object({ submissionId: v.id("submissions"), reason: v.string() })))` | set on apply — sessions dropped because the agenda changed since proposal time |

`scheduleAssignmentValidator` (new, defined in `convex/agentState.ts` next to `proposedTaskValidator`/`proposedMessageValidator`):
```ts
export const proposedScheduleAssignmentValidator = v.object({
  submissionId: v.id("submissions"),
  title: v.string(),
  roomId: v.id("rooms"),
  trackId: v.optional(v.id("tracks")),
  startTime: v.number(),
  endTime: v.number(),
  speakerIds: v.array(v.id("speakers")),
  reason: v.string(),
});
```

No new table is needed — the audit trail already exists (`agenda_items_audit`) and proposal storage already exists (`agent_action_proposals`); this feature only adds a new `kind` variant to each, exactly like `prepare_message_drafts` did.

### Migration
Convex schema changes are additive (new optional fields, new union literal) — no backfill required. Existing rows are valid as-is because all new fields are optional.

---

## Backend / API

### Affected Existing Files
| File | Change |
|------|--------|
| `convex/schema.ts:643` | Add `"schedule_assignments"` to `kind` union; add `scheduleAssignments`, `createdAgendaItemIds`, `skippedAssignments` fields |
| `convex/agentState.ts` | Add `proposedScheduleAssignmentValidator`; add `saveScheduleProposal` internal mutation (mirrors `saveMessageProposal` at line 109) |
| `convex/agentProposal.ts` | Add `canonicalScheduleProposalPayload(summary, assignments)` (mirrors `canonicalMessageDraftProposalPayload`) |
| `convex/agentData.ts` | Add `unscheduledAcceptedSubmissions` internal query (new — see below); add `candidateScheduleSlots` internal query (new — see below) |
| `convex/agentRuntime.ts:21-28` | Update `SYSTEM_PROMPT` to permit proposing schedule assignments; add `propose_schedule_assignments` tool to `tools` object; add to `stopWhen` arrays at lines 143 and 228 |
| `convex/agentRuns.ts` | Add `approveScheduleProposal` mutation (mirrors `approveTaskProposal` at line 195 / `approveMessageProposal` at line 229) |
| `src/data/types.ts:160` | Extend `AgentActionProposal` union with `AgentScheduleProposal` type |
| `src/components/agent/AgentRunInspector.tsx` | Render `schedule_assignments` proposals |

### New Internal Queries (backend planning support)

**`agentData.unscheduledAcceptedSubmissions`**
- Args: `{ eventId: v.id("events") }`
- Returns: bounded list (max 50) of `{ submissionId, title, speakerIds, trackId }` for submissions where `status === "accepted"` and no `agenda_items` row has `submissionId` equal to that submission's id.
- Implementation: `ctx.db.query("submissions").withIndex("by_event", ...).collect()` filtered to `status === "accepted"`, cross-referenced against `ctx.db.query("agenda_items").withIndex("by_event", ...).collect()` to build a `Set<submissionId>` of already-scheduled ones. This is the same pattern the existing `agentData.conflicts` (line 73) and `agentData.reviewCoverage` (line 81) already use for full-table event-scoped collects.

**`agentData.candidateScheduleSlots`**
- Args: `{ eventId: v.id("events") }`
- Returns: `{ timezone, rooms: [{roomId, name, capacity}], slotGridMinutes: number, candidateStarts: number[] }` — a deterministic, bounded slot grid the LLM can choose from, not free-form times it invents.
- Implementation:
  1. Load `event.startDate`, `event.endDate`, `event.scheduleStartTime` (`"HH:mm"` string, default `"09:00"`), `event.scheduleEndTime` (default `"17:00"`), `event.timezone`.
  2. Build one slot grid per event day: iterate each day between `startDate` and `endDate` (inclusive), generate 30-minute-aligned candidate start timestamps between `scheduleStartTime` and `scheduleEndTime` in the event's timezone — same 30-minute granularity `unavailableSlotKeys` (`convex/agenda.ts:81`) already uses for availability matching.
  3. Cap total candidate starts returned at 200 (NFR-003 bound) — for a 3-day event with a 9am-5pm window and 30-min granularity that's already only 48/day = 144, so 200 covers typical events; if exceeded, truncate and note truncation in the query's return payload so the tool result can surface it.
  4. Return all `rooms` for the event (`ctx.db.query("rooms").withIndex("by_event", ...)`) with `capacity`.

### New Agent Tool

`convex/agentRuntime.ts` — add alongside `detect_schedule_conflicts` (read) and before `propose_create_tasks` (write-proposal pattern):

```ts
list_unscheduled_sessions: readTool(
  "list_unscheduled_sessions",
  "List accepted submissions that have no agenda placement yet.",
  z.object({}),
  internal.agentData.unscheduledAcceptedSubmissions,
),
list_schedule_slots: readTool(
  "list_schedule_slots",
  "List the event's rooms and the deterministic candidate time grid available for scheduling.",
  z.object({}),
  internal.agentData.candidateScheduleSlots,
),
propose_schedule_assignments: createTool<any, any, RunToolCtx>({
  description:
    "Propose room/time assignments for 1 to 50 unscheduled accepted sessions, chosen only from rooms and start times returned by list_schedule_slots. This never creates agenda items. Every assignment is re-validated server-side against the live product conflict rules before it can be shown as approvable; assignments that would create a blocking conflict are rejected here, not silently dropped for the organizer to discover later.",
  inputSchema: z.object({
    summary: z.string().min(1).max(1000),
    assignments: z.array(scheduleAssignmentInputSchema).min(1).max(50),
  }),
  execute: async (ctx, input, options) => {
    // Server-side re-validation: for each proposed assignment, call the same
    // placementConflicts-backed check the manual Agenda UI uses
    // (internal.agenda.checkPlacementInternal — new thin internal wrapper around
    // convex/agenda.ts:106 placementConflicts, reusing it directly rather than
    // duplicating conflict logic in agent code).
    const validated = [];
    const rejected = [];
    for (const assignment of input.assignments) {
      const conflicts = await ctx.runQuery(internal.agenda.checkPlacementInternal, {
        eventId: ctx.eventId,
        roomId: assignment.roomId,
        trackId: assignment.trackId,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        speakerIds: assignment.speakerIds,
      });
      const blocking = conflicts.filter((c: { blocking: boolean }) => c.blocking);
      if (blocking.length > 0) {
        rejected.push({ submissionId: assignment.submissionId, reason: blocking[0].message });
      } else {
        validated.push(assignment);
      }
    }
    if (validated.length === 0) {
      return { status: "no_valid_assignments", rejected };
    }
    const canonicalPayload = canonicalScheduleProposalPayload(input.summary, validated);
    const payloadHash = createHash("sha256").update(canonicalPayload).digest("hex");
    const proposalId = await ctx.runMutation(internal.agentState.saveScheduleProposal, {
      runId: ctx.runId,
      summary: input.summary,
      assignments: validated,
      payloadHash,
      toolCallId: options.toolCallId || randomUUID(),
    });
    return { status: "needs_approval", proposalId, payloadHash, count: validated.length, rejectedCount: rejected.length, rejected };
  },
}),
```

`scheduleAssignmentInputSchema` (zod, defined near `taskSchema`/`messageSchema` at `convex/agentRuntime.ts:63`):
```ts
const scheduleAssignmentInputSchema = z.object({
  submissionId: z.string().min(1),
  title: z.string().min(1).max(200),
  roomId: z.string().min(1),
  trackId: z.string().optional(),
  startTime: z.number().finite(),
  endTime: z.number().finite(),
  speakerIds: z.array(z.string()).min(0),
  reason: z.string().min(1).max(1000),
});
```

### New Internal Query: `agenda.checkPlacementInternal`
`convex/agenda.ts` — thin internal wrapper reusing `placementConflicts` (line 106), because the existing `checkPlacement` (line 248) is a public `query` gated by `assertEventOrganizerAccess`, which the agent's action context cannot call as an organizer-authenticated user. Add:
```ts
export const checkPlacementInternal = internalQuery({
  args: { id: v.optional(v.id("agenda_items")), ...agendaItemFields },
  handler: async (ctx, args) => placementConflicts(ctx, args),
});
```
This is a direct reuse, not new conflict logic — it calls the exact same `placementConflicts` function the manual save path (`convex/agenda.ts:293`) already trusts.

### SYSTEM_PROMPT change (`convex/agentRuntime.ts:21-28`)
Replace the line `You may read operational data, ask one focused clarification question, propose task creation, or prepare exact communication drafts. You may not score or decide submissions, send communications, edit or publish schedules, assign reviewers, delete records, change configuration, reveal credentials, or expose hidden reasoning.` with:
```
You may read operational data, ask one focused clarification question, propose task creation, prepare exact communication drafts, or propose schedule assignments for unscheduled accepted sessions. You may not score or decide submissions, send communications, directly create/edit/delete agenda items, publish schedules, assign reviewers, delete records, change configuration, reveal credentials, or expose hidden reasoning.
```
Add a new sentence after the task/message-proposal sentence:
```
Schedule proposals are never direct: call list_unscheduled_sessions and list_schedule_slots first, then call propose_schedule_assignments with room/time pairs chosen only from the returned slot grid, and stop for organizer approval. Never invent a room, time, or slot outside what list_schedule_slots returned.
```

### `stopWhen` arrays (`convex/agentRuntime.ts:143`, `:228`)
Add `hasToolCall("propose_schedule_assignments")` to both arrays, alongside the existing `propose_create_tasks` / `propose_message_drafts` entries.

### Approval Mutation

`convex/agentRuns.ts` — add after `approveMessageProposal` (line 271), mirroring its structure exactly:

```ts
export const approveScheduleProposal = mutation({
  args: { eventId: v.id("events"), proposalId: v.id("agent_action_proposals"), expectedPayloadHash: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.eventId !== args.eventId || proposal.kind !== "schedule_assignments" || !proposal.scheduleAssignments)
      throw new Error("Schedule proposal not found for this event.");
    const run = await ctx.db.get(proposal.runId);
    if (!run || run.eventId !== args.eventId) throw new Error("Agent run not found for this event.");
    if (args.expectedPayloadHash !== proposal.payloadHash) throw new Error("This proposal changed. Reload before approving.");
    if (proposal.status === "applied") return { createdAgendaItemIds: proposal.createdAgendaItemIds ?? [], skippedAssignments: proposal.skippedAssignments ?? [] };
    if (proposal.status !== "pending" || run.status !== "needs_approval") throw new Error("This proposal is no longer pending approval.");

    const now = Date.now();
    const createdAgendaItemIds: Id<"agenda_items">[] = [];
    const skippedAssignments: { submissionId: Id<"submissions">; reason: string }[] = [];

    for (const assignment of proposal.scheduleAssignments) {
      // Re-validate at approval time — the agenda may have changed since the proposal was generated.
      const conflicts = await placementConflictsForApproval(ctx, { eventId: args.eventId, roomId: assignment.roomId, trackId: assignment.trackId, startTime: assignment.startTime, endTime: assignment.endTime, speakerIds: assignment.speakerIds });
      const blocking = conflicts.filter((c) => c.blocking);
      if (blocking.length > 0) {
        skippedAssignments.push({ submissionId: assignment.submissionId, reason: blocking[0].message });
        continue;
      }
      const newId = await ctx.db.insert("agenda_items", {
        eventId: args.eventId,
        submissionId: assignment.submissionId,
        title: assignment.title,
        roomId: assignment.roomId,
        trackId: assignment.trackId,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        speakerIds: assignment.speakerIds,
        isPublished: false,
        calendarSequence: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(newId, { calendarUid: `sessionboard-${newId}` });
      const created = await ctx.db.get(newId);
      if (created) {
        await recordAgendaItemAudit(ctx, { item: created, operation: "create", actorUserId: identity.subject, source: "agent:schedule_proposal" });
      }
      createdAgendaItemIds.push(newId);
    }

    await ctx.db.patch(proposal._id, { status: "applied", decidedByUserId: identity.subject, decidedAt: now, appliedAt: now, createdAgendaItemIds, skippedAssignments, updatedAt: now });
    await ctx.db.patch(run._id, { status: "completed", completedAt: now, updatedAt: now });
    await appendEvent(ctx, run, "approval", `Approved and scheduled ${createdAgendaItemIds.length} session${createdAgendaItemIds.length === 1 ? "" : "s"}.${skippedAssignments.length ? ` ${skippedAssignments.length} could not be placed and were skipped.` : ""}`);
    return { createdAgendaItemIds, skippedAssignments };
  },
});
```

Note: this duplicates the insert body of `agenda.save` (`convex/agenda.ts:322`) rather than calling it directly, because `agenda.save` is a public `mutation` requiring its own `assertEventOrganizerAccess` call and is designed for a single item at a time from the UI form; `approveScheduleProposal` already holds its own `identity` from the top of the function and applies N items in one mutation. `placementConflictsForApproval` should be `placementConflicts` imported directly from `convex/agenda.ts` (it is already an exported function, not gated) — import it into `agentRuns.ts` rather than re-implementing.

Room/track ownership validation (belongs-to-event checks that `agenda.save` performs at lines 264-282) must also run inside `approveScheduleProposal` before insert, for the same reason `agenda.save` runs them — a room/track id from a stale proposal could reference a deleted room. Add the same two checks (room exists + belongs to event; track exists + belongs to event if present) before each insert, skipping (not throwing for) an individual assignment that fails, consistent with the "skip and report" behavior for conflicts.

### `rejectProposal` (`convex/agentRuns.ts:273`)
No change needed — confirmed generic: it looks up by `proposalId` only and doesn't branch on `kind`. Verify this holds after adding the new kind (read the full function body before implementing to confirm no kind-specific assumption was missed).

---

## Frontend Components

### Modified Components

| File | Change |
|------|--------|
| `src/data/types.ts:160` | Add `AgentScheduleProposal` interface; extend `AgentActionProposal` union |
| `src/components/agent/AgentRunInspector.tsx:60-153` | Add a third branch for `proposal.kind === "schedule_assignments"` |
| `src/pages/program/AgentOperations.tsx:136-149` | Extend `approveProposal` to call `repo.agentRuns.approveScheduleProposal` for the new kind |
| `convex/agentRuns.ts` (repo data-adapter layer, wherever `repo.agentRuns.*` is wired — same file group as `approveTaskProposal`/`approveMessageProposal` are already exposed through) | Expose `approveScheduleProposal` the same way the other two approvals are exposed to `useRepo()` |

### Type Addition (`src/data/types.ts`, near line 160)

```ts
export interface AgentProposedScheduleAssignment {
  submissionId: SubmissionId;
  title: string;
  roomId: string;
  trackId?: string;
  startTime: number;
  endTime: number;
  speakerIds: SpeakerId[];
  reason: string;
}
export interface AgentScheduleProposal extends AgentActionProposalBase {
  kind: "schedule_assignments";
  scheduleAssignments: AgentProposedScheduleAssignment[];
  createdAgendaItemIds?: string[];
  skippedAssignments?: { submissionId: SubmissionId; reason: string }[];
}
export type AgentActionProposal = AgentTaskProposal | AgentMessageProposal | AgentScheduleProposal;
```
(`AgentActionProposalBase` — check whether `AgentTaskProposal`/`AgentMessageProposal` already share a base interface above line 160; if so extend it the same way, if not, mirror their exact shared fields: `id`, `eventId`, `runId`, `payloadHash`, `summary`, `status`, `createdAt`, `updatedAt`.)

### `AgentRunInspector.tsx` — New Rendering Branch

Location: inside the existing `proposals.map(...)` block (line 60-153), same `<section>` card layout as the other two kinds.

- Header (line 65-72): extend the ternary to a 3-way — `proposal.kind === "create_tasks" ? "Proposed tasks" : proposal.kind === "prepare_message_drafts" ? "Proposed message drafts" : "Proposed schedule"`.
- Body (replacing the single ternary at line 75-108): add a third branch —
  ```tsx
  : proposal.scheduleAssignments.map((assignment, index) => (
      <div key={`${assignment.submissionId}-${index}`} className="rounded-md bg-muted/60 p-3">
        <p className="text-sm font-medium">{assignment.title}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(assignment.startTime).toLocaleString()} – {new Date(assignment.endTime).toLocaleTimeString()}
        </p>
        <p className="mt-1 text-xs">{assignment.reason}</p>
      </div>
    ))
  ```
  Room/track names: the proposal only carries ids. Resolve display names client-side the same way `listForSpeaker` does server-side (`convex/agenda.ts:167-186`, building a `Map` of `roomId → name`) — pass `rooms`/`tracks` lookups down from `AgentOperations.tsx` (it already has `useCurrentEvent()`; add `useRepoQuery("rooms.list", ...)` and `useRepoQuery("tracks.list", ...)` if not already fetched on that page, and thread as new optional props `roomNames?: Map<string,string>` / `trackNames?: Map<string,string>` on `AgentRunInspector`). Render room name and, if present, track name as an additional `<p>` line under the time.
- Skipped-on-apply state: extend the `proposal.status === "applied"` block (line 134-152) with a third branch showing `Scheduled {createdAgendaItemIds.length} session(s).` and, if `skippedAssignments.length > 0`, a list of skipped session titles + reasons (resolve title from `proposal.scheduleAssignments` by matching `submissionId`).
- Approve button label (line 120-122 ternary): extend to 3-way — `"Approve & create" : proposal.kind === "prepare_message_drafts" ? "Approve & prepare drafts" : "Approve & schedule"`.

### `AgentOperations.tsx` — Approve Wiring (line 136-149)

Extend the ternary in `approveProposal`:
```ts
const approveProposal = (proposal: AgentActionProposal) =>
  decide(proposal.id, () =>
    proposal.kind === "create_tasks"
      ? repo.agentRuns.approveTaskProposal({ eventId: event.id, proposalId: proposal.id, expectedPayloadHash: proposal.payloadHash })
      : proposal.kind === "prepare_message_drafts"
        ? repo.agentRuns.approveMessageProposal({ eventId: event.id, proposalId: proposal.id, expectedPayloadHash: proposal.payloadHash })
        : repo.agentRuns.approveScheduleProposal({ eventId: event.id, proposalId: proposal.id, expectedPayloadHash: proposal.payloadHash }),
  ).then(() => undefined);
```

No new entry point/route is needed — this reuses the existing Operations Agent page (`/events/:slug/program/agent`) and its existing composer + suggestion-chip pattern. Add one new grounded suggestion string, e.g. `"Propose a schedule for unscheduled accepted sessions"`, to the `fallbackSuggestions` array (`AgentOperations.tsx:26-30`) and/or the server-side `agentRuns.suggestions` query if it has a similar hardcoded/derived list (check `convex/agentRuns.ts:69` `suggestions` query before implementing — mirror however task/message suggestions are already surfaced there).

---

## State / Data Flow

```
AgentOperations page: useRepoQuery("agentRuns.get", {runId}) → AgentRunDetail{ run, events, proposals }
  → AgentRunInspector renders proposals[] (reactive Convex subscription — same as task/message proposals today)
  → organizer clicks "Approve & schedule"
  → repo.agentRuns.approveScheduleProposal({eventId, proposalId, expectedPayloadHash})
  → convex mutation: re-validates each assignment via placementConflicts, inserts agenda_items rows,
    writes agenda_items_audit rows, patches proposal.status = "applied"
  → Convex reactivity re-renders AgentRunInspector with applied state (createdAgendaItemIds, skippedAssignments)
  → Agenda page (src/pages/program/Agenda.tsx, unmodified) picks up the new agenda_items rows on its own
    existing reactive query — no new wiring needed there, it already subscribes to all agenda_items for the event.
```

Agent run generation side (LLM path):
```
Organizer objective ("propose a schedule for my unscheduled sessions")
  → agent.generateText with tools including list_unscheduled_sessions, list_schedule_slots, propose_schedule_assignments
  → LLM calls list_unscheduled_sessions → gets submissions needing placement
  → LLM calls list_schedule_slots → gets rooms + deterministic candidate start times
  → LLM calls propose_schedule_assignments with chosen (submissionId, roomId, startTime, endTime, speakerIds) pairs
  → tool execute() re-validates every assignment server-side via internal.agenda.checkPlacementInternal
    before saving the proposal — rejected assignments never reach the organizer as "approvable"
  → saveScheduleProposal mutation persists agent_action_proposals row, run.status = "needs_approval"
```

---

## Auth / Permissions
- Tool execution (`propose_schedule_assignments`, its read tools) runs inside the existing `RunToolCtx` action context, authorized by the run's `eventId` binding already established when the run was created — no new auth surface, identical to `propose_create_tasks`.
- `approveScheduleProposal` requires `assertEventOrganizerAccess(ctx, args.eventId)` exactly like `approveTaskProposal`/`approveMessageProposal` — only an event organizer can approve.
- Nothing here is public; unauthenticated/non-organizer users have no access path to this feature (same boundary as the rest of the Operations Agent).

---

## Edge Cases & Error States

| Scenario | Handling |
|----------|----------|
| No unscheduled accepted submissions | `list_unscheduled_sessions` returns `[]`; agent's final brief states nothing needs scheduling — no proposal created (same "nothing to propose" pattern as the existing `executeDeterministicDemoRun` no-candidates branch at `agentRuntime.ts:180-184`) |
| Agent proposes assignment outside the returned slot grid | Not a runtime edge case to handle defensively — prevented by the tool description instructing selection only from `list_schedule_slots` output; if the model violates this, `checkPlacementInternal` still validates room/time validity implicitly (an out-of-range time just won't conflict, so it would still be accepted — track separately if this proves to be a real problem after testing, out of scope for v1 per requirements.md) |
| All proposed assignments rejected by server-side re-validation in the tool | `propose_schedule_assignments` returns `{status: "no_valid_assignments", rejected}` instead of saving a proposal; run continues (does not stop at `needs_approval`) so the LLM can either retry with different slots or explain the situation in its final text response |
| Agenda changes between proposal creation and approval (another organizer manually schedules one of the proposed sessions) | `approveScheduleProposal` re-validates every assignment against current state; conflicting ones move to `skippedAssignments`, valid ones still apply (NFR-001) |
| Proposal approved twice (double-click / stale tab) | Existing idempotency pattern: `if (proposal.status === "applied") return { ...already-created ids... }` (mirrors line 204/238) |
| Payload changed since organizer loaded it | `expectedPayloadHash` mismatch throws "This proposal changed. Reload before approving." — identical existing behavior |
| Room or track referenced in proposal was deleted before approval | Skipped (not thrown) with a reason, consistent with conflict-skip behavior — added as an explicit check per the Backend/API section above |
| Speaker marked unavailable but no blocking conflict | Included in the proposal as `blocking: false` per existing `placementConflicts` semantics (`convex/agenda.ts:126`) — surfaced as a soft warning in `reason`, not excluded |
| Event has zero rooms configured | `candidateScheduleSlots` returns `rooms: []`; agent cannot propose anything meaningful and should surface this via `request_clarification` or its final text, not attempt a proposal with no room |
| Very large accepted-submission count (>50) | `list_unscheduled_sessions` bounded to 50 per call, `propose_schedule_assignments` bounded to 50 assignments per proposal — same pattern as `propose_create_tasks`'s existing 1-50 bound; multiple agent runs needed for larger backlogs, consistent with existing per-run bounds elsewhere in this file |

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slot search: LLM-free-form vs deterministic grid | Deterministic grid returned by `list_schedule_slots`, LLM only selects from it | Requirements explicitly rule out a novel optimizer (FR-002); prevents the LLM inventing invalid times, keeps the search space bounded (NFR-003) |
| Conflict validation: reuse vs reimplement | Reuse `placementConflicts` (`convex/agenda.ts:106`) via a new internal wrapper | Single source of truth for conflict rules — the manual Agenda UI and the AI path must never diverge on what counts as a conflict |
| Apply-time write path: call `agenda.save` vs reimplement insert | Reimplement the insert body directly in `approveScheduleProposal` | `agenda.save` is single-item, publicly gated, and designed for the manual form; the approval mutation needs to apply N items in one call with its own already-established identity — duplicating the ~15-line insert body is simpler and safer than adapting a public single-item mutation to a batch internal caller |
| New table for schedule proposals vs extending `agent_action_proposals` | Extend existing table with a new `kind` | Exactly mirrors how `prepare_message_drafts` was added as a second kind alongside `create_tasks` — no reason to diverge from the established pattern |

## Dependencies
**Requires:** existing Operations Agent infrastructure (`agentRuntime.ts`, `agentState.ts`, `agentRuns.ts`), existing agenda conflict logic (`agenda.ts`), existing rooms/tracks/submissions data.
**Enables:** future multi-candidate optimization (out of scope here) could later replace the single deterministic-grid pass with a scored search over the same validated-placement primitive.

## Risks & Mitigations
- **Risk:** LLM proposes assignments that don't reflect organizer intent (e.g. wrong track grouping). **Mitigation:** proposal is always review-then-approve, never auto-applied — same trust model as tasks/messages.
- **Risk:** Large events blow the 200-candidate-slot bound, causing incomplete slot coverage. **Mitigation:** truncation is reported in the query payload (see `candidateScheduleSlots` above); acceptable for v1, flagged as a known limit rather than silently covered.
