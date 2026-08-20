# Organizer-Owned Form Page Model — Implementation Plan

> **Status 2026-08-19:** T002–T011 and T013–T024 are implemented. T001's production deploy audit
> and T012's public-flow browser verification remain release gates. The owner-approved prototype changed the
> final UX to a custom-pages-only rail and dedicated Preview mode; requirements.md and design.md
> record that amendment. T025–T026 remain an intentionally separate post-production follow-up:
> this PR continues dual-writing legacy `sections`.

## Phase 1: Schema + Migration Foundation

- [ ] T001: Add `pages` as an optional array field on `submission_forms` in `convex/schema.ts`
      (validator shape per design.md), alongside the existing `sections` field. Deploy — no
      behavior change yet.
- [x] T002: Write a backfill mutation (same pattern as `migrations:backfillOrganizations`,
      `convex/schema.ts:49-53`) that derives `pages` from `sections` for every existing
      `submission_forms` row — CFP shape (`account, custom(from abstract), participant?, review`)
      and Portal shape (`custom(from portal)`), with stable deterministic ids for invented
      system pages.
- [x] T003: Update `forms.save` (`convex/forms.ts:39-80`) to accept and persist `pages`, and to
      dual-write a synthesized legacy `sections` derived from `pages` so old readers keep working
      during rollout.
- [x] T004: Update `forms.createFromTemplate` (`convex/forms.ts:101-176`) and
      `convex/formTemplates.ts` to build `pages` instead of `sections`.
- [x] T005: Update `convex/seed.ts:76-106` dev seed data to seed `pages`.

## Phase 2: Migrate Readers Off `sections`

- [x] T006: Update `publicForms.get` (`convex/publicForms.ts:49-107`) to read/flatten `pages`
      instead of `sections`; grow `PublicSubmissionFormConfig` (`src/data/types.ts:73,325`) to
      carry an ordered `pages` array.
