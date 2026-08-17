# Sanity CMS Sync — Implementation Plan

> Prerequisite: `docs/features/notion-cms-sync/` implemented first (shared `content_integrations`
> table, `credentialEncryption.ts`, `contentIntegrations.ts`, `contentIntegrationsActions.ts`
> already exist).

## Phase 1: Schema extension
- [x] T001: Extend `content_integrations.authMethod` with `v.literal("sanity_token")`,
      `direction` with `v.literal("push")` (if not already added), `target` with
      `v.literal("public_program")`, and `config` with `sanityProjectId`/`sanityDataset` in
      `convex/schema.ts`.
- [x] T002: Add optional `sanityDocId: v.optional(v.string())` to `agenda_items` and `speakers`
      in `convex/schema.ts`.

## Phase 2: Sanity backend
- [x] T003: Create `convex/sanitySync.ts` with Sanity API calls (read-validate query, write-
      permission dry-run mutate, batched real mutate) and document-shape builders for
      `namosSession`/`namosSpeaker` per design.md.
- [x] T004: Add `internal.agenda.setSanityDocId` and `internal.speakers.setSanityDocId` internal
      mutations (single-field patch, keyed by row id).
- [x] T005: Add `connectSanity` and `publishSanity` actions to
      `convex/contentIntegrationsActions.ts`, reusing `assertEventOrganizerAction` and the
      existing published-agenda query in `convex/agenda.ts` (do not duplicate that filter).

## Phase 3: Frontend UI

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### UI Spec
- **Location:** `Settings > Integrations`, "Content sources" section — add a Sanity card
  alongside Notion/Airtable.
- **Elements:** `IntegrationCard` (icon `Globe`, name "Sanity", description "Publish confirmed
  sessions and speakers to a Sanity dataset."); dialog contains `SanityIntegrationForm` with
  not-connected form (Project ID/Dataset/API Token/Connect button/error text) and connected
  panel (status badge/dataset+last-published/"Publish now"/summary with expandable failures
  list/"more remain" note/static disconnect-doesn't-delete help text/Disconnect button), exactly
  as specified in design.md's "New Components" section.
- **Behavior:** identical interaction pattern to Notion/Airtable forms, plus the expandable
  failures `<details>` element when `failed > 0`.
- **Data:** `repo.contentIntegrations.connectSanity`, `.publishSanity`.

### Tasks
- [x] T006: Add `SanityConnectInput`, `SanityPublishResult` types to `src/data/types.ts`.
- [x] T007: Add `connectSanity`/`publishSanity` to the `contentIntegrations` slice in
      `src/data/repo.ts`.
- [x] T008: Build `src/components/shared/SanityIntegrationForm.tsx` per the UI Spec above.
- [x] T009: Add the Sanity `IntegrationCard` + `Dialog` to `src/pages/settings/
      Integrations.tsx`'s "Content sources" section.
- [ ] T010: Verify the full flow against a real Sanity project with `namosSession`/
      `namosSpeaker` document types provisioned: connect, publish, confirm documents appear
      correctly in Sanity Studio, re-publish and confirm no duplicates (same `_id`s updated in
      place), disconnect and confirm documents remain in Sanity.

> **Live verification boundary (2026-08-16):** T010 remains unchecked because this environment
> has no organizer-provided Sanity project, matching document schemas, or Editor/read-only test
> tokens. Focused tests cover the fixed document shapes, deterministic IDs, read + write dry-run
> requests, read-only rejection, per-document failure isolation, repository wiring, and all form
> states. Real Sanity Studio creation/update/no-duplicate/disconnect-retention proof is still
> required before checking T010 or the provider-dependent verification items below.
>
> **Rendered UI verification boundary (2026-08-16):** the app compiled and served on
> `127.0.0.1:3000`, but Settings > Integrations is Clerk-gated and the checked-in fallback is a
> production key restricted to `namos-sessions.xyz`. No matching `.env.local` dev key or reusable
> authenticated browser session is available, so Clerk rejected the local origin before the route
> could render. The focused React tests exercise the card/form interactions, but they are not a
> substitute for an authenticated real-browser walkthrough; that gate remains blocked.

## Task Dependencies
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [ ] Feature is accessible and usable in the UI
- [ ] Re-running "Publish now" against unchanged data produces zero duplicate Sanity documents
- [ ] Only `isPublished: true` sessions and `confirmationStatus: "confirmed"` speakers are ever
      published — verify by publishing an event with at least one draft session and confirming
      it does not appear in Sanity
- [ ] A read-only Sanity token is rejected at connect time, not discovered later at publish time
- [ ] Disconnecting does not delete previously published Sanity documents
