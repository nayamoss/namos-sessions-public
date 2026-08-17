# Notion CMS Sync — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-16

## Problem Statement
Organizers frequently track CFP pipeline, speaker outreach, or session notes in a Notion
database before (or alongside) using Namos Sessions. There is currently no way to pull that
work into an event without re-typing it. This feature adds a per-event Notion connection that
imports speakers and/or submissions from a Notion database the organizer points at, using the
same encrypted-integration pattern already proven for email delivery
(`convex/email_integrations`, `convex/emailIntegrationsActions.ts`).

This also establishes the shared `content_integrations` table and `contentSync` action module
that the Airtable (`docs/features/airtable-cms-sync/`) and Sanity (`docs/features/sanity-cms-sync/`)
sync features build on — Notion ships first because it is the smallest surface (read-only
import, no bidirectional field mapping).

## User Stories
**As an** event organizer **I want to** connect a Notion database and import its rows as
speakers or submissions **so that** I don't have to manually re-enter data I already track in
Notion.

**Acceptance Criteria:**
- GIVEN an organizer with a Notion internal integration token and a database shared with that
  integration WHEN they paste the token and database ID into Settings > Integrations THEN the
  connection is validated against the real Notion API before being saved.
- GIVEN a connected Notion integration WHEN the organizer clicks "Import now" THEN new Notion
  rows are created as speakers or submissions (organizer's choice per connection) and existing
  ones (matched by a stored Notion page ID) are updated, and the organizer sees a summary of
  created/updated/skipped counts.
- GIVEN a Notion API error (invalid token, database not shared with the integration, rate
  limit) WHEN import runs THEN the organizer sees the specific error and no partial data is
  silently dropped.

## Functional Requirements
- FR-001: Organizer can connect one Notion integration per event, choosing whether it imports
  into `speakers` or `submissions`.
- FR-002: Connecting validates the token + database ID against Notion's API (`users.me` and a
  database retrieve call) before any credential is stored.
- FR-003: Import is pull-only (Notion → Namos Sessions) and manually triggered ("Import now"
  button). No automatic polling or webhook in v1.
- FR-004: Each imported row stores the source Notion page ID so re-running import updates the
  same record instead of duplicating it.
- FR-005: Organizer can disconnect the integration, which deletes the stored credential but
  leaves already-imported records untouched.
- FR-006: Field mapping from Notion properties to speaker/submission fields is fixed (not
  user-configurable) in v1 — documented explicitly in design.md — because a mapping UI is out
  of scope for this pass.

## Non-Functional Requirements
- NFR-001: Notion credentials (internal integration token) are stored AES-256-GCM encrypted
  using the same envelope shape as `email_integrations.credentialEnvelope`, never returned to
  the browser.
- NFR-002: Import runs as a Convex Node action with a bounded row count per run (200 rows) to
  stay under Convex's action execution limits; importing a larger database requires re-running
  "Import now", which resumes from the last synced page cursor.

## Out of Scope
- Two-way sync (writing Namos data back to Notion) — Notion is pull-only in v1.
- User-configurable field mapping UI.
- Automatic/scheduled sync (cron) — manual "Import now" only.
- Notion OAuth (public integration) — v1 uses an internal integration token the organizer
  creates themselves in Notion and pastes in, same trust model as the existing Resend API-key
  flow.

## Success Metrics
- An organizer can go from "have a Notion database" to "speakers imported into the event" in
  under 3 minutes without engineering help.
- Zero duplicate speaker/submission records created on repeated "Import now" runs against an
  unchanged Notion database.
