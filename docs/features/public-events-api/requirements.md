# Public Events API — Requirements

**Type:** Feature
**Status:** Done
**Priority:** Medium
**Last Updated:** 2026-08-12

## Problem Statement
Organizers have no way to pull their own event data (name, schedule, status, program) into an
external website or tool without going through the Convex client SDK, which requires signing in
as an organizer. There is no public, key-authenticated, versioned HTTP endpoint, and no marketing
page explaining that one exists — modeled on opensession.dev's `GET /api/v1/events` reference page
(https://opensession.dev/docs/api/get-api-v1-events).

## User Stories

**As an** organizer **I want to** generate an API key from Settings **so that** I can call the
Events API from my own site or integration without sharing my login.

**Acceptance Criteria:**
- GIVEN I am a signed-in organizer, WHEN I open Settings → API, THEN I can generate a new key, see
  its raw value exactly once, and revoke any existing key.
- GIVEN I have a valid, non-revoked key, WHEN I call `GET /api/v1/events` with
  `Authorization: Bearer <key>`, THEN I get a 200 with my events (all statuses).
- GIVEN I call the endpoint with no key, a malformed key, or a revoked key, WHEN the request is
  made, THEN I get a 401 with a structured error body.

**As a** prospective integrator (not yet signed in) **I want to** read documentation for the
Events API **so that** I can decide whether to build against it before creating an account.

**Acceptance Criteria:**
- GIVEN I visit `/api-docs` while signed out, WHEN the page loads, THEN I see the endpoint,
  auth instructions, a curl example, the full response schema, and all error responses — with no
  login required to read any of it.

## Functional Requirements
- FR-001: New Convex HTTP route `GET /api/v1/events` in `convex/http.ts`, authenticated via
  `Authorization: Bearer <api key>`.
- FR-002: New `api_keys` table + organizer-facing management UI at `/settings/api` (generate,
  reveal-once, revoke; list of existing keys with label/created/last-used, no raw key persisted
  or ever shown again after creation).
- FR-003: Events table gains the fields needed to match the documented response contract:
  `startsAt`/`endsAt` (rename from `startDate`/`endDate`), `status` values uppercased to
  `DRAFT` / `ACTIVE` / `ARCHIVED` (rename from `draft`/`published`/`archived`), plus new optional
  fields `description`, `contactEmail`, `logoFileId`, `programPublishedAt`.
- FR-004: New public, unauthenticated marketing/reference page at `/api-docs` documenting the
  endpoint, auth, request example, response schema, and error responses — styled like
  opensession.dev's API reference page but using this app's actual Kanrei design system.
- FR-005: Structured error responses (`{ code, message, details }`) for 400 / 401 / 403 / 500.

## Out of Scope
- **Outbound webhooks / push delivery** — this issue is pull-only (`GET /api/v1/events`). Sending
  data out to Airtable, Zapier, or a website automatically the moment something changes is
  [outbound-event-webhooks](../outbound-event-webhooks/plan.md), issue #96, filed as a deliberate
  phase 2 (2026-08-12) so this issue's scope stays fixed. #96 depends on this issue's schema
  migration landing first.
- Multi-organization / `orgId` scoping — this app is single-tenant today (one shared `organizers`
  table, no `organizations` table). The API key is instance-wide, not org-scoped. See design.md
  Technical Decisions for the rationale; true multi-org support is a separate, larger feature.
- Additional endpoints (speakers, sessions, agenda) — this issue is `GET /api/v1/events` only.
- Rate limiting — noted as a known gap in design.md, not built here.
- Pagination — the events list is expected to stay small (single-tenant, one organizer's own
  events); revisit if that assumption breaks.
- An OpenAPI/Swagger spec file — the docs page is hand-written, not spec-generated.

## Success Metrics
- An organizer can generate a key and get a working `curl` response in under 2 minutes using only
  the `/api-docs` page.
- Zero unauthenticated or revoked-key requests return event data (verified in Phase 4 testing).
