# Event-scoped Slack Operations Integration — Requirements

**Type:** Feature

**Status:** In Review

**Priority:** High

**Last Updated:** 2026-08-19

## Problem Statement

Namos Sessions organizers must currently open the web application to see operational notifications or use the existing Operations Agent. Teams that coordinate a conference in Slack cannot bind a conference channel to its Namos event, ask the agent an event-scoped question, approve a proposed task, or receive selected lifecycle notifications without changing tools.

Takumi proves the product shape: a dedicated Slack app, OAuth installation, signed event/command/interaction endpoints, immediate acknowledgements, mentions, slash commands, and thread replies. Namos Sessions needs the same integration surface adapted to its stronger organization/event tenancy, its durable Convex runtime, its existing event-scoped Operations Agent, and its hash-bound task approval boundary. The integration must not create a second agent or bypass Namos authorization.

## User Stories

**As an** organization owner or admin **I want to** install a Namos Slack app once for my organization **so that** its event teams can use the same trusted workspace connection.

**As an** event organizer **I want to** bind one Slack channel to one Namos event **so that** questions and notifications have an unambiguous event context.

**As an** event organizer **I want to** mention Namos or use `/namos` in Slack **so that** I can run the existing Operations Agent without leaving the coordination channel.

**As an** event organizer **I want to** approve or reject a proposed task from Slack **so that** I can complete safe operational work while preserving Namos's approval and audit rules.

**As an** event organizer **I want to** choose which high-value event notifications reach Slack **so that** the channel remains useful rather than noisy.

**Acceptance Criteria:**

- GIVEN an organization owner/admin on an event WHEN they select Connect Slack in Settings > Integrations THEN Slack OAuth opens with a cryptographically random, single-use, hashed state bound to their organization, event, and Clerk subject.
- GIVEN a valid OAuth callback WHEN Slack returns a bot installation THEN Namos encrypts the bot token before storage, never returns it to the browser, records the Slack team identity, and returns the organizer to that event's Integrations modal.
- GIVEN an event organizer and a connected organization workspace WHEN they choose a channel THEN Namos saves exactly one channel binding for that event and prevents the same workspace/channel pair from being bound to a second event.
- GIVEN a private channel WHEN the app is not a member THEN the channel cannot be saved and the UI explains that the organizer must invite Namos first.
- GIVEN an unlinked Slack user WHEN they mention the bot or run `/namos ask` THEN no event data is exposed and the bot returns an ephemeral one-time account-link action.
- GIVEN a signed-in event organizer with a valid one-time link token WHEN they claim it THEN Namos creates a Slack-to-Clerk mapping only after rechecking their access to the bound event.
- GIVEN a linked organizer in a bound channel WHEN they mention Namos with an objective THEN the existing event-scoped Operations Agent creates a durable run using an idempotency key derived from the Slack event.
- GIVEN a linked organizer replies in the bot-created Slack thread WHEN the existing run needs input THEN the reply resumes that run; otherwise it starts a new run in the same event and persists the new run/thread mapping.
- GIVEN `/namos status` in a bound channel WHEN the caller is linked and authorized THEN the command returns an ephemeral summary and a deep link to the event's Operations Agent page.
- GIVEN `/namos ask <objective>` WHEN accepted THEN Slack receives an acknowledgement within three seconds while durable processing continues in Convex.
- GIVEN an agent task proposal WHEN it is posted to Slack THEN each task's title, target, due date, reason, and proposal status are visible with Approve & create and Reject controls.
- GIVEN a pending proposal WHEN an authorized linked organizer clicks Approve & create THEN Namos applies the stored proposal through the existing payload-hash approval path exactly once and replaces the Slack controls with the final result.
- GIVEN a stale, rejected, already applied, unauthorized, or cross-event proposal interaction WHEN processed THEN no new task is created and the Slack message shows a safe final/error state.
- GIVEN a configured event notification WHEN `submission_received`, `reviewer_assigned`, `evaluation_completed`, `decision_sent`, or `comms_delivery_failed` occurs THEN one deduplicated message is delivered to the bound channel with a Namos deep link.
- GIVEN Slack retries an event, command, interaction, or outbound request WHEN Namos processes it THEN durable receipt/outbox records prevent duplicate runs, tasks, and channel messages.
- GIVEN a forged request, a timestamp older than five minutes, an unknown team, a bot-authored event, or an unmapped channel WHEN it reaches a Slack endpoint THEN Namos rejects or safely ignores it without reading or writing event data.
- GIVEN an organizer removes the event binding WHEN the workspace is still used by another event THEN only that event binding is removed and the organization installation remains connected.
- GIVEN an organization owner/admin disconnects the workspace WHEN confirmed THEN all bindings and user/thread mappings for that installation are disabled or removed, the Slack token is revoked when possible, and subsequent inbound requests fail closed.

