# Agent-native Operations Foundation — User Journey

## 1. User

An authenticated Namos Sessions organization owner, administrator, or event member with the event-level `organizer` role. Reviewers and speakers are not eligible.

## 2. Starting State

- The organizer is signed in through Clerk and has access to an existing event.
- The event contains representative submissions, speakers, tasks, agenda items/conflicts, evaluation assignments, and communications.
- `VITE_DATA_BACKEND=convex`.
- The organizer chooses Namos-managed AI or supplies an event-level OpenAI key in Settings → Integrations. Managed mode uses the protected Convex `OPENAI_API_KEY`, checks the event creator’s active Clerk Billing plan/feature, and enforces its server-configured monthly run and token terms. BYOK is verified once and stored with the separate `AI_INTEGRATION_ENCRYPTION_KEY`; it is never charged by Namos. `OPENAI_AGENT_MODEL` is optional.
- The event records are representative test data, but the agent run, tool results, proposal, approval, and resulting tasks are created through the real production code paths. No run or result is pre-baked.

## 3. Entry Point

The organizer selects an event, then chooses **Operations Agent** in the Program section of the main sidebar. The route is `/events/:eventSlug/program/agent`. No control is placed in the page title row.

## 4. User Journey Steps

1. The page opens with the title **Operations Agent**. Inside the content surface, the organizer sees a **History** control, an empty-state explanation, three suggested objectives, a labeled multiline composer, and a **Run** button.
2. The organizer chooses the suggestion “Check whether this event is ready to publish.” The suggestion fills the composer without starting a run, allowing edits.
3. The organizer presses **Run**. The frontend calls `repo.agentRuns.create({ eventId, objective })`; the server derives the Clerk subject, inserts the run and first event, schedules execution, and returns `runId`. The URL becomes `?run=<runId>`.
4. The page immediately shows the objective and a queued/running status. Reactive updates append meaningful progress such as “Checking agenda conflicts” and “Reviewing outstanding speaker tasks.” Tool names and compact result counts are visible; hidden reasoning is never shown.
5. If the agent needs a material choice, it displays the question in the timeline, changes status to **Needs input**, and preserves the composer text/history. The composer label changes to **Reply to continue**. Submitting the reply appends it to the same run and schedules a new execution segment.
6. The agent returns a readiness brief grouped by issue, with counts, concise evidence, and links to the owning Namos Sessions pages/records. The organizer can open a link and return without losing the run.
7. If follow-up tasks would help, the agent displays **Proposed tasks** in the inline right detail pane. Each row shows title, target, linked speaker/submission/sponsor/form where present, due date, and reason. The pane shows **Approve & create**, **Reject**, and **Cancel run** controls.
8. The organizer clicks **Approve & create**. The frontend submits only `proposalId` and the displayed `payloadHash`. The server rechecks organizer access, event ownership, proposal status/hash, and every task field, then creates all tasks atomically and marks the proposal applied.
9. The UI announces “Created N tasks,” changes the proposal to **Applied**, shows links to the new task records, and marks the run completed. Opening Program > Tasks shows each task with source **Operations Agent**.
10. The organizer refreshes the page, leaves and returns, or opens the same URL in a second browser. The same ordered timeline, final brief, applied proposal, actor, and created task links remain visible.

## 5. Expected Outcome

The organizer can delegate a readiness investigation, understand what the agent checked, answer a clarification, review an exact proposed change, approve it, and see durable agent-attributed tasks in the normal Namos Sessions workflow.

## 6. Visible Success State

- Run status badge reads **Completed**.
- Timeline contains the final readiness brief and source links.
- Proposal card reads **Applied** and lists created task links.
- A polite live-region announcement reports the number of tasks created.
- Program > Tasks visibly labels those tasks **Operations Agent**.

## 7. Failure and Recovery States

| Failure | What the user sees | Preservation and recovery |
|---|---|---|
| Empty objective | Inline “Enter an objective for this run.” | Composer value remains; Run stays disabled for whitespace-only input. |
| Missing OpenAI key | Run becomes Failed with “Operations Agent is not configured.” | Objective and durable failure event remain; an admin configures the key and clicks Retry. The UI does not substitute a canned response or simulated run. |
| Model/provider timeout | Failed event with Retry | Completed tool events and objective persist; retry starts a new execution segment in the same run. |
| One read tool fails | Tool result shows the affected source failed; agent may continue with a clearly partial brief | Final response must name the missing source; Retry reattempts from the checkpoint. |
| Needs clarification | Status and one question appear; no write occurs | Reply resumes the same run. |
| Network failure submitting objective/reply | Inline error below composer | Text remains; retry does not duplicate a run because the client sends an idempotency key. |
| Stale proposal hash | “This proposal changed. Reload before approving.” | No tasks are created; reactive reload supplies the current proposal. |
| Invalid/deleted linked record | Proposal application fails with the exact invalid row | No tasks are created; proposal remains pending or becomes superseded; organizer asks the agent to regenerate. |
| Duplicate approval/retry | Existing created task IDs return | No duplicate task is created. |
| Rejected proposal | Proposal reads Rejected with optional reason | No write occurs; run remains durable and a new run may be started. |
| Cancelled run | Status reads Cancelled | Completed events remain; scheduled segments check status and exit. |
| Lost event permission | Access-denied state and return-to-events link | No run data is returned. Regaining permission restores access. |
| Airtable backend | “Operations Agent currently requires the Convex backend.” | No request is attempted against Airtable. |
| Refresh/back navigation | Selected run is restored from `?run=` | History and composer state come from durable data; unsent local text is the only non-persisted state. |

## 8. Persistence Expectations

- Refresh: run, events, question, proposal, decision, task IDs, and final output persist.
- Leave and return: History lists the run newest-first; selecting it restores the detail pane and URL.
- Logout/login: an authorized organizer sees the same event-scoped history.
- Second browser: status/progress/approval changes arrive reactively.
- Event switch: the prior event’s run disappears from history and cannot be fetched with a copied ID.
- Deployment restart/provider interruption: persisted statuses/checkpoints permit retry without duplicating applied proposals.

## End-to-end Wiring Trace

`Run click → AgentOperations.handleSubmit → repo.agentRuns.create → transport write agentRuns.create → convex/agentRuns.ts create → auth/event validation + agent_runs/agent_run_events insert + durable schedule → agentRuntime segment → bound read/proposal tools → agent_run_events/agent_action_proposals writes → reactive agentRuns.get → AgentTimeline/AgentRunInspector render → Approve click → repo.agentRuns.approveTaskProposal({proposalId, expectedPayloadHash}) → atomic validation/task creation → reactive task/run/proposal update → visible Applied state and task links.`
