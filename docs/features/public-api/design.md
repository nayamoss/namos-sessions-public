# Public API — Technical Design

## Evidence and current architecture

| Layer | Findings | Evidence |
|---|---|---|
| Schema | Convex owns all product records; each domain table is event-scoped except events, organizers, field definitions, and internal confirmation requests. | [`convex/schema.ts`](../../../convex/schema.ts:16) |
| HTTP | The HTTP router has no registered endpoint. | [`convex/http.ts`](../../../convex/http.ts:1) |
| Auth | Private Convex functions use `requireIdentity` and `assertOrganizer`; organizer role is stored by Clerk subject. | [`convex/functions.ts`](../../../convex/functions.ts:11), [`convex/organizers.ts`](../../../convex/organizers.ts:19) |
| Existing public projection | `publicEmbeds.get` already filters to a published event, published agenda items, accepted speakers, and projected fields. It has no HTTP route. | [`convex/publicEmbeds.ts`](../../../convex/publicEmbeds.ts:26) |
| Event APIs | Events/rooms/tracks are organizer-only Convex queries/mutations. | [`convex/events.ts`](../../../convex/events.ts:6) |
| Agenda APIs | Agenda save validates event-local room, track, speaker, title, and time range; publish sets all event items published. | [`convex/agenda.ts`](../../../convex/agenda.ts:90) |
| UI | Routes are client-rendered React Router routes; Configure has Event Settings, Library, and Email delivery but no Developer API page. | [`src/App.tsx`](../../../src/App.tsx:38), [`src/components/AppLayout.tsx`](../../../src/components/AppLayout.tsx:48) |
| Deployment | Cloudflare Workers serves the Vite SPA. HTTP API work uses Convex HTTP actions. | [`wrangler.jsonc`](../../../wrangler.jsonc:1) |
| Packages | Convex `^1.42.3`, Clerk, Zod `^3.25.76`, Radix dropdown menu, and Vitest are already installed. No OpenAPI validator/client generator is installed. No AI SDK is installed or needed. | [`package.json`](../../../package.json:1) |

## Database / Schema Changes

### Current schema (affected pattern)

```ts
organizers: defineTable({
  userId: v.string(), email: v.string(),
  role: v.union(v.literal("owner"), v.literal("admin")), createdAt: v.number(),
}).index("by_userId", ["userId"]),
events: defineTable({
  name: v.string(), slug: v.string(), type: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  location: v.optional(v.string()), timezone: v.string(), startDate: v.number(), endDate: v.number(),
  theme: v.optional(v.string()), logoStorageKey: v.optional(v.string()), backgroundStorageKey: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]),
agenda_items: defineTable({
  eventId: v.id("events"), submissionId: v.optional(v.id("submissions")), title: v.string(),
  roomId: v.id("rooms"), trackId: v.optional(v.id("tracks")), startTime: v.number(), endTime: v.number(),
  speakerIds: v.array(v.id("speakers")), isPublished: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_room", ["roomId"]).index("by_submission", ["submissionId"]),
```

The complete existing domain schema, including forms/submissions/speakers/evaluations/tasks/
availability/comms, remains the data source and is unchanged by Phase A. See
[`convex/schema.ts`](../../../convex/schema.ts:16).

### Required schema additions

