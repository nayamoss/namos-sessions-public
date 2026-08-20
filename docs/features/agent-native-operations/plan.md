# Agent-native Operations Foundation — Implementation Plan

## Phase 1: Contracts, components, and schema

- [ ] T001: Install the peer-compatible set `@convex-dev/agent@0.6.4`, `@convex-dev/workflow@0.4.5`, `ai@6.0.64`, and `@ai-sdk/openai@3.0.96`; commit package and lockfile changes together. (The originally researched AI SDK 7/provider 4 pair is rejected by Agent 0.6.4's AI SDK 6 peer contract.)
- [ ] T002: Create `convex/convex.config.ts`; install Agent and Workflow components; run `npx convex dev` to generate component types.
- [ ] T003: Add the exact `agent_runs`, `agent_run_events`, and `agent_action_proposals` tables/indexes from `design.md`; extend `onboarding_tasks.source` with `agent`. No backfill.
- [ ] T004: Add exact `AgentRunId`, `AgentProposalId`, `AgentRunStatus`, `AgentRun`, `AgentRunEvent`, `AgentProposedTask`, `AgentTaskProposal`, and `AgentRunDetail` types to `src/data/types.ts`.
- [ ] T005: Add `AgentRunsRepo` methods to `src/data/repo.ts`: `canUse`, `list`, `get`, `create`, `respond`, `retry`, `cancel`, `approveTaskProposal`, `rejectProposal`; add `agentRuns` to `Repository`.
- [ ] T006: Add all agent read/write operation literals and mappings in `src/data/transport.ts` and `src/data/convex/index.ts`, including nested normalization tests.
- [ ] T007: Add explicit Convex-only failures for `agentRuns.*` in `src/data/airtable/index.ts` and an adapter contract test proving the failure message; do not add an Airtable route/table mapping.

## Phase 2: Durable run state and authorization

- [ ] T008: Create `convex/agentRuns.ts` with `canUse`, `list`, `get`, `create`, `respond`, `retry`, `cancel`, `approveTaskProposal`, and `rejectProposal` using the exact args/returns in `design.md`.
- [ ] T009: Create `convex/agentState.ts` internal queries/mutations for legal status transitions, ordered append-only events, step counters, component thread ID, proposals, failures, and terminal summaries. Event sequence allocation must be transactional.
- [ ] T010: Implement create/respond idempotency using `by_requester_idempotency`; trim/validate objective/message; schedule runtime only after durable insert.
- [ ] T011: Enforce `assertEventOrganizerAccess` for every public function. Internal scheduled functions must re-read the stored run/event/requester binding and refuse missing/cancelled/terminal runs.
- [ ] T012: Unit-test owner/admin/event-organizer access, reviewer/speaker/signed-out denial, copied cross-event IDs, removed permission, and nav `canUse` behavior.

## Phase 3: Atomic domain tools

- [ ] T013: Refactor `convex/tasks.ts` so public `tasks:create` and agent proposal application share one `validateAndCreateTask` helper. Preserve all current validation; accept explicit source `manual | agent`; never weaken public auth.
- [ ] T014: Create read-only internal projections in `convex/agentData.ts` for overview, submissions, one submission, speakers, tasks, agenda, conflicts, review coverage, and failed comms. Every query must use event indexes, enforce caps, and omit secrets/storage keys.
- [ ] T015: Reuse/extract `src/lib/readiness.ts` rules so agent overview and the Readiness page agree on the five operational categories; add parity fixtures.
- [ ] T016: Create `convex/agentTools.ts` with the eleven exact run-bound tools in `design.md`. Model-visible schemas exclude `eventId`, actor, run ID, and credentials.
- [ ] T017: Implement `request_clarification`: one trimmed question, `needs_input`, durable event, segment stop.
- [ ] T018: Implement `propose_create_tasks`: validate 1–50 typed tasks, canonicalize, hash server-side, insert immutable proposal, append event, enter `needs_approval`; do not insert tasks.
- [ ] T019: Implement atomic approval application: expected hash check, pending/applied idempotency, event validation for all linked IDs, all-or-nothing inserts with `source: agent`, stored task IDs, approving Clerk subject, applied event.
- [ ] T020: Add tests for tool caps/filtering, prompt-injection text treated as data, no cross-event results, invalid links, invalid due dates, mixed-validity atomic rollback, stale hash, concurrent/repeated approval, rejection, and cancellation.

## Phase 4: Model loop, checkpoints, and observability

- [x] T021: Create `convex/agentRuntime.ts` (`"use node"`) using `Agent`, `WorkflowManager`, `openai.responses(process.env.OPENAI_AGENT_MODEL ?? "gpt-5.6-terra")`, and `stepCountIs(12)`.
- [x] T022: Write the Namos Sessions Operations Agent system prompt: event-scoped role, evidence requirement, concise output, untrusted record text, allowed tools, explicit prohibitions (AI scoring/decisions/sends/schedule writes/deletes/config/secrets/hidden reasoning), clarification behavior, completion rules.
- [ ] T023: Build compact context injection from the stored event: identity, IANA timezone/dates, current category counts, available capabilities, and recent run summary. Fetch detail through tools.
- [ ] T024: Persist user-visible events before/after meaningful tool calls with name, redacted args summary, result count, duration, and errors. Never store API keys, Clerk tokens, provider credentials, full private payload dumps, or chain-of-thought.
- [ ] T025: Implement execution segments: create/continue component thread; stop on clarification, proposal, completion, cancellation, max steps, or failure; checkpoint after every tool result; resume same run after reply/retry.
- [ ] T026: Classify transient provider/rate-limit failures for bounded workflow retry with backoff; validation/auth/model-contract failures fail immediately with a durable user message.
- [ ] T027: Record model, step count, duration, and token usage where exposed. Test pure state transitions and tool contracts directly; do not add a fake agent runtime or simulated model/tool execution path to the product.

## Phase 5: Frontend UI

> The feature is not complete until the following exact UI is reachable and usable. Page header is identity-only; all controls remain inside the content surface.

### UI Spec

**Page: `AgentOperations`**

- Location: `/events/:eventSlug/program/agent`, Program sidebar after Readiness.
- Shell: `AppLayout title="Operations Agent"`; selected run uses the existing inline flex `detail` pane.
- Content root: `flex min-h-[calc(100vh-10rem)] flex-col gap-4`.
- Workspace controls: History popover and Start a review secondary action below the identity-only page header. The completed result and approvals precede a collapsed technical activity disclosure.
- Empty state: `Bot` icon; title “Ask about this event”; message “Check readiness, investigate blockers, or prepare follow-up tasks.”; three outline suggestion buttons: “Check whether this event is ready to publish”, “Find accepted speakers who still need attention”, “Review failed communications and overdue tasks”. Suggestions fill, never auto-run.
- Timeline: chronological user, assistant, progress, tool, clarification, proposal, approval, and error events; loading skeletons; source links; no hidden reasoning.
- Composer: visible label, multiline textarea, helper/count, inline error, one accent Run/Continue button; Enter submit and Shift+Enter newline.
- Status: polite live region announces queued/running/needs input/needs approval/completed/failed/cancelled transitions.
- Error states: access denied, Convex-required Airtable message, missing model config, query error with Retry, invalid run URL returns to empty state.

**Detail: `AgentRunInspector`**

- `rounded-lg bg-muted/60` is supplied by `AppLayout`; internal sections use `space-y-4`.
- Passive run status, objective, model, steps, created/completed time.
- Pending proposal card lists every task title, target, linked display label, event-timezone due date, and reason.
- Pending controls: outline **Approve & create**, ghost **Reject**; run control outline **Cancel run**. No modal/dialog/sheet.
- Applied card shows created count and task links. Rejected/failed states show actor/time/reason/error.
- Button pending state disables duplicate clicks and reads “Creating…”. Inline error preserves proposal.

### Tasks

- [ ] T028: Create `src/components/agent/AgentComposer.tsx` with exact props/elements/behavior/classes from `design.md`; add keyboard and validation tests.
- [ ] T029: Create `src/components/agent/AgentTimeline.tsx`; render all event types accessibly with contextual icons (`Bot`, `Search`, `Wrench`, `CircleAlert`), markdown source links, skeleton/empty/error states; never use Sparkles.
- [ ] T030: Create `src/components/agent/AgentHistoryPopover.tsx` using existing Popover + Command, not native select; support keyboard selection and empty/loading states.
- [ ] T031: Create `src/components/agent/AgentRunInspector.tsx` with exact proposal rows, hash-bound approval, rejection, cancellation, applied links, pending/error states.
- [ ] T032: Create `src/pages/program/AgentOperations.tsx`; wire reactive reads/writes, URL `?run=`, new/reply composer modes, suggestion fill, live announcements, and inline detail.
- [ ] T033: Lazy-register route in `src/App.tsx`; add `Bot` Program nav item in `src/components/AppLayout.tsx`; use reactive `agentRuns.canUse` to hide it from non-organizers. Do not alter title/header controls.
- [ ] T034: Extend Tasks admin/portal source labels to “Operations Agent”; verify existing manual/automatic labels unchanged.
- [ ] T035: Add component tests for empty page, suggestions, create/select/history, progress, clarification/reply, approval/rejection/cancel, stale-hash error, refresh URL restoration, forbidden and Airtable states.

## Phase 6: Evaluation and real release verification

- [x] T036: Add a release guard that rejects product code containing stub agent handlers, pre-baked runs/results, no-op approvals, hard-coded success states, or placeholder wiring. Representative event records may be seeded, but agent outputs and mutations may not be. (`npm run check:agent-no-stubs`)
- [x] T037: Build and execute a versioned 25-case real-model dataset covering readiness categories, counts, event-timezone interpretation, empty/missing data, prompt injection, and event isolation. **2026-08-13 preview result:** 23/25 (92%, passing the 90% gate), 0% prohibited-action rate, 56 steps, 200,011 input / 7,587 output tokens, 11.3s average latency, and $0.491 estimated cost at the evaluator's configured rates. The two nominal misses reached the correct durable clarification/proposal checkpoints; evaluator accounting was corrected to recognize those terminal custom-tool events.
- [x] T038: Add a live-model verification command requiring the protected preview environment and authenticated eval inputs; record the model snapshot/config with results. The command fails closed when its live credentials are absent and never substitutes fixtures.
- [ ] T039: Run `npm run check` and lint; verify no feature code imports `convex/react`, no secret is bundled, and route chunks remain split.
- [ ] T040: Execute `USER_JOURNEY.md` in a real browser against representative event records and the live configured model: new run → visible real tool progress → clarification/reply → brief → exact task proposal → approve through the real mutation → Tasks attribution → refresh/second session/event switch.
- [ ] T041: Browser-test 375px and desktop, light/dark, keyboard-only, screen-reader labels/live regions, reduced motion, failed network/provider, cancellation, and stale approval.
- [ ] T042: Update `docs/features/INDEX.md`, architecture capability map, environment docs (`OPENAI_API_KEY`, optional model), and README only after verified behavior exists.

## Task Dependencies

`T001–T007 → T008–T012 → T013–T020 → T021–T027 → T028–T035 → T036–T042`.

Schema/contracts precede runtime. Task validation precedes proposal application. Pure functions can be tested in isolation, but no stub runtime or simulated product path may be introduced. Live-model evals and the real-browser journey gate completion.

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` pass.
- [ ] Authoritative `USER_JOURNEY.md` passes through the real UI.
- [ ] Organizer, reviewer, speaker, signed-out, removed-access, and cross-event cases pass.
- [ ] No model-controlled direct write exists; task creation requires exact pending proposal approval.
- [ ] Approval is immutable/hash-bound, atomic, idempotent, and visibly attributed.
- [ ] Progress is reactive and durable; refresh/second session works.
- [ ] Hidden reasoning and secrets are absent from UI/database/log output.
- [ ] Readiness facts match existing Readiness page rules.
- [ ] Airtable fails explicitly and safely.
- [ ] No stub, pre-baked run/result, placeholder handler, no-op control, simulated approval, or hard-coded success path exists in production code.
- [ ] No page-header invariant, icon preference, dropdown invariant, three-pane layout, or repository-boundary regression.
- [ ] `npm run check`, lint, focused agent tests, eval threshold, and browser journey pass.

## Future Capability Map (separate follow-up issues)

| User outcome | Required future atomic proposal/executor |
|---|---|
| Draft speaker follow-ups | durable communication drafts + preview; approval before send |
| Balance reviewer assignments | assignment proposal + existing idempotent assignment validator |
| Prepare schedule changes | agenda proposal + conflict simulation + approval |
| Stage submission decisions | status proposal; human remains decision-maker |
| Publish program/send email | explicit high-impact approval and immutable final payload |

Each follow-up must preserve the same run, event binding, proposal hash, audit, and UI visibility contracts. AI scoring remains prohibited.
