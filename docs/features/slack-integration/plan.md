# Event-scoped Slack Operations Integration — Implementation Plan

## Delivery Rules

- Build from `requirements.md` and `design.md`; do not reinterpret Slack as a generic chat bot.
- Preserve the existing Operations Agent's event binding, provider/billing choice, tool set, durable status transitions, and exact payload-hash task approval. Slack is an adapter only.
- Do not hardcode any app host, callback URL, workspace/team/channel/user ID, email, token, client secret, signing secret, encryption key, or plan rule.
- Do not use in-memory dedupe, fake Slack payloads as release evidence, a fire-and-forget promise in an HTTP action, or a browser-exposed token.
- Do not create a branch as part of planning. Implementation should follow the repository's current delivery workflow when explicitly started.

## Phase 1: Foundation, Schema, and Configuration

- [ ] T001: Add the shared `encryptedEnvelope` and `slackNotificationKind` validators and all eight Slack tables from `design.md` to `convex/schema.ts` with the exact fields, unions, and indexes.
- [ ] T002: Run Convex code generation after the additive schema change; verify existing rows need no backfill and missing event `organizationId` still fails closed.
- [ ] T003: Add placeholder-only `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, and `SLACK_INTEGRATION_ENCRYPTION_KEY` entries to `.env.example`; document `CONVEX_SITE_URL` and `PUBLIC_APP_ORIGIN` usage without committing live values.
- [ ] T004: Add `slack-manifest.example.yaml` containing `/namos`, OAuth redirect, event subscription, interactivity URL, `app_mention`/`message.im`, and only the scopes specified in `design.md`; use documented placeholders instead of a live deployment domain.
- [ ] T005: Add `docs/runbooks/slack-integration.md` with Slack app creation, environment setup, callback/webhook URLs, sandbox install, private-channel invitation, token rotation/reinstall response, disconnect, and live verification instructions.
- [ ] T006: Add a daily bounded cleanup cron for expired OAuth state, link tokens, and request receipts; test that active rows and durable outbox audit rows are retained.

## Phase 2: Slack Security and Web API Client

- [ ] T007: Create `convex/slackSecurity.ts` with raw-body signature verification, five-minute timestamp skew validation, equal-length timing-safe comparison, SHA-256/base64url helpers, 32-byte random token generation, and AES-256-GCM token envelope helpers.
- [ ] T008: Unit-test valid/invalid signatures, changed bodies, missing headers, non-integer timestamps, future/old timestamps, unequal signature lengths, state hashing, and encryption round-trip without logging secrets.
- [ ] T009: Create `convex/slackClient.ts` using platform `fetch` for OAuth v2 and Web API helpers: exchange code, list/get channel, get user, post message, post ephemeral, update message, and revoke token.
- [ ] T010: Define exact TypeScript response guards for Slack `ok`, team, bot user, access token, channel, user, and message timestamp fields; classify 429/transient/permanent errors and redact bearer tokens/response URLs from thrown messages.
- [ ] T011: Contract-test pagination, malformed JSON, `ok:false`, `Retry-After`, 5xx, invalid auth, missing OAuth fields, archived/private channel flags, and token redaction.

## Phase 3: OAuth Installation and Event Binding Backend

- [ ] T012: Create `convex/slackIntegrations.ts` safe status query using event → organization → workspace → binding indexes. Return only the exact `SlackIntegrationStatus` union; never return token/state envelopes.
- [ ] T013: Implement `startOAuth` as an action with event plus organization owner/admin authorization, required environment validation, random state generation, hashed/expiring storage through an internal mutation, and exact authorize URL construction.
- [ ] T014: Implement `GET /oauth/slack/callback` in `convex/slackHttp.ts`: consume the state once, revalidate actor role, exchange code, reject a team attached to another organization, encrypt/upsert the installation, and redirect to the exact event Settings route with safe result params.
- [ ] T015: Implement `listChannels` action with event organizer authorization, server-side token decryption, Slack pagination capped at 500, stable sort, and safe `{ id, name, isPrivate, isMember }` projection.
- [ ] T016: Implement `saveBinding` action. Derive name/privacy through `conversations.info`; reject archived, inaccessible private, cross-org, duplicate workspace/channel, invalid kinds, and both-capabilities-off states; upsert by event.
- [ ] T017: Implement `updateBinding`, `removeBinding`, and event-specific cleanup. Ensure an event organizer can change/remove only their event binding and cannot remove another event's workspace installation.
- [ ] T018: Implement owner/admin-only `disconnectWorkspace`: attempt `auth.revoke`, transactionally remove/disable installation-owned bindings/mappings/threads, resolve queued work safely, and make retries idempotent.
- [ ] T019: Implement `claimLink` with token hashing, single-use/expiry enforcement, Clerk-derived actor, event organizer reauthorization, user lookup for safe display name, and mapping upsert.
- [ ] T020: Implement `testNotification` through the real Slack client and connected binding, with an explicit test message and safe persistent error state.
- [ ] T021: Add backend tests for owner/admin versus event-organizer privileges, reviewer/speaker denial, missing organization, cross-org team conflicts, channel uniqueness, private membership, archived channels, invalid capabilities, OAuth denial/replay/expiry, account-link theft/replay, disconnect retries, and no secret projection.

## Phase 4: Signed HTTP Endpoints and Durable Inbound Processing

- [ ] T022: Register `GET /oauth/slack/callback`, `POST /slack/events`, `POST /slack/commands`, and `POST /slack/interactions` in `convex/http.ts`; keep route methods/paths exact.
- [ ] T023: Implement Events API raw-body verification, URL challenge, `event_id` receipt claim, zero-delay scheduling, and immediate 200 response. Unknown event types and bot/subtype messages are safely ignored.
- [ ] T024: Implement slash-command form parsing and exact `/namos help`, `/namos status`, `/namos ask <objective>` validation. Return ephemeral acknowledgement/help within three seconds; schedule accepted work and cap objective at 4,000 characters.
- [ ] T025: Implement interaction form/payload parsing for `namos_proposal_approve` and `namos_proposal_reject`; claim a body-derived receipt and acknowledge before proposal work.
- [ ] T026: Create `convex/slackInbound.ts` receipt claim/mark functions using `by_dedupe_key`, seven-day expiry, redacted errors, and parsed minimal scheduled payloads. Never persist raw bodies or response URLs.
- [ ] T027: Resolve each inbound request in this order: team installation → live workspace state → channel binding → feature enabled → Slack user mapping → current Namos event authorization. Do not expose event data when any link fails.
- [ ] T028: Implement unlinked-user response: generate one account-link token, store only its hash for ten minutes, construct a `PUBLIC_APP_ORIGIN` settings deep link, and send ephemeral/DM copy without event data.
- [ ] T029: Implement DM ambiguity handling: run only when one event binding is unambiguous for the linked user/workspace; otherwise return safe event-choice/deep-link guidance.
- [ ] T030: Test acknowledgement latency, raw-body-before-parse enforcement, replay/skew rejection, URL challenge, duplicate receipts, bot loops, unsupported events/actions, unbound channels, disabled agent, missing mapping, DM ambiguity, malformed forms/JSON, and objective validation.

## Phase 5: Operations Agent Adapter and Slack Thread Projection

- [ ] T031: Refactor `convex/agentRuns.ts` so browser mutations and new internal Slack functions call shared services for create/respond/approve/reject. Preserve every existing authorization, status, event-link, payload-hash, task validation, idempotency, billing/provider, and workflow scheduling rule.
- [ ] T032: Add internal by-user-ID event organizer authorization helper for scheduled work. It must query organization/event membership from stored IDs and fail closed; it must never treat a Slack mapping as authorization.
- [ ] T033: Create `convex/slackAgent.ts` functions from `design.md` for create, respond, approve, reject, and thread mapping. Use stable receipt/timestamp-derived idempotency keys and `by_workspace_channel_thread`.
- [ ] T034: Route `app_mention` and `/namos ask` objectives into the existing run creation service. Strip only the installed bot mention, preserve sanitized user text, and never let Slack supply `eventId` or Namos user ID.
- [ ] T035: Route authorized thread replies into a run needing input; if the mapped run is terminal, start a new run with a new mapping rather than mutating history.
- [ ] T036: Add a meaningful-state projection hook from the existing agent runtime/workflow that posts acknowledgement, clarification, final result, and proposal messages to the mapped thread. Do not modify agent tools/system prompt.
- [ ] T037: Build typed Block Kit factories for acknowledgement, clarification, final result, and proposal contracts. Escape Slack text, include top-level fallback, cap task display at ten, retain full proposal in Namos, and add deep links built from environment origin plus event slug.
- [ ] T038: Implement proposal interactions by reloading workspace/mapping/event/proposal and calling the shared hash-bound approve/reject service; then update the Slack message to remove buttons and display the durable decision.
- [ ] T039: Test cross-event thread IDs, removed organizers, concurrent/retried replies, status races, missing AI config, quota/provider failures, clarification resume, terminal-run reply, stale hash, already-applied/rejected proposal, different click actor, >10-task display, and exactly-once task creation.

## Phase 6: Event Notification Outbox

- [ ] T040: Create `convex/slackNotifications.ts` enqueue/deliver/cleanup functions with exact outbox states and indexes from `design.md`.
- [ ] T041: Update `notifyEvent` call flow to enqueue Slack once per logical event notification, outside its recipient loop, with a stable source dedupe key. Confirm current browser/email behavior remains unchanged.
- [ ] T042: Add Slack fanout only for `submission_received`, `reviewer_assigned`, `evaluation_completed`, `decision_sent`, and `comms_delivery_failed`, and only when the binding enables that exact kind.
- [ ] T043: Implement delivery claim, token resolution, accessible Block Kit, sent timestamp, and bounded retries at 30 seconds/2 minutes/10 minutes with Slack `Retry-After` override and four-attempt ceiling.
- [ ] T044: Mark permanent channel/auth failures as Needs attention and stop retries. Re-resolve binding/workspace before every attempt so disconnect/remove races fail safely.
- [ ] T045: Test multiple in-app recipients → one Slack message, duplicate source enqueue, 429, timeout, 5xx, invalid auth, missing/deleted channel, disabled notifications, unselected kind, binding removed during queue, retry ceiling, and successful test message.

## Phase 7: Frontend UI

> A feature is not done until the organizer can install, bind, configure, test, link, remove, and disconnect Slack through the real UI. Build the exact states below; do not ship a backend-only integration.

### UI Spec: Slack card and dialog entry point

- **Location:** Settings modal > Integrations > Messaging & Communication, after the existing email provider cards.
- **Elements:**
  - `IntegrationCard` with Lucide `Slack`, name `Slack`, description `Run event operations and receive selected updates in one channel.`
  - Existing badge contract only: `Not connected`, `Connected`, or `Error`. Do not widen `IntegrationCardStatus` for Slack alone.
  - Detail line: `Workspace connected · Choose a channel` when installed but unbound, `teamName · #channelName` when bound, and safe `Needs attention` detail for permanent Slack errors; never a token or ID.
  - Dialog `max-h-[90vh] max-w-2xl overflow-y-auto`, title `Slack`, containing `SlackIntegrationForm`.
