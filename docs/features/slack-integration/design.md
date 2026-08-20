# Event-scoped Slack Operations Integration — Technical Design

## Evidence and Scope Decisions

- Namos Sessions is a React 18/Vite client with Convex as its authenticated backend. Settings content is lazy-rendered inside `SettingsModal` (`src/components/settings/SettingsModal.tsx:1-38`), so Slack configuration must fetch through client repository operations rather than server-component props.
- The current integration surface is `src/pages/settings/Integrations.tsx:1-255`. It loads safe email, content, and Operations Agent states through `useRepo`, renders `IntegrationCard`, and opens one dialog per provider. Slack follows this established pattern.
- `IntegrationCard` accepts a Lucide icon, name, description, status, optional detail, open handler, and coming-soon flag (`src/components/settings/IntegrationCard.tsx:1-70`). No new card primitive is needed.
- `organizations`, organization owners/admins, `event_members`, notifications, and events establish the tenant chain (`convex/schema.ts:38-66`, `107-171`). Event authorization fails closed through `requireIdentity`, `isOrganizerOf`, and `assertEventOrganizerAccess` (`convex/functions.ts:18-22`, `55-89`, `101-130`).
- The Operations Agent already persists event-scoped runs, events, and hash-bound proposals (`convex/schema.ts:383-506`), executes through `@convex-dev/agent` and `@convex-dev/workflow` (`convex/agentRuntime.ts:1-111`, `convex/agentWorkflow.ts:1-14`), and exposes organizer-authorized run operations (`convex/agentRuns.ts:55-185`). Slack is another input/output adapter around this runtime, not another agent.
- Existing OAuth integration code already generates random state, stores only its hash, enforces expiry/single-use consumption, and encrypts credentials with AES-256-GCM (`convex/contentIntegrations.ts:78-103`, `convex/contentIntegrationsActions.ts:41-72`, `127-175`). Slack reuses this security shape with Slack-specific tables and callbacks.
- Existing `notifyEvent` creates one row per recipient and schedules optional email per row (`convex/notifications.ts:36-100`). Slack fanout must be enqueued once per event action outside the recipient loop or a single event would produce duplicate channel messages.
- `wrangler.jsonc` hosts the static Vite application on Cloudflare Workers; `netlify.toml` and `vercel.json` describe static Vite builds. Public Slack endpoints belong in Convex HTTP actions at the deployment's `.convex.site` URL. Long AI/Slack work is scheduled after acknowledgement; it must not run in a static-host request.
- `package.json` contains Convex `^1.42.3`, `@convex-dev/agent` `0.6.4`, `@convex-dev/workflow` `0.4.5`, `ai` `6.0.64`, and `@ai-sdk/openai` `3.0.96`. No Slack SDK is installed. Version one uses built-in `fetch` and does not add a package.
- Takumi's `slack-manifest.yaml`, OAuth route, signed events route, and deployment runbook establish the desired interaction surface. Its in-memory dedupe and fire-and-forget work are unsuitable here; Namos uses durable Convex receipts, scheduled functions, and workflows.
- Slack requires raw-body HMAC verification and timestamp replay protection ([Verifying requests from Slack](https://docs.slack.dev/authentication/verifying-requests-from-slack/)), OAuth v2 with exact redirect URI and state ([Installing with OAuth](https://docs.slack.dev/authentication/installing-with-oauth/)), and acknowledgement within three seconds for events/commands/interactions ([Events API](https://docs.slack.dev/apis/events-api/), [Slash commands](https://docs.slack.dev/interactivity/implementing-slash-commands/), [Interactivity](https://docs.slack.dev/interactivity/handling-user-interaction/)).
- Slack recommends concise, progressively disclosed Block Kit experiences with accessible fallback text and completed controls removed or updated ([Designing with Block Kit](https://docs.slack.dev/concepts/designing-with-block-kit), [Block Kit accessibility](https://docs.slack.dev/block-kit/)).
- Convex HTTP actions are the supported webhook boundary, and scheduled functions/workflows provide persisted execution and retries ([HTTP actions](https://docs.convex.dev/functions/http-actions), [Scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions), [Workflows](https://docs.convex.dev/agents/workflows)).

## Database / Schema Changes

### Current Schema (affected tables)

```ts
organizations: defineTable({
  name: v.string(),
  createdByUserId: v.string(),
  createdAt: v.number(),
}).index("by_createdByUserId", ["createdByUserId"]),

organizers: defineTable({
  organizationId: v.optional(v.id("organizations")),
  userId: v.string(),
  email: v.string(),
  role: v.union(v.literal("owner"), v.literal("admin")),
  onboardingCompletedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_email", ["email"])
  .index("by_organization", ["organizationId"])
  .index("by_org_userId", ["organizationId", "userId"])
  .index("by_org_email", ["organizationId", "email"]),

event_members: defineTable({
  eventId: v.id("events"),
  userId: v.string(),
  email: v.string(),
  role: v.union(v.literal("organizer"), v.literal("reviewer")),
  invitedByUserId: v.string(),
  clerkInvitationId: v.optional(v.string()),
  inviteEmailStatus: v.optional(v.union(
    v.literal("pending"), v.literal("sent"), v.literal("failed"),
  )),
  inviteError: v.optional(v.string()),
  invitedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_userId", ["userId"])
  .index("by_email", ["email"])
  .index("by_event_userId", ["eventId", "userId"])
  .index("by_event_email", ["eventId", "email"]),

notifications: defineTable({
  eventId: v.id("events"),
  recipientUserId: v.string(),
  kind: v.union(
    v.literal("invite_sent"), v.literal("invite_accepted"),
    v.literal("invite_declined"), v.literal("member_removed"),
    v.literal("submission_received"), v.literal("submission_withdrawn"),
    v.literal("reviewer_assigned"), v.literal("evaluation_completed"),
    v.literal("decision_sent"), v.literal("comms_delivery_failed"),
  ),
  title: v.string(),
  body: v.optional(v.string()),
  linkPath: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  readAt: v.optional(v.number()),
  emailedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_recipient", ["recipientUserId", "createdAt"])
  .index("by_recipient_unread", ["recipientUserId", "readAt"])
  .index("by_event", ["eventId"]),

events: defineTable({
  organizationId: v.optional(v.id("organizations")),
  name: v.string(), slug: v.string(), type: v.optional(v.string()),
  websiteUrl: v.optional(v.string()), location: v.optional(v.string()),
  timezone: v.string(), startDate: v.number(), endDate: v.number(),
  description: v.optional(v.string()), contactEmail: v.optional(v.string()),
  logoFileId: v.optional(v.string()), programPublishedAt: v.optional(v.number()),
  theme: v.optional(v.string()), logoStorageKey: v.optional(v.string()),
  accentColor: v.optional(v.string()), backgroundStorageKey: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(),
  defaultOnboardingTemplateId: v.optional(v.id("task_templates")),
  billingOwnerUserId: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]).index("by_organization", ["organizationId"]),
```

The existing agent tables in `convex/schema.ts:383-506` remain unchanged and are reused by ID.

### Required Changes

Add the following validators near the schema module's other shared validators:

```ts
const encryptedEnvelope = v.object({
  version: v.literal(1),
  iv: v.string(),
  ciphertext: v.string(),
  tag: v.string(),
});

const slackNotificationKind = v.union(
  v.literal("submission_received"),
  v.literal("reviewer_assigned"),
  v.literal("evaluation_completed"),
  v.literal("decision_sent"),
  v.literal("comms_delivery_failed"),
);
```

Add these tables exactly:

```ts
slack_workspaces: defineTable({
  organizationId: v.id("organizations"),
  slackTeamId: v.string(),
  slackTeamName: v.string(),
  botUserId: v.string(),
  botTokenEnvelope: encryptedEnvelope,
  scopes: v.array(v.string()),
  status: v.union(v.literal("connected"), v.literal("error")),
  lastError: v.optional(v.string()),
  installedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_organization", ["organizationId"])
  .index("by_team", ["slackTeamId"])
  .index("by_org_team", ["organizationId", "slackTeamId"]),

slack_channel_bindings: defineTable({
  organizationId: v.id("organizations"),
  eventId: v.id("events"),
  slackWorkspaceId: v.id("slack_workspaces"),
  slackChannelId: v.string(),
  slackChannelName: v.string(),
  isPrivate: v.boolean(),
  agentEnabled: v.boolean(),
  notificationsEnabled: v.boolean(),
  notificationKinds: v.array(slackNotificationKind),
  createdByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_workspace", ["slackWorkspaceId"])
  .index("by_workspace_channel", ["slackWorkspaceId", "slackChannelId"]),

slack_user_mappings: defineTable({
  organizationId: v.id("organizations"),
  slackWorkspaceId: v.id("slack_workspaces"),
  slackUserId: v.string(),
  namosUserId: v.string(),
  slackDisplayName: v.optional(v.string()),
  linkedAt: v.number(),
  lastVerifiedAt: v.number(),
})
  .index("by_workspace_user", ["slackWorkspaceId", "slackUserId"])
  .index("by_org_namos_user", ["organizationId", "namosUserId"]),

slack_oauth_states: defineTable({
  stateHash: v.string(),
  organizationId: v.id("organizations"),
  eventId: v.id("events"),
  userId: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index("by_state_hash", ["stateHash"])
  .index("by_expiry", ["expiresAt"]),

slack_link_tokens: defineTable({
  tokenHash: v.string(),
  slackWorkspaceId: v.id("slack_workspaces"),
  eventId: v.id("events"),
  slackUserId: v.string(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_token_hash", ["tokenHash"])
  .index("by_expiry", ["expiresAt"]),

slack_agent_threads: defineTable({
  slackWorkspaceId: v.id("slack_workspaces"),
  eventId: v.id("events"),
  slackChannelId: v.string(),
  slackThreadTs: v.string(),
  slackUserId: v.string(),
  agentRunId: v.id("agent_runs"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_workspace_channel_thread", ["slackWorkspaceId", "slackChannelId", "slackThreadTs"])
  .index("by_run", ["agentRunId"]),

slack_request_receipts: defineTable({
  dedupeKey: v.string(),
  kind: v.union(v.literal("event"), v.literal("command"), v.literal("interaction")),
  slackTeamId: v.optional(v.string()),
  status: v.union(v.literal("accepted"), v.literal("processed"), v.literal("failed")),
  error: v.optional(v.string()),
  receivedAt: v.number(),
  processedAt: v.optional(v.number()),
  expiresAt: v.number(),
})
  .index("by_dedupe_key", ["dedupeKey"])
  .index("by_expiry", ["expiresAt"]),

slack_delivery_outbox: defineTable({
  eventId: v.id("events"),
  bindingId: v.id("slack_channel_bindings"),
  sourceNotificationId: v.optional(v.id("notifications")),
  dedupeKey: v.string(),
  kind: slackNotificationKind,
  title: v.string(),
  body: v.optional(v.string()),
  linkPath: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  status: v.union(
    v.literal("queued"), v.literal("sending"),
    v.literal("sent"), v.literal("failed"),
  ),
  attempts: v.number(),
  slackMessageTs: v.optional(v.string()),
  lastError: v.optional(v.string()),
  nextAttemptAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_dedupe_key", ["dedupeKey"])
  .index("by_status_next_attempt", ["status", "nextAttemptAt"])
  .index("by_event", ["eventId"]),
```

### Migration

This is an additive Convex schema deployment: eight new tables and two shared validators. No existing document changes and no backfill are required. Deploy schema/functions before configuring Slack endpoints. Existing organizations/events with missing `organizationId` fail closed and cannot install Slack until the existing organization migration is complete.

After release, schedule daily cleanup of consumed/expired OAuth states, expired link tokens, and request receipts older than seven days. Outbox audit rows remain. Workspace disconnect deletes or tombstones its bindings/mappings/threads only after revocation has been attempted; implementation must choose one consistent transaction strategy and tests must cover retry after partial revocation failure.

## Backend / API

### Affected Existing Functions

| Function | Current behavior | Required change |
|---|---|---|
| `notifications:notifyEvent` internal helper (`convex/notifications.ts:70-100`) | Inserts one in-app row per resolved recipient and schedules optional email per row. | After recipient insertion, call one internal `slackNotifications.enqueueEventNotification` with a stable event/action dedupe key. Never enqueue inside the recipient loop. |
| `agentRuns:create/respond/approveTaskProposal/rejectProposal` (`convex/agentRuns.ts`) | Authenticates a browser caller with Clerk and event organizer access. | Extract shared internal service functions that accept a stored `requestedByUserId`, revalidate it against the event, and preserve all existing objective, status, hash, linkage, and idempotency checks. Public functions remain wrappers. |
| `agentRuntime:executeRun` (`convex/agentRuntime.ts:135-185`) | Executes the existing event-bound agent tools and persists progress/final state. | Add an internal completion hook that schedules Slack thread projection when a run has a Slack thread mapping. Do not change the system prompt or tool permissions. |
| `convex/http.ts` | Registers existing public HTTP actions. | Register Slack callback, events, commands, and interactions routes. Keep request signature verification in the Slack HTTP module. |
| `.env.example` | Documents current browser and server configuration. | Add placeholder-only server variables: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_INTEGRATION_ENCRYPTION_KEY`. Document that redirect/event URLs use `CONVEX_SITE_URL`; deep links use `PUBLIC_APP_ORIGIN`. |

### New Browser-callable Convex Functions

Create `convex/slackIntegrations.ts`. All query/mutation handlers call `assertEventOrganizerAccess`; organization-wide actions additionally load the caller's `organizers` row by `by_org_userId` and require `role === "owner" || role === "admin"`.

| Function | Type | Exact args | Exact return | Indexes / validation |
|---|---|---|---|---|
| `slackIntegrations:status` | query | `{ eventId: Id<"events"> }` | `{ state: "not_connected" } \| { state: "workspace_connected"; workspaceId: Id<"slack_workspaces">; teamId: string; teamName: string; canDisconnectWorkspace: boolean; lastError?: string; updatedAt: number } \| { state: "connected" \| "error"; workspaceId: Id<"slack_workspaces">; teamId: string; teamName: string; channelId: string; channelName: string; isPrivate: boolean; agentEnabled: boolean; notificationsEnabled: boolean; notificationKinds: SlackNotificationKind[]; canDisconnectWorkspace: boolean; lastError?: string; updatedAt: number }` | Event via ID; organization via event; workspace `by_organization`; binding `by_event`. Never returns token envelope. |
| `slackIntegrations:startOAuth` | action | `{ eventId: Id<"events"> }` | `{ url: string; expiresAt: number }` | Authenticated owner/admin only. Require server env. Generate 32 random bytes, store hash through internal mutation, create exact Slack authorize URL with state and redirect URI `${CONVEX_SITE_URL}/oauth/slack/callback`. |
| `slackIntegrations:listChannels` | action | `{ eventId: Id<"events"> }` | `{ channels: Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }> }` | Event organizer. Resolve workspace `by_organization`, decrypt server-side token, paginate `conversations.list`, retain public/private channels visible to bot, sort by name, cap at 500. Never return token. |
| `slackIntegrations:saveBinding` | action | `{ eventId: Id<"events">; channelId: string; agentEnabled: boolean; notificationsEnabled: boolean; notificationKinds: SlackNotificationKind[] }` | `{ status: "connected"; channelId: string; channelName: string; isPrivate: boolean; updatedAt: number }` | Event organizer. Server fetches `conversations.info`; rejects archived channel, private non-member channel, duplicate `by_workspace_channel`, invalid notification kind, both features disabled, or cross-org workspace. Server derives name/privacy. Upsert by `by_event`. |
| `slackIntegrations:updateBinding` | mutation | `{ eventId: Id<"events">; agentEnabled: boolean; notificationsEnabled: boolean; notificationKinds: SlackNotificationKind[] }` | `{ updatedAt: number }` | Event organizer; binding via `by_event`. At least one capability enabled. Empty kinds allowed only when notifications disabled. |
| `slackIntegrations:removeBinding` | mutation | `{ eventId: Id<"events"> }` | `{ removed: boolean }` | Event organizer. Delete binding plus event-specific thread/link-token records; preserve org workspace and other event mappings. Idempotent false when absent. |
| `slackIntegrations:disconnectWorkspace` | action | `{ eventId: Id<"events"> }` | `{ disconnected: true }` | Organization owner/admin only. Resolve workspace, attempt Slack `auth.revoke`, then internal mutation removes installation-owned bindings/mappings/threads and marks pending receipts/outbox failed. Retry-safe. |
| `slackIntegrations:createLink` | mutation | `{ eventId: Id<"events">; slackUserId: string }` | Internal use only; not browser callable. | Inbound processor resolves binding; generates raw token, stores hash and ten-minute TTL. Returns raw token once to processor. |
| `slackIntegrations:claimLink` | mutation | `{ eventId: Id<"events">; token: string }` | `{ linked: true; teamName: string; slackDisplayName?: string }` | Auth required. Hash token, load `by_token_hash`, verify unused/unexpired/event, call `assertEventOrganizerAccess`, upsert mapping by `by_workspace_user`, set consumedAt atomically. |
| `slackIntegrations:testNotification` | action | `{ eventId: Id<"events"> }` | `{ sent: true; slackMessageTs: string }` | Event organizer. Require bound/notifications enabled. Post a clearly labeled test through the same Slack client; record failure on workspace/binding and return safe error. |

`startOAuth`, `listChannels`, `saveBinding`, `disconnectWorkspace`, and `testNotification` are actions because they perform Slack network requests. Their database reads/writes go through internal queries/mutations; action code never relies on a mutation context it does not have.

### New HTTP Actions

Create `convex/slackHttp.ts` and register these in `convex/http.ts`:

#### `GET /oauth/slack/callback`

- Query: `{ code?: string; state?: string; error?: string }`.
- Success response: `302 Location: ${PUBLIC_APP_ORIGIN}/events/${event.slug}/settings/integrations?slack=connected`.
- Failure response: `302 Location: ${PUBLIC_APP_ORIGIN}/events/${event.slug}/settings/integrations?slack=error&reason=<safe-code>` when a valid state identifies the event; otherwise a minimal `400` HTML/text response with no secret detail.
- Validation: require code/state, SHA-256 state, consume exactly once via `by_state_hash`, require unexpired state and still-valid owner/admin subject, use exact redirect URI in `oauth.v2.access`, require Slack `ok`, `team.id`, `team.name`, `access_token`, and `bot_user_id`; reject if `by_team` belongs to another Namos organization; encrypt token; upsert by `by_organization`.

#### `POST /slack/events`

- Raw body shape accepted from Slack:
  - URL verification: `{ type: "url_verification"; challenge: string }`.
  - Event callback: `{ type: "event_callback"; team_id: string; event_id: string; event_time: number; event: { type: "app_mention" | "message"; user?: string; channel: string; text?: string; ts: string; thread_ts?: string; channel_type?: string; bot_id?: string; subtype?: string } }`.
- Success response for verification: `200 { challenge: string }`.
- Success response for callback: `200 { accepted: true }`; duplicate: `200 { accepted: false; duplicate: true }`.
- Failure: `401` invalid signature/timestamp, `400` malformed supported envelope; unknown event types return `200` and are ignored.
- Processing: verify raw bytes first; use `event_id` dedupe; insert receipt with seven-day expiry; schedule `slackInbound:processEvent` at delay 0; never invoke AI in the HTTP action.

#### `POST /slack/commands`

- Content type: `application/x-www-form-urlencoded`.
- Required parsed fields: `{ command: string; text: string; team_id: string; channel_id: string; channel_name?: string; user_id: string; user_name?: string; response_url: string; trigger_id: string }`.
- Immediate success response: `200 { response_type: "ephemeral"; text: "Namos is working on that…" }` for accepted `ask`; exact help/status validation copy for synchronous invalid syntax; never include event data before mapping/authorization.
- Validation: signed raw body, `command === "/namos"`, supported subcommand, non-empty objective at most 4,000 characters, known workspace/channel binding for event commands. Claim hashed raw-body dedupe and schedule `slackInbound:processCommand`.

#### `POST /slack/interactions`

- Content type: `application/x-www-form-urlencoded` with `payload=<JSON>`.
- Supported parsed body: `{ type: "block_actions"; team: { id: string }; user: { id: string; username?: string }; channel?: { id: string }; message?: { ts: string; thread_ts?: string }; actions: Array<{ action_id: "namos_proposal_approve" | "namos_proposal_reject"; value: string; action_ts: string }>; response_url?: string }`.
- `value` is base64url JSON `{ proposalId: string; expectedPayloadHash: string; eventId: string }`; it is treated as an identifier hint, never authority.
- Immediate response: empty `200` after receipt is claimed. Processor updates the original message with success/error state.
- Validation: signed raw body, supported type/action, known team/workspace, mapped Slack user, binding/event/proposal relationships, event organizer authorization, and existing agent proposal status/hash rules.

### New Internal Modules and Functions

**`convex/slackSecurity.ts`** (`"use node"` where Node crypto is required)

- `verifySlackRequest({ rawBody: string, timestamp: string | null, signature: string | null, signingSecret: string, nowMs?: number }): boolean`.
- Reject non-integer timestamps and absolute skew greater than 300 seconds.
- Compute `v0:${timestamp}:${rawBody}` with HMAC-SHA256; compare `v0=<hex>` using equal-length constant-time bytes.
- `sha256Base64Url(value: string): string`, `randomToken(): string`, and AES-256-GCM Slack token envelope helpers matching content integration conventions.

**`convex/slackClient.ts`** (`"use node"`)

- Use `fetch("https://slack.com/api/<method>")` with `Authorization: Bearer <decrypted token>` and JSON/form bodies.
- Typed helpers: `exchangeOAuthCode`, `listConversations`, `getConversation`, `getUser`, `postMessage`, `postEphemeral`, `updateMessage`, `revokeToken`.
- Require HTTP 2xx and parsed `{ ok: true }`; classify `ratelimited`/429 using `Retry-After`, transient 5xx, and permanent errors. Redact tokens and `response_url` from errors.

**`convex/slackInbound.ts`**

- `claimReceipt` internal mutation args `{ dedupeKey: string; kind: "event" | "command" | "interaction"; slackTeamId?: string; expiresAt: number }`, returns `{ claimed: boolean; receiptId?: Id<"slack_request_receipts"> }`; use `by_dedupe_key` and insert atomically.
- `processEvent` internal action args `{ receiptId; envelope }`, resolves workspace via `by_team`, ignores bot/subtype events, resolves channel binding via `by_workspace_channel`, resolves mapping via `by_workspace_user`, creates link response when absent, strips `<@BOT_ID>` and validates objective, then schedules/starts agent service.
- `processCommand` internal action args `{ receiptId; command }`, implements exact `help/status/ask` semantics and uses `response_url` only during its 30-minute/five-response validity; later results use bot token and `chat.postMessage`.
- `processInteraction` internal action args `{ receiptId; interaction }`, re-resolves every stored entity and actor, calls shared approval/rejection service, then `chat.update` removes controls.
- `markReceipt` internal mutation args `{ receiptId; status: "processed" | "failed"; error?: string }`, stores only a redacted safe error.
- Raw verified bodies are not persisted. The parsed scheduled payload keeps only fields needed for routing and response; `response_url` is passed as a scheduled argument only when required and never logged/stored in database tables.

**`convex/slackAgent.ts`**

- `createRunFromSlack` internal mutation args `{ eventId; requestedByUserId; objective; idempotencyKey; slackWorkspaceId; slackChannelId; slackThreadTs; slackUserId }`, returns `{ runId }`. It loads user/event membership by IDs, calls the shared agent create service, then upserts the thread mapping.
- `respondFromSlack` internal mutation args `{ eventId; runId; requestedByUserId; message; idempotencyKey }`, returns `{ runId }`; it rechecks actor authorization and legal run status.
- `approveFromSlack` internal mutation args `{ eventId; proposalId; expectedPayloadHash; requestedByUserId }`, returns `{ createdTaskIds }`; it invokes the shared hash-bound application logic.
- `rejectFromSlack` internal mutation args `{ eventId; proposalId; requestedByUserId; reason?: string }`, returns `{ rejected: true }`.
- `projectRunUpdate` internal action args `{ runId }` reads mapping/run/events/proposals, creates accessible Block Kit, and posts/updates only when a meaningful state changes. Store last projected run update in the thread mapping only if implementation needs it for exact duplicate suppression; if added, document the optional schema field before coding.

**`convex/slackNotifications.ts`**

- `enqueueEventNotification` internal mutation args `{ eventId; kind: SlackNotificationKind; title; body?; linkPath?; relatedId?; dedupeKey: string; sourceNotificationId?: Id<"notifications"> }`, returns `{ queued: boolean; outboxId?: Id<"slack_delivery_outbox"> }`. Resolve `by_event`, require enabled/kind selected, claim `by_dedupe_key`, insert queued, schedule delivery.
- `deliver` internal action args `{ outboxId }`. Internal mutation atomically moves queued/failed-due → sending and increments attempts. Decrypt token, post Block Kit, mark sent with timestamp. On 429/transient error, set failed with `nextAttemptAt` and schedule bounded exponential retry: 30 seconds, 2 minutes, 10 minutes, then stop after four total attempts. Permanent failure stops immediately and marks workspace error.
- `cleanupEphemeral` internal mutation invoked daily by cron removes expired OAuth states/link tokens/receipts in bounded batches.

### Slack App Configuration

Add `docs/runbooks/slack-integration.md` and `slack-manifest.example.yaml`. The manifest must be parameterized/documented, never contain a live host or secret. Required bot scopes for version one:

- `app_mentions:read`
- `chat:write`
- `commands`
- `channels:read`
- `groups:read`
- `im:history` and `im:read` only because direct messages are in scope

Subscribe to `app_mention` and `message.im`. Interactivity points to `/slack/interactions`, slash command `/namos` points to `/slack/commands`, event requests point to `/slack/events`, and OAuth redirects to `/oauth/slack/callback`. Private-channel history is not required because Namos processes mentions delivered to the app; the app must be invited to a private channel before binding it.

## Frontend Components

### Modified Components

| File path | Exact change |
|---|---|
| `src/pages/settings/Integrations.tsx` | Import Lucide `Slack`; add `slackStatus` and `slackOpen`; include `repo.slackIntegrations.status(event.id)` in the existing load; render Slack card in Messaging & Communication after email providers; add a Slack dialog containing `SlackIntegrationForm`. Map safe state to the existing card union only: no workspace → `not_connected`, workspace/binding connected → `connected`, permanent integration failure → `error`; convey channel-required/Needs-attention context in `detail`. Preserve existing integrations and errors. |
| `src/data/types.ts` | Add `SlackNotificationKind`, `SlackIntegrationStatus`, `SlackChannel`, and `SlackChannelBindingInput` exact DTOs matching safe function returns. No token/state/secret fields. |
| `src/data/repo.ts` | Add `SlackIntegrationsRepo` with `status`, `startOAuth`, `listChannels`, `saveBinding`, `updateBinding`, `removeBinding`, `disconnectWorkspace`, `claimLink`, and `testNotification`; add `slackIntegrations` to `Repository`. |
| `src/data/transport.ts` | Add status to read operations and all Slack writes/actions to operation typing/mapping. Ensure action operations are distinguished from query/mutation operations. |
| `src/data/convex/index.ts` | Map Slack repository operations to generated Convex API functions, mark networked functions as actions, and normalize ID/timestamp/array fields without exposing envelopes. |
| `src/lib/analytics.ts` | No route addition is required: `/settings/integrations` is already in `eventRouteSuffixes` (`src/lib/analytics.ts:166`). Add only provider-safe interaction events if existing analytics naming supports it; never include team/channel/user names or IDs. |

### New Component: `SlackIntegrationForm`

- File: `src/components/shared/SlackIntegrationForm.tsx`
- Props:

```ts
export interface SlackIntegrationFormProps {
  eventId: EventId;
  eventSlug: string;
  onStatusChange?: (status: SlackIntegrationStatus) => void;
}
```

- Location: Settings modal > Integrations > Messaging & Communication > Slack card dialog. The surrounding `DialogContent` in `Integrations.tsx` uses `max-h-[90vh] max-w-2xl overflow-y-auto` and `DialogHeader` title `Slack`.
- Data access: client-side through `useRepo()`. On mount and after OAuth query-param handling, call `repo.slackIntegrations.status(eventId)`. When a workspace exists, call `listChannels` only after the user opens the channel selector or clicks Refresh channels; do not fetch continuously.
- Local state:

```ts
status: SlackIntegrationStatus | null
channels: SlackChannel[]
selectedChannelId: string
agentEnabled: boolean
notificationsEnabled: boolean
notificationKinds: SlackNotificationKind[]
isLoading: boolean
isConnecting: boolean
isLoadingChannels: boolean
isSaving: boolean
isTesting: boolean
isRemoving: boolean
isDisconnecting: boolean
error: string | undefined
success: string | undefined
confirmRemoveOpen: boolean
confirmDisconnectOpen: boolean
```

- Shared root: `space-y-6`; every configuration section uses `space-y-3`; passive metadata cards use `rounded-lg bg-muted/60 p-4` with no border/shadow; action rows use `flex flex-wrap items-center gap-2`.

#### Loading output

- Root has `aria-busy="true"` and `space-y-4`.
- Three skeletons: `h-16 w-full animate-pulse rounded-lg bg-muted`, `h-10 w-full animate-pulse rounded-md bg-muted`, and `h-24 w-full animate-pulse rounded-lg bg-muted`.
- Screen-reader text: `Loading Slack integration…` with `sr-only`.

#### Not-connected output

- Intro paragraph: `Connect your Slack workspace to run event operations and receive selected updates in one event channel.` class `text-sm text-muted-foreground`.
- Permission summary card `rounded-lg bg-muted/60 p-4 space-y-2`, heading `What Namos can do` class `text-sm font-medium`, list `space-y-1 text-sm text-muted-foreground` containing `Read mentions and direct messages sent to Namos`, `Post agent replies and event notifications`, and `List channels so you can choose an event channel`.
- Privacy sentence: `Namos does not import channel history or match people by email.` class `text-xs text-muted-foreground`.
- Primary button: Lucide `Slack` icon `h-4 w-4`, label `Connect Slack`, `variant="accent"`, `size="sm"`; disabled while connecting. Click calls `startOAuth`, then `window.location.assign(url)`. No blue button.

#### Workspace-connected, no-channel output

- Workspace card `rounded-lg bg-muted/60 p-4` with label `Workspace`, team name `font-medium`, `StatusBadge status="connected"`, and safe last-error text if present.
- Channel field: `Label` text `Event channel`; shadcn `Select`, not native select; trigger `bg-background`; placeholder `Choose a channel`; items show `#name` plus `Private` and `Invite Namos first` text where applicable. Non-member private items are disabled.
- Refresh control: `Button variant="ghost" size="sm"`, Lucide `RefreshCw h-4 w-4`, label `Refresh channels`; calls `listChannels`; spin/disable while loading.
- Empty channel list: `No eligible channels found. Invite Namos to a channel, then refresh.` class `rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground`.
- Error loading channels: inline `role="alert"` class `text-sm text-destructive` and `Try again` ghost button.

#### Capability controls (shown when a channel is selected or bound)

- Agent row `flex items-start justify-between gap-4 rounded-lg bg-muted/60 p-4`: label `Operations Agent`, description `Use @Namos and /namos ask for this event.`, shadcn `Switch` checked from `agentEnabled`, accessible label via `Label htmlFor`.
- Notification row same classes: label `Event notifications`, description `Post selected event updates to this channel.`, `Switch` checked from `notificationsEnabled`.
- When notifications are enabled, render `fieldset className="space-y-2 rounded-lg bg-muted/60 p-4"`, legend `Send these updates`, and five checkbox rows with exact labels: `New submission received`, `Reviewer assigned`, `Evaluation completed`, `Decision sent`, `Communication delivery failed`. Each row is `flex items-start gap-3 text-sm`; descriptions explain the event and do not expose email/body contents beyond the existing notification title/body.
- Validation text below capability controls: `Turn on the Operations Agent or at least one notification type.` class `text-xs text-destructive`, shown when both switches are off or notifications are on with no types.

#### Bound output and actions

- Channel summary in workspace card: `Channel` label plus `#channelName`; show `Private` as text badge, never by icon/color alone.
- Save button: `Button variant="accent" size="sm"`, label `Save channel` for first bind or `Save changes` for existing; disabled until a channel is selected, validation passes, or while saving. First bind calls `saveBinding`; later setting-only edit calls `updateBinding`; success reloads status, calls `onStatusChange`, announces `Slack settings saved.` and does not close the dialog.
- Test button: `Button variant="outline" size="sm"`, Lucide `Send h-4 w-4`, label `Send test`; visible only for a bound notification-enabled channel; calls `testNotification`; success `Test message sent to #channel.`.
- Remove event binding: `Button variant="ghost" size="sm"`, label `Remove from this event`; opens `AlertDialog`. Confirmation title `Remove Slack from this event?`, body states workspace connection remains for other events, cancel `Keep connection`, destructive action `Remove channel`. On success return to workspace-connected state.
- Disconnect workspace: visible only when `canDisconnectWorkspace`; `Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"`, label `Disconnect workspace`; opens separate `AlertDialog`. Body warns all organization event bindings will stop. Confirm `Disconnect Slack`, cancel `Cancel`; calls `disconnectWorkspace`, then shows not-connected state.
- Never hide destructive scope differences: removing the event binding and disconnecting the organization workspace are distinct controls and confirmations.

#### OAuth/account-link/error output

- Read `slack=connected|error` and `reason` from `window.location.search` on mount. Show success `Slack workspace connected. Choose a channel for this event.` in `text-sm text-emerald-700 dark:text-emerald-300`, or safe failure in `text-sm text-destructive`; then use `window.history.replaceState` to remove only Slack callback params while preserving `/events/:eventSlug/settings/integrations`.
- Read `slack_link=<raw token>` only on the Integrations route. Immediately call `claimLink({ eventId, token })` once, replace the URL to remove the token before rendering success, and show `Slack account linked for this event.`. Never persist the raw token in local/session storage, analytics, or error text.
- Global error region is immediately above actions: `role="alert" className="text-sm text-destructive"`. Global success region: `role="status" aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300"`.

### Slack Message UI Contracts

These are server-generated Block Kit, but they are user-facing components and must be implemented exactly enough to verify:

**Agent acknowledgement**

- Top-level fallback: `Namos started an Operations Agent run for {eventName}.`
- Blocks: header `Namos Operations`; section with sanitized objective (max 500 visible chars); context with event name and status `Running`; button `Open in Namos` using the run deep link.
- Post as thread root for `/namos ask`; for an `app_mention`, reply with `thread_ts = event.thread_ts ?? event.ts`.

**Clarification**

- Fallback: `Namos needs more information for {eventName}.`
- Section with one question and instruction `Reply in this thread to continue.`; context with event name; open-run button.

**Final result**

- Fallback: `Namos completed an Operations Agent run for {eventName}.`
- Header, concise final summary capped for Slack, optional evidence links, status context, open-run button. Never render hidden reasoning/tool internals.

**Task proposal**

- Fallback: `Namos proposed {count} task(s) for {eventName}; approval is required.`
- Header `Task proposal`; summary section; one section per task up to 10 with bold escaped title and plain target/due date/reason; if more, show first 10 plus `Open in Namos to review {remaining} more.`
- Actions: primary-styled Slack button `Approve & create` action ID `namos_proposal_approve`; danger-styled `Reject` action ID `namos_proposal_reject`; `Open in Namos` link button. Slack button color is controlled by Slack, not app CSS and does not violate the web UI blue-button rule.
- After decision, replace action buttons with context `Applied by <@USER>` or `Rejected by <@USER>` and keep only `Open in Namos`.

**Event notification**

- Fallback equals a concise `${eventName}: ${title}`.
- Section with title/body, context with event name and notification type label, and link button `Open in Namos` when `linkPath` exists.
- Test message is explicitly prefixed `Test — Slack notifications are connected for {eventName}.`.

## State / Data Flow

```text
SettingsModal
  → Integrations (client page) calls repo.slackIntegrations.status(eventId)
  → transport maps to slackIntegrations:status
  → events[eventId] → slack_workspaces[organizationId] → slack_channel_bindings[eventId]
  → safe SlackIntegrationStatus DTO
  → IntegrationCard status/detail + SlackIntegrationForm controls

Connect Slack
  → SlackIntegrationForm.startOAuth(eventId)
  → owner/admin authorization → random state → slack_oauth_states(stateHash)
  → browser redirects to Slack OAuth
  → GET .convex.site/oauth/slack/callback
  → consume state → Slack oauth.v2.access → encrypt bot token → slack_workspaces
  → redirect to /events/:slug/settings/integrations?slack=connected

Bind channel
  → listChannels action decrypts token server-side → Slack conversations.list
  → user selects channel and capabilities
  → saveBinding action verifies Slack channel + Namos uniqueness/authorization
  → slack_channel_bindings upsert
  → status query re-renders card/form

Slack mention or /namos ask
  → HTTP action verifies raw-body signature and claims slack_request_receipts
  → immediate HTTP 200
  → scheduled processor resolves team → channel binding → user mapping → event authorization
  → shared AgentRuns service inserts/reuses agent_runs + maps slack_agent_threads
  → existing workflow/runtime/tools update agent_run_events/proposals
  → projection hook posts clarification/final/proposal Block Kit to the mapped Slack thread

Proposal click
  → signed /slack/interactions → durable receipt → immediate HTTP 200
  → mapping + event authorization + proposal/event/hash checks
  → existing exact-payload approve/reject service
  → agent_action_proposals/task records update exactly once
  → Slack chat.update removes buttons and displays final state

Domain notification
  → notifyEvent inserts recipient-specific notifications
  → once-per-source enqueueEventNotification checks event binding/kind
  → slack_delivery_outbox(dedupeKey, queued)
  → scheduled deliver → Slack chat.postMessage → sent timestamp or bounded retry
```

Every displayed client value traces as follows:

| UI value | Database source | Server response | Component/render |
|---|---|---|---|
| Workspace name/status | `slack_workspaces` via `by_organization` | `SlackIntegrationStatus.teamName/state/lastError` | Integration card detail and workspace card |
| Bound channel | `slack_channel_bindings` via `by_event` | `channelId/channelName/isPrivate` | Select value and channel summary |
| Capability switches | `slack_channel_bindings` | `agentEnabled/notificationsEnabled` | Switch checked state |
| Notification checkboxes | `slack_channel_bindings.notificationKinds` | `notificationKinds[]` | Checkbox checked state |
| Eligible channel list | Slack `conversations.list`, server token only | `SlackChannel[]` | Select items; no DB/channel list cache required in v1 |
| Agent status/result/proposal | Existing `agent_runs`, `agent_run_events`, `agent_action_proposals` | Internal Slack projection DTO | Bot thread Block Kit and Namos deep link |
| Event notification | Existing notification call input plus binding | Outbox fields | Channel Block Kit |

Reactive Convex query updates trigger the settings re-render. Slack itself is not reactive; internal actions post/update messages only after durable state changes.

## Auth / Permissions

- Public endpoints: only the four Slack HTTP routes. Callback state or request signature authenticates the caller; none returns event data directly.
- Browser access: Clerk `ctx.auth.getUserIdentity()` is mandatory. Status/config/account-link functions call `assertEventOrganizerAccess(eventId)`.
- Organization installation/disconnect: caller must have an `organizers` row indexed by `organizationId + identity.subject` with role owner/admin. An event-only `event_members.role === "organizer"` can bind a channel after installation but cannot install/disconnect the organization's workspace.
- Slack user access: explicit `slack_user_mappings` only. No email auto-link. The stored `namosUserId` is rechecked against organization/event membership on every operation; deleting/removing access immediately causes later Slack requests to fail closed even if the mapping remains.
- Reviewer/speaker/unlinked behavior: ephemeral link/access-denied copy only; no event counts, names beyond the already bound channel context, run data, proposal data, or notifications.
- Secrets: token encryption/decryption and signing secret are action-only. Browser DTOs expose IDs/names/configuration but never token envelope, OAuth state, link token hash, request body, signing material, or Slack `response_url`.

## Edge Cases & Error States

| Scenario | Handling |
|---|---|
| Settings status loading | Render three skeletons with `aria-busy`; do not flash `Not connected`. |
| No organization ID on event | Fail closed with configuration error; do not create a workspace row. |
| Missing Slack environment variable | Start/callback/request fails with safe setup message; no fake connected state. |
| OAuth denied by user | Redirect with `slack=error&reason=access_denied`; existing connection remains unchanged. |
| OAuth state missing, expired, reused, or subject lost role | Reject callback; do not exchange/store token. |
| Slack team already belongs to another Namos organization | Reject install with safe conflict message; never reassign automatically. |
| Reinstall same organization/team | Replace encrypted bot token/scopes/bot user atomically; preserve valid bindings after re-verifying channels asynchronously. |
| Channel list empty or pagination >1 page | Paginate to cap 500; render explicit empty state. |
| Private channel without bot membership | Disable selection and instruct organizer to invite Namos. |
| Channel archived/deleted/renamed | IDs keep routing stable; refresh updates display name. Deleted/archived channel marks binding error and stops sends. |
| Same channel selected for second event | Server rejects using `by_workspace_channel`; UI says channel is already connected to another Namos event without naming unauthorized event details. |
| Both capabilities disabled | Client and server reject save; remove binding is the explicit way to disable everything. |
| Notifications enabled with zero kinds | Client/server validation error. |
| Forged or stale Slack request | `401`; no receipt or lookup. |
| Slack URL verification | Verify signature, return challenge synchronously, no receipt/agent work. |
| Duplicate Slack event/retry | Existing dedupe receipt returns 200; no duplicate processing. |
| Bot/message subtype event | Mark receipt processed/ignored; no response loop. |
| Unbound channel | Ephemeral/help response when response mechanism exists; otherwise ignore without leaking event list. |
| Unlinked Slack user | Create one expiring link URL and send ephemeral/DM response; do not invoke agent. |
| Link token copied to a different Namos user | Claim still requires that signed-in user be an organizer for the exact event; first valid claim consumes token. |
| Removed organizer with old Slack mapping | Reauthorization fails; mapping may be deleted/marked stale; no event data returned. |
| DM maps to multiple bound events | Return an event-choice message with safe deep links; do not guess or start a run. |
| Empty or >4,000-character objective | Ephemeral validation copy; no run. |
| Slash command used inside desired thread | Explain Slack commands cannot be invoked in threads and direct the user to mention/reply. |
| Agent disabled for binding | Return ephemeral `Operations Agent is off for this event` with Settings link. |
| Missing AI provider/key/quota | Existing agent run records a durable failure; Slack posts safe failure plus run link. |
| Agent needs clarification | Post one thread question; authorized linked reply resumes once. |
| Concurrent thread replies | Stable Slack timestamp-derived idempotency keys serialize/dedupe; each accepted unique reply is ordered by receipt time. |
| Proposal has more than ten tasks | Show first ten and require Namos deep link for remainder; approval still references full stored hash. |
| Proposal stale/already applied/rejected | Do not reapply; update message with current durable state. |
| Slack action from different user | Resolve clicked Slack user mapping and independently authorize; never trust original message actor. |
| Slack returns 429 | Respect `Retry-After`; persist and schedule bounded retry. |
| Slack returns invalid_auth/account_inactive | Mark workspace error; show Needs attention in Settings; stop automatic retries. |
| Outbound Slack post times out after Slack accepted | Retry uses outbox dedupe. Because Slack `chat.postMessage` lacks a general idempotency key, include stable `client_msg_id` where supported and reconcile stored timestamp where possible; tests document residual duplicate risk. |
| Disconnect while work is queued | Delivery/processor re-resolves live workspace/binding before posting and marks work failed/ignored. |
| OAuth/account-link URL contains raw token | Remove query param immediately after consumption attempt and exclude from analytics/logs. |

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Product boundary | Organization install + event channel binding | Matches current tenancy and gives each message one event context. |
| Agent | Reuse existing Operations Agent | Preserves tools, provider/billing, audit events, and approval safety; avoids divergent behavior. |
| Runtime | Convex HTTP actions + scheduler/workflow | Correct public webhook host and durable execution outside Slack's three-second acknowledgement window. |
| Slack SDK | No new package in v1; typed `fetch` helpers | Required API surface is small, current repo has no Slack SDK, and signature/OAuth behavior remains explicit/testable. |
| Dedupe | Persistent receipts/outbox | Survives process restarts and Slack retries; improves on Takumi's in-memory set. |
| Identity | Explicit one-time authenticated linking | Email matching is unsafe and can cross identity/tenant boundaries. |
| Channel model | One channel per event and one event per channel | Eliminates ambiguous mention routing in version one. |
| Notifications | Selected high-value kinds only | Avoids channel noise and recipient-loop duplicates. |
| Proposal actions | Existing stored hash-bound approval service | Slack does not become a privileged write bypass. |
| Token storage | AES-256-GCM with dedicated key | Matches current integration secret handling and separates Slack blast radius. |
| URLs | `CONVEX_SITE_URL` for callbacks/webhooks; `PUBLIC_APP_ORIGIN` for user links | No environment-specific host is hardcoded. |

## Dependencies

**Requires:**

- Existing multi-tenant organization/event authorization and completed organization backfill.
- Existing Operations Agent runtime, run/proposal tables, provider configuration, workflow component, and task approval service.
- A Slack sandbox workspace and a separately created Namos Slack app configured from the checked-in manifest/runbook.
- Convex deployment environment values: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_INTEGRATION_ENCRYPTION_KEY`, `CONVEX_SITE_URL`, and `PUBLIC_APP_ORIGIN`.
- Existing Clerk sign-in and settings deep-link handling.

**Enables:**

- Future multi-channel rules, Slack App Home, marketplace distribution, operational shortcuts, and additional approved agent actions without weakening tenancy or dedupe foundations.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Forged/replayed Slack request | Raw-body HMAC, five-minute skew check, timing-safe comparison, durable receipt. |
| Slack identity confused with Namos identity | Explicit expiring link + Clerk auth + event authorization on every action. |
| Cross-event message routing | Unique workspace/channel binding and server-derived event ID. |
| Secret exposure | Dedicated environment variables, AES-GCM envelope, safe DTOs, redacted errors, no raw request storage. |
| Three-second Slack timeout | Verify/claim/schedule/ack only; all network/AI/domain work runs afterward. |
| Duplicate agent runs/tasks/messages | Event/body idempotency keys, persistent receipts/outbox, existing hash-bound task apply. |
| Notification spam | Opt-in binding, capability switch, five selected kinds, one event-level enqueue. |
| Slack API drift | Isolate typed Web API helpers and contract-test representative Slack responses/errors. |
| Token revoked or channel removed | Mark integration Needs attention, halt retries on permanent errors, provide reconnect/refresh UI. |
| Feature reported done without real Slack proof | Release checklist requires live OAuth, signed webhook, mention, command, account-link, proposal, notification, retry, and disconnect evidence in a sandbox. |