```ts
api_tokens: defineTable({
  tokenPrefix: v.string(),                 // e.g. tt_live_ab12; unique display/lookup prefix
  tokenHash: v.string(),                   // SHA-256 or stronger server-side hash; never plaintext
  name: v.string(),
  createdByUserId: v.string(),
  scopes: v.array(v.union(
    v.literal("events:read"), v.literal("events:write"),
    v.literal("forms:read"), v.literal("forms:write"),
    v.literal("submissions:read"), v.literal("submissions:write"),
    v.literal("speakers:read"), v.literal("speakers:write"),
    v.literal("evaluations:read"), v.literal("evaluations:write"),
    v.literal("agenda:read"), v.literal("agenda:write"), v.literal("agenda:publish"),
    v.literal("tasks:read"), v.literal("tasks:write"),
    v.literal("availability:read"), v.literal("availability:write"),
    v.literal("portal:self"), v.literal("comms:read"), v.literal("comms:send"),
    v.literal("api:manage"), v.literal("comms:pii")
  )),
  expiresAt: v.optional(v.number()), revokedAt: v.optional(v.number()), lastUsedAt: v.optional(v.number()),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_prefix", ["tokenPrefix"]).index("by_creator", ["createdByUserId"]),
api_token_event_grants: defineTable({
  tokenId: v.id("api_tokens"), eventId: v.id("events"), createdAt: v.number(),
}).index("by_token", ["tokenId"]).index("by_token_event", ["tokenId", "eventId"]),
api_idempotency_keys: defineTable({
  tokenId: v.optional(v.id("api_tokens")), actorUserId: v.optional(v.string()),
  method: v.string(), path: v.string(), key: v.string(), bodyHash: v.string(), status: v.number(),
  responseJson: v.string(), createdAt: v.number(), expiresAt: v.number(),
}).index("by_actor_method_path_key", ["tokenId", "actorUserId", "method", "path", "key"])
  .index("by_expiry", ["expiresAt"]),
api_audit_log: defineTable({
  requestId: v.string(), tokenId: v.optional(v.id("api_tokens")), actorUserId: v.optional(v.string()),
  eventId: v.optional(v.id("events")), operation: v.string(), targetType: v.optional(v.string()),
  targetId: v.optional(v.string()), method: v.string(), path: v.string(), status: v.number(),
  errorCode: v.optional(v.string()), createdAt: v.number(),
}).index("by_request", ["requestId"]).index("by_event_created", ["eventId", "createdAt"])
  .index("by_token_created", ["tokenId", "createdAt"]),
```

### Migration

New tables only; no backfill. Deploy schema before HTTP routes. Existing public embeds remain
unchanged during Phase A. Before Phase B, add an owner-only migration action that can create a
first API token only after a user explicitly requests it; no token is seeded. An expiry cleanup
job may delete idempotency rows after 24 hours; audit retention is append-only and must be decided
before deleting data.

## Backend / API

### Existing functions affected

| Function | Current behavior | API change |
|---|---|---|
| `events.list/get/getBySlug/save/listRooms/saveRoom/removeRoom/listTracks/saveTrack/removeTrack` | Organizer-only CRUD | Extract business checks into server services called by both Convex functions and HTTP actions. |
| `agenda.list/get/detectConflicts/save/remove/publishSchedule` | Organizer-only event agenda | Same service extraction; preserve all existing validation. |
| `publicEmbeds.get` | Published projection for SPA embeds | Reuse/replace with a serializer-only public projection for HTTP, without leaking IDs. |
| `requireIdentity/assertOrganizer` | Clerk session identity/role checks | Add API actor resolver; do not weaken existing app checks. |

### HTTP route groups and complete operation contract

All successful resource responses use `{"data": T}`. Collections use
`{"data": T[], "page": {"nextCursor": string | null, "hasMore": boolean}}`. Timestamps are
RFC 3339 strings. Every error is `application/problem+json`:
`{ "type": string, "title": string, "status": number, "detail": string, "instance": string, "requestId": string, "errors"?: [{"pointer": string, "detail": string}] }`.

