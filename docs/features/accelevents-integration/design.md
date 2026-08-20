# Accelevents One-Way Integration — Technical Design

> **Partially superseded, 2026-08-17.** See
> [`BRIEF-RECONCILIATION-2026-08-17.md`](./BRIEF-RECONCILIATION-2026-08-17.md). The four-table
> schema, mapping/idempotency model, eligibility rules, and speakers-before-sessions ordering all
> stand. The authorization design (`EVENT_ADMIN_USER_IDS`, referenced around lines 161, 435, and
> 495) and the three-secret environment design (around lines 498-500) predate this codebase's
> row-based `organizers` / `event_members` model and its shared
> `convex/credentialEncryption.ts` pattern, and are replaced there.

## Scope Decision and Evidence

The product owner reopened a feature the competition brief had struck. The existing commercial
integration defines the useful behavior: Sessionboard is the program source of truth; accepted
sessions/speakers flow to Accelevents; initial save triggers transfer; periodic resync runs hourly
or every 15 minutes near/live; manual resync is available; mapped source fields are restored on
resync while Accelevents-only settings survive.

Accelevents' public documentation confirms API-key authentication and host endpoints for speaker
and session create/update. Its published OpenAPI is incomplete around assigning speakers to a
session and contains at least one suspect type (`linkedIn` is documented as boolean). Therefore,
the implementation has a hard credentialed-sandbox contract gate: capture and fixture the exact
working request/response for create speaker, update speaker, create session, update session, and
speaker assignment before production sync is enabled. Do not guess around an undocumented field.

## Database / Schema Changes

### Current Schema (affected tables)

From `convex/schema.ts`:

```ts
events: defineTable({
  name: v.string(), slug: v.string(), type: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  location: v.optional(v.string()), timezone: v.string(), startDate: v.number(), endDate: v.number(),
  theme: v.optional(v.string()), logoStorageKey: v.optional(v.string()), backgroundStorageKey: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]),

speakers: defineTable({
  eventId: v.id("events"), email: v.string(), firstName: v.string(), lastName: v.string(),
  bio: v.optional(v.string()), salutation: v.optional(v.string()), honorific: v.optional(v.string()),
  pronouns: v.optional(v.string()), gender: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()), xUrl: v.optional(v.string()),
  facebookUrl: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  headshotStorageKey: v.optional(v.string()),
  status: v.union(v.literal("invited"), v.literal("active"), v.literal("inactive")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_event_email", ["eventId", "email"]),

submissions: defineTable({
  eventId: v.id("events"), formId: v.id("submission_forms"),
  speakerId: v.optional(v.id("speakers")), tagIds: v.optional(v.array(v.id("tags"))),
  title: v.string(),
  status: v.union(v.literal("draft"), v.literal("pending"), v.literal("accept_queue"),
    v.literal("accepted"), v.literal("decline_queue"), v.literal("declined"), v.literal("withdrawn")),
  answers: v.any(), submittedAt: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_form", ["formId"]).index("by_speaker", ["speakerId"]),

agenda_items: defineTable({
  eventId: v.id("events"), submissionId: v.optional(v.id("submissions")), title: v.string(),
  roomId: v.id("rooms"), trackId: v.optional(v.id("tracks")), startTime: v.number(), endTime: v.number(),
  speakerIds: v.array(v.id("speakers")), isPublished: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_room", ["roomId"]).index("by_submission", ["submissionId"]),
```

### Required Changes

