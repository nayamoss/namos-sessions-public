# Developer Platform (API hardening + SDK + CLI + MCP) — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-15

## Problem Statement

Namos Sessions has exactly one public API route today (`GET /api/v1/events`, shipped in #93) and
one flat, unscoped `api_keys` table (full read access to an event's public projection, no
per-scope permissions, no audit trail, no rate limiting). Nothing else exists: no SDK, no CLI, no
MCP server. Issue #73 — the original versioned/scoped platform API — was explicitly closed in
favor of the smaller #93, so scoped tokens, audit logging, and idempotency were never built.

Organizers who want to script against Namos Sessions (pull agenda data into their own tools, wire
up webhooks-adjacent automation, or point an AI agent at it) have no supported way to do it beyond
hand-rolled `fetch` calls against the one endpoint.

Note on scope: issue #66's MCP spike was explicitly logged (2026-08-13) as "prior art only, not
an implementation dependency" after #122 shipped an in-app Operations Agent instead. This plan
deliberately reopens that MCP scope at Naya's explicit direction (2026-08-15) — it does not
touch or revert #122's in-app agent, which stays as-is.

## User Stories

**As an** organizer with engineering skills **I want to** call a documented, versioned REST API
with scoped tokens **so that** I can build integrations without full read/write access to every
resource on a single leaked key.

**As a** third-party integrator **I want to** use a typed TypeScript SDK **so that** I don't
hand-roll HTTP calls and auth headers against a REST API I have to reverse-engineer from docs.

**As an** organizer scripting from a terminal **I want to** a CLI (`namos-sessions`) **so that**
I can list events, pull agenda/submission data, and manage API tokens without writing code.

**As an** external AI agent (Claude, ChatGPT, etc.) **I want to** connect to an MCP server scoped
to one organizer's data **so that** it can read/act on events, submissions, and tasks under
explicit, revocable, scoped permission — not a full-access key pasted into a prompt.

**Acceptance Criteria:**
- GIVEN a scoped API token with only `events:read` WHEN it's used against `POST /api/v1/submissions` THEN the request is rejected 403, and the rejection is written to the audit log.
- GIVEN a valid `events:read`+`submissions:read` token WHEN the SDK's `client.submissions.list(eventId)` is called THEN it returns typed results identical to the raw REST response.
- GIVEN the CLI with no stored token WHEN any authenticated command runs THEN it prints a clear "run `namos-sessions login`" message rather than a raw 401.
- GIVEN an MCP client connected with a scoped token WHEN it calls a write-capable tool outside that token's scopes THEN the tool call is refused with the same 403 the REST API would return — MCP is never a bypass of REST scoping.
- GIVEN any authenticated write across REST, SDK, CLI, or MCP WHEN it succeeds or fails THEN one `api_audit_log` row is written with actor, scope used, method, path, and outcome.

## Functional Requirements

- FR-001: Extend `api_keys` → scoped tokens (`api_tokens`) with a fixed permission-scope enum (see design.md), replacing the current all-or-nothing event-read key.
- FR-002: Add `api_audit_log` — every authenticated API request (REST, SDK, CLI, MCP all funnel through REST) logs actor, token, scope, method, path, status, timestamp.
- FR-003: Add `api_idempotency_keys` for all write (`POST`/`PATCH`/`DELETE`) routes — an `Idempotency-Key` header replays the prior response instead of double-writing.
- FR-004: Add per-token rate limiting (fixed window, e.g. 60 req/min) enforced in the HTTP router before any Convex query/mutation runs.
- FR-005: Expand `/api/v1/*` beyond events: `submissions`, `speakers`, `agenda`, `tasks` — read routes first, write routes gated by explicit scopes.
- FR-006: Publish `@namos-sessions/sdk` (TypeScript) — thin typed wrapper generated/hand-written against the REST surface, one method group per resource, ships with the monorepo's existing TypeScript config.
- FR-007: Publish `@namos-sessions/cli` (`namos-sessions` bin) wrapping the SDK — `login`, `events list`, `events get`, `submissions list`, `agenda list`, `tokens create/list/revoke`.
- FR-008: Build an MCP server (`@namos-sessions/mcp`) that authenticates with the same scoped token, exposes resources/tools 1:1 with the REST surface (no direct DB access — it calls the same HTTP routes everything else does), and enforces the same scope checks.
- FR-009: `/settings/api` UI gains scope checkboxes when creating a token (currently: label only, full event access).
- FR-010: `/api-docs` documents the full route set, scopes, rate limits, and links the SDK/CLI/MCP install instructions.

## Non-Functional Requirements

- NFR-001 (Security): Token values are never stored in plaintext — SHA-256 hash only (already true, keep it). Prefix (`ns_live_...`) shown once at creation, never retrievable again.
- NFR-002 (Security): Every scope check happens server-side in the HTTP router / Convex function — never trust a client-declared scope.
- NFR-003 (Security): Rate limit violations return `429` with `Retry-After`, and are audit-logged.
- NFR-004 (Reliability): Idempotency keys expire after 24h (matches the existing design doc's `api_idempotency_keys.expiresAt` shape).
- NFR-005 (Compatibility): CLI and MCP server run as ordinary Node processes distributed via npm — no Cloudflare Worker or Convex-specific runtime dependency, so anyone can `npx` them.

## Out of Scope

- Reverting or modifying #122's in-app Operations Agent — it stays exactly as shipped.
- Webhooks (issue #96, `outbound-event-webhooks`) — separate, already-planned effort; this plan does not duplicate it.
- OAuth / third-party app installs — token auth only, same model as today's API keys.
- Non-TypeScript SDKs (Python, Go, etc.) — v1 is TypeScript only.

## Success Metrics

- All four surfaces (REST, SDK, CLI, MCP) pass the same acceptance-criteria test matrix using one scoped token.
- Zero plaintext tokens in the database (verified by schema + a query audit).
- `npm run check` (typecheck + test + build) passes with the new packages included in the workspace.
