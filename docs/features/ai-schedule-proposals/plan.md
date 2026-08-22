# AI Schedule Proposals — Implementation Plan

## Phase 1: Backend Foundation
- [ ] T001: Add `proposedScheduleAssignmentValidator` to `convex/agentState.ts`, including structured server-derived `warnings`; keep the model input validator separate and limited to `submissionId`, `roomId`, `startTime`, and `reason`
- [ ] T002: Add `"schedule_assignments"` to `agent_action_proposals.kind` union in `convex/schema.ts:643`; add `scheduleAssignments`, `createdAgendaItemIds`, `skippedAssignments` optional fields
- [ ] T003: Add `canonicalScheduleProposalPayload(summary, assignments)` to `convex/agentProposal.ts`, mirroring `canonicalMessageDraftProposalPayload`
- [ ] T004: Add `saveScheduleProposal` internal mutation to `convex/agentState.ts`, mirroring `saveMessageProposal` (line 109)
- [ ] T005: Refactor the current private conflict helpers in `convex/agenda.ts` so manual placement and schedule proposals share one implementation; add `validateScheduleProposalBatchInternal` plus an exported TypeScript batch helper callable from query and mutation contexts
- [ ] T006: Add paginated `agentData.unscheduledAcceptedSubmissions` to `convex/agentData.ts` with stable ordering, an opaque continuation cursor, accepted-status filtering, and already-scheduled exclusion; add an index if needed to avoid an unbounded collect-and-slice
- [ ] T007: Add shared event-timezone-aware slot-grid construction in `convex/schedulePlanning.ts` and expose it through `agentData.candidateScheduleSlots` (30-minute starts, fixed 45-minute duration matching Agenda defaults, end-boundary clipping, 200-slot cap, `truncated` flag)
- [ ] T007A: Implement canonical batch validation: reject duplicate/off-grid/wrong-event/stale records; derive title/speakers/track/end time; check candidates against the persisted agenda and earlier accepted candidates in the same batch; persist non-blocking results as warnings

## Phase 2: Agent Tool Wiring
- [ ] T008: Add `list_unscheduled_sessions` and `list_schedule_slots` read tools to `convex/agentRuntime.ts` `tools` object
- [ ] T009: Add the narrow `scheduleAssignmentInputSchema` (zod) near `taskSchema`/`messageSchema` (`agentRuntime.ts:63`): `submissionId`, `roomId`, `startTime`, and `reason` only
- [ ] T010: Add `propose_schedule_assignments` using one complete-batch call to `validateScheduleProposalBatchInternal`; save only canonical validated assignments and return explicit rejected rows
- [ ] T011: Update `SYSTEM_PROMPT` (`agentRuntime.ts:21-28`) to permit schedule proposals and describe the list-then-propose flow
- [ ] T012: Add a schedule-specific `stopWhen` predicate to both arrays that stops only when `propose_schedule_assignments` returns `status: "needs_approval"`; prove `no_valid_assignments` leaves the model able to retry or produce a final explanation

## Phase 3: Approval Mutation
- [ ] T013: Add `approveScheduleProposal` to `convex/agentRuns.ts`; re-run the shared batch validator inside the write transaction, compare current canonical session metadata with the reviewed proposal, collect expected stale/conflict failures as skips, insert canonical `agenda_items`, and write `agenda_items_audit` rows with `source: "agent:schedule_proposal"`
- [ ] T013A: Verify atomicity and concurrency behavior: inserts, audits, and proposal/run patches remain one Convex transaction; unexpected write/audit errors throw and roll back; concurrent agenda changes cause validation to retry against fresh state
- [ ] T014: Confirm `rejectProposal` (`agentRuns.ts:273`) needs no kind-specific change — read full function body to verify

## Phase 4: Frontend UI (REQUIRED — never skip)

> A feature is NOT done until it is visible and usable in the UI. This phase must be specific.

### UI Spec

**Location:** Operations Agent page (`/events/:slug/program/agent`, `src/pages/program/AgentOperations.tsx`) — the existing agent run detail panel (`AgentRunInspector`, rendered as the `detail` slot of `AppLayout`). No new route or page.