```ts
accelevents_integrations: defineTable({
  eventId: v.id("events"),
  eventUrl: v.string(),
  externalEventId: v.number(),
  credentialHint: v.string(),
  credentialEnvelope: v.object({
    version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string(),
  }),
  status: v.union(v.literal("connected"), v.literal("error"), v.literal("disconnected")),
  autoSyncEnabled: v.boolean(),
  lastAttemptAt: v.optional(v.number()),
  lastSuccessfulSyncAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  updatedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
  .index("by_auto_sync_status", ["autoSyncEnabled", "status"]),

accelevents_entity_mappings: defineTable({
  eventId: v.id("events"),
  entityType: v.union(v.literal("speaker"), v.literal("session")),
  localId: v.string(),
  externalId: v.string(),
  sourceHash: v.string(),
  lastSyncedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event_entity", ["eventId", "entityType"])
  .index("by_event_entity_local", ["eventId", "entityType", "localId"])
  .index("by_event_entity_external", ["eventId", "entityType", "externalId"]),

accelevents_sync_runs: defineTable({
  eventId: v.id("events"),
  trigger: v.union(v.literal("initial"), v.literal("manual"), v.literal("scheduled"), v.literal("retry")),
  status: v.union(v.literal("queued"), v.literal("running"), v.literal("succeeded"),
    v.literal("partial"), v.literal("failed"), v.literal("cancelled")),
  requestedByUserId: v.optional(v.string()),
  total: v.number(), created: v.number(), updated: v.number(), unchanged: v.number(),
  skipped: v.number(), failed: v.number(),
  startedAt: v.optional(v.number()), completedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_event_created", ["eventId", "createdAt"])
  .index("by_status_created", ["status", "createdAt"]),

accelevents_sync_items: defineTable({
  eventId: v.id("events"),
  runId: v.id("accelevents_sync_runs"),
  entityType: v.union(v.literal("speaker"), v.literal("session")),
  localId: v.string(),
  displayName: v.string(),
  operation: v.union(v.literal("create"), v.literal("update"), v.literal("unchanged"), v.literal("skip")),
  status: v.union(v.literal("pending"), v.literal("running"), v.literal("succeeded"), v.literal("skipped"), v.literal("failed")),
  externalId: v.optional(v.string()),
  sourceHash: v.string(),
  attemptCount: v.number(),
  errorCode: v.optional(v.string()),
  message: v.optional(v.string()),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_run", ["runId"])
  .index("by_event_entity_local", ["eventId", "entityType", "localId"]),
```

| Table | Action | Column/Index | Type | Notes |
|---|---|---|---|---|
| `accelevents_integrations` | ADD | full table + two indexes | as above | One destination per event; encrypted key only |
| `accelevents_entity_mappings` | ADD | full table + three indexes | as above | Durable idempotency mapping |
| `accelevents_sync_runs` | ADD | full table + two indexes | as above | Aggregate operational evidence |
| `accelevents_sync_items` | ADD | full table + two indexes | as above | Per-record recovery and UI detail |
| existing domain tables | NONE | — | — | Do not contaminate speaker/session records with provider fields |

### Migration

Add four new tables only. No existing-row backfill is required. The first preview/sync derives
eligibility from current event, speaker, submission, agenda, room, track, and file records. Existing
events start disconnected. Seed records may add a fake, secret-free completed run; never seed an
API key or credential envelope.

## Backend / API

### Affected Existing Endpoints

| Method / function | Path / name | Current behavior | Change |
|---|---|---|---|
| Convex query | `events:list` | Returns event documents | Read-only source for integration UI/event scope |
| Convex query | `speakers:list` | Lists event speakers | Read-only source for preflight/export |
| Convex query | `submissions:list` | Lists event submissions | Filter to `accepted` only |
| Convex query | `agenda:list` | Lists event agenda items | Filter to published scheduled items |
| Convex query | `events:listRooms` | Lists event rooms | Resolve session location |
| Convex query | `speakers:headshotUrl` | Resolves fresh storage URL | Server export must use equivalent service-only resolver |
| React provider | `src/data/provider.tsx` | Mounts Clerk only for Airtable | Mount Clerk whenever configured so organizer integration calls can obtain a token |
| Account UI | `src/components/AccountMenu.tsx` | Demo user in Convex mode | Show verified user/sign-out when Clerk is configured; preserve explicit demo mode only when auth is absent |

### Browser-Facing Cloudflare Endpoints

All responses set `cache-control: no-store`. All endpoints verify Clerk with
`CLERK_SECRET_KEY`/`CLERK_JWT_KEY`, optional `CLERK_AUTHORIZED_PARTIES`, and
`EVENT_ADMIN_USER_IDS`. The browser sends `Authorization: Bearer <Clerk token>`.