| Methods and paths | Request body/query | Response `data` | Scope and validation |
|---|---|---|---|
| `GET /api/v1/public/events/{slug}` | path `slug:string` | `PublicEvent {slug,name,type?:string,websiteUrl?:string,location?:string,timezone,startAt,endAt}` | Public only; event must be published. |
| `GET /api/v1/public/events/{slug}/schedule`, `/sessions`, `/speakers` | `limit?:1..100,cursor?:string` | schedule/session `PublicAgendaItem {title,startAt,endAt,roomName,trackName?:string,speakers:PublicSpeaker[]}`; speaker `PublicSpeaker {displayName,bio?:string,headshotUrl?:string,links:{label,url}[]}` | Public only; event published; agenda item published; speaker accepted. |
| `GET,POST /api/v1/events`; `GET,PATCH /api/v1/events/{eventId}` | POST/PATCH `EventWrite {name:string,slug:string,type?:string,websiteUrl?:string,location?:string,timezone:string,startAt:string,endAt:string,theme?:string,exhibitorsEnabled:boolean,sponsorsEnabled:boolean,status:"draft"|"published"|"archived"}` | `Event` adds `id:string,createdAt:string,updatedAt:string` | `events:read/write`; event grant on item route; validate unique slug and IANA timezone/date range via existing `assertEventSchedule`. |
| `GET,POST /api/v1/events/{eventId}/rooms|tracks|tags`; `GET,PATCH,DELETE /api/v1/events/{eventId}/rooms|tracks|tags/{id}` | Room `{name:string,capacity?:number,sortOrder:number}`; Track/Tag `{name:string,color?:string,sortOrder?:number}` | resource + list envelope | `events:read/write`; path resource must belong to event. |
| `GET,POST /api/v1/events/{eventId}/forms`; `GET,PATCH,DELETE /api/v1/events/{eventId}/forms/{formId}`; `GET /fields` | `FormWrite` mirrors exact current submission-form fields; field write mirrors `field_definitions` validator | `Form`/`FieldDefinition` DTO excluding `adminUserIds` and notification lists without `comms:pii` | `forms:read/write`; preserve conditional/routing validation. |
| `GET /api/v1/public/events/{slug}/forms/{formId}`; `POST /submissions`; `POST /drafts` | Public form config; `PublicSubmissionWrite {answers:Record<string,string>,participants:Participant[],idempotencyKey?:string}` | Public config; `SubmissionReceipt {submissionId?:string,status,portalUrl?:string}` (no internal ID in unauthenticated response) | CFP public config/submit rule, form status/close date/rules/server-side routing. |
| `GET,POST /api/v1/events/{eventId}/submissions`; `GET,PATCH /.../submissions/{id}`; `POST /{id}/decision`; `PATCH /{id}/tags` | `SubmissionWrite`, `StatusWrite {status: Status}`, `TagWrite {tagIds:string[]}` | `Submission` DTO including answers only with `submissions:read`; decision includes resulting status | `submissions:read/write`; state union is the fixed seven statuses; decisions are idempotent. |
| `GET,POST /api/v1/events/{eventId}/speakers`; `GET,PATCH /.../speakers/{speakerId}` | `SpeakerWrite {email,firstName,lastName,bio?,salutation?,honorific?,pronouns?,gender?,linkedinUrl?,xUrl?,facebookUrl?,websiteUrl?,status}` | `Speaker` excludes email unless `comms:pii` | `speakers:read/write`; normalize email; event ownership. |
| `POST /.../speakers/{speakerId}/headshot-upload`; `POST /.../documents-upload`; `GET,DELETE /.../documents/{documentId}` | `{fileName:string,contentType:string,kind?:"slides"|"supporting_doc"}` then storage completion `{storageId:string,...}` | `{uploadUrl:string,expiresAt:string}` / `SpeakerDocument {id,fileName,kind,downloadUrl,createdAt}` | ownership/scope verified before one-time short-lived URLs; never return storage IDs. |
| `GET,POST /api/v1/events/{eventId}/evaluation-plans`; `GET /evaluations`; `POST /assignments`; `POST /evaluations` | Exact existing plan/assignment/evaluation write DTOs | plan/assignment/evaluation DTOs; reviewer listing redacted to required fields | `evaluations:read/write`; current reviewer self queue remains separate. |
| `GET,POST /api/v1/events/{eventId}/agenda`; `GET /conflicts`; `GET,PATCH,DELETE /agenda/{id}`; `POST /publish` | `AgendaWrite {title,roomId,trackId?,submissionId?,speakerIds:string[],startAt:string,endAt:string,isPublished:boolean}` | `AgendaItem`, `AgendaConflict {type,itemAId,itemBId,speakerId?}` | `agenda:read/write/publish`; reuse exact validation at `agenda.ts:94-119`. |
| `GET,POST /api/v1/events/{eventId}/tasks`; `PATCH /tasks/{id}`; `GET,PUT /availability/{speakerId}` | existing `TaskCreateInput`, `TaskStatusWrite`, `AvailabilityWrite {unavailable:{date:string,part}[],notes?:string}` | task/availability DTO | organizer scope or speaker self-ownership; do not expose others’ availability to speakers. |
| `GET /api/v1/events/{eventId}/communications`; `POST /communications/{id}/send` | `SendRequest {recipientSpeakerIds?:string[],submissionIds?:string[]}` | redacted `CommLog`; send receipt `{accepted:boolean,requestId}` | `comms:read/send`; only after real provider path is verified; no credential endpoint. |
| `GET,POST /api/v1/api-tokens`; `POST /api-tokens/{id}/rotate|revoke`; `GET /api-audit` | create `{name:string,scopes:Scope[],eventIds:string[],expiresAt?:string}` | creation `{id,prefix,token,scopes,eventIds,expiresAt?}` once; later `ApiToken {id,prefix,name,scopes,eventIds,expiresAt?,revokedAt?,lastUsedAt?,createdAt}` | `api:manage`; owner/admin policy to be approved. |