**Elements — new `schedule_assignments` proposal card** (added inside the existing `proposals.map(...)` loop in `AgentRunInspector.tsx`, same `<section className="space-y-3 rounded-lg bg-background p-4">` card style as task/message proposals):
- Card header: `<h2>` reading "Proposed schedule" (third branch of the existing kind-ternary) + existing `<StatusBadge>{proposal.status}</StatusBadge>`
- Summary line: `<p className="text-sm text-muted-foreground">{proposal.summary}</p>` (unchanged, reused)
- Per-assignment row (one `<div className="rounded-md bg-muted/60 p-3">` per assignment, same visual weight as task/message rows):
  - Session title: `<p className="text-sm font-medium">{assignment.title}</p>`
  - Current state: passive text `Currently unscheduled`, making the proposed change explicit without adding row actions
  - Time range: `<p className="text-xs text-muted-foreground">{formatted start} – {formatted end}</p>` using `Intl.DateTimeFormat` with `timeZone: event.timezone`, following the existing Agenda/event-time patterns rather than the browser timezone
  - Room + track line: `<p className="text-xs text-muted-foreground">{roomName}{trackName ? ` · ${trackName}` : ""}</p>` — resolved via `roomNames`/`trackNames` maps passed down as new props
  - Reason/rationale: `<p className="mt-1 text-xs">{assignment.reason}</p>` (unchanged pattern, line 88)
  - Server warnings: semantic `<ul aria-label="Scheduling warnings">` rendered separately from rationale, with a contextual warning icon and text so meaning does not depend on color
- Approve button: existing `<Button variant="outline" size="sm">` — label becomes `"Approve & schedule"` for this kind (extend ternary at line 120-122)
- Reject button: existing `<Button variant="ghost" size="sm">Reject</Button>` — unchanged, already generic
- Applied state (`proposal.status === "applied"`): new third branch of the ternary at line 134 —
  - `<p className="text-sm">Scheduled {proposal.createdAgendaItemIds?.length ?? 0} session(s).</p>`
  - If `skippedAssignments.length > 0`: `<p className="text-sm text-muted-foreground">{n} could not be placed:</p>` followed by a `<ul>` of `<li>{title} — {reason}</li>` (resolve title by matching `submissionId` back to `proposal.scheduleAssignments`)
  - Link to Agenda page (mirrors the existing "Review drafts" link at line 143-150): `<Link to="../agenda">Review agenda</Link>`
- Empty/loading states: none new — this card only renders once a `schedule_assignments` proposal exists in `proposals[]`; the existing `AgentTimeline` already shows the "Running list_unscheduled_sessions…" / "Running list_schedule_slots…" / "Running propose_schedule_assignments…" tool-call progress lines automatically via `runRead`'s existing `agentState.append` calls (`agentRuntime.ts:45,48`) — no new loading UI needed, this is inherited for free from the existing tool-call logging pattern.
- New suggestion chip: add `"Propose a schedule for unscheduled accepted sessions"` to `fallbackSuggestions` array (`AgentOperations.tsx:26-30`); check whether `agentRuns.suggestions` (server-derived, `convex/agentRuns.ts:69`) should also surface this when there are unscheduled accepted submissions — mirror however existing suggestions are conditionally generated there.

**Behavior:**
- Clicking "Approve & schedule" calls `repo.agentRuns.approveScheduleProposal({eventId, proposalId, expectedPayloadHash})` via the extended `approveProposal` ternary in `AgentOperations.tsx:136-149`; button shows "Preparing…" while pending (existing `decisionPendingId` pattern, unchanged)
- Clicking "Reject" calls the existing generic `repo.agentRuns.rejectProposal` (unchanged)
- On success, Convex reactivity updates the card to its applied state automatically (no manual refetch) — same behavior as task/message approval today
- The Agenda page (`src/pages/program/Agenda.tsx`) requires no changes: it already subscribes reactively to all `agenda_items` for the event, so newly created sessions appear there automatically once approved

**Data:**
- Card reads from `AgentRunDetail.proposals[]` (already fetched by the existing `useRepoQuery("agentRuns.get", ...)` in `AgentOperations.tsx:52-57`) — no new query needed on the read side beyond the room/track name lookups
- Room/track name resolution: `AgentOperations.tsx` needs `useRepoQuery("rooms.list", {eventId})` and `useRepoQuery("tracks.list", {eventId})` if not already present on this page (check first — the Agenda page already has this pattern to copy) and pass down `roomNames`/`trackNames` plus `event.timezone` to `AgentRunInspector`