- **Behavior:** card click opens the dialog; loading does not falsely show disconnected; saving updates the card without closing; existing integration cards/dialogs remain unchanged.
- **Data:** `repo.slackIntegrations.status(eventId)` via existing `useRepo` loading flow.

### UI Spec: `SlackIntegrationForm`

- **Location:** Slack dialog body.
- **Layout/classes:** root `space-y-6`; sections `space-y-3`; passive surfaces `rounded-lg bg-muted/60 p-4`; actions `flex flex-wrap items-center gap-2`; no borders or shadows.
- **Loading elements:** three skeletons with exact classes `h-16 w-full animate-pulse rounded-lg bg-muted`, `h-10 w-full animate-pulse rounded-md bg-muted`, `h-24 w-full animate-pulse rounded-lg bg-muted`; `aria-busy`; screen-reader loading text.
- **Not-connected elements:** intro copy, What Namos can do heading/list, privacy copy, accent Connect Slack button with Slack icon. Button disables/shows progress while `startOAuth` runs, then redirects to returned URL.
- **Workspace elements:** connected team card/status, safe error text, shadcn channel Select with `#name`, Private and Invite Namos first labels, Refresh channels ghost button, exact empty/error channel states.
- **Capability elements:** Operations Agent labeled Switch plus description; Event notifications labeled Switch plus description; five labeled checkbox rows; inline validation when configuration is empty.
- **Bound actions:** accent Save channel/Save changes; outline Send test with Send icon; ghost Remove from this event with scoped confirmation; owner/admin-only destructive-text Disconnect workspace with organization-wide confirmation.
- **Feedback:** global error `role="alert" text-sm text-destructive`; saved/link/test status `role="status" aria-live="polite" text-sm text-emerald-700 dark:text-emerald-300`.
- **OAuth/link behavior:** consume `slack=connected|error` and `slack_link` query params; call status/claim exactly once; remove sensitive/result params with `history.replaceState` while preserving event settings route; never send raw link token to analytics/storage.
- **Responsive/accessibility:** all labels programmatically bind to control IDs; controls keyboard-operable; action row wraps; dialog scrolls within viewport; do not use color as the only status cue; no blue web button.
- **Data:** status/list/save/update/remove/disconnect/claim/test repository operations described in `design.md`; all names/privacy fields are derived by server APIs.