Every POST/PATCH/DELETE/action route requires `Idempotency-Key: string` except token creation and
revocation (which get dedicated one-time action semantics and audit rows). The API service hashes
`method + canonicalPath + authenticatedActor + key + canonicalBody`; equal replays return saved
status/JSON, unequal replays return `409 idempotency_conflict`.

### New Convex modules

| File | Exports and responsibility |
|---|---|
| `convex/api/http.ts` | `httpRouter` registration; route dispatch only. |
| `convex/api/request.ts` | `parseJson(request,maxBytes)`, `requestId()`, CORS/cache/error response helpers. |
| `convex/api/auth.ts` | `resolveActor(request): ApiActor`, `requireScope(actor, scope, eventId)`, PAT hashing/revocation/expiry lookup. |
| `convex/api/policy.ts` | event-grant and resource-belongs-to-event assertions; public visibility rules. |
| `convex/api/serializers.ts` | DTO functions with explicit object fields per resource. |
| `convex/api/idempotency.ts` | idempotency lookup/write and 24-hour cleanup action. |
| `convex/api/audit.ts` | append-only audit query/mutation helpers. |
| `convex/api/services/*.ts` | server-side domain operations extracted from current Convex modules. |
| `convex/api/tokens.ts` | owner/admin token management queries/mutations for the UI and HTTP API. |

Install an OpenAPI validator only after choosing one compatible with Node 22 and the repository’s
tooling; add its exact version to `devDependencies`, a `npm run api:lint` script, and a CI test.

## Frontend Components

### Modified components

| File | Change |
|---|---|
| `src/App.tsx` | Lazy-import `DeveloperApi` and register authenticated `/settings/developer-api`. |
| `src/components/AppLayout.tsx` | Add `Code2`-icon navigation item “Developer API” below “Email delivery” in Configure. |
| `src/data/types.ts`, `repo.ts`, transports | Add API-token/audit repository types used solely by Settings UI; preserve existing backend interface rules. |

### New components

**`src/pages/settings/DeveloperApi.tsx`**

- Props: none; reads repository context with `useRepo()`.
- Location: authenticated Settings → Developer API route, rendered inside
  `<AppLayout title="Developer API">`.
- Layout classes: root `space-y-4`; `ContentToolbar ariaLabel="Developer API actions"` directly
  below identity-only page header; each section `rounded-lg bg-card p-6 space-y-4`; no border,
  shadow, native `select`, or header action.
- Elements:
  - Toolbar `Button variant="accent" size="sm"` labelled “Create token”, disabled while token
    list is loading; clicking opens an inline content section, not a modal.
  - Intro text “Create scoped tokens for server-to-server integrations. Tokens are shown once.”
  - API docs `a` link labelled “Open API reference”, target `/_api/docs`, plus a muted URL label.
  - Token table: Name, Prefix, Scopes, Event access, Expires, Last used, Status, and Actions.
    Scope/event values display as muted compact text; actions use the existing styled dropdown
    menu, never `<select>`.
  - Empty state: “No API tokens yet. Create one to connect an external tool.”
  - Loading: five `animate-pulse h-10 rounded-md bg-muted` rows; error: `p role="alert"
    className="text-sm text-destructive"` with “Couldn’t load API tokens. Try again.” and a
    Button “Retry”.
  - Inline create form: labelled `Input` for token name; multi-choice scope buttons; event grant
    checkboxes; styled expiry menu (“30 days”, “90 days”, “1 year”, “Never”); Cancel and Create
    token buttons. Create is disabled until name, one scope, and one event are selected.
  - One-time secret result: `Input readOnly` containing token, `Button` “Copy token”, warning
    “Copy this token now. It will not be shown again.”, and “I’ve saved it” button that clears
    plaintext state.
  - Row actions: “Rotate” opens an inline confirmation with exact text “Rotate this token? The
    old token will stop working immediately.”; “Revoke” uses sanctioned `AlertDialog`, exact text
    “Revoke this token? This cannot be undone.”; both show Sonner success/error feedback.
  - Audit section: title “Recent API activity”, read-only table (When, Token, Event, Operation,
    Status, Request ID), an empty state, and 10-row pager. No PII/payload values render.