| Method | Path | Request Body | Response |
|---|---|---|---|
| GET | `/api/accelevents-status?eventId=:id` | none | `{ integration: null | { eventUrl: string, externalEventId: number, credentialHint: string, status: "connected"|"error"|"disconnected", autoSyncEnabled: boolean, lastAttemptAt?: number, lastSuccessfulSyncAt?: number, lastError?: string }, latestRun: SyncRunSummary | null }` |
| POST | `/api/accelevents-connect` | `{ eventId: string, eventUrl: string, externalEventId: number, apiKey: string, autoSyncEnabled: boolean }` | `{ status: "connected", eventUrl: string, externalEventId: number, credentialHint: string, autoSyncEnabled: boolean }` |
| POST | `/api/accelevents-preview` | `{ eventId: string }` | `{ counts: { speakers: number, sessions: number, unchanged: number, blocked: number }, items: Array<{ entityType: "speaker"|"session", localId: string, displayName: string, operation: "create"|"update"|"unchanged"|"skip", valid: boolean, reasons: string[] }> }` |
| POST | `/api/accelevents-sync-start` | `{ eventId: string, trigger: "initial"|"manual"|"retry", failedRunId?: string }` | `202 { runId: string, status: "queued" }` |
| GET | `/api/accelevents-sync-run?eventId=:id&runId=:id` | none | `{ run: SyncRunSummary, items: SyncRunItem[] }` |
| PATCH | `/api/accelevents-settings` | `{ eventId: string, autoSyncEnabled: boolean }` | `{ autoSyncEnabled: boolean }` |
| POST | `/api/accelevents-disconnect` | `{ eventId: string, confirmation: "DISCONNECT" }` | `{ status: "disconnected" }` |

`SyncRunSummary` is exactly:

```ts
type SyncRunSummary = {
  id: string;
  trigger: "initial" | "manual" | "scheduled" | "retry";
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
  total: number; created: number; updated: number; unchanged: number; skipped: number; failed: number;
  startedAt?: number; completedAt?: number; createdAt: number;
};
```

`SyncRunItem` is exactly:

```ts
type SyncRunItem = {
  id: string; entityType: "speaker" | "session"; localId: string; displayName: string;
  operation: "create" | "update" | "unchanged" | "skip";
  status: "pending" | "running" | "succeeded" | "skipped" | "failed";
  externalId?: string; attemptCount: number; errorCode?: string; message?: string;
};
```

### New Service-Only Convex Functions

File: `convex/acceleventsIntegrations.ts`

| Function | Type | Args | Return / behavior |
|---|---|---|---|
| `getForService` | query | `{ eventId: Id<"events">, serviceSecret: string }` | Full connection including envelope; service secret required |
| `getStatusForService` | query | same | Status with envelope removed |
| `upsertForService` | mutation | connection fields + service secret | Insert/patch `by_event` |
| `setAutoSyncForService` | mutation | `{ eventId, autoSyncEnabled, updatedByUserId, serviceSecret }` | Patch toggle |
| `recordResultForService` | mutation | `{ eventId, lastAttemptAt, lastSuccessfulSyncAt?, lastError?, serviceSecret }` | Patch connection status safely |
| `removeForService` | mutation | `{ eventId, serviceSecret }` | Delete connection only |
| `listAutoSyncForService` | query | `{ serviceSecret }` | Connected auto-sync configs, no decrypted key |

File: `convex/acceleventsSync.ts`

| Function | Type | Args | Return / behavior |
|---|---|---|---|
| `buildExportForService` | query | `{ eventId, serviceSecret }` | Validated speaker/session DTO sources; no credential |
| `listMappingsForService` | query | `{ eventId, serviceSecret }` | Mappings by event |
| `upsertMappingForService` | mutation | `{ eventId, entityType, localId, externalId, sourceHash, serviceSecret }` | Idempotent mapping patch/insert |
| `createRunForService` | mutation | `{ eventId, trigger, requestedByUserId?, items, serviceSecret }` | Inserts one run/items, returns run ID |
| `claimRunForService` | mutation | `{ runId, serviceSecret }` | Atomically queued→running; duplicate worker exits |
| `recordItemForService` | mutation | item outcome + service secret | Patches item and aggregate counts |
| `completeRunForService` | mutation | `{ runId, status, serviceSecret }` | Completes run |
| `getRunForService` | query | `{ eventId, runId, serviceSecret }` | Run + items for authorized wrapper |
| `latestRunForService` | query | `{ eventId, serviceSecret }` | Latest by `by_event_created` |

### Background and Scheduled Work

- A background Convex action invoked with `{ runId }` claims the run, decrypts credentials,
  processes speakers then sessions, records every result, and completes the run.
