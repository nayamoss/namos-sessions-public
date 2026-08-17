# Airtable CMS Sync — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-16

## Problem Statement
Same problem as `docs/features/notion-cms-sync/`, for organizers who track CFP/speaker data in
Airtable instead of Notion. This feature adds a per-event Airtable connection, built on the
`content_integrations` table and `contentIntegrationsActions.ts` module shipped by the Notion
feature — ship Notion first.

**Important — do not confuse with an unrelated existing feature.** This codebase already has an
"Airtable" concept that means something completely different: `VITE_DATA_BACKEND` can be set to
`airtable` to make Airtable the app's *own* primary database instead of Convex
(`src/data/airtable/reactive.tsx`, `src/data/backend.ts`, `docs/features/data-adapter/`,
env vars `AIRTABLE_API_KEY` / `AIRTABLE_BASE_ID` in `.env.example:11-12`, consumed by
`functions/api/data.ts`). This feature is unrelated: it is a per-event *content source*
connection (like the Notion feature), used regardless of which backend the app itself runs on.
**New env vars for this feature must not reuse the `AIRTABLE_API_KEY`/`AIRTABLE_BASE_ID` names**
— see design.md's naming decision.

## User Stories
**As an** event organizer **I want to** connect an Airtable base/table and import its rows as
speakers or submissions **so that** I don't have to manually re-enter data I already track in
Airtable.

**Acceptance Criteria:**
- GIVEN an organizer with an Airtable personal access token, a base ID, and a table name WHEN
  they enter these into Settings > Integrations THEN the connection is validated against the
  real Airtable API before being saved.
- GIVEN a connected Airtable integration WHEN the organizer clicks "Import now" THEN new
  Airtable records are created as speakers or submissions and existing ones (matched by stored
  Airtable record ID) are updated, with a created/updated/skipped summary shown.
- GIVEN an Airtable API error (invalid token, base/table not found, rate limit) WHEN import runs
  THEN the organizer sees the specific error and no partial data is silently dropped.

## Functional Requirements
- FR-001: Organizer can connect one Airtable integration per event, choosing whether it imports
  into `speakers` or `submissions` — same choice as Notion.
- FR-002: Connecting validates the personal access token + base ID + table name against
  Airtable's API (`GET /v0/{baseId}/{tableName}?maxRecords=1`) before any credential is stored.
- FR-003: Import is pull-only, manually triggered via "Import now" — no polling/webhook in v1,
  matching the Notion feature's scope decision.
- FR-004: Each imported row stores the source Airtable record ID (`sourceRef =
  "airtable:" + recordId`) so re-running import updates the same record instead of duplicating.
- FR-005: Organizer can disconnect, deleting the stored credential but leaving already-imported
  records untouched.
- FR-006: Field mapping from Airtable column names to speaker/submission fields is fixed (not
  user-configurable) in v1, same reasoning as Notion.

## Non-Functional Requirements
- NFR-001: Airtable credentials (personal access token) stored AES-256-GCM encrypted using the
  shared `convex/credentialEncryption.ts` helper introduced by the Notion feature — no new
  crypto code.
- NFR-002: Airtable's API returns up to 100 records per page; import fetches up to 2 pages (200
  records) per "Import now" run, same bound as Notion, using Airtable's `offset` pagination
  token stored on `content_integrations.lastSyncCursor`.

## Out of Scope
- Two-way sync — pull-only in v1, same as Notion.
- Field mapping UI.
- Scheduled/automatic sync.
- Any change to the existing `VITE_DATA_BACKEND=airtable` data-adapter feature — that code path
  is untouched by this feature.

## Success Metrics
- An organizer can go from "have an Airtable base" to "speakers imported into the event" in
  under 3 minutes.
- Zero duplicate records created on repeated "Import now" runs against an unchanged base.
