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
  warnings: v.array(v.object({
    reason: v.union(v.literal("speaker_unavailable"), v.literal("track_overlap")),
    message: v.string(),
  })),
});
```

Only `submissionId`, `roomId`, `startTime`, and `reason` originate in model output. Before persistence, the server reloads the submission and derives `title`, `speakerIds`, `trackId`, and `endTime`; `warnings` comes exclusively from server-side conflict validation. The persisted proposal is therefore a canonical, event-scoped snapshot rather than a copy of model-authored record relationships.

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
| `convex/schedulePlanning.ts` | Add shared deterministic slot-grid construction and batch-validation helpers used by proposal creation and approval |
| `convex/agentData.ts` | Add `unscheduledAcceptedSubmissions` internal query (new — see below); add `candidateScheduleSlots` internal query (new — see below) |
| `convex/agentRuntime.ts:21-28` | Update `SYSTEM_PROMPT` to permit proposing schedule assignments; add `propose_schedule_assignments` tool to `tools` object; add to `stopWhen` arrays at lines 143 and 228 |
| `convex/agentRuns.ts` | Add `approveScheduleProposal` mutation (mirrors `approveTaskProposal` at line 195 / `approveMessageProposal` at line 229) |
| `src/data/types.ts:160` | Extend `AgentActionProposal` union with `AgentScheduleProposal` type |
| `src/components/agent/AgentRunInspector.tsx` | Render `schedule_assignments` proposals |

### New Internal Queries (backend planning support)

**`agentData.unscheduledAcceptedSubmissions`**
- Args: `{ eventId: v.id("events"), cursor: v.optional(v.string()) }`
- Returns: `{ items, nextCursor }`, where `items` is a deterministic page (max 50) of `{ submissionId, title, speakerIds, trackId }` for submissions where `status === "accepted"` and no `agenda_items` row has the same `submissionId`.
- Implementation: query event-scoped submissions in a stable order, cross-reference against event agenda items, and paginate without allowing repeatedly unplaceable records in the first page to starve later submissions. `nextCursor` is opaque to the model and can be supplied to a subsequent `list_unscheduled_sessions` call. If implementing true indexed pagination requires a status-aware schema index, add and document that index rather than collecting an unbounded event table and slicing after filtering.

**`agentData.candidateScheduleSlots`**
- Args: `{ eventId: v.id("events") }`
- Returns: `{ timezone, rooms: [{roomId, name, capacity}], slotGridMinutes: 30, slotDurationMinutes: 45, candidateSlots: [{startTime, endTime}], truncated }` — a deterministic, bounded slot grid the LLM can choose from, not free-form times it invents. The 45-minute duration matches the existing new-session default in `Agenda.tsx:649,903`; v1 does not infer duration from unstructured submission answers.
- Implementation:
  1. Load `event.startDate`, `event.endDate`, `event.scheduleStartTime` (`"HH:mm"` string, default `"09:00"`), `event.scheduleEndTime` (default `"17:00"`), `event.timezone`.
  2. Build one slot grid per event-local calendar day: generate 30-minute-aligned starts and a server-derived 45-minute end, retaining only slots whose end is at or before `scheduleEndTime`. Use an IANA-timezone-aware conversion equivalent to the existing `eventDateTimeToEpoch` behavior so nonexistent DST wall times are rejected rather than shifted.
  3. Cap total candidate slots returned at 200 (NFR-003 bound). A 3-day 9am-5pm event produces 48 starts in total before the end-boundary adjustment, not 48 per day. If the bound is exceeded, return `truncated: true` so the tool result can surface incomplete coverage.
  4. Return all `rooms` for the event (`ctx.db.query("rooms").withIndex("by_event", ...)`) with `capacity`.

The same pure grid builder is called again during proposal validation and approval. Model instructions are not the enforcement boundary: a requested `startTime` is accepted only when it exactly matches a currently valid candidate slot, and `endTime` is copied from that slot.

### New Agent Tool

`convex/agentRuntime.ts` — add alongside `detect_schedule_conflicts` (read) and before `propose_create_tasks` (write-proposal pattern):

```ts
list_unscheduled_sessions: readTool(
  "list_unscheduled_sessions",
  "List accepted submissions that have no agenda placement yet.",
  z.object({ cursor: z.string().optional() }),
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
    "Propose room/time assignments for 1 to 50 unscheduled accepted sessions, chosen only from rooms and start times returned by list_schedule_slots. Supply identifiers and rationale only; the server derives session metadata and end times. This never creates agenda items. The complete assignment batch is re-validated server-side before it can be shown as approvable.",
  inputSchema: z.object({
    summary: z.string().min(1).max(1000),
    assignments: z.array(scheduleAssignmentInputSchema).min(1).max(50),
  }),
  execute: async (ctx, input, options) => {
    // One server query validates the complete batch against a single database
    // snapshot, deriving authoritative submission fields, rejecting duplicates
    // and off-grid values, and checking each accepted assignment against both
    // existing agenda items and earlier accepted assignments in this batch.
    const { validated, rejected } = await ctx.runQuery(
      internal.agenda.validateScheduleProposalBatchInternal,
      { eventId: ctx.eventId, assignments: input.assignments },
    );
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
  roomId: z.string().min(1),
  startTime: z.number().finite(),
  reason: z.string().min(1).max(1000),
});
```

### New Internal Query: `agenda.validateScheduleProposalBatchInternal`
`convex/agenda.ts` — an internal wrapper around a shared batch validator, because the existing `checkPlacement` (line 248) is a public query gated by `assertEventOrganizerAccess` and validates only one placement against persisted agenda items. Add:
```ts
export const validateScheduleProposalBatchInternal = internalQuery({
  args: {
    eventId: v.id("events"),
    assignments: v.array(requestedScheduleAssignmentValidator),
  },
  handler: async (ctx, args) => validateScheduleProposalBatch(ctx, args),
});
```
`validateScheduleProposalBatch` must be an exported TypeScript helper (not a public Convex endpoint) callable with either `QueryCtx` or `MutationCtx`. For each request, it:

1. rejects repeated `submissionId` values;
2. reloads the submission and verifies event ownership, `status === "accepted"`, and no existing `agenda_items` row by submission;
3. verifies that the room belongs to the event and that `startTime` is present in the freshly recomputed event slot grid;
4. derives `title`, `speakerIds`, `trackId`, and `endTime` from authoritative data;
5. calls the existing `placementConflicts` rules against persisted agenda items plus the growing list of canonical assignments already accepted from this batch; and
6. stores non-blocking results as structured `warnings` while rejecting blocking results.

This requires a small refactor of the current private `placementConflicts` function at `convex/agenda.ts:107`: allow additional in-memory candidates or extract its pure overlap portion. Do not claim it is already exported; it is not. `agenda.checkPlacement`, `agenda.save`, proposal creation, and proposal approval must continue to share the same conflict-rule implementation.

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
Do not add an unconditional `hasToolCall("propose_schedule_assignments")`: the tool may return `no_valid_assignments` without moving the run to `needs_approval`, and an unconditional stop would end the generation before the model can retry or explain the rejected rows. Add a small stop predicate for both arrays that inspects schedule-proposal tool results and returns true only when the result status is `needs_approval`. Retain the existing unconditional stops for task/message proposals, whose tools always persist a proposal when called successfully.

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
    // Re-run the same batch validator inside this mutation. It reads the current
    // agenda and canonical submission data in the transaction that will perform
    // the writes, so concurrent changes cause Convex to retry from a fresh snapshot.
    const { validated, rejected } = await validateScheduleProposalBatch(ctx, {
      eventId: args.eventId,
      assignments: proposal.scheduleAssignments.map(({ submissionId, roomId, startTime, reason }) =>
        ({ submissionId, roomId, startTime, reason })),
      expectedCanonicalAssignments: proposal.scheduleAssignments,
    });
    const createdAgendaItemIds: Id<"agenda_items">[] = [];
    const skippedAssignments = rejected.map(({ submissionId, reason }) => ({ submissionId, reason }));

    for (const assignment of validated) {
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

Note: this duplicates only the final insert/audit portion of `agenda.save` (`convex/agenda.ts:322`) because `agenda.save` is a public, single-item mutation. Its validation behavior is not duplicated: the shared batch validator owns room/event membership, accepted/unscheduled submission state, speaker/track relationships, valid time ordering and grid membership, and conflict checks. At approval it also compares the freshly derived title/speaker/track snapshot with the canonical proposal; if those reviewed details changed, that assignment is skipped with a stale-proposal reason rather than silently applying a materially different session.

Expected per-assignment validation failures become `skippedAssignments`. Inserts, audit writes, and final proposal/run patches remain one atomic Convex mutation; an unexpected database or audit error is allowed to throw and roll back the whole approval.

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
  warnings: Array<{ reason: "speaker_unavailable" | "track_overlap"; message: string }>;
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
        <p className="text-xs text-muted-foreground">Currently unscheduled</p>
        <p className="text-xs text-muted-foreground">
          {formatScheduleRange(assignment.startTime, assignment.endTime, eventTimezone)}
        </p>
        <p className="mt-1 text-xs">{assignment.reason}</p>
        {assignment.warnings.length > 0 && (
          <ul aria-label="Scheduling warnings">
            {assignment.warnings.map((warning) => <li key={warning.reason}>{warning.message}</li>)}
          </ul>
        )}
      </div>
    ))
  ```
  Room/track names: the proposal only carries ids. Resolve display names client-side the same way `listForSpeaker` does server-side (`convex/agenda.ts:167-186`, building a `Map` of `roomId → name`) — pass `rooms`/`tracks` lookups down from `AgentOperations.tsx` (it already has `useCurrentEvent()`; add `useRepoQuery("rooms.list", ...)` and `useRepoQuery("tracks.list", ...)` if not already fetched on that page, and thread as new optional props `roomNames?: Map<string,string>` / `trackNames?: Map<string,string>` on `AgentRunInspector`). Also pass `eventTimezone: string` and format both timestamps with `Intl.DateTimeFormat(..., { timeZone: eventTimezone })`, following the existing Agenda/event-time patterns rather than the browser timezone. Render room name and, if present, track name as an additional `<p>` line under the time. If a referenced room/track is no longer in the lookup, show an explicit “Room unavailable”/“Track unavailable” fallback rather than a raw id or blank label.