- A scheduled dispatcher reads connected auto-sync integrations and enqueues work. It skips events
  outside the 48-hour window when their last attempt is less than one hour old. It only dispatches;
  remote synchronization stays in the background action.
- Prevent overlapping runs: `createRunForService` returns the active queued/running run for that
  event instead of inserting a second one.

### Accelevents Client Contract

Implement the client in the Convex Node-action layer. Use native `fetch`; no third-party package
is installed or needed. The base URL is the constant vendor API origin, not a user-configurable URL.
Authentication is the documented API-key header. Time strings are formatted in `events.timezone`
as `yyyy/MM/dd HH:mm`.

| Operation | Remote method/path | Body owned by this app |
|---|---|---|
| list speakers | GET `/rest/host/event/{eventUrl}/speaker?eventId={externalEventId}&page=0&size=100&expand=SPEAKER` | none; paginate until complete |
| create speaker | POST `/rest/host/event/{eventUrl}/speaker` | `{ firstName, lastName, email, pronouns?, bio?, linkedIn?, twitter?, imageUrl?, allowOverrideDetails: true }` |
| update speaker | PUT `/rest/host/event/{eventUrl}/speaker/{externalId}` | same mapped fields; include remote ID only if sandbox contract requires it |
| list sessions | GET `/rest/host/event/{eventUrl}/session?eventId={externalEventId}&page=0&size=100&expand=SPEAKER` | none; paginate until complete |
| create session | POST `/rest/host/event/{eventUrl}/session` | `{ title, description?, startTime, endTime, location, format: "BREAKOUT_SESSION", sessionVisibilityType: "PUBLIC", status: "VISIBLE", <sandbox-verified speaker association> }` |
| update session | PUT `/rest/host/event/{eventUrl}/session/{externalId}` | same mapped fields; never send Accelevents-only streaming/ticket/chat/private configuration |

The `speaker association` placeholder is a deliberate hard gate, not license to improvise. Before
implementation proceeds beyond the client:

1. Use an owner-generated Enterprise API key and disposable Accelevents event.
2. Create one speaker, create one session, associate that speaker, then retrieve both.
3. Save sanitized request/response fixtures under `src/test/fixtures/accelevents/`.
4. Encode the exact property in Zod schemas in `_accelevents-client.mjs`.
5. If the public API cannot assign speakers, stop and document the provider limitation; do not
   claim the core integration is complete.

### Validation & Business Logic

- Normalize `eventUrl` to the slug only: 1–160 lowercase letters, numbers, and hyphens. Reject
  schemes, slashes, query strings, and fragments.
- `externalEventId` must be a positive safe integer.
- API key must be a non-empty string; never echo it. `credentialHint` is `••••` plus its last four
  characters.
- Connection test must list both speakers and sessions for the same `eventUrl`/`externalEventId`.
- Speaker eligibility: local event match, accepted submission association, active/invited local
  status, non-empty names, syntactically valid normalized email.
- Session eligibility: accepted submission, published agenda item, start < end, within both local
  event dates and the tested Accelevents event window, resolvable room, and every speaker eligible.
- Map by persisted external ID first. Only an unmapped speaker may fall back to exact normalized
  email. Do not fuzzy-match names. Sessions do not title-match; they require a persisted mapping.
- Canonically serialize only mapped fields and SHA-256 hash them. Same hash + mapping = unchanged.
- Treat remote `404` on a mapped ID as deletion: recreate and replace mapping.
- Treat `401/403` as connection-level failure; stop the run. Treat `429` and `5xx` as retryable with
  bounded exponential backoff and jitter (three attempts). Treat validation `4xx` as item failure.
- Never delete remote records automatically. Surface local ineligibility as `Needs attention`.

## Frontend Components

### Modified Components

| File Path | Change |
|---|---|
| `src/App.tsx` | Lazy-load `Integrations`; add `/settings/integrations` route |
| `src/components/AppLayout.tsx` | Add Configure nav item `Integrations` with neutral `Plug` icon |
| `src/data/provider.tsx` | Mount `ClerkProvider` for configured Convex deployments as well as Airtable; expose organizer token access without routing vendor sync through `Repository` |
| `src/data/backend.ts` | Replace backend-coupled `isClerkEnabled` with configuration-based auth capability |
| `src/components/AccountMenu.tsx` | Render verified Clerk account whenever configured; retain explicit demo user only for auth-disabled demo mode |
| `.env.example` | Add placeholders listed under Dependencies; no real URLs, IDs, or secrets |
| Convex scheduler configuration | Register the 15-minute scheduled dispatcher |

