# Onboarding Multi-Source Import — Implementation Plan

**Depth:** FULL
**Type:** Feature
**Estimated effort:** 32–44 hours
**Risk:** High — external OAuth, encrypted credentials, and bulk event-data writes

## Phase 1: Shared Import Contracts and Schema

- [ ] T001: Add `OnboardingImportSource`, `ImportTarget`, canonical speaker/submission preview rows,
  `ImportPreview`, and `ImportResult` exactly as specified in `design.md` to
  `src/data/types.ts`; extend `ContentIntegrationProvider`, config, and OAuth input unions for
  `google_sheets` and `trello`.
- [ ] T002: Extend `convex/schema.ts` provider/auth unions and optional Google/Trello config fields
  on `content_integrations`; extend OAuth state/pending provider unions and add optional
  `returnTo`; keep existing indexes and existing-row compatibility.
- [ ] T003: Update the matching validators and safe projections in
  `convex/contentIntegrations.ts`; verify `credentialEnvelope` remains stripped from all public
  status responses.
- [ ] T004: Add server-only `.env.example` placeholders for `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, and `TRELLO_API_KEY`; document the Google callback alongside
  existing callbacks. Add no `VITE_` credential.
- [ ] T005: Add type/contract tests that fail if schema, repo, transport, actions, disconnect, and
  frontend provider unions drift apart.

## Phase 2: Canonical Validation and Write Path

- [ ] T006: Create `convex/importRows.ts` with exact Convex validators for canonical speaker and
  submission rows, field limits/status normalization, ≤500 enforcement, server-built sourceRefs,
  and organizer/event checks.
- [ ] T007: Implement `importRows.importManual` with args/return from `design.md`, importing only
  valid confirmed rows and returning aggregate created/updated/skipped counts.
- [ ] T008: Refactor `speakers.bulkImport` into a compatibility wrapper over shared speaker-row
  logic; preserve current CSV behavior and error language until the new UI caller migrates.
- [ ] T009: Update `speakers.upsertBySourceRef` to check `by_event_email` before a new insert and
  return an explicit skip when a different source already owns that email; preserve exact-source
  updates.
- [ ] T010: Extend `submissions.upsertBySourceRef` with optional `speakerId`; for imported past
  talks, create/reuse the closed `Imported talks` form and upsert an accepted submission linked to
  the speaker.
- [ ] T011: Unit-test trimming, email/URL/status rules, sourceRef construction, exact-source reruns,
  cross-source duplicate email, linked talk creation, malformed rows, zero rows, and 501 rows.

## Phase 3: CSV and Markdown File Sources

- [ ] T012: Generalize `src/pages/onboarding/importCsv.ts` into target-aware parsing while keeping
  current named exports compatible until callers/tests update; implement speaker and submission
  header contracts exactly.
- [ ] T013: Create `src/pages/onboarding/importMarkdown.ts`; parse exactly one GFM table, handle
  delimiter/alignment rows and escaped pipes, reject multiple/no tables, and pass plain string
  cells into canonical validation. Do not interpret HTML, frontmatter, links, or scripts.
- [ ] T014: Generate four client-side templates from constants: CSV speakers, CSV submissions,
  Markdown speakers, Markdown submissions. Speaker template retains optional talk columns.
- [ ] T015: Add parser tests for valid/invalid target schemas, CRLF, blank rows, extra columns,
  escaped pipes, empty cells, multiple tables, prose-only Markdown, 500/501 rows, and unsafe HTML
  treated as text.

## Phase 4: Google Sheets Backend

- [ ] T016: Create `convex/googleSheetsSync.ts` with bare-ID/URL parsing, Google OAuth token
  exchange/refresh, spreadsheet metadata fetch, A1 worksheet escaping, bounded `A1:Z502` values
  read, target-specific row mapping, and explicit 401/403/404/429 errors.
- [ ] T017: Expand `contentIntegrationsActions.startOAuth` and
  `completeOAuthCallback` for `google_sheets`, state-bound `returnTo`, offline read-only consent,
  encrypted access/refresh tokens, expiry, and exact redirect URI.
- [ ] T018: Add `GET /oauth/google-sheets/callback` to `convex/http.ts`; redirect successful
  onboarding state to `/onboarding` and settings state to the existing event integration route;
  never forward code/token/provider response text.
- [ ] T019: Implement `getGoogleSpreadsheet` and `finishGoogleSheetsOAuth` with exact args,
  responses, pending ownership checks, metadata validation, selected worksheet validation, and
  integration upsert from `design.md`.
- [ ] T020: Implement `previewGoogleSheets` as read-only normalized preview and
  `importGoogleSheets` as a source re-read plus confirmed shared writes; update last-sync/error
  state without deleting records.
- [ ] T021: Unit-test URL parsing, quoted worksheet names, missing headers, blank rows, >500 rows,
  token refresh, missing refresh token, provider errors, source keys, preview no-write behavior,
  and confirmed rerun idempotency.

## Phase 5: Trello Backend

- [ ] T022: Create `convex/trelloSync.ts` with `/1/authorize` URL construction, token/member
  validation, open-board listing, nested lists/cards/custom-fields reads, custom-field decoding,
  list-to-status mapping, ≤500 cap, and 401/404/429 errors.
- [ ] T023: Implement `startTrelloAuthorization` with read-only 30-day scope, same-origin fragment
  return URL, random hashed one-time state, event/user/target/return binding, and no token logging.
- [ ] T024: Implement `completeTrelloAuthorization`, `listTrelloBoards`, and
  `finishTrelloAuthorization`; consume state once, exchange browser fragment token for encrypted
  pending credentials immediately, validate board access, and persist only encrypted token +
  board ID.
- [ ] T025: Implement `previewTrello` and `importTrello`; use one nested card fetch plus lists and,
  only for speakers, custom-field definitions; never issue a per-card fetch loop.
- [ ] T026: Unit-test authorization URL parameters, wrong/expired/replayed state, token rejection,
  board filtering, speaker custom-field mapping, missing required fields, submission list mapping,
  >500 cards, 429 handling, sourceRef/card reruns, and preview no-write behavior.

## Phase 6: Notion Reuse and OAuth Return Routing

- [ ] T027: Add optional `returnTo` to existing Notion/Airtable OAuth state without changing
  Settings behavior; default absent/legacy rows to `settings`.
- [ ] T028: Extract Notion read/map code so `previewNotion` returns up to 500 canonical rows without
  writes and `importNotion` remains the confirmed writer with existing sourceRefs/cursors.
- [ ] T029: Refactor `NotionIntegrationForm` into reusable connection body behavior with
  `returnTo: "onboarding" | "settings"`; preserve current Settings dialog appearance and
  disconnect semantics.
- [ ] T030: Test existing Notion Settings OAuth, onboarding OAuth return, existing target match,
  target mismatch, invalid/expired pending state, preview, confirm, rerun, and disconnect.

## Phase 7: Data Adapter and Analytics Wiring

- [ ] T031: Add every new operation and return type to `src/data/repo.ts` with exact signatures
  from `design.md`.
- [ ] T032: Add transport operation literals/methods in `src/data/transport.ts` and Convex action/
  mutation mappings in `src/data/convex/index.ts`; include external actions in `convexActions`.
- [ ] T033: Extend `disconnect` and status provider validators everywhere; regression-test current
  Notion, Airtable, and Sanity calls.
- [ ] T034: Add analytics schemas/events for source selected, previewed, and completed with only
  source, target, and aggregate counts; test rejection/absence of filenames, IDs, row data,
  emails, OAuth parameters, and credentials.

## Phase 8: Frontend UI

> A feature is not done until all five sources are visible, usable, and browser-proven in
> onboarding. Implement the elements and behaviors below exactly; do not substitute generic
> provider cards or omit loading/error/empty states.

### UI Spec — Onboarding Shell and Source Chooser

- **Location:** `/onboarding`, step 5 of 5, inside the current centered `max-w-lg` wizard content.
- **Elements:**
  - Heading `Bring your existing data` (`text-2xl font-semibold sm:text-3xl`).
  - Description `Start with speakers or submissions you already manage. You can import another
    source later.` (`mt-2 text-sm text-muted-foreground`).
  - `ImportSourceChooser` five-card grid using exact card labels, descriptions, icons, and classes
    in `design.md`; CSV appears first.
  - After selection, `ImportTargetChooser` for Speakers/Submissions.
  - Outline `Back` returns to source chooser from a panel, or to the prior onboarding step from the
    chooser.
  - Ghost `Skip and finish` always visible and disabled only while completion itself is pending.
  - No blue buttons; use existing `Button` default/accent primary tokens and neutral variants.
- **Behavior:** source selection focuses target; changing source resets ephemeral preview only;
  provider connections remain saved; keyboard Enter/Space works; browser Back from OAuth is safe.
- **Data:** `eventId` from saved onboarding event; no provider request before explicit selection.

### UI Spec — File Import

- **Location:** same onboarding panel after CSV/Markdown source selection.
- **Elements:** target-specific template button, exact header help, dropzone/hidden input, parsing
  skeleton, format/empty/row errors, `ImportPreviewTable`, confirm/reset controls.
- **Behavior:** file parses locally; no writes before confirm; invalid rows excluded; >500 blocks;
  target change clears file after confirmation; reset returns to dropzone.
- **Data:** local parser → `importRows.importManual` on confirm.

### UI Spec — Google Sheets

- **Location:** same onboarding panel after Google Sheets selection; shared version also renders in
  Settings > Integrations dialog.
- **Elements:** minimal-scope explanation, connect/redirect state, spreadsheet URL/ID input,
  metadata loading, worksheet select, selected-source summary, preview table, confirm, reconnect,
  inline errors, disconnect AlertDialog.
- **Behavior:** OAuth returns to the same surface; inaccessible input remains editable; worksheet
  must be selected; preview writes nothing; confirm re-reads and imports.
- **Data:** start OAuth → pending metadata actions → stored integration → preview/import actions.

### UI Spec — Trello

- **Location:** same onboarding panel; shared version also renders in Settings dialog.
- **Elements:** read-only/30-day explanation, connect state, board loading/select, target-specific
  mapping help, selected board summary, preview table, confirm, reconnect, inline errors,
  disconnect AlertDialog.
- **Behavior:** token hash is cleared synchronously; board is required; missing custom fields mark
  cards invalid; target mismatch does not silently replace a saved connection.
- **Data:** state URL → fragment token → encrypted pending → board selection → stored integration →
  preview/import.

### UI Spec — Notion

- **Location:** same onboarding panel, composed from existing shared integration form behavior.
- **Elements:** connect/redirect/database select, connected status, mapping help, preview table,
  confirm, current-target mismatch explanation and alternative actions, inline errors.
- **Behavior:** uses OAuth, never internal-token input; Settings connection is reused; changing an
  existing target requires deliberate disconnect in Settings.
- **Data:** existing content integration repo plus new preview action.

### UI Spec — Shared Preview and Result

- **Preview elements:** target-specific `DataGrid`, ready/error status per row, ready/skipped counts,
  >500 warning, confirm and reset buttons; embedded horizontal scrolling at mobile width.
- **Result elements:** `Data imported` or `Nothing new was imported`, every nonzero aggregate,
  skipped-row disclosure, `Import another source`, and primary `Finish setup` with pending state.
- **Behavior:** successful import does not auto-finish; another source clears source/target result;
  Finish calls current idempotent onboarding completion and navigates to dashboard.

### Frontend Tasks

- [ ] T035: Build `ImportSourceChooser` and `ImportTargetChooser` with exact props, elements,
  classes, focus behavior, selected state, and copy in `design.md`.
- [ ] T036: Build `FileImportPanel`, wire both target-aware parsers/templates to it, and implement
  drop, choose, parsing, preview, confirm, reset, invalid, empty, over-limit, and import-error states.
- [ ] T037: Build `ImportPreviewTable` and `ImportResultPanel` with exact target columns, counts,
  skipped disclosure, has-more blocking, another-source, and finish behavior.
- [ ] T038: Build `GoogleSheetsImportPanel` with OAuth resume, URL/ID validation, worksheet select,
  preview/import, reconnect/disconnect, and every loading/error state.
- [ ] T039: Build `TrelloImportPanel`; clear hash before any await/log/analytics; wire state-token
  completion, boards, mapping help, preview/import, reconnect/disconnect, and errors.
- [ ] T040: Build `NotionOnboardingImportPanel` by composing shared Notion logic; add preview and
  current-target mismatch handling without regressing Settings.
- [ ] T041: Refactor `ImportDataStep` into the orchestrator and `OnboardingWizard` step 5 into one
  coherent control surface; preserve Back, Skip, progress count, error boundary, keyboard rules,
  completion guard, and speaker escape hatch.
- [ ] T042: Add Google Sheets and Trello `IntegrationCard` entries/dialogs to Settings using shared
  panels, safe status details, and existing grid/design language.
- [ ] T043: Add component tests for every source, target, state transition, focus/keyboard path,
  OAuth return, fragment clearing, preview, confirm, reset, retry, back, skip, another-source,
  finish, mobile overflow classes, and target mismatch.
- [ ] T044: Verify all five complete flows in a real browser at desktop and 390px width, including
  persisted Speaker/Abstract records and repeat-import behavior; record provider-console or live
  OAuth blockers explicitly rather than substituting mocks for live proof.

## Phase 9: Security, Deployment, and Regression Gates

- [ ] T045: Review all new logs, errors, analytics, query strings, browser history, and public
  projections for Google/Trello tokens, OAuth codes, provider IDs, filenames, row content, and
  email leakage.
- [ ] T046: Verify OAuth state is random, hashed, bound, single-use, expiring, and consumed before
  credential persistence for Google, Trello, and existing providers.
- [ ] T047: Configure and document production provider consoles/env without committing values:
  Google Sheets API, consent screen/verification, exact Convex callback; Trello Power-Up API key
  and allowed origin/return URL.
- [ ] T048: Run focused tests, then `npm run check`; distinguish unit/component success from live
  provider, deployment, and browser evidence.
- [ ] T049: Run `git diff --check`, review generated Convex types, and ensure only feature-scoped
  files plus the intentionally narrow index entry are part of implementation work.

## Task Dependencies

- T001–T005 precede all provider actions and UI repo wiring.
- T006–T011 precede confirmed imports for files, Google, Trello, and Notion.
- T012–T015 may run after canonical contracts and in parallel with provider backend phases.
- T016–T021 and T022–T026 are independent after schema/contracts.
- T027–T030 must land before the onboarding Notion panel.
- T031–T034 follow backend signatures and precede frontend provider wiring.
- T035–T043 follow contracts/repo wiring; source panels may be developed independently, then
  integrated by T041.
- T044 requires provider test accounts/configuration and all UI work.
- T045–T049 are release gates and cannot be replaced by local happy-path tests.

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` are mapped to tests or browser rows.
- [ ] Source chooser shows exactly CSV, Google Sheets, Trello, Notion, and Markdown.
- [ ] Speakers and Submissions targets work for all five sources under their documented mappings.
- [ ] No source writes during discovery or preview.
- [ ] CSV regression path still imports speakers and optional linked talks.
- [ ] Markdown accepts one structured table and rejects free-form/multiple-table input clearly.
- [ ] Google uses only Sheets read-only scope and a server-side code exchange.
- [ ] Trello requests only read scope, clears the fragment immediately, and encrypts the token.
- [ ] Notion Settings and onboarding share one connection implementation.
- [ ] Remote exact-record reruns update rather than duplicate.
- [ ] Cross-source duplicate speaker email skips with an explicit reason.
- [ ] Loading, empty, invalid, denial, expired, inaccessible, 429, partial-skip, all-skipped, and
  success states are visible and actionable.
- [ ] Back, skip, import-another, and finish paths preserve the correct saved state.
- [ ] Settings can manage Google/Trello connections created during onboarding.
- [ ] Credentials and imported personal data are absent from public responses and analytics.
- [ ] Desktop and 390px browser verification passes without page-level horizontal overflow.
- [ ] Existing Notion/Airtable/Sanity, route guard, speaker portal, and onboarding tests pass.
- [ ] `npm run check` and `git diff --check` pass.
- [ ] Live OAuth/provider proof, deployment proof, and local test proof are reported separately.

## Stop Condition

Planning ends with these docs and the GitHub issue. Do not create a branch, implement, configure
provider consoles, deploy, or run live OAuth until implementation is explicitly authorized.
