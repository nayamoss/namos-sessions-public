# Onboarding Multi-Source Import — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-17

## Problem Statement

The final organizer-onboarding step currently accepts only a CSV file. Organizers who already
manage speakers or proposals in Google Sheets, Trello, Notion, or Markdown must either discover a
separate Notion integration after onboarding or manually reshape their data into the CSV template.
That creates avoidable setup work at the exact point where Namos Sessions should demonstrate that
an existing event can move into the product without being rebuilt by hand.

Namos Sessions already has two useful foundations that this feature must reuse: the validated CSV
preview/import flow in `src/pages/onboarding/steps/ImportDataStep.tsx`, and the encrypted,
organizer-scoped, idempotent Notion integration in `convex/contentIntegrationsActions.ts`. This
feature replaces the CSV-only step with one source chooser covering CSV, Google Sheets, Trello,
Notion, and a structured Markdown table. It remains a manual, read-only import; it is not a general
two-way synchronization product.

## User Stories

**As an** event organizer **I want to** choose the system where my existing data lives during
onboarding **so that** I can start with my speakers or submissions already in Namos Sessions.

**As an** event organizer **I want to** preview mapped rows and validation problems before writing
anything **so that** I understand what will be created, updated, or skipped.

**As an** event organizer **I want to** safely retry or rerun an import **so that** a failed or
repeated import does not silently duplicate my event data.

**Acceptance Criteria:**

- GIVEN the organizer reaches the final onboarding step WHEN it renders THEN it presents exactly
  five source choices: CSV, Google Sheets, Trello, Notion, and Markdown, plus the existing
  `Skip and finish` escape hatch.
- GIVEN any source is selected WHEN the source setup panel opens THEN the organizer chooses
  `Speakers` or `Submissions` before previewing or importing rows.
- GIVEN a valid CSV or Markdown table WHEN the organizer selects the file THEN Namos validates at
  most 500 data rows locally, displays a row preview with per-row readiness/errors, and writes
  nothing until the organizer confirms the import.
- GIVEN a Google Sheet WHEN the organizer grants read-only Google access, pastes a spreadsheet URL
  or ID, and chooses a worksheet THEN Namos reads the header row and at most 500 data rows, shows
  the same normalized preview, and imports only after confirmation.
- GIVEN a Trello board WHEN the organizer grants read-only Trello access and selects a board THEN
  Namos previews visible cards using the documented speaker/submission mapping and imports only
  after confirmation.
- GIVEN an existing Notion connection or a newly authorized Notion database WHEN selected during
  onboarding THEN Namos reuses the current OAuth connection and import behavior instead of asking
  for an internal token or creating a second Notion integration.
- GIVEN a provider denial, expired authorization, rate limit, inaccessible source, malformed file,
  missing required column, or invalid row WHEN the flow handles it THEN the organizer receives a
  specific inline error and can retry, choose another source, or skip onboarding without losing
  the already-saved event.
- GIVEN an unchanged Google, Trello, or Notion record is imported again WHEN the import runs THEN
  the existing Namos record is updated by its provider-prefixed source reference rather than
  duplicated.
- GIVEN a speaker email already exists in the event but belongs to a different or manual source
  WHEN a new source tries to create it THEN that row is skipped with an explicit duplicate-email
  reason rather than creating a second speaker or silently overwriting it.
- GIVEN an import succeeds WHEN the result is shown THEN the organizer sees created, updated, and
  skipped counts, can import another source, or can finish setup and reach the dashboard.

## Functional Requirements

- FR-001: Replace the CSV-only onboarding body with a source chooser for `csv`, `google_sheets`,
  `trello`, `notion`, and `markdown`; CSV remains the first and recommended source so current
  functionality is not hidden.
- FR-002: Every source flow must require a target of `speakers` or `submissions` and normalize into
  one of the two canonical row shapes documented in `design.md`.
- FR-003: CSV and Google Sheets speaker imports use columns `firstName`, `lastName`, `email`,
  `bio`, `talkTitle`, and `talkAbstract`; the first three are required, and the optional talk
  columns create one accepted past-talk submission linked to the imported speaker.
- FR-004: CSV and Google Sheets submission imports use columns `title`, `status`, and `notes`;
  `title` is required, and `status` accepts `pending`, `accepted`, or `declined` case-insensitively,
  defaulting to `pending` when empty.
- FR-005: Markdown import accepts one GitHub-flavored Markdown table using the same target-specific
  column names as CSV/Google Sheets. Arbitrary prose, frontmatter, headings, lists, and multiple
  tables are not interpreted as event data.
- FR-006: Google authorization must use a server-side OAuth 2.0 authorization-code flow, encrypted
  access/refresh-token storage, state validation, and the read-only
  `https://www.googleapis.com/auth/spreadsheets.readonly` scope. It must not request Drive-wide
  access or edit permission.
- FR-007: The Google flow accepts a full `docs.google.com/spreadsheets/d/...` URL or a bare
  spreadsheet ID, validates access, lists worksheet titles, and stores only the selected
  spreadsheet ID and worksheet title in integration config.
- FR-008: Trello authorization must use Trello's `/1/authorize` read-only token flow with a
  one-time Namos state nonce, a 30-day token, and a fragment callback. The fragment token must be
  removed from browser history immediately and encrypted before persistence.
- FR-009: Trello speaker mapping uses board custom fields named `First name`, `Last name`, `Email`,
  `Bio`, `Talk title`, and `Talk abstract` (case-insensitive); the first three are required.
