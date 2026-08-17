# Developer Platform — Implementation Plan

Dependency order: **API hardening → SDK → CLI → MCP**. Each phase is independently shippable and
gated on the previous one being real (not stubbed) — do not start the SDK against a fake API
response shape, do not start the CLI against a fake SDK, etc.

## Phase 1: API hardening (scoped tokens, audit log, idempotency, rate limit)

- [ ] T001: Add `api_tokens`, `api_idempotency_keys`, `api_audit_log`, `api_rate_limits` tables to `convex/schema.ts` per design.md (additive, no data loss).
- [ ] T002: Write the one-off backfill mutation giving every existing `api_keys` row `scopes: ["events:read"]`; run it against dev, verify row count matches.
- [ ] T003: Build `convex/httpAuth.ts` — the single `withApiAuth(scope, handler)` wrapper: bearer parse → hash → token lookup → scope check → rate limit → audit log → handler.
- [ ] T004: Migrate `GET /api/v1/events` to use `withApiAuth("events:read", ...)`. Verify existing integrations (docs page, any known consumers) still work unchanged.
- [ ] T005: Add `GET /api/v1/submissions`, `/api/v1/speakers`, `/api/v1/agenda`, `/api/v1/tasks` — all read-only, all through `withApiAuth`.
- [ ] T006: Add `POST /api/v1/submissions/:id/status` as the first write route — implements idempotency-key handling end to end (this is the template for future write routes).
- [ ] T007: Add `POST/GET/DELETE /api/v1/tokens` — organizer-session-gated (Clerk, not token auth), replaces the current `/settings/api` create/list/revoke Convex calls.
- [ ] T008: Rename `api_keys` → `api_tokens` in schema once T002's backfill is verified; update every reference (`apiKeys.ts`, `apiKeyAuth.ts`, `http.ts`).
- [ ] T009: Route-registration test asserting every `http.route` handler is wrapped by `withApiAuth` (prevents future scope-check bypass).

## Phase 2: Frontend UI — `/settings/api` scope controls + audit log

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### UI Spec

**ScopeCheckboxGroup** (inside the existing "Create token" sheet on `/settings/api`)
- Location: Configure → API Settings page, "Create token" sheet (existing sheet, add this to its form body)
- Elements:
  - Section per resource: Events, Submissions, Speakers, Agenda, Tasks — each a row with a resource label and Read/Write checkboxes (Write disabled/greyed for resources with no write route yet)
  - "Select all read-only" link above the groups
  - Inline validation text below the group: "Select at least one permission" (red, `text-sm`), shown only after a failed submit attempt
- Behavior: Create button disabled until ≥1 scope checked; submit sends `scopes: string[]` to the create-token mutation
- Data: local component state, no API call until submit

**Token list (existing table, extended)**
- Location: same page, existing token list
- Elements added per row: scope badges (small pill-style tags, not bordered — use the existing badge/tag component if one exists in the design system, else a `bg-neutral-200 rounded-[6px] px-2 py-0.5 text-sm` span), last-used relative time
- Behavior: unchanged (existing revoke button stays)

**ApiAuditLogTable**
- Location: `/settings/api`, below the token list, inside a collapsible section titled "Recent API activity" (collapsed by default)
- Elements:
  - DataGrid: Timestamp, Token label, Method + Path, Status (colored dot: green 2xx, amber 4xx, red 5xx), Scope used
  - Empty state: card with "No API activity yet" + subtext "Requests made with your API tokens will show up here."
  - Loading state: 5 skeleton rows
- Behavior: paginated using the existing client-side pagination pattern (`datagrid-pagination`); read-only, no row click action
- Data: new `api.auditLog.list` query, organizer-gated, `eventId` scoped

### Tasks

