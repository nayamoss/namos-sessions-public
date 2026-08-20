# Accelevents One-Way Integration — Requirements

**Type:** Feature  
**Status:** In Review — **not implemented; zero Accelevents code exists on `main` as of 2026-08-17**  
**Priority:** Medium  
**Last Updated:** 2026-08-12, reconciled 2026-08-17

> **FR-002 is superseded.** It requires a user id present in `EVENT_ADMIN_USER_IDS`. That variable
> does not exist in this repository and must not be created — authorization here is row-based
> (`organizers`, `event_members`, `convex/functions.ts`). Use `assertEventOrganizerAccess`. FR-004's
> dedicated encryption key stands; the service and scheduler secrets in `design.md` do not. Full
> audit: [`BRIEF-RECONCILIATION-2026-08-17.md`](./BRIEF-RECONCILIATION-2026-08-17.md).

## Problem Statement

Organizers currently manage accepted speakers and scheduled sessions in this application, then
re-enter the same information in Accelevents, the registration and attendee-experience platform.
That duplicate work is slow and error-prone. The competition brief originally named a native,
one-way Accelevents integration, later struck it from the required rubric, and the product owner
has explicitly chosen to build it anyway.

This application remains the source of truth for the program. Accelevents receives accepted
speaker profiles and scheduled sessions. Accelevents attendee registrations, ticketing, check-in,
engagement, streaming, and other platform-only settings never flow back into this application.

## User Stories

**As an** event organizer **I want to** connect one event to its corresponding Accelevents event
**so that** I can transfer program data without copying it by hand.

**As an** event organizer **I want to** preview the exact records and validation problems before
the first sync **so that** I can fix incomplete speakers or sessions without partially publishing
bad data.

**As an** event organizer **I want to** run a sync immediately and see per-record results **so
that** I know which speakers and sessions reached Accelevents and how to recover failures.

**As an** event organizer **I want to** enable automatic resync **so that** later program changes
reach Accelevents without repeated data entry.

### Acceptance Criteria

- GIVEN an authenticated event administrator and an event with no connection WHEN they open
  Configure > Integrations THEN the Accelevents card says `Not connected` and opens a connection
  form.
- GIVEN a valid Accelevents API key, event URL slug, and numeric event ID WHEN the organizer tests
  and saves the connection THEN the API key is encrypted server-side, never returned to or logged
  by the browser, and the card says `Connected`.
- GIVEN invalid credentials or an event mismatch WHEN the organizer tests the connection THEN no
  credentials are saved and the UI shows an actionable error without exposing the key.
- GIVEN a connected event WHEN the organizer selects `Review sync` THEN the UI shows counts for
  eligible speakers, eligible sessions, unchanged records, and blocked records plus a row-level
  reason for every blocked record.
- GIVEN an accepted speaker with a normalized email address WHEN a sync runs THEN Accelevents is
  matched by the persisted external ID first and by exact normalized email only when no mapping
  exists; the remote speaker is created or updated once and the mapping is persisted.
- GIVEN an accepted submission with a valid agenda item, room, start/end time, and all speaker
  mappings WHEN a sync runs THEN the Accelevents session is created or updated once and linked to
  the intended speakers using the credentialed sandbox-verified Accelevents request contract.
- GIVEN a submission that is not accepted, has no agenda item, has an unpublished agenda item, is
  outside the Accelevents event window, or has an incomplete speaker WHEN a sync runs THEN it is
  skipped with a visible reason and no partial remote session is created.
- GIVEN an already-synced record with no mapped-field changes WHEN a sync reruns THEN no remote
  update is sent for that record.
- GIVEN an already-synced record whose mapped source fields changed WHEN a sync reruns THEN only
  source-owned mapped fields are updated; Accelevents-only settings remain untouched.
- GIVEN a remote record deleted from Accelevents while its local source remains eligible WHEN the
  next sync runs THEN the record is recreated and the new external ID replaces the stale mapping.
- GIVEN a local record becomes ineligible or is deleted WHEN a sync reruns THEN the integration
  reports it as `Needs attention` and does not automatically delete or hide the Accelevents record.
- GIVEN automatic sync is enabled WHEN the event is more than 48 hours away THEN eligible events
  are dispatched no more than hourly; WHEN the event is live or within 48 hours THEN they are
  dispatched every 15 minutes.
- GIVEN a transient Accelevents failure or rate limit WHEN a sync runs THEN completed records stay
  recorded, failed records receive a safe error, retryable failures use bounded backoff, and a
  later retry does not duplicate successful records.
- GIVEN a running sync WHEN the organizer refreshes or logs out and back in THEN current status and
  completed results reload from persisted run data.
- GIVEN the integration is disconnected WHEN the organizer confirms disconnection THEN the
  credential is deleted, automatic sync stops, historical non-secret run evidence remains, and no
  Accelevents records are deleted.