### UI Tasks

- [ ] T046: Add exact Slack DTOs to `src/data/types.ts`, `SlackIntegrationsRepo` to `src/data/repo.ts`, operation declarations/mappings to `src/data/transport.ts`, and generated Convex mappings/action classification to `src/data/convex/index.ts`.
- [ ] T047: Create `src/components/shared/SlackIntegrationForm.tsx` with the exact props, local state, Tailwind classes, elements, copy, validation, accessible loading/error/success regions, and interaction behavior in `design.md` and this UI Spec.
- [ ] T048: Modify `src/pages/settings/Integrations.tsx` to load Slack status, add the Slack card in the correct section, and open the exact dialog without regressing Resend, SES, Operations Agent AI, Notion, Airtable, or Sanity.
- [ ] T049: Implement OAuth and account-link query-param consumption with immediate URL cleanup. Add a regression test proving the raw link token is absent from the URL after the claim attempt and absent from analytics calls.
- [ ] T050: Add component/integration tests for every visual state: loading, not connected, OAuth failure, workspace/no channel, channel loading/empty/error, private non-member, bound, needs attention, invalid switches/kinds, save pending/success/error, test pending/success/error, remove confirmation, disconnect visibility/confirmation, link success/error, responsive wrapping, keyboard labels, and live regions.
- [ ] T051: Drive the real authenticated browser flow at desktop, 390px mobile, light, and dark modes: open Settings from an event page, connect OAuth, return to correct modal/tab, choose channel, configure, save, reload, test, remove event binding, and verify owner/admin disconnect scope.