### New Components

**IntegrationsPage**

- File: `src/pages/settings/Integrations.tsx`
- Props: none.
- Location: Configure sidebar > Integrations, route `/settings/integrations`.
- State: `eventId?: EventId`, `status: IntegrationStatus | null`, `latestRun: SyncRunSummary | null`,
  `loading: boolean`, `error?: string`, `panel: "connect"|"review"|"run"|"disconnect"|null`.
- Elements:
  - `AppLayout title="Integrations"`.
  - `SkeletonList rows={2} label="Loading integrations…"` while event/status loads.
  - Inline destructive text `Could not load integrations. Try again.` plus `Retry` outline button.
  - Event-empty card: `Create an event before connecting integrations.`
  - Responsive grid `grid grid-cols-1 gap-4 lg:grid-cols-2`.
  - `AcceleventsIntegrationCard`.
- Behavior: loads first event through `Repository`, then status through authenticated integrations
  service. Selecting the card sets the appropriate inline detail pane; no dialog/sheet overlay.

**AcceleventsIntegrationCard**

- File: `src/components/integrations/AcceleventsIntegrationCard.tsx`
- Props:
  ```ts
  interface AcceleventsIntegrationCardProps {
    integration: AcceleventsIntegrationStatus | null;
    latestRun: SyncRunSummary | null;
    onOpen(): void;
  }
  ```
- Location: Integrations page card grid.
- Elements: `bg-card rounded-lg p-5` card; neutral plug icon; `Accelevents`; copy `Send accepted
  speakers and scheduled sessions to Accelevents.`; status badge `Not connected`, `Connected`,
  `Syncing`, or `Needs attention`; last-success text; `Configure` or `View sync` outline button.
- Behavior: button and card keyboard activation open the inline detail pane.

**AcceleventsConnectPanel**

- File: `src/components/integrations/AcceleventsConnectPanel.tsx`
- Props:
  ```ts
  interface AcceleventsConnectPanelProps {
    eventId: EventId;
    initial?: Pick<AcceleventsIntegrationStatus, "eventUrl"|"externalEventId"|"autoSyncEnabled">;
    onConnected(status: AcceleventsIntegrationStatus): void;
    onCancel(): void;
  }
  ```
- Location: AppLayout detail pane, opened from integration card.
- Elements: title `Connect Accelevents`; helper copy; labeled `Event URL slug` text input with
  placeholder `your-event`; `Accelevents event ID` numeric input; `API key` password input with no
  populated value; `Automatic sync` switch and cadence copy; link to official API-key instructions;
  inline validation; destructive error alert; `Cancel` outline button; accent `Test and connect`
  button showing `Testing…` while disabled.
- Behavior: never stores key in localStorage. Submit authenticates, tests both host list endpoints,
  encrypts/saves only on success, clears local key state, updates card, and opens review panel.

**AcceleventsSyncPanel**

- File: `src/components/integrations/AcceleventsSyncPanel.tsx`
- Props:
  ```ts
  interface AcceleventsSyncPanelProps {
    eventId: EventId;
    integration: AcceleventsIntegrationStatus;
    latestRun: SyncRunSummary | null;
    onStatusChange(status: AcceleventsIntegrationStatus): void;
    onRunChange(run: SyncRunSummary): void;
    onDisconnectRequest(): void;
  }
  ```
- Elements: connection summary with masked key hint; automatic-sync switch; `Review sync` outline
  button; accent `Sync now` button; last success/attempt timestamps; aggregate result cards; compact
  per-item list with entity/status/message; progress bar and live `role=status`; `Retry failed`
  button for partial runs; `Disconnect` destructive-text button. Loading uses matching skeletons;
  no-run copy is `No sync has run yet.`
- Behavior: Review opens preflight results before the first run. Sync queues a background run and
  polls every 2 seconds while queued/running, stopping on terminal state or unmount. Retry sends only
  failed items from the named run. Toggle persists server-side. Disconnect opens confirmation.

**AcceleventsPreview**

