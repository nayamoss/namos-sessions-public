# Agent-native Operations Foundation — Requirements

**Type:** Feature  
**Status:** In Review  
**Priority:** High  
**Last Updated:** 2026-08-13

## Problem Statement

Namos Sessions has mature event-scoped workflows, but organizers must operate each workflow through its dedicated page. The repository contract exposes atomic reads and writes to React (`src/data/repo.ts:580-602`), while no in-app agent can compose those capabilities into an outcome such as “check readiness and prepare the work needed to fix it.” The prior issue #66 explored external MCP task access, but its PR was closed without merge and it did not provide an in-app run loop, durable progress, clarification, approval, or user-visible results.

The first agent-native release must establish a safe, durable foundation rather than simulate autonomy with a chat box. It will read live event data across the program lifecycle, produce evidence-linked readiness briefs, ask focused clarification questions, and propose onboarding tasks. The organizer must approve the exact immutable task payload before any task is created.

This scope follows the agent-native principles of UI/agent outcome parity, granular tools, composability, visible execution, and accumulated context while respecting the product’s existing decision that AI must not score submissions. See [Every’s agent-native architecture guide](https://every.to/guides/agent-native).

## User Stories

**As an** event organizer **I want to** ask Namos Sessions an operational question in plain language **so that** I can understand what needs attention without manually reconciling every program page.

**As an** event organizer **I want to** see the data checks and progress behind an agent run **so that** I can trust the result and recover when one source fails.

**As an** event organizer **I want to** approve the exact tasks an agent proposes **so that** useful work is created without giving the model unrestricted write access.

**Acceptance Criteria:**

- GIVEN an organizer with access to an event WHEN they open Program > Operations Agent THEN the page loads only that event’s run history and shows an event-aware composer.
- GIVEN a prompt such as “What could block us from publishing?” WHEN the run executes THEN the agent may inspect submissions, speakers, tasks, agenda, conflicts, evaluations, and communication failures through bounded read tools and returns a concise brief with links to source pages.
- GIVEN a request that lacks a material choice WHEN the agent cannot safely infer it THEN the run enters `needs_input`, displays one focused question, preserves prior progress, and resumes after the organizer replies.
- GIVEN a run that proposes tasks WHEN the proposal is ready THEN no task exists yet and the UI shows every proposed title, target, linked record, due date, reason, and the payload hash-backed approval controls.
- GIVEN a pending task proposal WHEN an organizer approves the exact current payload THEN all tasks are created once, attributed to the operations agent, the proposal becomes `applied`, and linked task pages update through the existing reactive data layer.
- GIVEN a stale browser proposal WHEN its expected payload hash does not match the stored proposal THEN approval fails without creating tasks and the user is told to reload.
- GIVEN a rejected proposal WHEN the organizer rejects it THEN no task is created, the rejection is durable, and the run records the decision.
- GIVEN a refresh, route change, logout/login, or second browser session WHEN the organizer returns THEN run status, progress events, questions, proposals, decisions, and final output remain visible.
- GIVEN a reviewer, speaker, signed-out user, or organizer without access to the event WHEN they request the page or any agent function THEN access fails closed and no event data is returned.
- GIVEN an Airtable-backed deployment WHEN the user opens the feature THEN the UI explains that the Operations Agent currently requires the Convex backend; it must not silently fall back to an unscoped path.

## Functional Requirements

- FR-001: Add an organizer-only route at `/events/:eventSlug/program/agent`, titled `Operations Agent`, reachable from the Program navigation with the contextual `Bot` icon.
- FR-002: The page header remains identity-only. Run history, composer actions, status controls, and approvals live inside the content surface.
- FR-003: A new run accepts an `objective` from 1–4,000 trimmed characters and binds it server-side to `eventId` and the authenticated Clerk subject.
- FR-004: Runs use durable statuses: `queued | running | needs_input | needs_approval | completed | failed | cancelled`.
- FR-005: Persist an append-only, ordered user-visible event stream for user messages, progress, tool calls, tool results, clarification, proposals, decisions, final responses, and errors. Do not persist hidden chain-of-thought.
- FR-006: Bind tools to the run’s stored event. The model never supplies or changes `eventId`, requester identity, or authorization scope.
- FR-007: Provide bounded read tools for event overview, submissions, speakers, onboarding tasks, agenda, schedule conflicts, review coverage, and failed communications.
- FR-008: Read tools use indexed/scoped server queries, limit returned rows, return summaries before detail, and never expose email credentials, API keys, storage keys, private authentication data, or data from another event.
- FR-009: Provide a `request_clarification` tool that stores one focused question and stops the current execution segment.
- FR-010: Provide one write-capable tool, `propose_create_tasks`. It creates only an immutable proposal; it never writes `onboarding_tasks` directly.
- FR-011: A task proposal contains 1–50 fully specified tasks. Each task includes `title`, `targetType`, optional linked IDs, optional `dueDate`, and a human-readable `reason`.
- FR-012: Store a SHA-256 hash of the canonical proposal payload. Approval must include the expected hash and apply the stored payload, not client-supplied task fields.
- FR-013: Proposal application validates authorization, current proposal status, payload hash, event ownership of every linked record, task title, due date, and target-type rules in one mutation before creating anything.
- FR-014: Proposal application is idempotent. A repeated approval returns the existing task IDs and never duplicates tasks.
- FR-015: Agent-created tasks use `source: "agent"`; Tasks admin and speaker task views render that attribution honestly.
- FR-016: Each execution segment has a hard stop of 12 model/tool steps, bounded tool result sizes, and a terminal status. Hitting the limit produces a resumable failure summary rather than an infinite loop.
- FR-017: Organizers can cancel queued, running, `needs_input`, or `needs_approval` runs. Execution checks cancellation before each external/model/tool step.
- FR-018: The UI receives run updates through the repository’s reactive transport, with no direct `convex/react` import in feature code.
- FR-019: The system prompt injects current event identity, timezone, capabilities, safety rules, and compact counts; the agent fetches record detail through tools instead of receiving an unbounded data dump.
- FR-020: Store model name, duration, step count, tool names, redacted argument summaries, result counts, errors, proposal decisions, and authenticated actor IDs for auditability.
- FR-021: Use OpenAI’s Responses API through the current AI SDK provider and the Convex Agent component. Model selection is deployment-configurable, defaulting to `gpt-5.6-terra` as the balanced cost/capability tier described in [official OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model).
- FR-022: Ship no stubs: no pre-baked agent runs, fabricated tool results, placeholder handlers, simulated approvals, or fallback responses may appear as working product behavior. Every displayed run and proposal must come from the real persisted runtime and real domain tools.

## Non-Functional Requirements

- NFR-001: The OpenAI API key exists only in the Convex deployment environment. It is never a Vite variable, browser response, database field, or log value.
- NFR-002: First visible acknowledgement of a submitted objective appears within 500 ms from the durable queued/run event, independent of model latency.
- NFR-003: Run/event/proposal queries are reactive and indexed. Selecting a historic run does not refetch unrelated event program datasets.
- NFR-004: The UI meets WCAG 2.2 AA, supports keyboard operation, announces status changes, does not use color alone, and respects reduced motion.
- NFR-005: No run may cross event boundaries, elevate a reviewer/speaker, bypass existing validation, or call an unapproved write path.
- NFR-006: Model and tool errors preserve the objective and completed event history, show a retry path, and never convert partial work into a false success.
- NFR-007: Agent events store redacted summaries, not secrets or hidden reasoning. Proposal payloads store only fields required for the proposed application action.
- NFR-008: The feature must pass app and Convex typecheck, tests, production build, and the documented browser journey against representative event data and a live configured model. Unit tests may isolate pure functions, but test doubles cannot substitute for release-level runtime verification.
- NFR-009: Incomplete capabilities remain absent or visibly unavailable; they must never be represented by no-op controls, hard-coded success states, temporary data, or comments promising later wiring.

## Out of Scope

- Automatic or AI-assisted submission scoring, ranking, acceptance, or rejection.
- Sending email, publishing schedules, editing agenda items, assigning reviewers, changing submission status, deleting records, or changing configuration.
- Autonomous background operation without an organizer-created objective.
- Agent self-modification, automatic memory writes, RAG/vector search, external web search, browser/computer use, multi-agent delegation, and voice.
- External MCP credentials/endpoints from issue #66; that spike is prior art, not a dependency.
- Airtable execution parity in this release. The interfaces must remain extensible, but the feature fails explicitly outside Convex.

## Success Metrics

- At least 90% of a curated readiness-question eval set returns the correct source-linked facts with no cross-event leakage.
- 100% of task writes have a stored proposal, matching payload hash, approving actor, and exactly-once application record.
- Zero task writes occur from rejected, stale, unauthorized, cancelled, or unapproved proposals.
- At least 80% of usability participants using a real test event and live configured model can start a readiness run, inspect progress, and approve a proposal without instruction.
- P95 first durable acknowledgement under 500 ms; P95 run-history query under 200 ms for 100 runs/2,000 events.
