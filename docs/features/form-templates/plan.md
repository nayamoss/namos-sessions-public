# Form Templates — Implementation Plan

## Phase 1: Template Catalog & Backend
- [x] T001: Create `src/components/forms/formTemplates.ts` — `FORM_TEMPLATES: FormTemplate[]`
      with all 12 templates (6 `appliesTo: "cfp"`, 6 `appliesTo: "portal"`) per design.md's spec,
      each with an icon from `lucide-react`
- [x] T002: Create `convex/formTemplates.ts` — server-side subset of the same 12 templates
      (label/type/required/maxChars/options/kind/sections/participantRoles/portalFormSettings —
      no icons or UI copy), with a comment pointing at `src/components/forms/formTemplates.ts`
      as the sibling file to keep in sync
- [x] T003: Add `forms:createFromTemplate` mutation to `convex/forms.ts` — resolves `templateId`
      against the catalog, dedupes `field_definitions` by case-insensitive label (reuse existing
      id or insert), inserts a `status: "draft"` `submission_forms` row, returns its id. Guarded
      by `assertOrganizer(ctx)` like every other mutation in the file.
- [x] T004: Add `forms.createFromTemplate` to `FormsRepo` in `src/data/repo.ts`, to
      `WriteOperation` in `src/data/transport.ts`, map it in `src/data/convex/index.ts`, and add
      it to the unsupported-operation throw list in `src/data/airtable/index.ts`

## Phase 2: Frontend UI (REQUIRED — never skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### UI Spec

**TemplateGallery** (`src/components/forms/TemplateGallery.tsx`)
- Location: Replaces the forms list in-page on `/program/forms` and `/portals/forms` when
  "+ Add" / "+ Add form" is clicked — same `AppLayout`, not a new route.
- Elements:
  - Header: "Choose a template" (h2), subtext "Start from a template or build from scratch.",
    Cancel button top-right
  - Grid (`md:grid-cols-3`) of template cards, one per applicable template (6 cards, filtered by
    `appliesTo`): Lucide icon (size 20, muted), name (font-semibold), one-line description
    (text-sm text-muted-foreground), small kind tag
  - 7th card, visually distinct (neutral/dashed, not accent): "Start from blank" — Plus icon,
    "Build a form with no pre-filled fields" subtext
  - Loading/disabled state: after a card click, whole grid disables; clicked card shows a small
    inline spinner in place of its icon
  - Error state: `role="alert"` red text above the grid if `createFromTemplate` fails; grid
    re-enables
- Behavior:
  - Click template card → `repo.forms.createFromTemplate(templateId, eventId)` → on success,
    open the wizard on the returned form id (navigate for `/program/forms`, set `editing` state
    for `/portals/forms`) → on failure, inline error + re-enable grid
  - Click "Start from blank" → same as today's blank-create path, no network call
  - Click Cancel → return to forms list, nothing created
- Data: reads `FORM_TEMPLATES` (filtered by `appliesTo`) from the static catalog; writes via
  `repo.forms.createFromTemplate`

### Tasks
- [x] T005: Build `TemplateGallery` with every element listed in the UI Spec above
- [x] T006: Wire `SubmissionForms.tsx` — "+ Add" opens `TemplateGallery` (`appliesTo: "cfp"`)
      instead of linking directly to `/program/forms/new/edit`; template pick navigates to
      `/program/forms/:id/edit` on the new id; "Start from blank" preserves the current link
      behavior; Cancel returns to the list
- [x] T007: Wire `PortalForms.tsx` — "+ Add form" opens `TemplateGallery` (`appliesTo: "portal"`)
      instead of immediately calling `setEditing(newForm())`; template pick calls `load()` then
      `setEditing()` on the new form; "Start from blank" keeps calling `setEditing(newForm())`
      directly; Cancel returns `editing` to `undefined`
- [ ] T008: Verify full flow end-to-end in the browser for at least 2 CFP templates and 2 portal
      templates: gallery renders → pick → wizard pre-filled correctly → save → appears in list

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

## Phase 3: Verification
- [ ] T009: Convex test — each of the 12 templates, when applied via `createFromTemplate`,
      produces a `submission_forms` row that also passes `forms:save`'s own validation
      (pageHeading ≤ 15 chars, valid routing rules, etc.)
- [ ] T010: Convex test — applying two templates that share a field label (e.g. "Email") creates
      exactly one `field_definitions` row, not two

## Task Dependencies
T001, T002 → T003 → T004 → T005 → T006, T007 → T008
T003 → T009, T010 (can run in parallel with T005-T008)

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [x] Gallery is reachable from both `/program/forms` and `/portals/forms` "+ Add" — not just
      implemented in the backend
- [x] "Start from blank" behaves identically to today's pre-feature behavior on both pages
- [ ] No duplicate `field_definitions` rows created across templates that share a field label
- [ ] No regressions to the existing forms list, wizard, duplicate, or delete flows
- [ ] Docs updated if `submission-form-builder`/`portal-forms` plan docs reference "+ Add" flow
