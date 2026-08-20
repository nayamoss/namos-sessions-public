# AI Schedule Proposals — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement
The Operations Agent (`convex/agentRuntime.ts`) can read the agenda and detect conflicts (`detect_schedule_conflicts` → `convex/agentData.ts:73` → `conflictRows` in `convex/agenda.ts:45`), but its system prompt explicitly forbids it from editing or publishing schedules (`convex/agentRuntime.ts:24`). There is no way for an organizer to ask the agent to actually propose a schedule — every accepted session must be placed manually in the Agenda UI. For events with dozens of accepted submissions, this is the single largest remaining manual-operations gap, and it's the one AI-agenda capability explicitly out of scope today.

## User Stories

**As an** event organizer **I want to** ask the Operations Agent to propose time/room assignments for my unscheduled accepted sessions **so that** I can review and approve a full draft schedule instead of placing every session by hand.

**Acceptance Criteria:**
- GIVEN an event with accepted submissions that have no agenda item WHEN the organizer asks the agent to schedule them THEN the agent returns a `schedule_assignments` proposal listing a room/time for each session, or explains which sessions it could not place and why.
- GIVEN a schedule proposal is pending WHEN the organizer views it THEN they see, per session: current placement (none), proposed room, proposed start/end time, proposed track (if any), and any soft warnings (e.g. speaker marked unavailable).
- GIVEN a schedule proposal contains an assignment that would create a blocking conflict (room or speaker double-booking) WHEN the agent builds the proposal THEN that session is excluded from the proposal and listed as "could not place" with the reason — the agent never proposes a blocking conflict.
- GIVEN a schedule proposal is pending WHEN the organizer clicks Approve THEN each assignment is applied via the existing `agenda.save` mutation (re-validated against current state at approval time), audited via `agenda_items_audit`, and the proposal is marked applied.
- GIVEN a schedule proposal is pending WHEN the organizer clicks Reject THEN no agenda items are created and the proposal is marked rejected.
- GIVEN the underlying agenda has changed since the proposal was generated (e.g. another organizer manually placed one of the proposed sessions) WHEN the organizer approves THEN each assignment is independently re-validated at apply time; a session that no longer places cleanly is skipped and reported, valid ones are still applied.
- GIVEN a schedule proposal was applied WHEN the organizer views agenda history THEN each created `agenda_items_audit` row records `source: "agent:schedule_proposal"` and the acting organizer's user id (the approver, not the agent).

## Functional Requirements
- FR-001: New agent tool `propose_schedule_assignments` mirrors the existing `propose_create_tasks` / `propose_message_drafts` pattern — it never writes agenda data directly, only saves a proposal row and stops the run for approval.
- FR-002: A new internal read-only planning function computes candidate assignments deterministically (not left to the LLM to invent room/time pairs) — the LLM selects *which* unscheduled sessions to include and in what order/rationale, but slot search and conflict validation reuse the existing `placementConflicts` helper (`convex/agenda.ts:106`), the same function `agenda.checkPlacement` and `agenda.save` already use.
- FR-003: The agent's system prompt is updated to allow proposing (not applying) schedule assignments, matching the existing task/message carve-outs.
- FR-004: `agent_action_proposals.kind` gains a new literal `"schedule_assignments"` with a `scheduleAssignments` field (array of proposed sessions).
- FR-005: A new mutation `agentRuns.approveScheduleProposal` applies each assignment via `agenda.save`-equivalent internal logic (see design.md), inside the existing organizer-approval/audit trail, and reports per-assignment success/skip.
- FR-006: The Operations Agent UI (`AgentRunInspector.tsx`) renders a `schedule_assignments` proposal as a table/list of session → room/time, with per-row warnings, alongside the existing task/message proposal cards.
- FR-007: `rejectProposal` (`convex/agentRuns.ts:273`) already generically rejects by `proposalId` — confirm it does not need a kind-specific branch; document if it does.

## Non-Functional Requirements
- NFR-001: The planning function must be transactional per-assignment at apply time — a partial failure (one session no longer placeable) must not block or roll back the other valid assignments in the same proposal.
- NFR-002: The agent must never call `agenda.save` (or any write) directly — schedule changes only ever happen through the same organizer-approval mutation path as tasks/messages, no new write surface for the LLM.
- NFR-003: Candidate slot search must be bounded (see design.md for the exact search space) so a single tool call cannot run unbounded compute inside the Convex action.

## Out of Scope
- Optimization/scoring across multiple candidate schedules (e.g. minimizing gaps, balancing track distribution) — first version proposes one reasonable placement per session using existing rooms/slots already in use for other agenda items, not a novel optimizer.
- Personalized/attendee-facing agenda recommendations.
- Rescheduling or moving *already-published* sessions — this only targets unscheduled accepted submissions with no existing `agenda_items` row.
- A drag/drop diff-preview UI beyond the existing proposal-card pattern (no new visual diff component).

## Success Metrics
- An organizer can go from "N accepted, unscheduled sessions" to a fully proposed draft placement for all placeable sessions in one agent run, with zero blocking conflicts in the proposal.
