# AI Schedule Proposals — Requirements

**Type:** Feature
**Status:** Ready for Implementation
**Priority:** High
**Last Updated:** 2026-08-20

## Problem Statement
The Operations Agent (`convex/agentRuntime.ts`) can read the agenda and detect conflicts (`detect_schedule_conflicts` → `convex/agentData.ts:73` → `conflictRows` in `convex/agenda.ts:45`), but its system prompt explicitly forbids it from editing or publishing schedules (`convex/agentRuntime.ts:24`). There is no way for an organizer to ask the agent to actually propose a schedule — every accepted session must be placed manually in the Agenda UI. For events with dozens of accepted submissions, this is the single largest remaining manual-operations gap, and it's the one AI-agenda capability explicitly out of scope today.

## User Stories

**As an** event organizer **I want to** ask the Operations Agent to propose time/room assignments for my unscheduled accepted sessions **so that** I can review and approve a full draft schedule instead of placing every session by hand.

**Acceptance Criteria:**
- GIVEN an event with accepted submissions that have no agenda item WHEN the organizer asks the agent to schedule them THEN the agent returns a `schedule_assignments` proposal listing a room/time for each session, or explains which sessions it could not place and why.
- GIVEN a schedule proposal is pending WHEN the organizer views it THEN they see, per session: current placement (none), proposed room, proposed start/end time, proposed track (if any), the agent's rationale, and separately displayed server-derived soft warnings (e.g. speaker marked unavailable).
- GIVEN a schedule proposal contains assignments that conflict with the live agenda or with another assignment in the same proposal (room or speaker double-booking) WHEN the server builds the proposal THEN the conflicting session is excluded and listed as "could not place" with the reason — the organizer never sees a proposal containing a blocking conflict.
- GIVEN a schedule proposal is pending WHEN the organizer clicks Approve THEN the shared agenda validation rules are re-run against the complete batch inside the approval mutation, valid assignments are inserted with `agenda.save`-equivalent persistence semantics, every insert is audited via `agenda_items_audit`, and the proposal is marked applied.
- GIVEN a schedule proposal is pending WHEN the organizer clicks Reject THEN no agenda items are created and the proposal is marked rejected.
- GIVEN the underlying agenda or reviewed session metadata has changed since the proposal was generated WHEN the organizer approves THEN the complete batch is re-validated at apply time; a session that no longer matches or places cleanly is skipped and reported, while valid assignments are still applied.
- GIVEN a schedule proposal was applied WHEN the organizer views agenda history THEN each created `agenda_items_audit` row records `source: "agent:schedule_proposal"` and the acting organizer's user id (the approver, not the agent).

## Functional Requirements
- FR-001: New agent tool `propose_schedule_assignments` mirrors the existing `propose_create_tasks` / `propose_message_drafts` pattern — it never writes agenda data directly, only saves a proposal row and stops the run for approval.
- FR-002: A new internal read-only planning function computes candidate slots deterministically (not left to the LLM to invent room/time pairs). The LLM may select a returned `submissionId`, `roomId`, and `startTime` and supply rationale, but the server derives authoritative title, speakers, track, and end time; enforces membership in the returned slot grid; and validates the complete proposal batch with the same conflict rules used by `agenda.checkPlacement` and `agenda.save`.
- FR-003: The agent's system prompt is updated to allow proposing (not applying) schedule assignments, matching the existing task/message carve-outs.
- FR-004: `agent_action_proposals.kind` gains a new literal `"schedule_assignments"` with a `scheduleAssignments` field (array of proposed sessions).
- FR-005: A new mutation `agentRuns.approveScheduleProposal` applies each assignment via `agenda.save`-equivalent internal logic (see design.md), inside the existing organizer-approval/audit trail, and reports per-assignment success/skip.
- FR-006: The Operations Agent UI (`AgentRunInspector.tsx`) renders a `schedule_assignments` proposal as a table/list of session → room/time, with per-row warnings, alongside the existing task/message proposal cards.
- FR-007: `rejectProposal` (`convex/agentRuns.ts:273`) already generically rejects by `proposalId` — confirm it does not need a kind-specific branch; document if it does.
- FR-008: Both proposal creation and approval reload every referenced submission and require that it belongs to the run's event, remains accepted, has no agenda item, and appears at most once in the proposal. Room, track, title, speaker ids, and end time are never trusted from model output.
- FR-009: Non-blocking conflicts are stored as structured, server-derived warnings on each proposed assignment and displayed separately from the LLM-authored rationale.

## Non-Functional Requirements
- NFR-001: Approval runs as one atomic Convex mutation. Expected per-assignment validation failures (for example, a newly occupied slot) are collected as skips so other valid assignments can be applied; an unexpected write or audit failure rolls back the entire approval.
- NFR-002: The agent must never create or update `agenda_items` directly. Its only write is persisting an approval-gated proposal; schedule changes happen exclusively through the organizer-triggered approval mutation.
- NFR-003: Candidate slot search must be bounded (see design.md for the exact search space) so a single tool call cannot run unbounded compute inside the Convex action.
- NFR-004: All timestamps shown in the proposal UI must be formatted in the event timezone, not the browser's local timezone.

## Out of Scope
- Optimization/scoring across multiple candidate schedules (e.g. minimizing gaps, balancing track distribution) — first version proposes one reasonable placement per session using configured rooms and the deterministic event-hours slot grid, not a novel optimizer.
- Personalized/attendee-facing agenda recommendations.
- Rescheduling or moving *already-published* sessions — this only targets unscheduled accepted submissions with no existing `agenda_items` row.
- A drag/drop diff-preview UI beyond the existing proposal-card pattern (no new visual diff component).

## Success Metrics
- For a batch of up to 50 accepted, unscheduled sessions, an organizer can receive a proposed draft placement for all placeable sessions in one agent run, with zero blocking conflicts in the proposal. Larger events expose deterministic continuation rather than repeatedly returning the same first page.
- Every applied agenda item uses authoritative event-scoped submission data, a server-generated valid slot, and an audit row attributed to the approving organizer.
