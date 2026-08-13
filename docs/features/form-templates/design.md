# Form Templates — Technical Design

## Database / Schema Changes
### Current Schema (affected tables)
```ts
submission_forms: defineTable({
  eventId: v.id("events"),
  internalName: v.string(), externalTitle: v.string(), pageHeading: v.string(),
  version: v.number(),
  kind: v.union(v.literal("abstract"), v.literal("session"), v.literal("contact"),
    v.literal("group"), v.literal("submission_task")),
  collectParticipants: v.boolean(),
  welcomeMessage: v.optional(v.string()), showWelcomeMessage: v.boolean(),
  sections: v.array(v.object({ id: v.string(), key: v.union(v.literal("abstract"),
    v.literal("participant"), v.literal("portal")), title: v.string(), pageHeading: v.string(),
    description: v.optional(v.string()), fieldIds: v.array(v.string()) })),
  participantRoles: v.array(v.object({ role: v.string(), min: v.optional(v.number()),
    max: v.optional(v.number()) })),
  crossFieldLimits: v.array(v.object({ id: v.string(), label: v.string(),
    fieldIds: v.array(v.string()), maxCombinedChars: v.number(), perParticipant: v.boolean() })),
  routingRules: v.optional(v.array(v.object({ /* ... */ }))),
  closeDate: v.optional(v.number()), submissionLimit: v.optional(v.number()),
  allowMultipleDrafts: v.boolean(), autoRedirectToPortal: v.boolean(),
  successPageMessage: v.optional(v.string()), reminderEmailEnabled: v.boolean(),
  adminUserIds: v.array(v.string()), notifyAdminsOnNew: v.array(v.string()),
  notifyAdminsOnUpdate: v.array(v.string()), sendSubmitterConfirmation: v.boolean(),
  portalFormSettings: v.optional(v.object({ sendConfirmationEmail: v.optional(v.boolean()),
    confirmationBody: v.optional(v.string()) })),
  status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]),

field_definitions: defineTable({
  label: v.string(), type: v.union(v.literal("text"), v.literal("wysiwyg"),
    v.literal("dropdown"), v.literal("multiselect"), v.literal("email"), v.literal("phone"),
    v.literal("file"), v.literal("date"), v.literal("number")),
  maxChars: v.optional(v.number()), options: v.optional(v.array(v.string())),
  locked: v.boolean(), required: v.boolean(),
  showIf: v.optional(v.object({ fieldId: v.string(), equals: v.string() })),
  createdAt: v.number(), updatedAt: v.number(),
}),
```

### Required Changes
No new tables and no schema migration. Template *definitions* (the 12 presets) are static data
shipped in source, not stored in Convex — they never need editing per event, per FR-006.

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| submission_forms | none | — | — | Rows created from a template are ordinary `status: "draft"` rows, indistinguishable from hand-built ones once saved |
| field_definitions | none | — | — | Applying a template inserts rows only for labels that don't already exist (see dedupe below) |

### Migration
None required — no schema change. This feature is pure application logic on top of the existing
`submission_forms` / `field_definitions` tables.

---

## Backend / API
### Affected Existing Endpoints
| Method | Path (Convex function) | Change |
|--------|------|--------|
| mutation | `forms:save` | none — template application reuses this unchanged |
| mutation | `forms:saveField` | none — reused for creating/reusing field-library entries |
| query | `forms:listFields` | none — used to check for existing labels before creating |

### New Endpoints
| Convex function | Request Body | Response |
|--------|------|--------|
| mutation `forms:createFromTemplate` | `{ eventId: Id<"events">, templateId: string }` | `Id<"submission_forms">` — id of the newly created draft form |

`createFromTemplate` is a thin server-side helper, not a public HTTP surface: it looks up the
`templateId` against the static `FORM_TEMPLATES` catalog (see Frontend below — the catalog is
plain TS shared by client and Convex, imported into `convex/formTemplates.ts`), then:
1. For each field in the template, query `field_definitions` for an exact-label match (case-
   insensitive). Reuse the existing `_id` if found; otherwise insert a new locked/unlocked row
   per the template's field spec.
