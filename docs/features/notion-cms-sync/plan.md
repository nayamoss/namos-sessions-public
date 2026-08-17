# Notion CMS Sync — Implementation Plan

## Phase 1: Foundation (shared content-integration infra)
- [x] T001: Extract `encryptCredentials`/`decryptCredentials` from `convex/emailDelivery.ts`
      into a new generic `convex/credentialEncryption.ts` (`encrypt(plaintext, envKey)` /
      `decrypt(envelope, envKey)`); update `emailDelivery.ts` to call it. No behavior change —
      run existing email integration tests after to confirm.
- [x] T002: Add `content_integrations` table to `convex/schema.ts` per design.md, plus optional
      `sourceRef` field + `by_event_sourceRef` index on `speakers` and `submissions`.
- [x] T003: Add `CONTENT_INTEGRATION_ENCRYPTION_KEY` to `.env.example` (next to
      `EMAIL_INTEGRATION_ENCRYPTION_KEY`) and to the Convex deployment env.
- [x] T004: Create `convex/contentIntegrations.ts` — internal `getInternal(eventId, provider)`
      query, internal `upsertInternal` mutation, public `status(eventId, provider)` query
      (credential-safe projection), following `convex/emailIntegrations.ts`'s structure.

## Phase 2: Notion backend
- [x] T005: Create `convex/notionSync.ts` with the Notion HTTP calls (`users/me`, database
      retrieve, database query) and the field-mapping functions for both `speakers` and
      `submissions` targets, per design.md's mapping tables.
- [x] T006: Add `internal.speakers.upsertBySourceRef` and
      `internal.submissions.upsertBySourceRef` mutations (create-or-update keyed on
      `eventId` + `sourceRef`).
- [x] T007: Create `convex/contentIntegrationsActions.ts` with `connectNotion`, `importNotion`,
      `disconnect` actions per design.md, using `assertEventOrganizerAction`.
- [x] T008: For `target: "submissions"` imports, add the one-time "Notion Import" default
      `submission_forms` row creation (first import only) reusing existing form-template
      creation code in `convex/formTemplates.ts`.

## Phase 3: Frontend UI

> ⚠️ A feature is NOT done until it is visible and usable in the UI. Build exactly the elements
> listed below — do not add or omit any.

### UI Spec
- **Location:** `Settings > Integrations` page, new "Content sources" section below the
  existing provider grid.
- **Elements:**
  - `IntegrationCard` (icon: `FileText` from `lucide-react`, name "Notion", description
    "Import speakers or submissions from a Notion database.") — same card component as the
    existing Resend/SES/Agent cards.
  - Clicking the card opens a `Dialog` containing `NotionIntegrationForm`.
  - **Not-connected form:** help text, Token input (password type), Database ID input, "Import
    into" select (Speakers/Submissions), "Connect" button (disabled until both fields
    non-empty), inline red error text on failure.
  - **Connected panel:** status badge, "Importing into {target}" + relative last-synced time,
    "Import now" button (spinner + disabled while running), post-import summary text ("N
    created, N updated" + optional "N skipped"), "more rows remain" note when `hasMore`,
    "Disconnect" button behind a confirm `AlertDialog`.
- **Behavior:** exactly as specified in design.md's "New Components" section — no additional
  states beyond not-connected / connecting / connected / importing / error.
- **Data:** `repo.contentIntegrations.status`, `.connectNotion`, `.importNotion`, `.disconnect`.

### Tasks
- [x] T009: Add `ContentIntegration` types to `src/data/types.ts` (mirrors `EmailIntegration`
      shape).
- [x] T010: Add `contentIntegrations` slice to `src/data/repo.ts` (status/connectNotion/
      importNotion/disconnect), wired to the Convex actions from Phase 2.
- [x] T011: Build `src/components/shared/NotionIntegrationForm.tsx` per the UI Spec above.
- [x] T012: Wire the Notion `IntegrationCard` + `Dialog` into `src/pages/settings/
      Integrations.tsx`, following the exact pattern of the existing email provider dialog
      (lines 124-135).
- [x] T013: Code compiles and typechecks cleanly (`npm run typecheck` — app + convex both pass);
      component renders without error in the settings page structure. Live Notion credential
      testing (connect with a real token/database, re-run import, disconnect) still needs to
      happen locally against a real Notion account — not possible from this environment.

## Task Dependencies
T001 → T002 → T003 → T004 → (T005, T006) → T007 → T008 → T009 → T010 → T011 → T012 → T013

## Verification Checklist
- [x] All acceptance criteria in requirements.md met (code-complete per design.md; see T013 note
      on live Notion verification still pending)
- [x] Feature is accessible and usable in the UI, not just implemented in Convex — Notion card +
      dialog wired into Settings > Integrations
- [ ] Re-running "Import now" against an unchanged Notion database produces zero duplicates —
      implemented via `upsertBySourceRef` keyed on `eventId`+`sourceRef`; not yet exercised
      against a real Notion database (needs local live-credential testing, see T013)
- [ ] Invalid token / unshared database produce the specific error messages from design.md, not
      generic Notion API errors — implemented in `notionSync.ts` (401 → "That token isn't
      valid.", 404 → "That database isn't shared with your Notion integration yet."); not yet
      exercised against a real Notion database
- [x] No regressions in existing `email_integrations` tests after the `credentialEncryption.ts`
      extraction — `npm test` email-scoped suite (27 tests) passes unchanged
- [x] `.env.example` updated with `CONTENT_INTEGRATION_ENCRYPTION_KEY`