### Tasks
- [ ] T015: Add `AgentProposedScheduleAssignment` (including structured warnings) and `AgentScheduleProposal` types to `src/data/types.ts`, extend `AgentActionProposal` union
- [ ] T016: Expose `approveScheduleProposal` through the `repo.agentRuns` data-adapter surface (same place `approveTaskProposal`/`approveMessageProposal` are already exposed — confirm exact file/pattern before implementing)
- [ ] T017: Add the third `schedule_assignments` rendering branch to `AgentRunInspector.tsx` per the UI Spec above (header, per-assignment rows, accessible warning list, approve label, applied state with skipped list)
- [ ] T018: Wire room/track name lookups and the event timezone in `AgentOperations.tsx` and thread them as props into `AgentRunInspector`
- [ ] T019: Extend `approveProposal` in `AgentOperations.tsx:136-149` to a 3-way ternary calling `approveScheduleProposal`
- [ ] T020: Add the new suggestion chip string
- [ ] T021: Verify the full user flow in browser end-to-end, including event-timezone display, a server warning, successful application, a stale skipped assignment, and appearance on the Agenda page

## Phase 5: Automated Verification
- [ ] T022: Add slot-grid unit tests for normal multi-day events, end-boundary clipping, the 200-slot cap, invalid timezones, and DST spring-forward/fall-back behavior
- [ ] T023: Add batch-validator tests for persisted and intra-proposal room/speaker conflicts, duplicate submissions, off-grid starts, wrong-event ids, non-accepted/already-scheduled submissions, authoritative field derivation, and structured non-blocking warnings
- [ ] T024: Add approval mutation tests for stale agenda/session state, partial apply, double-click idempotency, organizer authorization, audit actor/source, and rollback on unexpected write/audit failure
- [ ] T025: Extend proposal payload/type/adapter and agent-stop contract tests; prove existing task/message behavior is unchanged, a successful schedule proposal stops for approval, and `no_valid_assignments` can continue to a retry/final explanation
- [ ] T026: Add `AgentRunInspector` component tests for event-timezone formatting, keyboard/focus behavior, accessible warnings, loading/disabled actions, and applied/skipped summaries
- [ ] T027: Run `npm run typecheck`, relevant Vitest files, `npm run build`, and the full `npm run check` when practical; record local evidence because this repository does not use GitHub Actions as its verification gate

## Task Dependencies
- T001-T007A (schema + shared grid/batch validation + internal queries) block T008-T012 (tool wiring)
- T008-T012 (tools) block T013 (approval mutation needs the schema fields from T002 and the proposal-saving pattern from T004 as reference)
- T013-T014 block T015-T020 (frontend needs the backend shape finalized)
- T001-T020 block T022-T026 (focused tests need final contracts and UI)
- T022-T026 block T021 and T027 (browser/full verification follows focused coverage)

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [ ] Feature is accessible and usable in the UI (not just implemented in the backend) — verified via T021
- [ ] Agent never writes `agenda_items` directly — only `approveScheduleProposal` (organizer-triggered) does
- [ ] A proposal containing a persisted-agenda or intra-proposal blocking conflict is never shown as approvable
- [ ] Model-authored data cannot create off-grid/inverted times, duplicate submissions, cross-event relationships, or fabricated title/speaker/track/end-time values
- [ ] Non-blocking schedule warnings are generated server-side, persisted structurally, and rendered separately from agent rationale
- [ ] Proposal times render in the event timezone, including DST-boundary coverage
- [ ] Approving a proposal after the agenda changed correctly skips invalidated assignments and applies the rest, without throwing
- [ ] `agenda_items_audit` rows exist for every session created this way, with `source: "agent:schedule_proposal"` and the approving organizer's user id
- [ ] No regressions to existing `create_tasks`/`prepare_message_drafts` proposal rendering or approval flows
- [ ] Local typecheck, targeted tests, build, and full-check results are recorded in the implementation handoff
- [ ] Docs updated if needed (none beyond this folder expected)
