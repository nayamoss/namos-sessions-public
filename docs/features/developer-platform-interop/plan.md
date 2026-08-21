# Developer Platform Interoperability — Implementation Plan

## Phase 1: Contract and scopes

- [ ] T001: Inventory every shipped route/type/error and define the typed operation registry.
- [ ] T002: Add compatible write scopes; prove existing tokens receive no new authority.
- [ ] T003: Generate/validate OpenAPI 3.1 and CI drift snapshots from the registry.

## Phase 2: Safe writes

- [ ] T004: Add idempotent task-status, communication-draft, and agenda-proposal approval routes
  through existing domain logic.
- [ ] T005: Add cross-event, scope, validation, stale-hash, replay, and audit tests.
- [ ] T006: Extend SDK and CLI with the same generated/request types and typed errors.

## Phase 3: Hosted MCP

- [ ] T007: Implement Streamable HTTP GET/POST transport with Origin, auth, protocol, rate, size,
  disconnect, and revocation handling.
- [ ] T008: Register resources/tools strictly from token scopes and route through SDK/domain services.
- [ ] T009: Add parity tests across REST, SDK, CLI, stdio MCP, and HTTP MCP.

## Phase 4: Frontend UI

### UI Spec

- **Location:** Settings → API content body and public `/api-docs`; headers contain identity only.
- **Elements:** new scope checkboxes, scope descriptions, hosted endpoint, transport/header examples,
  copy buttons, `Bot` icon, missing/revoked-token empty card, inline copy/connection errors, audit rows,
  and operation docs generated from OpenAPI.
- **Behavior:** secrets show once; copy controls announce success; capability docs change with the
  generated contract; no native selects or header actions.
- **Data:** token management/audit queries and bundled OpenAPI description.

### Tasks

- [ ] T010: Update token creation/audit UI and build `McpConnectionGuide`.
- [ ] T011: Render API docs from the generated contract with mobile/keyboard/dark support.
- [ ] T012: Browser-test token create, one-time secret, scopes, revoke, audit, copy, and failure states.

## Phase 5: Verification

- [ ] T013: Run contract, security-boundary, conformance, typecheck, tests, lint, and build.
- [ ] T014: Connect a real remote MCP client and prove discovery, read, safe write, denial, and revoke.
- [ ] T015: Publish endpoint/docs only after deployed origin/auth checks pass.

## Task Dependencies

Registry precedes clients/docs. Safe writes precede MCP tools. Security tests precede hosting.

## Verification Checklist

- [ ] Every client has identical scope/idempotency behavior.
- [ ] Hosted MCP validates Origin/auth and advertises no excess capability.
- [ ] UI invariants and all acceptance criteria pass in a real browser.