- State: `tokens: ApiToken[]`, `auditRows: ApiAuditRow[]`, `loading:boolean`,
  `loadError:string|null`, `draft:TokenDraft`, `createdToken:string|null`,
  `creating:boolean`, `rotatingId:string|null`, `revokingId:string|null`.
- Data flow: mount → `repo.apiTokens.list()` and `repo.apiAudit.list({limit:10})` → tables;
  create → `repo.apiTokens.create(draft)` → set one-time token, refresh masked list/audit;
  rotate/revoke → repository mutation → refresh both lists. No plaintext token is placed in local
  storage, URL, analytics, audit display, or toast.

## State / Data Flow

`External client → Convex HTTP router → request parser/request ID → public serializer OR
resolve PAT → scope/event policy → shared domain service → Convex table(s) → explicit DTO
serializer → HTTP response + audit record`.

`DeveloperApi → RepoProvider → ApiTokensRepo/API audit Repo → Convex token query/mutation →
api_tokens/api_token_event_grants/api_audit_log → masked DTO → page state → content tables`.

The first-party browser never calls `/api/v1` with a PAT. Existing repository calls continue to
use their current authenticated Convex transport, avoiding token leakage into the browser.

## Auth / Permissions

- Public: only the four slug-scoped published projections. Unknown/unpublished slug returns 404.
- PAT: hash lookup, reject revoked/expired token, apply endpoint scope and event grant before
  loading protected resource. Private missing/wrong-event resources return 404; known action but
  missing scope returns 403.
- Clerk: current app behavior remains `requireIdentity`/`assertOrganizer`; reviewers and speakers
  retain their existing ownership constraints. A future Clerk-to-HTTP bridge must not elevate a
  reviewer/speaker to organizer scope.
- Token management: organizer only in initial implementation; owner-vs-admin create/rotate/revoke
  policy is the one approval gate before building Phase B.

## Edge Cases & Error States

| Scenario | Handling |
|---|---|
| Missing/invalid/revoked/expired PAT | `401` generic problem; audit without raw token. |
| Valid PAT lacks endpoint scope | `403 insufficient_scope`; no resource detail. |
| Event/resource outside grant | `404 not_found`; no existence leak. |
| Published event has no agenda/speakers | `200` with empty `data` list. |
| Overlong/non-JSON request | `413`/`415` before parsing domain body. |
| Invalid input | `422 validation_error` with JSON Pointer field errors. |
| Idempotent replay | Stored success response; changed body/path/key combination is `409`. |
| Simultaneous token rotation/request | Atomic revoked timestamp check; newly rotated old token fails thereafter. |
| Schedule publish races with public read | Projection is atomically filtered by `isPublished`; cache invalidated after completion. |
| Provider email unavailable | Existing degraded delivery behavior remains; API returns accepted/failed evidence without secrets. |
| API/Airtable quota | Public API remains Convex-only initially; do not forward public requests to Airtable. |

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Transport | Convex HTTP router | It is colocated with Convex data/auth and avoids a second service-to-service credential surface. |
| Contract | REST `/api/v1` + OpenAPI 3.1 | Familiar, versioned external integration contract like OpenSession. |
| Error shape | RFC 9457 problem details | Standard machine-readable errors. |
| Token storage | Hash + display prefix | Secrets cannot be retrieved after creation. |
| Data scope | Explicit event grants, not organizations | Project invariant: one conference team, event-scoped data. |
| Public scope | Published event/schedule projection only | Prevents draft and PII disclosure. |
| UI location | Configure → Developer API | Token management is configuration, not a page-header action. |

## Dependencies

- Requires a live Convex deployment, Clerk organizer identity, and completion/live verification of
  existing program flows before private writes.
- Enables public agenda embeds, Accelevents-style integrations, future signed webhooks, and
  generated clients without coupling them to the React app.

## Risks & Mitigations

- Scope creep: deliver Phase A independently and do not advertise full app coverage early.
- Authorization mistakes: serializers and policy checks have a table-driven access matrix.
- Business-rule drift: services are shared by UI Convex functions and HTTP actions.
- API secrets: one-time display, hash-only storage, masked UI/logs, revoke/rotate controls.
- Slow lists: cursor pagination, indexes, DTO projection, and no N+1 joins.
