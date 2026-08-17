# Airtable CMS Sync — Implementation Plan

> Prerequisite: `docs/features/notion-cms-sync/` implemented first (shared `content_integrations`
> table, `credentialEncryption.ts`, `contentIntegrations.ts`, `contentIntegrationsActions.ts`,
> `upsertBySourceRef` mutations already exist).

## Phase 1: Schema extension
- [x] T001: Extend `content_integrations.authMethod` union with `v.literal("airtable_pat")` and
      `config` object with `airtableBaseId: v.optional(v.string())`,
      `airtableTableName: v.optional(v.string())` in `convex/schema.ts`.

## Phase 2: Airtable backend
- [x] T002: Create `convex/airtableSync.ts` with Airtable HTTP calls (validation query, paginated
      list query) and field-mapping functions for both targets, per design.md's mapping tables.
- [x] T003: Add `connectAirtable` and `importAirtable` (or extend the generic `import` action if
      the Notion implementation was written provider-generic) to
      `convex/contentIntegrationsActions.ts`.
- [ ] T004: Confirm `internal.speakers.upsertBySourceRef` / `internal.submissions.
      upsertBySourceRef` (built for Notion) work unchanged for Airtable's `sourceRef =
      "airtable:" + recordId` — the sourceRef-based mutations are unchanged from Notion and
      Airtable sourceRef mappings are covered by automated tests; a real import still requires
      a PAT/base unavailable in this environment.

## Phase 3: Frontend UI

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### UI Spec
- **Location:** `Settings > Integrations`, "Content sources" section (already exists from the
  Notion feature) — add an Airtable card alongside the Notion card.
- **Elements:** `IntegrationCard` (icon `Table`, name "Airtable", description "Import speakers
  or submissions from an Airtable base."); dialog contains `AirtableIntegrationForm` with the
  not-connected form (Token/Base ID/Table Name/target select/Connect button/error text) and
  connected panel (status badge/target+last-synced/Import now/summary/Disconnect), exactly as
  specified in design.md's "New Components" section.
- **Behavior:** identical interaction pattern to the Notion form.
- **Data:** `repo.contentIntegrations.connectAirtable`, `.importAirtable` (status/disconnect
  reused from the Notion feature's generic slice).

### Tasks
- [x] T005: Add `AirtableConnectInput` type to `src/data/types.ts`; confirm
      `ContentIntegration.provider` already covers `"airtable"` (it should, from Notion's
      schema-aligned type).
- [x] T006: Add `connectAirtable`/`importAirtable` to the `contentIntegrations` slice in
      `src/data/repo.ts`.
- [x] T007: Build `src/components/shared/AirtableIntegrationForm.tsx` per the UI Spec above.
- [x] T008: Add the Airtable `IntegrationCard` + `Dialog` to `src/pages/settings/
      Integrations.tsx`'s "Content sources" section.
- [ ] T009: Verify the full flow in the running app with a real Airtable base: connect, import,
      confirm mapped fields, re-import and confirm no duplicates, disconnect. Local browser
      verification is blocked because the production Clerk key rejects localhost, and no test
      Clerk session or Airtable PAT/base is available in this environment.

## Task Dependencies
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [ ] Feature is accessible and usable in the UI
- [ ] Re-running "Import now" against an unchanged base produces zero duplicates
- [x] Invalid PAT / missing base or table produce the specific error messages from design.md
      (covered for Airtable HTTP 401, 403, and 404 responses)
- [x] No env var named `AIRTABLE_API_KEY` or `AIRTABLE_BASE_ID` was added or reused by this
      feature — confirm against `.env.example` diff
- [x] Existing `VITE_DATA_BACKEND=airtable` data-adapter tests still pass unchanged