- [ ] T010: Build `ScopeCheckboxGroup` and wire into the existing create-token sheet.
- [ ] T011: Add scope badges + last-used to the existing token list rows.
- [ ] T012: Build `ApiAuditLogTable`, wire to `api.auditLog.list`, add collapsible section.
- [ ] T013: Update `/api-docs` to document the 9 routes, scopes, rate limits (60/min), and link the SDK/CLI/MCP install commands (even if packages aren't published yet, document the intended `npm install`/`npx` commands — update once Phase 2/3/4 publish).
- [ ] T014: Verify full flow in browser: create a scoped token, hit a route with the wrong scope (expect 403), see it in the audit log.

## Phase 3: TypeScript SDK (`packages/sdk`)

- [x] T015: Scaffold `packages/sdk` as a Bun workspace package (`@namos-sessions/sdk`), add root `workspaces` key to `package.json`.
- [x] T016: Hand-write typed client: `NamosSessionsClient({ token })` with `.events.list()`, `.submissions.list(eventId)`, `.speakers.list(eventId)`, `.agenda.list(eventId)`, `.tasks.list(eventId)`, `.submissions.updateStatus(id, status, { idempotencyKey })`, `.tokens.create/list/revoke`.
- [x] T017: Share response types between `convex/publicEventsApi.ts`-style projections and the SDK — export a `types.ts` the SDK imports rather than hand-duplicating shapes.
- [x] T018: Error handling: typed `NamosSessionsApiError` (status, code, message) thrown on non-2xx, matches the REST error shape from `publicApiError`.
- [x] T019: Unit tests against a mocked fetch — cover 200/401/403/429/409 paths.
- [x] T020: `README.md` in `packages/sdk` with install + quickstart.

## Phase 4: CLI (`packages/cli`, bin `namos-sessions`)

- [x] T021: Scaffold `packages/cli` (`@namos-sessions/cli`), depends on `packages/sdk` via workspace link.
- [x] T022: `namos-sessions login` — prompts for a token, stores it in `~/.config/namos-sessions/credentials` (0600 permissions, never printed back).
- [x] T023: `namos-sessions events list`, `submissions list --event <id>`, `agenda list --event <id>`, `tasks list --event <id>` — table output by default, `--json` flag for raw output.
- [x] T024: `namos-sessions tokens create/list/revoke` — mirrors the `/settings/api` UI for terminal use.
- [x] T025: No-credentials UX: any authenticated command with no stored token prints "Run `namos-sessions login` first." and exits non-zero — never a raw 401 dump.
- [x] T026: `README.md` with install (`npm i -g @namos-sessions/cli` or `npx`) + command reference.

## Phase 5: MCP server (`packages/mcp`)

- [x] T027: Scaffold `packages/mcp` (`@namos-sessions/mcp`), depends on `packages/sdk`.
- [x] T028: Implement MCP resources: `events`, `submissions`, `speakers`, `agenda`, `tasks` — each backed by the corresponding SDK read call, scoped to the token's actual scopes (a resource the token can't read simply doesn't appear).
- [x] T029: Implement MCP tool: `update_submission_status` — backed by the SDK write call, refuses (same error the REST route would give) if the token lacks `submissions:write`.
- [x] T030: stdio transport, started via `npx @namos-sessions/mcp` with `NAMOS_SESSIONS_TOKEN` env var; fail fast with a clear error if the token is missing/invalid at startup (don't start with zero tools silently).
- [ ] T031: Manual verification: connect via Claude Desktop / Claude Code's MCP config, confirm scope enforcement (a `events:read`-only token cannot see the write tool at all — tools list itself is scope-filtered, not just enforced on call).
- [x] T032: `README.md` documenting setup for Claude Desktop, Claude Code, and any other MCP client, including the exact config JSON snippet.

## Task Dependencies

Phase 1 blocks 2–5. Phase 3 (SDK) blocks 4 (CLI) and 5 (MCP) — do not start either against a
placeholder SDK. Phase 2 (UI) can run in parallel with Phase 3 once Phase 1 is merged.

## Verification Checklist

- [ ] All acceptance criteria in requirements.md met
- [ ] `/settings/api` scope UI and audit log are live and usable, not just implemented in Convex
- [ ] One scoped token exercises REST, SDK, CLI, and MCP identically (same 403 on out-of-scope call in all four)
- [ ] No regressions to the existing `GET /api/v1/events` consumers
- [ ] `npm run check` (typecheck + test + build) passes with `packages/*` included
- [ ] No plaintext tokens anywhere in the database (spot-check via Convex dashboard)
