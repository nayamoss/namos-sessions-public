# AI Schedule Proposals — User Journey

## User
An authenticated event organizer (role `organizer` on the event, verified via `assertEventOrganizerAccess`) with Operations Agent access (`agentRuns.canUse` returns true).

## Starting State
- The organizer is signed in and viewing an event that has accepted submissions with no agenda placement yet (i.e. `submissions.status === "accepted"` with no matching `agenda_items.submissionId`).
- The event has at least one room configured (`rooms` table non-empty).
- Namos-managed AI or a bring-your-own key is configured and available for this event (existing precondition for any agent run — unrelated to this feature).

## Entry Point
The organizer navigates to **Program → Operations Agent** (`/events/:slug/program/agent`), the same page used for every other agent objective. They either click the new suggestion chip "Propose a schedule for unscheduled accepted sessions," or type a similar request into the existing composer (e.g. "Schedule my accepted talks that don't have a slot yet").

## User Journey Steps
1. Organizer opens the Operations Agent page. If no run is selected, they see the composer and suggestion chips, including the new schedule-proposal suggestion.
2. Organizer clicks the suggestion (or types their own request) and submits.
3. `repo.agentRuns.create` starts a new run; the page navigates to that run's detail view (`?run=<id>`).
4. The `AgentTimeline` shows live progress as the agent calls `list_unscheduled_sessions`, then `list_schedule_slots`, then `propose_schedule_assignments` — each shown as an existing "Running X… / X returned N results" pair, no new UI needed for this (inherited from existing tool-call logging). For more than 50 unscheduled submissions, the list tool exposes deterministic continuation so later records are not starved by an unplaceable first page.
5. The server validates the complete proposed batch against a single live snapshot, including conflicts between two rows in the proposal. It reloads every submission, derives its title/speakers/track/end time, enforces the event slot grid, and saves only canonical valid assignments.
6. The run transitions to `needs_approval`. A new "Proposed schedule" card appears in the run detail panel, listing each proposed session with its title, event-timezone time range, room, track (if any), and the agent's stated reason for that placement.
7. Organizer reviews the list. Server-derived soft warnings such as speaker unavailability or track overlap appear separately from the agent's rationale with text and an accessible warning indicator.
8. Organizer clicks **Approve & schedule**.
9. Button shows "Preparing…" while `approveScheduleProposal` runs.
10. The approval mutation re-runs the same batch validation inside the write transaction. Assignments invalidated by agenda or canonical session-data changes are skipped; expected skips do not block remaining valid assignments. An unexpected write or audit failure rolls back the whole approval.
11. On success, the card updates in place (via Convex reactivity, no page reload) to show "Scheduled N session(s)." plus, if any assignments were invalidated between proposal and approval, a list of which sessions were skipped and why.
12. Organizer clicks "Review agenda" (link in the applied-state card) and lands on the existing Agenda page (`/events/:slug/program/agenda`), where the newly created sessions are now visible in their assigned rooms/times, unpublished by default (`isPublished: false`), same as any manually created agenda item.

## Expected Outcome
Every session the agent could place without a blocking conflict now has a real `agenda_items` row, visible and editable on the Agenda page exactly as if an organizer had placed it by hand — same audit trail, same publish workflow. Sessions the agent couldn't place cleanly remain unscheduled and are explicitly called out, not silently dropped.

## Visible Success State
The "Proposed schedule" card shows "Scheduled N session(s)" with status badge `applied`; the Agenda page's session count increases by N; each new session is clickable/editable there like any other.

## Failure & Recovery States
- **No unscheduled accepted sessions:** agent's final text explains there's nothing to schedule; no proposal card appears. Organizer can dismiss and try later once submissions are accepted.
- **Agent supplies an invalid, duplicate, off-grid, or cross-event assignment:** the server rejects that row before proposal persistence; model instructions are never the data-integrity boundary.
- **Agent can't place any session without a blocking conflict:** no proposal is saved (tool returns `no_valid_assignments` internally); agent's final response explains which sessions it couldn't place and why. Organizer can free up rooms/times manually and re-run.
- **Proposal is stale (agenda or reviewed session metadata changed) at approval time:** approving still applies whatever remains valid; skipped sessions are listed with reasons in the applied-state card. Organizer can start a new run to get fresh proposals for the skipped ones.
- **Organizer clicks Reject instead:** proposal marked `rejected`, no agenda items created, run ends; organizer can start a new run with a different objective/instructions.
- **Network/mutation error on approve:** existing generic error handling in `AgentOperations.tsx` (`decide()` catches and sets `error` state) surfaces the error message below the composer, same as any other proposal type today.

## Persistence Expectations
- After refresh: the run, its proposal, and (if approved) the created `agenda_items` rows all persist — everything is stored in Convex, nothing is client-only state.
- After logout/login: the agent run history remains visible via `agentRuns.list`/`AgentHistoryPopover`, and any created agenda items remain on the Agenda page, same as all other persisted event data.

## Frontend Wiring Trace
1. User clicks suggestion chip → `setValue(suggestion.objective)` (existing, `AgentOperations.tsx:230`) → user clicks send → `submit()` → `repo.agentRuns.create(...)` → Convex mutation creates `agent_runs` row → backend action (`agentRuntime.executeSegment`) picks it up asynchronously.
2. Tool calls (`list_unscheduled_sessions`, `list_schedule_slots`, `propose_schedule_assignments`) execute server-side inside `executeSegment`; each logs `tool_call`/`tool_result` events via `agentState.append`, which `AgentTimeline` already renders reactively via the existing `agentRuns.get` subscription.
3. `propose_schedule_assignments`'s `execute()` calls `agentState.saveScheduleProposal`, which inserts an `agent_action_proposals` row and patches `run.status = "needs_approval"` — both changes flow to the client through the same existing `useRepoQuery("agentRuns.get", ...)` subscription in `AgentOperations.tsx:52-57`, no polling needed.
4. `AgentRunInspector` receives the updated `proposals` array as a prop, renders the new `schedule_assignments` branch.
5. User clicks "Approve & schedule" → `onApprove(proposal)` prop (wired in `AgentOperations.tsx:157`) → extended `approveProposal` ternary → `repo.agentRuns.approveScheduleProposal(...)` → Convex mutation re-runs canonical batch validation, inserts validated `agenda_items` rows + `agenda_items_audit` rows, records expected skips, and patches proposal/run status → reactive subscription updates the card and (separately) the Agenda page's own `agenda_items` subscription.
6. Every link in this chain already exists for `create_tasks`/`prepare_message_drafts` today; this journey adds one new proposal `kind` through the identical wiring, not a new wiring pattern.