## Functional Requirements

- FR-001: Add a Slack card to Settings > Integrations using the existing `IntegrationCard` and dialog patterns. Preserve its current `not_connected | connected | error` badge contract: map an installed workspace to `connected`, use the detail text to show `Workspace connected · Choose a channel` or `team · #channel`, and map permanent Slack failures to `error` with safe detail.
- FR-002: The Slack installation belongs to exactly one Namos organization. Only a row in `organizers` with role `owner | admin` for that organization may start OAuth or disconnect the entire workspace.
- FR-003: An event organizer may view status, list eligible channels, bind or remove that event's channel, configure features/notification kinds, link their own account, and send a test notification.
- FR-004: Version one supports one Slack workspace installation per Namos organization, one bound channel per event, and at most one Namos event per Slack workspace/channel pair.
- FR-005: OAuth uses Slack OAuth v2, a random 32-byte state, a stored SHA-256 state hash, a ten-minute expiry, single-use consumption, an exact HTTPS redirect URI, and minimum required bot scopes.
- FR-006: Store Slack bot tokens only as AES-256-GCM envelopes encrypted with `SLACK_INTEGRATION_ENCRYPTION_KEY`. `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, and the encryption key exist only in the Convex deployment environment and are documented in `.env.example` with placeholders.
- FR-007: Register Convex HTTP actions for `GET /oauth/slack/callback`, `POST /slack/events`, `POST /slack/commands`, and `POST /slack/interactions` on the deployment's `.convex.site` URL.
- FR-008: Verify every Slack POST against the raw request body using `X-Slack-Request-Timestamp`, `X-Slack-Signature`, HMAC-SHA256, a five-minute replay window, and constant-time comparison before parsing or scheduling work.
- FR-009: Handle Slack URL verification synchronously. All other valid inbound requests claim a durable dedupe receipt, schedule processing, and acknowledge within three seconds.
- FR-010: Use Slack `event_id` as the Events API dedupe key. Use a SHA-256 hash of the verified raw body plus request kind/team/timestamp for commands and interactions.
- FR-011: Ignore `bot_id`, `bot_profile`, message subtypes, and messages authored by the installed bot. Never answer Namos's own messages.
- FR-012: Support `app_mention` in bound channels and direct user messages. A channel mention derives `eventId` exclusively from `slack_channel_bindings`; a direct message requires one unambiguous recent/active linked event or returns an event-choice/deep-link response without invoking the agent.
- FR-013: Support `/namos help`, `/namos status`, and `/namos ask <objective>`. Unknown or missing subcommands return ephemeral usage copy. Slash commands do not promise thread invocation because Slack does not support commands inside threads.
- FR-014: Create one-time Slack account-link tokens as random 32-byte values, store only their hashes, expire them after ten minutes, consume them once, and bind them to workspace, Slack user, event, and current channel context.
- FR-015: A link claim derives the Namos actor from `ctx.auth.getUserIdentity().subject`; it never accepts a Clerk user ID from the client. It rechecks `assertEventOrganizerAccess` before inserting the mapping.
- FR-016: Route Slack objectives into the existing `agent_runs`, `agent_run_events`, `agent_action_proposals`, `agentRuntime`, and `agentWorkflow` implementation. Do not create a separate Slack agent prompt, model, tool set, or write policy.
- FR-017: Internal Slack-to-agent functions revalidate the stored mapped Clerk subject against the stored event before every create, respond, approve, or reject operation because scheduled functions have no browser identity.
- FR-018: Agent runs created from Slack use a stable idempotency key and map `{ workspace, channel, thread_ts }` to one active/recent `agentRunId`; replies and progress updates remain in that Slack thread.
- FR-019: Agent final summaries and focused clarification questions are posted to Slack with a top-level accessibility fallback `text` plus Block Kit. Long content is summarized and linked to the Namos run rather than split without bound.
- FR-020: A Slack proposal action sends only the opaque proposal ID, expected payload hash, action name, and signed Slack actor/context. The backend loads the stored proposal and applies/rejects it through existing agent proposal semantics.
- FR-021: After an interaction, update the original Slack message to remove active buttons and show `Applied by …`, `Rejected by …`, or a concise non-sensitive failure with a Namos deep link.
- FR-022: Add per-binding switches for Operations Agent and Slack notifications. Notification kinds are individually selectable from `submission_received`, `reviewer_assigned`, `evaluation_completed`, `decision_sent`, and `comms_delivery_failed`.
- FR-023: Slack notification fanout is event-level, not recipient-level. Existing per-recipient in-app notification inserts must not produce duplicate Slack messages.
- FR-024: Persist outbound messages in a Slack delivery outbox with queued/sending/sent/failed states, attempt count, Slack message timestamp, last error, and an indexed source key. Transient Slack failures and HTTP 429 responses retry with bounded backoff; permanent failures mark the integration `error` without fabricating delivery.
- FR-025: Every Slack message that represents a Namos entity contains a path built from the current `PUBLIC_APP_ORIGIN` and event slug; no host or callback URL is hardcoded.
- FR-026: The settings UI reads and writes only through the repository abstraction. Feature React code does not import `convex/react` directly.
- FR-027: Add audit-friendly metadata without storing raw Slack request bodies, Slack OAuth states/tokens, account-link tokens, Clerk JWTs, hidden model reasoning, or private credentials in logs or browser-readable projections.
- FR-028: Ship a deployment runbook and Slack app manifest template documenting redirect URL, event/interaction/command URLs, scopes, events, distribution mode, and required Convex environment variables.
- FR-029: Ship no stubs, in-memory dedupe, hard-coded success state, fake channels, pre-baked agent output, or no-op buttons. Release proof uses a real Slack sandbox, real OAuth, real Convex webhook traffic, and the real Operations Agent.

## Non-Functional Requirements

- NFR-001: Valid command, event, and interaction requests receive their required HTTP acknowledgement within 2.5 seconds at p95, leaving margin under Slack's three-second deadline.
- NFR-002: Every inbound request is authenticated before JSON/form parsing or database lookup, and every domain operation is independently authorized after the Slack identity mapping is resolved.
- NFR-003: Stored secrets use dedicated environment variables and encryption material; no new secret is exposed through `VITE_*`, client DTOs, errors, logs, or Git history.
- NFR-004: Dedupe and approval processing are safe under concurrent retries. A repeated Slack delivery cannot create more than one agent run, task proposal application, or outbound notification.
- NFR-005: Slack Block Kit copy is concise and accessible, has meaningful top-level fallback text, does not communicate status with color alone, and replaces completed controls to prevent misleading repeated actions.
- NFR-006: Settings controls meet WCAG 2.2 AA, are keyboard-operable, associate labels/descriptions with switches and checkboxes, expose loading with `aria-busy`, announce saved/error status, and respect reduced motion.
- NFR-007: Channel and workspace names are display metadata only. Authorization and routing always use immutable Slack team/channel/user IDs plus Namos IDs.
- NFR-008: The feature passes TypeScript, lint, unit/integration tests, production build, Convex code generation, and an authenticated browser journey plus a live Slack sandbox journey.
- NFR-009: No third-party Slack package is required for version one. Slack Web API and OAuth calls use the platform `fetch` API; signed request helpers remain small, tested, and server-only.

## Out of Scope

- Slack Marketplace listing, public multi-customer distribution review, Enterprise Grid org-wide deployment, and token rotation events.
- Multiple channels for one event, multiple events bound to one channel, or multiple Slack workspaces for one Namos organization.
- Slack App Home, modals, shortcuts, link unfurls, Canvas, Workflow Builder steps, message search/import, or file ingestion.
- Reviewer, speaker, sponsor, attendee, or unlinked-user access to event operations.
- AI submission scoring, acceptance/decline decisions, email sends, schedule/configuration writes, deletion, or any agent action beyond the existing task proposal approval boundary.
- Automatic user matching by email. Account linking is explicit and authenticated.
- Replacing browser/in-app notifications or making Slack the system of record.

## Success Metrics

- 100% of accepted inbound Slack requests have a verified signature and durable dedupe receipt.
- 100% of Slack-started agent writes retain the existing event authorization, stored proposal, payload hash, approving actor, and exactly-once application record.
- Zero cross-organization, cross-event, unlinked-user, reviewer/speaker, forged-request, or bot-loop data disclosures in the security test matrix.
- At least 90% of real sandbox commands and mentions acknowledge within 2.5 seconds; 100% acknowledge within Slack's three-second requirement under normal service conditions.
- At least 80% of usability participants can connect a workspace, bind a channel, link their account, ask the agent, and approve a task without instruction.
- One configured source notification produces exactly one Slack channel message even when multiple Namos organizers receive in-app notification rows or Slack retries delivery.
