# Organizer-Owned Form Page Model — Technical Design

> **Final UX amendment (2026-08-19):** The owner-approved HTML prototype supersedes the early
> persistent-preview and visible-system-page details in this document. Production uses a
> custom-pages-only rail and a dedicated Preview mode. System pages remain in the authoritative
> page model and public flow, with their anchors enforced server-side.

## Database / Schema Changes

### Current Schema (affected tables)

`convex/schema.ts:208-225` — `submission_forms` (one table already serves both CFP and Portal
forms; they're distinguished by `kind`, not by table):

```ts
submission_forms: defineTable({
  eventId: v.id("events"),
  kind: v.union(v.literal("abstract"), v.literal("session"), v.literal("contact"),
                 v.literal("group"), v.literal("submission_task")),
  sections: v.array(v.object({
    id: v.string(),
    key: v.union(v.literal("abstract"), v.literal("participant"), v.literal("portal")),
    title: v.string(), pageHeading: v.string(), description: v.optional(v.string()),
    fieldIds: v.array(v.string()),
  })),
  crossFieldLimits: v.array(v.object({ /* unchanged, keyed by fieldIds */ })),
  routingRules: v.optional(v.array(v.object({ /* unchanged, keyed by fieldId */ }))),
  participantRoles: v.array(v.object({ /* unchanged */ })),
  // ...welcomeMessage, showWelcomeMessage, collectParticipants, etc.
})
```

`convex/schema.ts:226` — `field_definitions`: flat, org-wide, already page-agnostic
(`label, type, maxChars, options, locked, required, showIf`). No change needed.

`convex/schema.ts:164` — `events`: `accentColor: v.optional(v.string())`,
`logoStorageKey: v.optional(v.string())`. Already the single source of branding truth.

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| submission_forms | ADD COLUMN | `pages` | `v.optional(v.array(pageValidator))` | dual-write alongside `sections` during rollout |
| submission_forms | KEEP (temporarily) | `sections` | unchanged | mark `v.optional` once dual-write starts; drop in a later deploy after full migration |

`pageValidator`:
```ts
v.object({
  id: v.string(),
  kind: v.union(v.literal("system"), v.literal("custom")),
  systemRole: v.optional(v.union(v.literal("account"), v.literal("participant"), v.literal("review"))),
  label: v.string(),
  pageHeading: v.string(),
  description: v.optional(v.string()),
  fieldIds: v.array(v.string()),
})
```
Array order is the page order — no separate `order` field needed (Convex arrays preserve order;
this matches how `sections`/`fieldIds` ordering already works today).

### Migration

Phased, per NFR-001 (no downtime, no data loss):

1. **Add `pages` as optional** on `submission_forms`. Deploy. No behavior change yet.
2. **Dual-write**: `forms.save` writes both `pages` (new, authoritative for the rebuilt UI) and a
   synthesized legacy `sections` (derived from `pages`, so old readers keep working) on every
   save from the rebuilt builder.
3. **Migrate readers**: `publicForms.get`, `publicForms.submit`, `categoryRouting.ts`'s
   `validateRoutingRules` move from reading `.sections` to reading `.pages` (flattened
   `fieldIds` across all pages for anything that today flattens across sections; `systemRole ===
   "participant"` for anything that today checks `key === "participant"`).
4. **Backfill mutation** (same pattern as `migrations:backfillOrganizations` referenced at
   `schema.ts:49-53`): for every existing row missing `pages`, derive it from `sections`:
   - CFP forms: `[account(system), <custom page from abstract section>, participant(system, if
     collectParticipants), review(system)]`. Preserve the abstract section's
     `title/pageHeading/description` verbatim on the custom page so nothing visibly changes.
     `welcomeMessage`/`showWelcomeMessage` (currently top-level wizard fields, not a section)
     become the `account` system page's description content, or stay top-level and get injected
     into the rendered Welcome/Account page — decide during implementation, not a schema
     blocker either way.
   - Portal forms: `[<custom page from portal section>]` — no participant/system-page
     complexity.
   - Generate **stable, deterministic ids** for invented system pages (e.g.
     `${formId}-account`, `${formId}-review`) so re-running the backfill or re-saving never
     forks duplicates.
   - **New/never-saved forms** (`id === "new"` in `SubmissionFormBuilder.tsx:756`) need no
     backfill — seed the default `pages` array directly in the new shape in the client's initial
     state.
5. **Stop dual-writing `sections`** once every reader is confirmed on `pages`.
6. **Drop `sections`** column in a later deploy.

---

## Backend / API

### Affected Existing Endpoints (all Convex functions, not HTTP, but same idea)

| Function | File:Line | Change |
|----------|-----------|--------|
| `forms.save` | `convex/forms.ts:39-80` | Accept/write `pages`; dual-write legacy `sections`; repoint `validateRoutingRules(ctx, eventId, args.form.sections ?? [], routingRules)` (line 48-53) at pages-derived fieldIds |
| `forms.createFromTemplate` | `convex/forms.ts:101-176` | Build `pages` instead of `sections` at the point it currently builds `sections` (lines 135-144); requires `formTemplates.ts` to gain a page-kind concept |
| `forms.duplicate` | `convex/forms.ts:81-100` | No explicit section logic — works unchanged once the doc shape includes `pages` |
| `publicForms.get` | `convex/publicForms.ts:49-107` | Line 58 flatten (`form.sections.flatMap(...)`) and lines 85-91 (1:1 section→public-section map) become page-based; `PublicSubmissionFormConfig` type (`src/data/types.ts:73,325`) grows a `pages` array |
| `publicForms.submit` (internalMutation) | `convex/publicForms.ts:130-309` | Lines 150-152 (`section.key === "participant"` partition) become `systemRole === "participant"` lookup, or better: keep an explicit `scope: "submission" | "participant"` tag per field-in-page so participant collection stays a scope, not just page identity (per the original FINDINGS proposal, `form-builder-review/FINDINGS.md:107`) |
| `categoryRouting.validateRoutingRules` | `convex/categoryRouting.ts` | Resolve routing-eligible fields via flattened `pages[].fieldIds` instead of sections |
| `convex/seed.ts:76-106` | dev seed | Update to seed `pages` so local dev doesn't diverge |

### New Endpoints

None — this is a shape change to existing `forms.save`/`publicForms.get`/`publicForms.submit`
args/return types, not new routes. `args: { form: v.any() }` on `forms.save`
(`convex/forms.ts:39-40`) already accepts arbitrary shape, so the mutation signature itself
doesn't need a new endpoint — just internal logic changes.

### Validation & Business Logic

- Page `label` uniqueness within a form.
- Page order: array position is authoritative; system pages have fixed anchor positions
  (`account` always first, `participant`/`review` always trail all custom pages) enforced
  **server-side** in `forms.save`, not just hidden client-side — a client payload that drops or
  reorders a system page must be rejected (NFR-003).
- `assertEventOrganizerAccess`/`assertEventAccess` guards (`convex/functions.ts:113-129`) stay
  exactly as-is — no auth model change, just called from the same mutations as today.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/pages/program/SubmissionFormBuilder.tsx` | Replace the fixed 8-item `steps` array (`:119-128`) usage for page content with a new Pages rail driven by form state; keep a (shrunk) settings-steps list for genuinely global settings (Welcome copy defaults, Form settings, Notifications) separate from the Pages rail. `save()` (`:864-1034`) serializes `pages` instead of the hard-coded two-section array (`:961-986`). Remove the dedicated Appearance step per FR-009 (moves to event settings) or keep as a thin pass-through to `events.accentColor` — implementation decides based on effort budget. |
| `src/pages/portal/PortalForms.tsx` | `FormEditor` (`:192-396`) adopts the same Pages rail + field palette (`FieldLibrary`, `:107-190`, already reusable as-is) + shared preview; `save()` (`:474-539`) serializes `pages` instead of the fixed one-section array (`:504-513`) |
| `src/pages/public/SubmissionPage.tsx` | Extract pure rendering (step content, `WizardShell`/progress, field rendering, review) into a shared component parameterized by `mode: "public" \| "preview"`; `SubmissionPage.tsx` keeps routing/data-fetching/real submit/Turnstile/analytics and supplies `mode="public"` |
| `src/components/shared/WizardShell.tsx` | Add a real progress-bar visual (filled/segmented track) above the step list, not just numbered-circle badges, per FR-008 |
| `src/components/forms/CfpPreviewPanel.tsx` | Replaced by the new shared-renderer preview host (see New Components) — retire this file's hand-maintained `previewType` mapping (`:69-74`) and second step list (`:16`) once the shared renderer lands |

### New Components

**`PagesRail`**
- File: `src/components/forms/PagesRail.tsx`
- Props: `{ pages: FormPage[]; activePageId: string; onSelect: (id: string) => void; onAdd: () => void; onRemove: (id: string) => void; onRename: (id: string, label: string) => void; onMove: (id: string, direction: "up" | "down") => void }`
- Location: CFP builder and Portal Forms builder, left rail (replaces `WizardShell`'s step list for page content; settings screens keep a separate, smaller nav or move into a "Settings" tab)
- Elements:
  - Ordered list of pages, each row: order number, label, kind badge (locked icon for `system`, none for `custom`)
  - System pages: no remove button, label shown but not editable inline, Move up/down disabled at their fixed anchor position
  - Custom pages: inline rename (click label → text input), remove button (confirm via existing delete-confirmation pattern in the codebase), Move up/Move down buttons (icon buttons, disabled at boundaries)
  - "+ Add page" button at the bottom of custom-page group
  - Empty state: N/A — system pages always exist, list is never empty
- Behavior: click row selects it (updates center panel); Move up/down reorders within the custom-page segment only; remove asks for confirmation before removing a custom page and its field associations (fields themselves stay in `field_definitions`, just detached from this page)
- Data: reads/writes the builder's in-memory `pages` state (not a direct Convex call — persisted on the existing `save()`)

**`FieldInspector`**
- File: `src/components/forms/FieldInspector.tsx`
- Props: `{ field: BuilderField | null; onChange: (patch: Partial<BuilderField>) => void; onClose: () => void }`
- Location: CFP builder and Portal Forms builder, opens as a focused panel (right side or overlay-in-flow, not `position: fixed`) when a field is selected from the page's field list
- Elements:
  - Label input, type select, Required switch, Max length input (type-dependent), Options textarea (dropdown/multiselect types), conditional visibility (`showIf`) picker reusing existing logic from `SubmissionFormBuilder.tsx`'s current inline field rows
  - Locked-field variant: same panel, all inputs disabled, explanatory muted text ("This field is required by the platform")
  - Close (X) button, top-right
- Behavior: edits apply to local draft state on change (existing debounce/save pattern), Close returns to the page's field-list view
- Data: same `BuilderField`/`field_definitions` shape already used by `SubmissionFormBuilder.tsx`'s `FieldRows` (`:249-539`) — this is a UI reorganization (list+inspector instead of all-rows-expanded), not a new data model

**`FormPreviewHost`**
- File: `src/components/forms/FormPreviewHost.tsx`
- Props: `{ config: PublicSubmissionFormConfig /* built from live draft */ }`
- Location: dedicated Preview mode in both builders, opened from the content toolbar
- Elements: renders the shared public-form component (extracted from `SubmissionPage.tsx`) in `mode="preview"` — same field rendering, same step list derived from `pages`, same progress bar as the real public page; wrapped in a distinct browser/device-chrome frame with a "Preview — reflects unsaved edits" label
- Behavior: internal Back/Continue navigate preview state only; leaving Preview returns to the
  same local draft without saving or resetting it
- Data: reads a live-derived `PublicSubmissionFormConfig` built from the builder's in-memory `pages`/fields state (replaces `previewDraft` useMemo pattern, `SubmissionFormBuilder.tsx:1041-1092`); no network calls, no Turnstile, no submit, no analytics (`mode="preview"` short-circuits all of these in the shared renderer)

**`ProgressTrack`** (inside `WizardShell.tsx`, not a separate file)
- Added to `WizardShell`, above the step list: a thin horizontal bar, filled proportionally to `activeStep / (steps.length - 1)`, with step labels beneath or as tooltips on hover — addresses FR-008

---

## State / Data Flow

- Builder holds `pages: FormPage[]` and `fields: Record<string, BuilderField>` in local React
  state (replacing the current ~20 separate `useState` fields plus the derived `previewDraft`
  memo).
- On every relevant change, a memoized `PublicSubmissionFormConfig` is derived from
  `{pages, fields, event}` and passed straight into `FormPreviewHost`, which passes it straight
  into the shared public-renderer component in `mode="preview"` — **one** derivation, not the
  current three-layer chain (builder state → `previewDraft` → preview's own re-entered local
  state). This eliminates the field-type-mapping duplication (`CfpPreviewPanel.tsx:69-74` vs
  `SubmissionPage.tsx:33-38`) structurally, not by convention.
- `save()` serializes `{pages, fields-already-in-field_definitions}` to `forms.save`, which
  dual-writes `pages` + legacy `sections` during the migration window (see above).
- Accent color: read from `event.accentColor` (already flows into both builders via the existing
  `Event` object) — `FormPreviewHost`/the shared renderer consumes it exactly as
  `SubmissionPage.tsx:143-147` does today (`hexToHslTriplet`/`contrastForeground` → CSS custom
  properties), just also available to Portal Forms' new preview since it's event-scoped, not
  form-scoped.

---

## Auth / Permissions

No change. Both builders already sit under `EventProvider`-scoped routes; every mutation already
calls `assertEventOrganizerAccess`/`assertEventAccess` (`convex/functions.ts:113-129`,
database-backed role check per the account's standing rule — no env-var/hardcoded admin list
involved). New/changed mutations (`forms.save` accepting `pages`) call the identical guard at the
identical call site.

---

## Edge Cases & Error States

- **Loading**: Pages rail shows a skeleton (existing loading pattern in `SubmissionFormBuilder.tsx`)
  while the form record (and its migrated/derived `pages`) loads.
- **Empty custom-page list** (organizer removes every custom page, e.g. on a Portal form): system
  pages still render; if `pages` would end up with zero pages of any kind (shouldn't be reachable
  given system pages are un-removable) — treat as a validation error, block save with inline
  message.
- **API failure on save**: existing error-toast pattern in `SubmissionFormBuilder.tsx` (`loadError`
  state) — no new pattern needed, just applies to the new payload shape.
- **Migration failure / missing `pages` on read**: `publicForms.get` and the builder's load path
  must tolerate a row that has `sections` but not yet `pages` (pre-backfill) by deriving pages
  on-the-fly client/server-side rather than crashing — this is the safety net alongside the
  explicit backfill mutation.
- **Preview divergence**: eliminated structurally per the State/Data Flow section — not an
  ongoing edge case to defend against once the shared renderer lands, but flag if implementation
  falls back to keeping `CfpPreviewPanel.tsx`'s separate mapping (do not let that happen — it's
  the actual root cause of the reported confusion).

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reuse `SubmissionPage.tsx` as the preview renderer vs. keep `CfpPreviewPanel.tsx` maintained separately | Extract shared component, both consume it | Preview/reality drift is the concrete bug today (6 preview steps vs 5 real steps); a second hand-maintained renderer will drift again |
| One `pages` field for both CFP and Portal, or separate models | One shared `pages` shape on the existing single `submission_forms` table | Table already serves both via `kind`; owner explicitly asked for one consistent model across both builders |
| Migration strategy | Dual-write + backfill mutation + phased reader migration | NFR-001 requires zero downtime/data loss on live, open forms |
| Accent color ownership | Event-level (`events.accentColor`), already the case — clarify/relocate the editing UI, not the data model | Only one value exists today; multiplying it per-form would be new redundancy, not a fix |
| Field reordering interaction | Drag + explicit Move up/Move down | FINDINGS explicitly calls out "do not ship another decorative grip" — accessibility requires a non-drag path regardless |

## Dependencies

**Requires:** none blocking — can start independently.
**Enables:** future work on Portal Forms' public rendering, currently under-specified
(`portalFormResponses.ts`) — this design surfaces (does not resolve) the question of whether
Portal Forms gets its own `account`/`review` system-page scaffolding; flag for a follow-up
decision if the answer isn't "no" during implementation.

## Risks & Mitigations

- **Risk**: Schema/migration touches a live, in-use table (`submission_forms`) with open CFP
  forms actively accepting submissions. **Mitigation**: strictly additive schema change
  (`pages` optional, `sections` untouched until later), dual-write, backfill, then multi-step
  cutover — never a single destructive migration.
- **Risk**: Extracting `SubmissionPage.tsx`'s renderer into a shared `mode`-aware component is
  the single largest and riskiest refactor here (real submit flow, Turnstile, Clerk email
  verification all live in that file today). **Mitigation**: do this extraction first and behind
  a feature flag / on a branch with the existing public form's E2E behavior verified unchanged
  before wiring the preview host to it — treat it as its own reviewable step in plan.md, not
  bundled silently into the builder UI work.
- **Risk**: Scope is large (schema + 3 Convex files + 2 builder pages + new shared components +
  Portal Forms parity). **Mitigation**: plan.md phases this explicitly; each phase is
  independently mergeable and the app keeps working at every phase boundary.