- File: `src/components/integrations/AcceleventsPreview.tsx`
- Props: `{ preview: AcceleventsPreviewResult; onSync(): void; onBack(): void; syncing: boolean }`.
- Elements: four count cards; rows grouped Speakers/Sessions; operation badge; every blocked reason;
  empty state `No accepted, scheduled program data is ready to sync.`; `Back` outline button;
  `Start sync` accent button disabled when valid count is zero or any blocking contract gate exists.

**AcceleventsDisconnectConfirm**

- File: `src/components/integrations/AcceleventsDisconnectConfirm.tsx`
- Props: `{ eventId: EventId; onDisconnected(): void; onCancel(): void }`.
- Elements: inline muted confirmation section (not Dialog); exact warning that remote data remains;
  text input requiring `DISCONNECT`; `Cancel` outline; destructive `Disconnect` disabled until exact.

### Third-Party UI

Reuse existing shadcn `Button`, `Input`, `Label`, `Switch`, `Badge`, `Progress`, `Alert`, and
existing `SkeletonList`. No new UI library. Never use blue buttons; primary actions use the
project's existing `variant="accent"`.

## State / Data Flow

```text
IntegrationsPage
  -> repo.events.list() -> eventId
  -> GET accelevents-status with Clerk token
  -> AcceleventsIntegrationCard
  -> Connect: POST accelevents-connect
       -> verify organizer -> test Accelevents -> encrypt key -> Convex service mutation
       -> connected card + preview
  -> Review: POST accelevents-preview
       -> Convex buildExportForService -> mappings -> canonical hashes
       -> preview counts and row reasons
  -> Sync now: POST accelevents-sync-start
       -> create queued run/items -> invoke background function -> 202 runId
       -> poll GET accelevents-sync-run
       -> background: speakers -> mappings -> sessions -> mappings -> complete run
       -> visible progress/result list and updated last-success timestamp
```

Local component state:

- `apiKey: string` exists only in `AcceleventsConnectPanel` until the connect request settles.
- `eventUrl: string`, `externalEventId: string`, `autoSyncEnabled: boolean` hold editable config.
- `isTesting`, `isPreviewing`, `isQueueing`, `isDisconnecting`: booleans controlling disabled states.
- `preview: AcceleventsPreviewResult | null` and `activeRun: SyncRunSummary | null` drive panels.
- `pollTimer: number | null` is cleared on unmount or terminal run status.

Data trace:

| Visible data | Source path |
|---|---|
| Integration status | `accelevents_integrations` -> service query -> status function -> card badge |
| Eligible speaker | `speakers` + accepted `submissions` -> export query -> preview row -> sync item |
| Headshot | `speakers.headshotStorageKey` -> server storage URL resolver -> Accelevents DTO; never persisted as mapping data |
| Eligible session | accepted `submissions` + published `agenda_items` + `rooms` -> export query -> preview/session request |
| Progress/results | `accelevents_sync_runs/items` -> run endpoint -> poll state -> progress/result list |

## Auth / Permissions

- User: authenticated organizer whose Clerk `sub` is in server-only `EVENT_ADMIN_USER_IDS`.
- Backend pattern: reuse `requireOrganizer` from `_email-delivery.mjs`; extract it into a shared
  `_organizer-auth.mjs` only if doing so preserves existing email tests.
- Frontend gate: without a loaded signed-in Clerk session, `/settings/integrations` renders
  `Sign in as an event administrator to manage integrations.` and no credential/sync controls.
- Server gate: every browser-facing endpoint verifies the bearer token and allowlist. Service-only
  Convex functions require `ACCELEVENTS_INTEGRATION_SERVICE_SECRET`.
- Public: nothing in this feature is public.
- Event ownership remains event-scoped; do not add `organizationId`, organizations, or Clerk Orgs.

## Edge Cases & Error States