- Warnings: render `assignment.warnings` as a semantic list with a contextual warning icon and text; do not fold server-derived warnings into the agent-authored reason or communicate them by color alone.
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
  → LLM calls list_schedule_slots → gets rooms + deterministic candidate slots
  → LLM calls propose_schedule_assignments with chosen (submissionId, roomId, startTime, reason) values
  → tool execute() validates the complete batch server-side via internal.agenda.validateScheduleProposalBatchInternal;
    the server derives title/speakers/track/endTime, enforces grid membership, and checks proposed rows
    against both persisted agenda items and one another
  → rejected assignments never reach the organizer as "approvable"; non-blocking conflicts are persisted as warnings
  → saveScheduleProposal mutation persists agent_action_proposals row, run.status = "needs_approval"
```

---

## Auth / Permissions
- Tool execution (`propose_schedule_assignments`, its read tools) runs inside the existing `RunToolCtx` action context, authorized by the run's `eventId` binding already established when the run was created — no new auth surface, identical to `propose_create_tasks`.
- `approveScheduleProposal` requires `assertEventOrganizerAccess(ctx, args.eventId)` exactly like `approveTaskProposal`/`approveMessageProposal` — only an event organizer can approve.
- Nothing here is public; unauthenticated/non-organizer users have no access path to this feature (same boundary as the rest of the Operations Agent).

---

## Test Strategy

Add focused automated coverage before browser verification:

- **Slot-grid tests:** event-local dates/hours, 30-minute starts, fixed 45-minute ends, schedule-end clipping, 200-slot truncation, invalid timezone handling, and DST spring-forward/fall-back boundaries.
- **Batch-validator tests:** persisted-agenda room/speaker conflicts; room/speaker conflicts between two proposed rows; non-blocking warning capture; duplicate submissions; off-grid times; wrong-event or missing rooms/submissions; non-accepted, already-scheduled, or deleted submissions; authoritative title/speaker/track derivation; and deterministic rejection reasons.
- **Approval tests:** stale agenda changes, stale canonical session metadata, valid partial application, duplicate-click idempotency, organizer authorization, audit source/actor, and full rollback when an unexpected insert or audit error occurs.
- **Proposal-contract tests:** payload hashing includes canonical assignments and warnings; existing task/message proposal kinds still serialize and approve unchanged; adapter/type mappings expose the new kind.
- **Component tests:** event-timezone formatting, accessible warning semantics, applied/skipped summaries, disabled/loading approval state, and room/track fallback labels.
- **Browser flow:** create a real proposal, approve it, verify applied and skipped results, follow “Review agenda,” and confirm the new unpublished agenda items appear.

Run the repository's local verification commands (`npm run typecheck`, relevant Vitest files, then `npm run build`; use `npm run check` when the full suite is practical). This repository does not rely on GitHub Actions for CI, so local evidence must be recorded in the implementation handoff.

---

## Edge Cases & Error States

| Scenario | Handling |
|----------|----------|
| No unscheduled accepted submissions | `list_unscheduled_sessions` returns `[]`; agent's final brief states nothing needs scheduling — no proposal created (same "nothing to propose" pattern as the existing `executeDeterministicDemoRun` no-candidates branch at `agentRuntime.ts:180-184`) |
| Agent proposes assignment outside the returned slot grid, with an invalid room, or with a fabricated relationship | The batch validator rejects it. `endTime`, title, speakers, and track are not accepted as model input; they are derived server-side. Prompt instructions improve model behavior but are never the data-integrity boundary. |
| Two requested assignments conflict with each other | The validator evaluates each candidate against the growing accepted batch; the later conflicting assignment is rejected with a blocking reason and is not persisted in the approvable proposal. |
| Duplicate submission appears in one request | The first occurrence may be evaluated; later occurrences are rejected as duplicates. The persisted proposal contains each submission at most once. |
| All proposed assignments rejected by server-side re-validation in the tool | `propose_schedule_assignments` returns `{status: "no_valid_assignments", rejected}` instead of saving a proposal. The schedule-specific stop predicate does not fire, so the LLM can retry with different slots or explain the situation in its final text response. |
| Agenda or submission data changes between proposal creation and approval | `approveScheduleProposal` re-validates the whole batch in the write transaction. Newly conflicting/already-scheduled assignments and assignments whose reviewed canonical metadata changed move to `skippedAssignments`; valid ones still apply (NFR-001). |
| Proposal approved twice (double-click / stale tab) | Existing idempotency pattern: `if (proposal.status === "applied") return { ...already-created ids... }` (mirrors line 204/238) |
| Payload changed since organizer loaded it | `expectedPayloadHash` mismatch throws "This proposal changed. Reload before approving." — identical existing behavior |
| Room or track referenced in proposal was deleted before approval | Skipped (not thrown) with a reason, consistent with conflict-skip behavior — added as an explicit check per the Backend/API section above |
| Speaker marked unavailable or track overlaps | Included in the proposal because the conflict is non-blocking, but stored in the server-derived `warnings` array and rendered separately from rationale. |
| Event has zero rooms configured | `candidateScheduleSlots` returns `rooms: []`; agent cannot propose anything meaningful and should surface this via `request_clarification` or its final text, not attempt a proposal with no room |
| Very large accepted-submission count (>50) | `list_unscheduled_sessions` bounded to 50 per call, `propose_schedule_assignments` bounded to 50 assignments per proposal — same pattern as `propose_create_tasks`'s existing 1-50 bound; multiple agent runs needed for larger backlogs, consistent with existing per-run bounds elsewhere in this file |
| First 50 submissions contain repeatedly unplaceable sessions | Return a deterministic cursor or stable `hasMore`/continuation token from `list_unscheduled_sessions`; subsequent runs must be able to advance rather than repeatedly starving later accepted submissions. |

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slot search: LLM-free-form vs deterministic grid | Deterministic grid returned by `list_schedule_slots`, LLM only selects from it | Requirements explicitly rule out a novel optimizer (FR-002); prevents the LLM inventing invalid times, keeps the search space bounded (NFR-003) |
| Conflict validation: reuse vs reimplement | Reuse `placementConflicts` (`convex/agenda.ts:106`) via a new internal wrapper | Single source of truth for conflict rules — the manual Agenda UI and the AI path must never diverge on what counts as a conflict |
| Model-authored vs authoritative fields | Model supplies only submission, room, start, and rationale; server derives record relationships and end time | Prevents hallucinated or cross-event ids from weakening conflict checks or corrupting agenda relationships |
| Session duration in v1 | Fixed 45-minute duration, matching the existing Agenda new-session default | The schema has no authoritative structured duration field; a fixed documented default is safer than inferring from `answers` or accepting an invented end time |
| Apply-time write path: call `agenda.save` vs reimplement insert | Reimplement the insert body directly in `approveScheduleProposal` | `agenda.save` is single-item, publicly gated, and designed for the manual form; the approval mutation needs to apply N items in one call with its own already-established identity — duplicating the ~15-line insert body is simpler and safer than adapting a public single-item mutation to a batch internal caller |
| New table for schedule proposals vs extending `agent_action_proposals` | Extend existing table with a new `kind` | Exactly mirrors how `prepare_message_drafts` was added as a second kind alongside `create_tasks` — no reason to diverge from the established pattern |

## Dependencies
**Requires:** existing Operations Agent infrastructure (`agentRuntime.ts`, `agentState.ts`, `agentRuns.ts`), existing agenda conflict logic (`agenda.ts`), existing rooms/tracks/submissions data.
**Enables:** future multi-candidate optimization (out of scope here) could later replace the single deterministic-grid pass with a scored search over the same validated-placement primitive.

## Risks & Mitigations
- **Risk:** LLM proposes assignments that don't reflect organizer intent (e.g. wrong track grouping). **Mitigation:** proposal is always review-then-approve, never auto-applied — same trust model as tasks/messages.
- **Risk:** Large events blow the 200-candidate-slot bound, causing incomplete slot coverage. **Mitigation:** truncation is reported in the query payload (see `candidateScheduleSlots` above); acceptable for v1, flagged as a known limit rather than silently covered.
- **Risk:** Timezone/DST conversion generates shifted or nonexistent slots. **Mitigation:** use an event-timezone-aware wall-clock conversion, reject nonexistent local times, format UI timestamps in `event.timezone`, and cover spring-forward/fall-back boundaries in tests.
- **Risk:** Manual and AI schedule validation drift apart. **Mitigation:** refactor the existing conflict implementation into shared helpers exercised by both paths; do not copy conflict rules into `agentRuns.ts`.