## Phase 8: End-to-End Security and Release Verification

- [ ] T052: Run focused unit/integration suites plus repository commands for lint, TypeScript, Convex codegen, tests, and production build. Record exact pass/fail output; do not infer deployment from local checks.
- [ ] T053: Install the generated Slack app in a real sandbox using the target Convex deployment, complete OAuth, bind public and invited private channels, and inspect stored projections to prove no plaintext token/raw OAuth state exists.
- [ ] T054: Verify live `/namos help`, `/namos status`, `/namos ask`, `@Namos` mention, DM ambiguity, unlinked account flow, linked account flow, thread clarification, final result, proposal approval, proposal rejection, and Namos deep links.
- [ ] T055: Verify live notification toggles and all five kinds, test message, one logical event → one channel post, channel rename/delete, bot removal, Slack 429/retry behavior where safely reproducible, and workspace disconnect.
- [ ] T056: Execute the authorization matrix with organization owner, organization admin, event-only organizer, reviewer, speaker, unlinked Slack user, removed organizer, wrong event/channel/team, and forged/stale signatures. Confirm failures expose no event data and create no runs/tasks.
- [ ] T057: Confirm Slack acknowledgements meet p95 2.5 seconds in the sandbox and that model/runtime latency occurs after 200. Inspect receipts/workflow/outbox rows to prove durability across retry/restart.
- [ ] T058: Verify Cloudflare/static app host and Convex deployments separately. Do not call the feature production-ready until the correct Slack app endpoints and environment values exist on the live Convex deployment and a live sandbox journey passes.
- [ ] T059: Update `docs/features/slack-integration/` and the feature index with actual implementation, issue/PR, verification evidence, and remaining out-of-scope work. Do not mark `done` for local implementation alone.