2. Insert a `submission_forms` row (`status: "draft"`) with `sections[].fieldIds` pointing at the
   resolved field ids, and every other column defaulted from the template (kind,
   collectParticipants, participantRoles, portalFormSettings, etc.)
3. Return the new form id so the client navigates to `/program/forms/:id/edit` or
   `/portal/forms/:id` immediately.

### Validation & Business Logic
- `templateId` must resolve to a known entry in `FORM_TEMPLATES`; unknown id throws (mirrors the
  "Form not found for this event" pattern already used in `forms:duplicate`).
- Field dedupe match is on trimmed, case-insensitive `label` only — type mismatches between an
  existing field and the template's expected type are allowed to reuse the existing field (the
  shared library is the source of truth once a label exists; this mirrors how the existing Field
  Library popover in `PortalForms.tsx` already works).
- `assertOrganizer(ctx)` guard, same as every other `forms.ts` mutation — no new auth surface.

---

## Frontend Components
### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/program/SubmissionForms.tsx` | "+ Add" button changes from `<Link to="/program/forms/new/edit">` to opening the new `TemplateGallery` (in-page state, not a route change) |
| `src/pages/portal/PortalForms.tsx` | "+ Add form" button (`onClick={() => setEditing(newForm())}`) changes to open `TemplateGallery`; "Start from blank" still calls `setEditing(newForm())` |
| `src/data/repo.ts` | Add `createFromTemplate(templateId: string, eventId: EventId): Promise<string>` to `FormsRepo` |
| `src/data/transport.ts` | Add `"forms.createFromTemplate"` to `WriteOperation`, wire to `transport.write` |
| `src/data/convex/index.ts` | Map `"forms.createFromTemplate": "forms:createFromTemplate"` |
| `src/data/airtable/index.ts` | Add to the existing "not yet supported" throw list alongside `forms.duplicate` |

### New Components

**TemplateGallery**
- File: `src/components/forms/TemplateGallery.tsx`
- Props: `{ templates: FormTemplate[] (required), onSelect: (templateId: string) => void (required), onBlank: () => void (required), onCancel: () => void (required), loading?: boolean (optional) }`
- Location: Renders in place of the forms list, inside `AppLayout`, on both `/program/forms` (when
  "+ Add" is clicked) and `/portals/forms` (same). Not a separate route — local component state
  (`editing`/gallery flag) exactly like `PortalForms.tsx` already does for its editor.
- Elements:
  - Header row: "Choose a template" heading, subtext "Start from a template or build from
    scratch.", Cancel button (top-right, returns to forms list)
  - Grid of template cards (`md:grid-cols-3`), one per `FormTemplate`: icon (Lucide, size 20,
    muted), name, one-line description, subtle "kind" tag (e.g. "Abstract", "Contact")
  - One additional card, visually distinct (dashed/neutral, not accent-colored): "Start from
    blank" with a Plus icon and "Build a form with no pre-filled fields" subtext
  - Loading state: `SkeletonList rows={6}` while `createFromTemplate` is in flight after a card
    click (cards become disabled, clicked card shows a small inline spinner)
  - Error state: inline `role="alert"` red text above the grid if `createFromTemplate` fails,
    same pattern as `loadError`/`error` elsewhere in these two files
