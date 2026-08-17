# Developer Platform — Technical Design

## Evidence and current architecture

| Layer | Findings | Evidence |
|---|---|---|
| HTTP | One route: `GET /api/v1/events`, bearer auth, CORS `*`. No rate limit, no idempotency, no audit log. | [`convex/http.ts`](../../../convex/http.ts:13) |
| Schema | `api_keys` is flat: one key = full read of one event's public projection. No scopes, no per-token grants. | [`convex/schema.ts`](../../../convex/schema.ts:90) |
| Auth | `hashApiKey` (SHA-256, no salt — acceptable, keys are high-entropy random, not passwords) + `findActive`/`markUsed`. | [`convex/apiKeyAuth.ts`](../../../convex/apiKeyAuth.ts:1) |
| Key mgmt | `apiKeys.ts` — `list`/`revoke`/`canManage`, organizer-gated via `assertEventOrganizerAccess`. UI at `/settings/api`. | [`convex/apiKeys.ts`](../../../convex/apiKeys.ts:1) |
| Prior design | A fuller scoped-token schema (`api_tokens`, `api_token_event_grants`, `api_idempotency_keys`, `api_audit_log`) was designed under issue #73 but never built — #73 closed in favor of the smaller #93. | [`docs/features/public-api/design.md`](../public-api/design.md:1) |
| Prior MCP art | `feature/66-agent-native-mcp-spike-tasks` has a working `convex/mcpProtocol.ts` in a different repo (`nayamoss/takumi-talks`, this product's prior name) — logged as "prior art only, not an implementation dependency" as of 2026-08-13. | Issue #66, PR `takumi-talks#72` |
| In-app agent | #122 shipped an organizer-only in-app Operations Agent UI at `/events/:eventSlug/program/agent`. This is separate from and unaffected by this plan — it does not call the public API. | Issue #122, PR #150 |
| Packaging | No `packages/` workspace exists. Bun is the package manager (`bun.lock`/`bun.lockb`), no `workspaces` key in root `package.json`. | `package.json`, `bun.lock` |
| Deployment | Cloudflare Workers hosts the Vite SPA (`wrangler.jsonc`); Convex is the backend/data layer (not D1) — unaffected by this plan. | `wrangler.jsonc` |

## Database / Schema Changes

### Current schema (affected table)

```ts
api_keys: defineTable({
  eventId: v.id("events"),
  label: v.string(),
  keyHash: v.string(),
  keyPrefix: v.string(),
  createdByUserId: v.string(),
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
}).index("by_keyHash", ["keyHash"]).index("by_event", ["eventId"]),
```

### Required changes

| Table | Action | Notes |
|-------|--------|-------|
| `api_keys` | RENAME (data migration) → `api_tokens` | Add `scopes: v.array(v.union(...))`, keep `eventId`/`keyHash`/`keyPrefix`/`createdByUserId`/timestamps. One event per token in v1 (matches today's model) — no multi-event grants table needed yet, unlike #73's design; add `api_token_event_grants` only if multi-event tokens are requested later. |
| `api_idempotency_keys` | ADD | `tokenId`, `method`, `path`, `key` (client-supplied `Idempotency-Key` header), `bodyHash`, `status`, `responseJson`, `createdAt`, `expiresAt`. Index `by_token_method_path_key`, index `by_expiry` for a cleanup cron. |
| `api_audit_log` | ADD | `requestId`, `tokenId`, `eventId`, `operation`, `method`, `path`, `status`, `scopeUsed`, `createdAt`. Index `by_token`, `by_event`, `by_createdAt`. |
| `api_rate_limits` | ADD | `tokenId`, `windowStart: v.number()`, `count: v.number()`. Index `by_token`. Fixed 60-second window, reset on read if `windowStart` is stale. |

### Migration

1. Add the new tables/columns in a schema PR — Convex schema changes are additive-safe, no downtime.
2. Backfill: every existing `api_keys` row gets `scopes: ["events:read"]` (the only permission that has ever existed for these keys) in a one-off `internalMutation` run once via `npx convex run`.
3. Rename the table only after backfill is verified (Convex supports table rename via schema; if not, ship `api_tokens` as new and dual-read `api_keys` for one release, then drop it — decide at implementation time based on current Convex version's rename support).

## Backend / API

### Affected existing endpoints

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/v1/events` | Add scope check (`events:read`), rate limit, audit log write. No response shape change. |

### New endpoints

| Method | Path | Scope required | Request | Response |
|--------|------|----------------|---------|----------|
| GET | `/api/v1/submissions` | `submissions:read` | query: `eventId` | `{ data: Submission[] }` |
| GET | `/api/v1/speakers` | `speakers:read` | query: `eventId` | `{ data: Speaker[] }` |
| GET | `/api/v1/agenda` | `agenda:read` | query: `eventId` | `{ data: AgendaItem[] }` |
| GET | `/api/v1/tasks` | `tasks:read` | query: `eventId` | `{ data: Task[] }` |
| POST | `/api/v1/submissions/:id/status` | `submissions:write` | `{ status }`, requires `Idempotency-Key` | `{ data: Submission }` |
| POST | `/api/v1/tokens` | `api:manage` (organizer session only, not token-auth) | `{ label, scopes[] }` | `{ token, prefix }` (token shown once) |
| GET | `/api/v1/tokens` | `api:manage` | — | `{ data: TokenSummary[] }` (no hash/secret) |
| DELETE | `/api/v1/tokens/:id` | `api:manage` | — | `{ revoked: true }` |

Write routes beyond `submissions/status` (agenda writes, task writes) are deferred to a follow-up
once the read surface + scoping + audit + idempotency are live and verified — do not build every
write route in the first pass.

### Validation & business logic

- Every route resolves `Authorization: Bearer <token>` → `hashApiKey` → `api_tokens` lookup → scope check → rate-limit check → audit log write → handler.
- A single `withApiAuth(scope, handler)` wrapper in `convex/httpAuth.ts` centralizes this — every route uses it, no route hand-rolls auth (this is the #1 place duplicated logic would create a security gap).
- Idempotency: for write routes, hash the request body; if `(tokenId, method, path, Idempotency-Key)` exists and body hash matches, replay the stored response; if body hash differs, `409 Conflict`.

## Frontend Components

### Modified components

| File Path | Change |
|-----------|--------|
| `src/pages/settings/ApiSettings.tsx` (or equivalent under `/settings/api`) | Add scope checkboxes to the token-creation form; show scopes on each listed token; show last-used and audit-log link. |

### New components

**ApiAuditLogTable**
- File: `src/components/settings/ApiAuditLogTable.tsx`
- Props: `{ eventId: string }`
- Location: `/settings/api`, below the token list, as a collapsible "Recent API activity" section
- Elements: DataGrid (reuse the shared DataGrid pattern already used elsewhere) with columns Timestamp, Token label, Method + Path, Status, Scope used; empty state "No API activity yet" inside a card; loading state: skeleton rows
- Behavior: paginated (reuse existing client-side pagination pattern from `datagrid-pagination`), read-only
- Data: new `api.auditLog.list` query, organizer-gated

**ScopeCheckboxGroup**
- File: `src/components/settings/ScopeCheckboxGroup.tsx`
- Props: `{ value: string[], onChange: (scopes: string[]) => void }`
- Location: inside the existing "Create token" sheet on `/settings/api`
- Elements: grouped checkboxes by resource (Events, Submissions, Speakers, Agenda, Tasks) each with Read/Write checkboxes; "Select all read-only" quick-action link
- Behavior: at least one scope required to submit; unchecking all disables the Create button
- Data: local state only, submitted with the create-token mutation

## State / Data Flow

REST route → `withApiAuth` → Convex query/mutation → response. SDK wraps `fetch` against these
same REST routes (no direct Convex client use — the SDK is a REST client, not a Convex client, so
it works from any runtime including CLI/MCP processes that aren't inside the Vite app). CLI wraps
the SDK. MCP server wraps the SDK, translating REST resources into MCP resources/tools 1:1 — MCP
never talks to Convex directly, which is what keeps its permission model identical to REST's.

## Auth / Permissions

- Token creation/listing/revocation (`api:manage`) requires an authenticated organizer **session** (Clerk), not a token — you cannot mint tokens using a token.
- All other scopes are checked per-request against the token's stored `scopes` array, server-side, in `withApiAuth`.
- MCP server holds one scoped token per connection (configured by the user who sets it up, e.g. via env var when self-hosting the MCP server) — it never has broader access than that token.

## Edge Cases & Error States

- Missing/malformed `Authorization` header → `401 unauthorized`.
- Valid token, wrong scope → `403 forbidden`, audit-logged.
- Revoked/expired token → `401 unauthorized` (same as missing, don't leak revocation state).
- Rate limit exceeded → `429`, `Retry-After` header, audit-logged.
- Idempotency key reused with different body → `409 conflict`.
- CLI with no stored credentials → friendly message directing to `namos-sessions login`, not a raw HTTP error dump.
- MCP server started with an invalid/revoked token → fails fast at startup with a clear message, doesn't silently expose zero-tool empty state.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package manager for new packages | Bun workspaces | Matches existing `bun.lock`/`bun.lockb` in the repo family; avoids introducing a second package manager. |
| SDK transport | Hand-written typed `fetch` wrapper, not a generated OpenAPI client | Route surface is small (9 routes) — generation overhead isn't worth it yet; revisit if the surface grows past ~20 routes. |
| MCP transport | stdio (local process) for v1, not a hosted remote MCP endpoint | Matches the token-per-connection model; a hosted remote MCP server is a larger, separate security surface (OAuth, multi-tenant routing) — out of scope for v1. |
| Where CLI/SDK/MCP live | New `packages/sdk`, `packages/cli`, `packages/mcp` inside this repo as a Bun workspace | Keeps them versioned alongside the API they wrap; avoids repo-split coordination overhead for a small team. |

## Dependencies

**Requires:** none — builds on what's already shipped (#93's `api_keys`/`http.ts`).
**Enables:** `outbound-event-webhooks` (#96) could reuse the same `api_tokens`/audit-log infrastructure later, though that's not required for this plan.

## Risks & Mitigations

- **Risk:** scope-check bypass if a new route forgets to use `withApiAuth`. **Mitigation:** a lint rule or a route-registration test that fails if any `http.route` handler doesn't wrap with `withApiAuth`.
- **Risk:** MCP server becomes a second place scope logic lives, drifting from REST. **Mitigation:** MCP calls the real REST routes over HTTP instead of reimplementing Convex calls — enforced by the design above, verify in code review.
- **Risk:** table rename (`api_keys` → `api_tokens`) breaks the shipped `/settings/api` UI mid-migration. **Mitigation:** backfill and verify before rename; keep the UI reading through a single `apiKeys.ts`/`apiTokens.ts` module so the rename is a one-file blast radius.
