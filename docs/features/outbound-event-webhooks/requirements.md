# Outbound Event Webhooks — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-12

## Problem Statement
[public-events-api](../public-events-api/plan.md) (issue #93) gives integrators a pull-only
`GET /api/v1/events` — a caller has to poll it. There's no way for Namos Sessions to push a change
out the moment it happens. Naya's ask, 2026-08-12: *"if they want to send the data from Takumi
Talks to Airtable... if they want to send the data to their website... right now they can't."*
Getting event data into Airtable or a live website today means either polling the pull API on a
timer, or nothing. This feature adds outbound webhooks so a change fires immediately, and the
organizer can wire that into Airtable (via an Automation's incoming-webhook trigger), Zapier,
Make, or their own site's endpoint.

Explicitly sequenced as **phase 2**, after #93 ships and is browser-verified — per Naya's
2026-08-12 decision to keep #93's scope unchanged and land this as its own issue.

## User Stories

**As an** organizer **I want to** register a webhook URL for my events **so that** my website
or Airtable base updates the moment I change an event, without polling.

**Acceptance Criteria:**
- GIVEN I am a signed-in organizer, WHEN I open Settings → API → Webhooks, THEN I can add a
  webhook URL, choose which event types it fires on, and see a signing secret (shown once, like
  the API key reveal in #93).
- GIVEN a webhook is registered, WHEN an event is created, updated, published, or archived,
  THEN my URL receives a POST within a few seconds, signed so I can verify it came from Takumi
  Talks.
- GIVEN my endpoint is down or errors, WHEN a delivery fails, THEN Namos Sessions retries with
  backoff and I can see the failure (status, response code, timestamp) in a delivery log — I am
  not silently dropped.
- GIVEN I no longer want a webhook, WHEN I delete it, THEN no further deliveries are attempted.

**As a** prospective integrator reading `/api-docs` **I want to** see webhooks documented next
to the pull endpoint **so that** I know push is available and don't build unnecessary polling.

## Functional Requirements
- FR-001: New `webhooks` table: organizer-configured URL + subscribed event types + signing
  secret + enabled/disabled state.
- FR-002: New `webhook_deliveries` table: one row per attempt, for the delivery log UI and retry
  bookkeeping.
- FR-003: Convex mutation on `events.save` (create/update/publish/archive) enqueues a delivery to
  every enabled webhook subscribed to that event type.
- FR-004: A Convex scheduled function/action sends the HTTP POST, HMAC-SHA256 signs the payload
  (header `X-Takumi-Signature`), retries failed deliveries with exponential backoff (e.g. 3
  attempts over ~5 minutes), and records each attempt in `webhook_deliveries`.
- FR-005: `/settings/api` gains a "Webhooks" section: add/edit/delete a webhook, view its
  delivery log (last N attempts, status, response code, "Redeliver" action).
- FR-006: `/api-docs` gains a "Webhooks" section documenting event types, payload shape,
  signature verification (with a code snippet), and retry behavior.
- FR-007: A short "Connecting to Airtable" how-to on `/api-docs` or a linked doc: register a
  webhook pointing at an Airtable Automation's "When a webhook is received" trigger URL, then map
  the JSON payload fields to base columns in the Automation. No Airtable-specific code on our
  side — Airtable's own Automations trigger is the receiving end.

## Out of Scope
- Building an Airtable-specific integration/connector — we send a generic signed webhook;
  Airtable's own Automations feature is the receiving end. (This app already moved away from
  treating Airtable as a first-class backend — see the INDEX.md cut log, 2026-08-08 — this
  feature does not reverse that; it just lets a webhook reach Airtable like any other endpoint.)
- Per-organizer webhook rate limiting/quota — single-tenant, small volume; revisit if abused.
- A generic "workflow builder" (field mapping UI, transforms) — the payload is fixed JSON;
  mapping into Airtable/Zapier/Make happens on their side, in their tool.
- Inbound webhooks (Namos Sessions receiving pushes from Airtable/other tools) — not asked for.

## Success Metrics
- An organizer can register a webhook and see a real delivery in the log within 2 minutes of
  changing an event, using only `/settings/api` and `/api-docs`.
- A failed delivery (test with a dead URL) shows up in the delivery log with a clear status,
  not silently disappears.