- [x] T007: Update `publicForms.submit` (`convex/publicForms.ts:130-309`) to resolve participant
      fields via `systemRole === "participant"` (or an explicit per-field `scope` tag — decide
      during implementation per design.md's note) instead of `section.key === "participant"`.
- [x] T008: Update `categoryRouting.validateRoutingRules` to resolve routing-eligible fields via
      flattened `pages[].fieldIds`.
- [x] T009: Add server-side validation in `forms.save`: system pages cannot be dropped, renamed
      as a type, or moved out of their fixed anchor position, even if the client payload tries
      (NFR-003) — do not rely on client-side "locked" UI alone.
- [x] T010: Verify `convex/portalFormResponses.ts` / `convex/portalFormConfirmationActions.ts`
      still resolve correctly (they read `field_definitions` directly, low impact expected, but
      confirm against the new shape).

## Phase 3: Extract Shared Public-Form Renderer (do before builder UI work — see design.md risk)

- [x] T011: Extract the pure rendering logic from `src/pages/public/SubmissionPage.tsx` (step
      content, progress bar, field rendering, review) into a shared component parameterized by
      `mode: "public" | "preview"`. `SubmissionPage.tsx` keeps routing, data fetching, real
      `publicForms.submit`, Turnstile, Clerk email verification, and analytics; supplies
      `mode="public"`.
- [ ] T012: Verify the real public CFP form still works end-to-end, unchanged, through the
      extracted component before touching any builder UI (browser-verify: load a real public
      form, submit it, confirm the confirmation flow — this is the single riskiest refactor in
      the whole effort per design.md).

## Phase 4: Frontend UI — CFP Builder

> ⚠️ A feature is NOT done until it is visible and usable in the UI. Every element below must
> actually exist — do not write "build a pages rail," build the pages rail with every listed
> element.

### UI Spec

**`PagesRail`** (`src/components/forms/PagesRail.tsx`)
- Location: `SubmissionFormBuilder.tsx`, left rail, replacing the page-content portion of the
  current fixed `steps` list (genuinely global settings — Form settings, Notifications — keep a
  separate small settings nav, not mixed into this rail)
- Elements:
  - Ordered rows: order number, page label, kind badge (lock icon for system pages)
  - Custom pages: inline-editable label (click to rename), remove button with confirm dialog,
    Move up / Move down icon buttons (disabled at their boundary)
  - System pages (`account`, `participant` when on, `review`): label shown, no rename/remove,
    Move buttons disabled/hidden
  - "+ Add page" button below the custom-page group
- Behavior: click selects the page and shows its fields in the center panel; Move up/down
  reorders only within the custom-page segment; Remove asks for confirmation, then detaches the
  page (fields stay in `field_definitions`)
- Data: local `pages` state, persisted via the existing `save()` call

**`FieldInspector`** (`src/components/forms/FieldInspector.tsx`)
- Location: opens in-flow (flex sibling, never `position: fixed`) when a field row is clicked
  in the selected page's field list
- Elements: Label input, Type select, Required switch, Max length input (type-dependent), Options
  textarea (dropdown/multiselect), conditional-visibility (`showIf`) picker, Close (X) button
- Locked-field variant: same layout, inputs disabled, muted explanatory text
- Behavior: edits update local draft state on change; Close returns to the field list
- Data: same `BuilderField` shape as today's `FieldRows`

**`FormPreviewHost`** (`src/components/forms/FormPreviewHost.tsx`)
- Location: right-side pane, persistent by default (replaces the "Show/Hide preview" header
  toggle button in `headerActions`, `SubmissionFormBuilder.tsx:1114-1170`)
- Elements: shared public-renderer component (from Phase 3) in `mode="preview"`, wrapped in a
  browser/device-chrome frame, "Preview — reflects unsaved edits" label at the top
- Behavior: internal Back/Continue navigate the preview's own simulated step only; styled
  distinctly (different variant/size) from the builder's real Back/Next so the two are never
  visually confusable
- Data: live-derived `PublicSubmissionFormConfig` from `{pages, fields, event}` — replaces the
  `previewDraft` useMemo (`SubmissionFormBuilder.tsx:1041-1092`) and retires
  `CfpPreviewPanel.tsx`'s separate field-type mapping/step list entirely

**`ProgressTrack`** (inside `src/components/shared/WizardShell.tsx`)
- Location: above the settings-steps list (the remaining global-settings nav, not the Pages
  rail)
- Elements: thin horizontal filled bar, proportional to `activeStep / (steps.length - 1)`, step
  labels below or as hover tooltips
- Behavior: purely visual, reflects `activeStep`

### Tasks
- [x] T013: Build `PagesRail` with every element listed above.
- [x] T014: Build `FieldInspector` with every element listed above; wire field selection from the
      page's field list to open it.
- [x] T015: Build `FormPreviewHost` wired to the Phase 3 shared renderer and expose it as the
      owner-approved dedicated Preview mode from the content toolbar.
- [x] T016: Add `ProgressTrack` to `WizardShell`.
- [x] T017: Rewire `SubmissionFormBuilder.tsx`'s `save()` (`:864-1034`) to serialize `pages`
      instead of the hard-coded two-section array.
- [x] T018: Remove or relocate the dedicated Appearance step per FR-009 (decide: cut entirely
      into event settings, or keep as a thin `events.accentColor` pass-through — either is
      acceptable, but the redundant per-form picker must go).
- [x] T019: Apply the cut/merge candidates from design.md: fold Abstracts-vs-Sessions into page
      1 as an inline toggle; collapse locked default fields into a compact "always included"
      summary instead of full expanded rows; remove the non-functional
      notify-admins-on-submission toggles (`SubmissionFormBuilder.tsx:1607-1620`, currently
      hard-coded `checked={false}` / no-op handler).
- [x] T020: Retire `src/components/forms/CfpPreviewPanel.tsx` once `FormPreviewHost` is verified
      working.

## Phase 5: Frontend UI — Portal Forms Parity

### UI Spec
Same `PagesRail`, `FieldInspector`, `FormPreviewHost` components as Phase 4, reused (not
reimplemented) in `src/pages/portal/PortalForms.tsx`'s `FormEditor` (`:192-396`). Portal Forms'
existing `FieldLibrary` (`:107-190`) plugs into the field-palette/add-field flow as-is.

### Tasks
- [x] T021: Wire `PortalForms.tsx`'s `FormEditor` to `PagesRail` + `FieldInspector` +
      `FormPreviewHost`, replacing its local 3-step `WizardShell` usage for page content.
- [x] T022: Rewire `save()` (`PortalForms.tsx:474-539`) to serialize `pages` instead of the fixed
      one-section array.
- [x] T023: Decide and implement whether Portal Forms gets `account`/`review` system-page
      scaffolding or stays single-custom-page-plus-settings (flagged as an open decision in
      design.md) — confirm with owner if genuinely ambiguous once the CFP builder is done and
      the pattern is concrete to look at.
- [x] T024: Confirm Portal Forms' preview reads `event.accentColor` (it can already receive the
      `Event` object) — Portal Forms currently has no Appearance step and none is being added;
      it should simply inherit the event's branding.

## Phase 6: Cutover

- [ ] T025 (deferred follow-up): Once every reader (builder, `publicForms.get`, `publicForms.submit`,
      `categoryRouting`) is confirmed on `pages`, stop dual-writing legacy `sections` in
      `forms.save`.
- [ ] T026 (deferred follow-up): Drop the `sections` column from `convex/schema.ts` in a follow-up deploy after
      confirming no code path reads it.

## Task Dependencies

- Phase 1 blocks Phase 2 (need `pages` to exist before anything reads it).
- Phase 3 blocks Phase 4/5's `FormPreviewHost` (preview needs the shared renderer to exist).
- Phase 2 blocks Phase 6 (can't stop dual-write until readers are migrated).
- Phase 4 and Phase 5 can run in parallel once Phase 3 is done, since they reuse the same shared
  components — but land Phase 4 (CFP) first and verify it in the browser before starting Phase 5,
  so any component-shape issues surface once, not twice.

## Verification Checklist

- [ ] All acceptance criteria in requirements.md met
- [ ] CFP builder: Pages rail visible and usable in the UI, not just implemented in Convex
- [ ] Portal Forms builder: same, at parity with CFP
- [ ] Preview panel persistent by default; its internal Back/Continue are visually distinct from
      the real wizard Back/Next (open the builder with preview showing and confirm this by eye)
- [ ] Existing (pre-migration) CFP and Portal forms open with no visible change and no data loss
- [ ] Real public CFP form still submits successfully end-to-end after the renderer extraction
      (Phase 3) — this is the highest-risk step, verify it in isolation before building on it
- [ ] Accent color set once at the event level is reflected in both builders' previews
- [ ] No regressions in routing rules or cross-field character limits (both keyed by fieldIds,
      should be unaffected, but confirm by exercising an existing form that uses both)
- [ ] Docs updated if needed