## Task Dependencies

```text
T001-T006 foundation
  → T007-T011 security/client
  → T012-T021 OAuth + binding backend
  → T022-T030 signed inbound endpoints
  → T031-T039 existing-agent adapter
  → T040-T045 notification outbox
  → T046-T051 settings UI
  → T052-T059 live release verification
```

Some work can run in parallel after Phase 2: OAuth/binding (Phase 3), agent shared-service refactor (part of Phase 5), and frontend DTO/component scaffolding (Phase 7). Signed inbound processing requires the security client and installation lookup. Live UI verification requires a configured Slack sandbox and deployed Convex HTTP actions.

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` are met.
- [ ] Feature is accessible and fully usable from Settings > Integrations.
- [ ] Exactly one organization installation and one event/channel binding model is enforced server-side.
- [ ] Every inbound POST verifies raw-body signature and timestamp before parsing/lookup.
- [ ] HTTP endpoints acknowledge inside Slack's three-second limit and schedule durable work.
- [ ] Durable receipts prevent duplicate runs/interactions; outbox prevents duplicate logical notification sends.
- [ ] Slack users explicitly link through a single-use hashed token; email auto-linking does not exist.
- [ ] Removed/unauthorized users fail closed even with a stale Slack mapping.
- [ ] Slack-started agent runs use the existing runtime, billing/provider settings, tools, audit events, and approval semantics.
- [ ] Proposal Approve & create uses stored proposal ID/hash, creates tasks exactly once, and removes Slack action buttons.
- [ ] Only selected notification kinds post, once per logical event rather than once per recipient.
- [ ] Tokens/secrets/raw states/raw request bodies/response URLs never reach browser DTOs, logs, analytics, or Git.
- [ ] Slack errors, 429s, deleted channels, revoked auth, disconnect races, and retries have durable honest states.
- [ ] Web UI has loading, empty, validation, error, success, destructive-confirmation, responsive, dark-mode, keyboard, and screen-reader proof.
- [ ] Lint, typecheck, Convex code generation, test suite, and production build pass.
- [ ] Real Slack sandbox OAuth, signed webhooks, commands, mentions, thread continuation, proposal decision, notification, and disconnect pass against the intended deployed Convex backend.
- [ ] Local checks, commit/PR, deployment, authenticated browser proof, and live Slack proof are reported as separate completion states.
- [ ] No out-of-scope Slack or agent capability was added.