| Scenario | Handling |
|---|---|
| No local event | Disable connection and direct organizer to Event Settings |
| Missing Clerk configuration | Fail closed; show auth configuration requirement |
| Non-admin token | 403; page shows `An event administrator role is required.` |
| Invalid/mismatched Accelevents credentials | Do not save; show sanitized connection-test error |
| Accelevents plan lacks API access | Explain that API access requires the relevant Accelevents plan; preserve entered non-secret fields |
| Duplicate speaker email remotely | Exact-email lookup; if multiple matches, fail that item for manual resolution |
| Remote says speaker already exists (`4068906`) | Re-list exact normalized email once; map only a unique match |
| Remote speaker email is immutable after login (`4090121`) | Fail item with instruction to update it in Accelevents or restore local email; do not create duplicate |
| Missing/incomplete speaker | Block dependent session; show speaker reason first |
| Session outside event dates | Skip with exact date-window reason |
| Session has no speakers | Skip; no partial session create |
| Unpublished/unscheduled session | Skip and do not delete prior remote record |
| Remote mapped record deleted | Recreate and replace mapping |
| Local record deleted/ineligible | Keep remote record; surface `Needs attention` |
| 401/403 mid-run | Stop run, mark connection error, retain completed item results |
| 429/5xx/network failure | Three bounded retries with jitter, then item/run partial failure |
| Duplicate manual clicks | Existing queued/running run returned; button remains disabled |
| Scheduler overlaps manual run | Scheduler skips event with active run |
| Refresh during run | Reload latest run and resume polling |
| Background function timeout | Run remains running; stale-run recovery marks it failed and allows retry without duplicates |
| Accelevents-only field edited | Never sent in update body; remote value survives |
| Local mapped field edited | Hash changes; update sent on next sync |
| Disconnect during run | Disable disconnect until terminal state or cancel queued run before deleting credentials |

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Direction | Program app -> Accelevents only | Matches the named requirement and existing commercial behavior |
| Source scope | Accepted speakers + accepted/published/scheduled sessions | Avoids leaking draft/rejected program data |
| Trigger | Preview + manual background sync + automatic resync | Eliminates manual entry while keeping visible control |
| Cadence | 15-minute dispatcher; hourly except within/live 48h | Matches official resync behavior while fitting static cron |
| Secret storage | Server-side AES-256-GCM envelope in Convex | Existing proven repository pattern; no browser exposure |
| Idempotency | External mapping + canonical source hash | Prevents duplicates and unnecessary updates |
| Remote deletion | Recreate; no automatic deletion in either system | Existing commercial behavior; avoids destructive surprises |
| UI | Dedicated Integrations page with inline detail pane | Scales beyond one provider and obeys three-pane design rule |
| API client | Native fetch + Zod response validation | No SDK/package exists; exact boundary stays small and testable |
| Auth | Clerk on Convex organizer routes too | Sensitive integration actions cannot remain in demo-user mode |
| External-contract uncertainty | Credentialed sandbox fixture gate | Published Accelevents schema is incomplete/inconsistent |

## Dependencies

**Requires:**

- An Accelevents Enterprise/eligible account with owner-generated API key and disposable test event.
- Verified working speaker-to-session association request captured from the sandbox.
- Clerk mounted for the Convex admin surface and configured `EVENT_ADMIN_USER_IDS`.
- `CONVEX_URL` for server functions.
- New server-only placeholders in `.env.example`:
  - `ACCELEVENTS_INTEGRATION_ENCRYPTION_KEY=base64-encoded-32-byte-key`
  - `ACCELEVENTS_INTEGRATION_SERVICE_SECRET=replace-with-a-long-random-secret`
  - `ACCELEVENTS_SCHEDULER_SECRET=replace-with-a-long-random-secret`
- Existing event, speaker, submission, agenda, room, and storage data.

**Enables:**

- Program publishing into the existing registration/attendee platform without re-entry.
- Future provider cards on the shared Integrations page without broadening this feature's sync scope.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Accelevents API access is plan-gated | Make real eligible credentials a start gate and surface plan error clearly |
| Published OpenAPI is incomplete/inconsistent | Credentialed sandbox fixtures before enabling production writes |
| Speaker/session association is undocumented | Hard stop if contract cannot be proven; no false completion claim |
| Partial sync creates duplicates on retry | Persist mapping immediately after every remote success; claim runs atomically |
| API key exposure | Dedicated server functions, encrypted envelope, masked hint, no raw response logs |
| Organizer auth changes the Convex demo shell | Treat auth as explicit dependency, preserve opt-in auth-disabled demo mode, test both |
| Automatic sync exceeds scheduled limit | Scheduler dispatches a background function; it does not process records |
| Remote manual settings are overwritten | Allowlisted update DTO contains mapped fields only |
| Source record becomes ineligible | Report drift, never automatically delete remote data |
| Headshot URL expires | Resolve a fresh server URL per sync; never persist it in mappings |
