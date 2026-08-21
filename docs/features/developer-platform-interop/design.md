# Developer Platform Interoperability — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

- `api_tokens`: one event, hash/prefix, six scope literals, creator/use/revocation timestamps.
- `api_idempotency_keys`: token+method+path+key/body hash and stored response.
- `api_audit_log`: token, operation, method/path, status, scope, timestamp.
- `api_rate_limits`: per-token window/count.

### Required Changes

| Table | Action | Column | Type | Notes |
| --- | --- | --- | --- | --- |
| `api_tokens` | CHANGE validator | scopes | add `tasks:write`, `communications:write`, `agenda:approve` | Existing arrays remain valid. |

No MCP session table is required for stateless v1; transport session IDs remain optional.

### Migration

Deploy additive scope literals and compatible readers. Existing tokens gain no new permission; users
must mint a new token or explicitly update scopes through a separate confirmed management action.

---

## Backend / API

### Affected Existing Endpoints

| Method | Path | Change |
| --- | --- | --- |
| GET | `/api/v1/events|submissions|speakers|agenda|tasks` | Register in shared contract. |
| POST | `/api/v1/submissions/:id/status` | Generate docs/tests from shared contract. |
| POST/GET/DELETE | `/api/v1/tokens...` | Document organizer-session auth separately. |

### New Endpoints

| Method | Path | Request Body | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/openapi.json` | none | OpenAPI document |
| POST | `/api/v1/tasks/:id/status` | `{ status, idempotencyKey header }` | task |
| POST | `/api/v1/communication-drafts` | `{ eventId, speakerId, kind, subject, body, calendarAttached }` | draft |
| POST | `/api/v1/agenda/proposals/:id/approve` | `{ payloadHash, idempotencyKey header }` | applied result |
| GET/POST | `/mcp` | MCP JSON-RPC/SSE per transport | MCP messages |

### Validation & Business Logic

The route registry binds method/path/schema/scope/operation. `withApiAuth` remains the only REST auth
entry. Writes call existing domain mutations, enforce event ownership and idempotency, and never
bypass confirmation semantics. MCP validates Origin, bearer token, protocol version, content types,
session header if used, rate limits, and request size before dispatch through the SDK/service layer.

---

## Frontend Components

### Modified Components

| File Path | Change |
| --- | --- |
| `src/pages/public/ApiDocs.tsx` | Render operations/scopes from generated OpenAPI. |
| `src/pages/settings/ApiKeys.tsx` | Add new scope choices and hosted MCP connection instructions. |
| `src/components/settings/ApiAuditLogTable.tsx` | Render new operations. |

### New Components

**McpConnectionGuide**
- File: `src/components/settings/McpConnectionGuide.tsx`
- Props: `{ endpoint: string; tokenPrefix?: string }`
- Location: Settings → API content below token management, not the page header.
- Elements: endpoint, transport label, required headers, copy buttons, client examples, revoked/
  missing-token empty card, inline copy error, and `Bot` icon.
- Behavior: copy individual values; secret is never re-revealed after token creation.
- Third-party: existing primitives.

---

## State / Data Flow

Typed route registry → runtime router + OpenAPI generator + SDK types → CLI/MCP adapters. Requests →
auth/scope/idempotency → domain mutation → response/audit. Settings reads token summaries only.

---

## Auth / Permissions

API tokens stay single-event and least-privilege. Token management requires organizer Clerk session.
Every hosted MCP request authenticates independently or through a validated session binding.

---

## Edge Cases & Error States

Revoked/missing scope, cross-event ID, reused idempotency key with different body, unsupported MCP
version, invalid Origin, reconnect, oversized payload, stream disconnect, rate limit, domain mutation
stale hash, and unavailable endpoint return stable errors and audit outcomes.

---

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Contract | One typed registry | Prevents docs/client/runtime drift. |
| OpenAPI | 3.1 | Broad tooling support and JSON Schema alignment. |
| MCP | Streamable HTTP | Current remote transport; validates Origin and auth. |
| Writes | Proposal/draft/status only | Preserves confirmation and avoids destructive shortcuts. |

## Dependencies

#178 foundation; #262/#265 agenda proposal hashes. #96 remains separate for outbound webhooks.

## Risks & Mitigations

Remote MCP expands attack surface; use strict Origin/auth/rate/request limits and shared domain logic.
Generated drift is blocked by CI snapshot/schema/conformance tests.