- FR-010: Trello submission mapping uses card name → `title`, list name
  `Pending`/`Accepted`/`Declined` → `status` (anything else → `pending`), and card description →
  `notes`.
- FR-011: Notion onboarding must reuse `NotionIntegrationForm` behavior and the existing per-event
  `content_integrations` record, but support an OAuth return destination of `/onboarding` as well
  as Settings > Integrations.
- FR-012: Remote imports are pull-only and manually triggered. They may be rerun during onboarding
  or later in Settings > Integrations; there is no scheduled polling, webhook, or outbound write.
- FR-013: A single preview contract must report `rows`, per-row `error`, `totalRows`, and
  `hasMore`; preview never writes to `speakers`, `submissions`, or `submission_forms`.
- FR-014: A single import-result contract must report created speakers, updated speakers, created
  submissions, updated submissions, and skipped rows with row/card identifiers and reasons.
- FR-015: Imports are capped at 500 rows/cards per confirmation. Files above the limit are rejected
  before upload; remote sources return the first 500 mapped rows and `hasMore: true` with clear
  guidance to narrow/split the source before importing.
- FR-016: Successful import does not automatically complete onboarding. The result panel offers
  `Import another source` and `Finish setup`; the global `Skip and finish` remains available until
  completion.
- FR-017: The source chooser and every nested state must support keyboard navigation, visible
  focus, screen-reader labels, loading states, and mobile widths without horizontal page overflow.
- FR-018: Settings > Integrations must gain Google Sheets and Trello cards using the same saved
  connection/import actions so onboarding does not create a dead-end integration that cannot be
  managed later.
- FR-019: CSV's current downloadable speaker template remains available, and target-specific CSV
  and Markdown templates are added for both speakers and submissions.
- FR-020: Analytics records source choice, preview success/failure, and import completion using
  source and target enums only; file names, spreadsheet IDs, board IDs, row content, emails, and
  credentials must never be sent to analytics.

## Non-Functional Requirements

- NFR-001: All Google and Trello credentials are encrypted with the existing
  `CONTENT_INTEGRATION_ENCRYPTION_KEY` AES-256-GCM envelope and are never returned after storage.
- NFR-002: Every public Convex action and mutation performs the existing event-organizer access
  check before reading provider credentials or writing event records.
- NFR-003: OAuth state values are random, hashed at rest, single-use, bound to user + event +
  provider + target + return destination, and expire after 10 minutes. Pending credentials expire
  after 15 minutes.
- NFR-004: Remote requests are bounded and manual. Google reads at most header + 500 rows; Trello
  uses board nested resources instead of a per-card request loop; provider `429` responses produce
  retry guidance and do not retry indefinitely inside one Convex action.
- NFR-005: Imports never delete Namos data when a source row/card disappears or a connection is
  disconnected.
- NFR-006: The implementation adds no new browser-exposed secrets. New provider identifiers and
  client credentials are server-only environment variables documented in `.env.example`.
- NFR-007: Existing CSV onboarding, existing Notion/Airtable/Sanity integrations, completed-user
  onboarding guards, and speaker-portal routing must remain regression-tested.
- NFR-008: Provider and parser logic must have deterministic unit tests; the complete source
  selection, OAuth-return, preview, import-result, retry, back, skip, and finish interactions must
  have component/browser coverage.

## Out of Scope

- Airtable in onboarding. Airtable remains available after onboarding in Settings > Integrations.
- Google Drive file browsing or Google Picker; the organizer pastes a Sheet URL/ID so Namos can
  request the narrower Sheets scope rather than Drive-wide access.
- Excel (`.xlsx`), Word, PDF, JSON, YAML/frontmatter, free-form Markdown, or AI-assisted parsing.
- User-configurable field-mapping UI. This release uses documented fixed headers/custom fields.
- Two-way sync, scheduled imports, provider webhooks, source-side updates, or source-side deletion.
- Importing attendees, sponsors, rooms, tracks, agenda placement, evaluations, tasks, files, or
  historical communications.
- Multiple Google Sheets or Trello connections for one provider on the same event.
- Changes to the existing Airtable or Sanity provider behavior.

## Success Metrics

- At least 90% of valid rows in the documented templates import without manual correction.
- A test organizer can reach a populated dashboard from each of the five onboarding source paths
  without leaving onboarding except for provider consent.
- Re-running an unchanged Google, Trello, or Notion import creates zero duplicate provider-mapped
  rows.
- No credentials, source identifiers, file names, or imported personal data appear in analytics or
  browser-visible integration-status responses.
- All five source paths pass desktop and 390px-wide browser verification, including error, empty,
  loading, back, skip, and success states.

## Research References

- Google recommends the narrowest practical scope; this plan uses Sheets read-only and avoids
  Drive scopes: https://developers.google.com/workspace/sheets/api/scopes
- Google web-server OAuth requires state, authorization-code exchange, secure client-secret
  storage, and refresh-token handling:
  https://developers.google.com/identity/protocols/oauth2/web-server
- Google Sheets values are read through `spreadsheets.values.get`:
  https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get
- Trello supports read-only, 30-day token authorization with a fragment return URL:
  https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/
- Trello recommends nested board resources and documents 429 rate-limit behavior:
  https://developer.atlassian.com/cloud/trello/guides/rest-api/rate-limits/