## Functional Requirements

- FR-001: Add an event-scoped `/settings/integrations` page and an Accelevents integration card.
- FR-002: Require a verified Clerk session whose user ID is present in `EVENT_ADMIN_USER_IDS` for
  all connection, preview, sync, scheduling, and disconnect operations.
- FR-003: Collect `eventUrl`, numeric `externalEventId`, API key, and `autoSyncEnabled`; do not
  collect or hardcode a platform base URL.
- FR-004: Encrypt the API key with AES-256-GCM before it reaches Convex, using a dedicated
  server-only encryption key and service secret.
- FR-005: Test the saved event identity through Accelevents host endpoints before accepting the
  configuration.
- FR-006: Export only accepted speakers and accepted, published, scheduled sessions.
- FR-007: Map speaker fields: first name, last name, email, pronouns, bio, LinkedIn, X/Twitter, and
  a fresh server-resolved headshot URL when available. Title/company remain omitted until this
  product owns those fields.
- FR-008: Map session fields: title, description, event-local start/end time in Accelevents'
  required format, room/location, default `BREAKOUT_SESSION` format, `PUBLIC` visibility, visible
  status, and assigned speaker IDs. Track/tag export is deferred until credentialed contract tests
  prove the exact remote IDs and association payload.
- FR-009: Persist external speaker/session IDs and a SHA-256 hash of mapped source fields so sync
  is idempotent and avoids unnecessary writes.
- FR-010: Run speakers before sessions. A session cannot sync until every assigned speaker has a
  successful external mapping.
- FR-011: Persist one run record plus one item record per attempted speaker/session, including
  status, attempt count, safe message, source hash, and external ID.
- FR-012: Provide preflight preview, manual background sync, automatic scheduled sync, latest-run
  status polling, bounded retry, and confirmed disconnect.
- FR-013: Never infer two-way conflict resolution. This application overwrites only its documented
  mapped fields; all other Accelevents fields remain Accelevents-owned.
- FR-014: Add seed/demo disconnected and completed-run states without real credentials.
- FR-015: Update `.env.example`, deployment documentation, feature index, page inventory, UI
  inventory, design-system route table, and tests with the integration.

## Non-Functional Requirements

- NFR-001 (security): The API key must never enter a `VITE_*` variable, client state after the
  save request completes, repository response, analytics payload, or log message.
- NFR-002 (authorization): UI visibility is not an authorization boundary. Every server endpoint
  verifies Clerk and the event-admin allowlist before reading integration state or changing it.
- NFR-003 (reliability): A retry must be idempotent per `(eventId, entityType, localId)` and must
  resume after partial failure without duplicating successful remote records.
- NFR-004 (performance): Preview/status requests return within 2 seconds for the seeded demo.
  Long-running remote work uses a background Convex action rather than a synchronous request.
- NFR-005 (runtime): The 15-minute scheduler only dispatches work; it does not perform the sync
  inside the scheduled invocation.
- NFR-006 (observability): Every run records aggregate counts and sanitized item failures. Secret
  values and raw remote response bodies are excluded.
- NFR-007 (accessibility): The connection form, preview table, status badges, confirmation dialog,
  and live run updates are keyboard reachable and announced with semantic labels/status regions.
- NFR-008 (portability): Feature UI uses an explicit integrations service, not the swappable
  program-data `Repository`; the external push workflow is Convex-backed and fails closed when the
  selected program backend cannot supply its required data.

## Out of Scope

- Importing attendees, registrations, ticket types, payments, check-ins, engagement, or analytics.
- Webhooks from Accelevents or any Accelevents-to-this-application data flow.
- Syncing exhibitors, sponsors, companies, booth data, portal resources, or arbitrary documents.
- Two-way merge/conflict resolution or importing manual Accelevents edits.
- Automatic deletion/hiding of remote records after local deletion, withdrawal, rejection, or
  unscheduling.
- Syncing drafts, pending submissions, rejected submissions, or unpublished agenda items.
- Multiple Accelevents destinations per local event.
- Organization-wide integrations or Clerk Organizations; scope remains `eventId`.
- User-configurable field mapping in the first release.
- Accelevents OAuth; the official API-key path is used.

## Success Metrics

- A connected organizer completes first sync without manual Accelevents re-entry.
- 100% of eligible seeded speakers and sessions either sync or show a specific preflight reason.
- Repeating an unchanged sync creates zero duplicates and sends zero update requests.
- A changed mapped field appears in Accelevents on the next successful sync.
- No integration secret is present in browser bundles, browser responses, Convex public queries,
  logs, issue artifacts, or repository history.
- The browser-proven journey covers connect, preview, manual sync, refresh persistence, one
  recoverable failure, automatic-sync toggle, and disconnect.