- Behavior:
  - Click a template card → disable grid → call `repo.forms.createFromTemplate(id, eventId)` →
    on success navigate/open editor on the returned form id → on failure show inline error, re-
    enable grid
  - Click "Start from blank" → immediately call existing `onBlank` (no network call, matches
    today's behavior exactly)
  - Click Cancel → `onCancel`, return to the forms list, nothing created
- Third-party: none new — uses existing `lucide-react` icons already imported elsewhere in these
  files (`Plus`, plus one distinct icon per template, e.g. `FileText`, `Mic`, `Users`, `Camera`,
  `Handshake`, `CreditCard`, `Wrench`, `Plane`).

### Template Catalog (shared, static — not a "component" but required by both new components)
- File: `src/components/forms/formTemplates.ts` (client) — a plain, exported `FORM_TEMPLATES:
  FormTemplate[]` array. Also referenced by `convex/formTemplates.ts` for the server-side catalog
  used by `createFromTemplate` (duplicated literal, not imported across the client/convex
  boundary — Convex functions can't import from `src/`; keep both files in sync, call this out in
  a comment in each pointing at the other).
- `FormTemplate` shape:
  ```ts
  type FormTemplate = {
    id: string;                          // e.g. "cfp-standard-abstract"
    appliesTo: "cfp" | "portal";
    name: string;                        // card title
    description: string;                 // card one-liner
    icon: LucideIcon;                    // client catalog only
    kind: SubmissionFormKind;
    internalName: string; externalTitle: string; pageHeading: string;
    collectParticipants: boolean;
    participantRoles: { role: string; min?: number; max?: number }[];
    sections: { key: "abstract" | "participant" | "portal"; title: string; pageHeading: string;
      description?: string;
      fields: { label: string; type: FieldDefinitionWrite["type"]; required: boolean;
        maxChars?: number; options?: string[]; locked?: boolean }[] }[];
    portalFormSettings?: { sendConfirmationEmail: boolean; confirmationBody?: string };
  };
  ```

### The 12 templates
**CFP-side (`appliesTo: "cfp"`, shown on `/program/forms`):**
1. **Standard Abstract CFP** (`kind: abstract`) — Title (locked), Description (wysiwyg),
   Format (dropdown: Talk/Workshop/Panel), Track (dropdown), Level (dropdown:
   Beginner/Intermediate/Advanced), Tags (multiselect)
2. **Full Session Proposal** (`kind: session`) — Title, Description, Learning Objectives
   (wysiwyg), Target Audience (text), Format, Track, Level
3. **Workshop Proposal** (`kind: session`) — Title, Description, Duration (dropdown:
   60/90/120/180 min), Materials Needed (text), Max Attendees (number), Prerequisites (wysiwyg)
4. **Lightning Talk** (`kind: abstract`) — Title, Description (wysiwyg, maxChars 500), Format
   fixed to "Lightning Talk" (no dropdown), Tags
5. **Panel Discussion Proposal** (`kind: session`) — Title, Description, `collectParticipants:
   true` with `participantRoles: [{ role: "Moderator", min: 1, max: 1 }, { role: "Panelist",
   min: 2, max: 5 }]`
6. **Sponsor Session Application** (`kind: session`) — Title, Description, Sponsor Tier
   (dropdown: Bronze/Silver/Gold/Platinum), Company Name (text), Track fixed to "Sponsored"

**Portal-side (`appliesTo: "portal"`, shown on `/portals/forms`):**
1. **Speaker Contact & Bio** (`kind: contact`) — First Name (locked), Last Name (locked), Email
   (locked), Mobile Phone, Biography (wysiwyg, maxChars 5000)
2. **A/V & Tech Requirements** (`kind: submission_task`) — Presentation Format (dropdown:
   Slides/Live Demo/Video), Special Equipment (text), Laptop Provided? (dropdown: Yes/No),
   Accessibility Needs (wysiwyg)
3. **Travel & Logistics** (`kind: submission_task`) — Arrival Date (date), Departure Date (date),
   Needs Hotel? (dropdown: Yes/No), Dietary Restrictions (text), Emergency Contact (text)
4. **Headshot & Bio Confirmation** (`kind: contact`) — Headshot (file), Bio (wysiwyg, locked),
   Twitter/X Handle (text), Company/Title (text)
5. **Sponsor/Exhibitor Deliverables** (`kind: group`) — Company Name (locked text), Logo (file),
   Booth Requirements (text), Contact Email (locked, email)
6. **Payment / W-9 Info** (`kind: submission_task`) — Legal Name (text), Payment Method
   (dropdown: Check/ACH/Wire), W-9 Upload (file), Billing Address (wysiwyg)

Every template's `portalFormSettings.sendConfirmationEmail` defaults to `true` for portal-side
templates (matching `newForm()`'s existing default in `PortalForms.tsx`); CFP-side templates
leave `sendSubmitterConfirmation: false` by default, matching current forms list behavior — the
admin turns it on in the wizard's Notifications step per the existing submission-form-builder
plan.

---

## State / Data Flow
Template selection is pure client state (`useState<"gallery" | "editor" | undefined>`, replacing
today's implicit blank-vs-editing state in `PortalForms.tsx` and route-nav in
`SubmissionForms.tsx`). On card click: `repo.forms.createFromTemplate` → transport → Convex
mutation `forms:createFromTemplate` → writes `field_definitions` + `submission_forms` → returns
new id → client either navigates (`SubmissionForms.tsx`, which already routes to
`/program/forms/:id/edit`) or sets `editing` to the freshly loaded form (`PortalForms.tsx`,
which keeps its create/edit flow in-page). Either way, from that point on the flow is identical
to today's hand-edited form — the existing wizard reads the saved `submission_forms` row exactly
as it would for a duplicated or manually-created form.

---

## Auth / Permissions
No change. `createFromTemplate` requires the same `assertOrganizer(ctx)` guard as every other
`forms.ts` mutation — template application is an admin-only action, same as today's "+ Add".

---

## Edge Cases & Error States
- **Loading:** Gallery shows `SkeletonList rows={6}` only on first mount if templates were ever
  fetched remotely — but they're static/bundled, so the gallery renders instantly; the only
  loading state is the brief network round-trip after a card is clicked (grid disables, clicked
  card shows an inline spinner).
- **Empty/zero state:** N/A — the gallery always has 6 (or "Start from blank" as the 7th) cards;
  there's no empty state to design.
- **API failure:** `createFromTemplate` throws (e.g. network error, dropped auth) → inline red
  `role="alert"` text above the grid, grid re-enables, nothing is created (mutation is atomic —
  either both the field rows and form row are written, or Convex rolls the whole mutation back).
- **Duplicate field labels across templates:** handled server-side by the label-match dedupe in
  `createFromTemplate` — picking two templates that share "Email" reuses one `field_definitions`
  row, doesn't create two.
- **No event yet:** `PortalForms.tsx` already gates "+ Add form" behind `disabled={!event}` and
  shows a "No event available" card; `TemplateGallery` inherits the same gate — the gallery never
  opens without an event to attach the new form to.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where templates live | Static TS array, duplicated client + Convex | No admin-editable requirement (FR-006); avoids a new table and admin UI for something fixed at ship time |
| Field dedupe strategy | Case-insensitive label match | Matches the existing informal convention in `PortalForms.tsx`'s Field Library search, which is also label-based |
| Gallery as route vs. in-page state | In-page state | Matches `PortalForms.tsx`'s existing create/edit pattern; `SubmissionForms.tsx` needs a small adjustment from route-based to state-based for the "+ Add" click, but the wizard route itself is unchanged |
| New Convex function vs. reusing `forms:save` | New `forms:createFromTemplate` | Keeps template expansion (dedupe + multi-row insert) server-side and atomic, rather than trusting the client to resolve field ids correctly |

## Dependencies
**Requires:** existing `submission-form-builder` and `portal-forms` wizards (already scaffolded
via `WizardShell`, `SubmissionForms.tsx`, `PortalForms.tsx`) — this feature only adds a
pre-fill step in front of them.
**Enables:** faster event setup; a natural place to add more templates later without touching
the wizard itself.

## Risks & Mitigations
- **Risk:** Duplicating the template catalog between `src/` and `convex/` drifts out of sync.
  **Mitigation:** Single source-of-truth comment in both files pointing at each other; the
  Convex copy only needs `label/type/required/maxChars/options` per field plus form-level
  defaults — no icons/descriptions — so the Convex file is a strict subset, harder to drift on
  the fields that matter for correctness.
- **Risk:** A future wizard-step change (e.g. new required column on `submission_forms`) breaks
  template application silently. **Mitigation:** `createFromTemplate`'s Convex tests (see
  plan.md) assert every template produces a form that passes the same `forms:save` validation
  path a hand-built form would.
