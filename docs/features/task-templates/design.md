# Task Templates + Automated Onboarding — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

```ts
// convex/schema.ts:35-42
events: defineTable({
  name: v.string(), slug: v.string(), type: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  location: v.optional(v.string()), timezone: v.string(), startDate: v.number(), endDate: v.number(),
  theme: v.optional(v.string()), logoStorageKey: v.optional(v.string()), backgroundStorageKey: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]),

// convex/schema.ts:162-176
onboarding_tasks: defineTable({
  eventId: v.id("events"),
  targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission")),
  submissionId: v.optional(v.id("submissions")),
  speakerId: v.optional(v.id("speakers")),
  title: v.string(),
  description: v.optional(v.string()),
  source: v.union(v.literal("manual"), v.literal("auto")),
  linkedFormId: v.optional(v.id("submission_forms")),
  status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
  dueDate: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_speaker", ["speakerId"]).index("by_submission", ["submissionId"]).index("by_status", ["status"]),
```

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| `task_templates` (new) | CREATE | `eventId` | `v.id("events")` | scope |
| `task_templates` | — | `name` | `v.string()` | e.g. "Keynote Speaker" |
| `task_templates` | — | `description` | `v.optional(v.string())` | shown in template picker |
| `task_templates` | — | `items` | `v.array(v.object({ title: v.string(), description: v.optional(v.string()), targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission")), linkedFormId: v.optional(v.id("submission_forms")), dueDateOffsetDays: v.optional(v.number()) }))` | ordered task list; mirrors `onboarding_tasks` fields except `dueDateOffsetDays` replaces `dueDate` (relative, resolved to an absolute date at apply time) |
| `task_templates` | — | `isSeeded` | `v.boolean()` | true for the 6 starter templates, lets UI label them distinctly |
| `task_templates` | — | `createdAt` / `updatedAt` | `v.number()` | standard |
| `task_templates` | INDEX | `by_event` | — | `["eventId"]` |
| `events` | ADD COLUMN | `defaultOnboardingTemplateId` | `v.optional(v.id("task_templates"))` | nullable — unset means "use the legacy 4-item default" |

### Migration
Convex schema changes are additive and require no manual migration step — new optional fields
default to `undefined` for existing rows, and the new `task_templates` table starts empty.
`events.defaultOnboardingTemplateId` is optional, so every existing event keeps working with no
default template set (FR-003 fallback). A one-time `convex run` script seeds the 6 starter
templates onto every existing event on deploy (same pattern as `convex/seed.ts`), but this is
additive data, not a schema migration.

---

## Backend / API

### Affected Existing Endpoints
| Method | Path (Convex function) | Change |
|--------|------|--------|
| mutation | `submissions.decide` | Replace hardcoded `taskTitles` array with: look up `event.defaultOnboardingTemplateId` → if set, load the template's `items` and map to task titles/fields; if unset, keep the existing 4-item array as fallback. Idempotency check (skip existing `source: "auto"` titles for this submission) stays unchanged. |

### New Endpoints (Convex functions in new `convex/taskTemplates.ts`)
| Method | Path | Request Body | Response |
|--------|------|--------------|----------|
| query | `taskTemplates.list` | `{ eventId: Id<"events"> }` | `TaskTemplate[]` |
| query | `taskTemplates.get` | `{ templateId: Id<"task_templates"> }` | `TaskTemplate \| null` |
| mutation | `taskTemplates.create` | `{ eventId, name, description?, items: TemplateItem[] }` | `TaskTemplate` |
| mutation | `taskTemplates.update` | `{ templateId, name?, description?, items?: TemplateItem[] }` | `TaskTemplate` |
| mutation | `taskTemplates.remove` | `{ templateId }` | `{ success: true }` — blocked with an error if it's the event's current default |
| mutation | `taskTemplates.setDefault` | `{ eventId, templateId: Id<"task_templates"> \| null }` | `{ success: true }` — patches `events.defaultOnboardingTemplateId` |
| mutation | `taskTemplates.applyToSubmission` | `{ templateId, submissionId }` | `{ created: number, skipped: number }` — powers "Copy from…" |

### Validation & Business Logic
- All mutations call `assertOrganizer(ctx)` first, matching every existing mutation in
  `submissions.ts` and `tasks.ts`.
- `create`/`update`: reject empty `name`, reject an empty `items` array, reject items with blank
  `title`.
- `remove`: reject if `templateId === event.defaultOnboardingTemplateId` (must unset default
  first) — prevents a dangling reference in `submissions.decide`.
- `applyToSubmission`: loads the submission, resolves `eventId`/`speakerId` from it (matching
  how `decide` already does this), fetches existing `source: "auto"` tasks for the submission via
  `onboarding_tasks.by_submission`, filters out template items whose `title` already exists among
  them (same rule as `decide`'s dedup), inserts the rest with `source: "auto"`. `dueDateOffsetDays`
  resolves to `Date.now() + offsetDays * 86_400_000`.
- `submissions.decide`: unchanged idempotency and auth; only the source of `taskTitles` changes
  from a literal array to `(await ctx.db.get(templateId))?.items.map(i => i.title) ?? fallback`.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/portal/TasksAdmin.tsx` | Add a "Copy from…" button next to "Add" in the `ContentToolbar` primary action slot; opens a template picker panel (reuses the existing `addOpen` panel pattern at line 150). |
| `src/data/repo.ts` | Add `taskTemplates` repo methods (`list`, `create`, `update`, `remove`, `setDefault`, `applyToSubmission`), following the existing `TasksRepo` pattern at lines 87-121. |
| `src/data/transport.ts` | Add `taskTemplates.*` operations, following the existing `tasks.*` pattern at lines 7-78. |
| `src/data/types.ts` | Add `TaskTemplate` and `TaskTemplateItem` types, mirroring `OnboardingTask` at line 109. |

### New Components

**EventSettingsTaskTemplates**
- File: `src/pages/settings/TaskTemplates.tsx`, new route `/settings/task-templates` registered in `src/App.tsx` alongside the existing `/settings/event`, `/settings/email`, `/settings/library` routes (`src/App.tsx:60-64`) and added to whatever settings nav list renders those (matches `src/pages/settings/EventDetails.tsx` conventions)
- Props: none (reads `eventId` from route/context the same way `TasksAdmin.tsx` does)
- Location: new Settings sub-page, "Task Templates" section
- Elements:
  - Section heading "Task Templates" + subtext "Reusable checklists applied automatically or on demand."
  - List of template cards (`bg-neutral-100 rounded-[12px] p-4`), each showing: template name, item count (e.g. "4 tasks"), a "Default" badge if it's `events.defaultOnboardingTemplateId`, "Edit" and "Delete" buttons, and a "Set as default" button (hidden if already default)
  - Empty state (only possible if organizer deletes all seeded templates): icon + "No templates yet" + "Create your first template" CTA button
  - "+ New template" button, top-right of the section, opens the editor panel
  - Loading state: `SkeletonList` (existing shared component), 3 rows
- Behavior: clicking "Edit" or "+ New template" opens `TaskTemplateEditor` inline below the list (flex sibling, not a modal — per layout rules); "Set as default" calls `taskTemplates.setDefault` optimistically; "Delete" shows a `Dialog` confirmation (destructive, matches layout rules for irreversible actions) and is disabled with a tooltip if the template is currently the default.
- Data: `taskTemplates.list({ eventId })`, `taskTemplates.setDefault`, `taskTemplates.remove`

**TaskTemplateEditor**
- File: `src/components/portal/TaskTemplateEditor.tsx`
- Props: `{ eventId: EventId, template?: TaskTemplate, portalForms: SubmissionForm[], onSaved: () => void, onCancel: () => void }`
- Location: inline panel within `EventSettingsTaskTemplates`, same visual pattern as the existing "Add task" panel in `TasksAdmin.tsx` (`section` with `bg-card p-5`)
- Elements:
  - "Template name" text input (required)
  - "Description" text input (optional)
  - Repeating item rows, each with: title input, description input (optional), target type select (Contact/Group/Submission — same options as `TasksAdmin.tsx`'s existing select), linked portal form select (same `portalForms` list already fetched in `TasksAdmin.tsx`), due-date-offset number input (days after acceptance, optional), a remove-row (×) button
  - "+ Add item" button below the item rows
  - "Save template" / "Cancel" buttons, bottom-right
  - Inline validation error text (red, `text-destructive`) if name or any item title is blank on save attempt
- Behavior: "+ Add item" appends a blank row; removing the last row is allowed but blocks save with an error ("Add at least one task"); "Save template" calls `create` or `update` depending on whether `template` prop is set, then calls `onSaved()`
- Data: `taskTemplates.create` / `taskTemplates.update`; reads `portalForms` passed down (already loaded once by the parent page, same as `TasksAdmin.tsx` does today)

**CopyFromTemplatePicker**
- File: `src/components/portal/CopyFromTemplatePicker.tsx`
- Props: `{ eventId: EventId, submissionId: string, onApplied: (result: { created: number, skipped: number }) => void, onCancel: () => void }`
- Location: `TasksAdmin.tsx`, opens as an inline panel (same slot/pattern as the existing `addOpen` "Add task" panel at line 150, toggled by a sibling "Copy from…" button next to "Add")
- Elements:
  - Heading "Copy from template" + subtext "Add a saved checklist to this submission."
  - Radio-style list of templates (name + item count), one selectable at a time
  - "Apply template" button (disabled until one is selected)
  - "Close" button, top-right (same as existing panel)
  - Result toast/inline text after apply: "Added N tasks (M already existed and were skipped)."
- Behavior: selecting a template highlights it; "Apply template" calls `taskTemplates.applyToSubmission`, then `onApplied` triggers `TasksAdmin.tsx`'s existing `loadTasks()` refresh
- Data: `taskTemplates.list({ eventId })`, `taskTemplates.applyToSubmission`

---

## State / Data Flow
Convex queries (`taskTemplates.list`) are reactive subscriptions — same as every other list in
this app (`repo.tasks.list`, etc.) — so template CRUD and default changes propagate to open tabs
automatically with no manual refetch. `applyToSubmission` is a mutation; `TasksAdmin.tsx` already
calls `loadTasks()` after mutations (see `createTask` at line 127), so `CopyFromTemplatePicker`
follows the same call-then-reload pattern rather than relying on the mutation's reactivity alone,
matching existing code style in this file.

---

## Auth / Permissions
All new mutations/queries require `assertOrganizer(ctx)`, identical to every existing
`tasks.ts`/`submissions.ts` mutation — no new permission tier. Speakers (non-organizers) never
see template management; `PortalTaskFormPage.tsx` (speaker-facing) is untouched by this feature.

---

## Edge Cases & Error States
- **No templates exist for an event** (organizer deleted all 6 seeded ones): `EventSettingsTaskTemplates` shows the empty state; `submissions.decide` falls back to the legacy hardcoded 4-item array; `CopyFromTemplatePicker` shows "No templates yet — create one in Event Settings" instead of an empty radio list.
- **Template referenced as default gets deleted**: prevented server-side (`remove` rejects while it's the default) — no orphaned reference is possible.
- **Applying a template where every item already exists**: `applyToSubmission` returns `{ created: 0, skipped: N }`; UI shows "All N tasks already exist on this submission."
- **Save fails (network/validation)**: `TaskTemplateEditor` shows inline red error text below the form, matching `TasksAdmin.tsx`'s existing `loadError` pattern; form stays open so the organizer doesn't lose input.
- **Loading state**: `SkeletonList` for the template list, same shared component already used in `TasksAdmin.tsx`.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Template scope | Event-scoped, not global | Matches existing app-wide pattern — every table in this schema is `eventId`-scoped, no cross-event entities exist anywhere |
| Due dates | Relative offset (days from acceptance) stored on template, resolved to absolute `dueDate` at apply time | Templates are reusable across many acceptance dates; storing an absolute date on the template would be meaningless |
| Fallback when no default set | Keep legacy 4-item array as the fallback in `submissions.decide` | Zero-regression requirement — every existing event with no configured template keeps behaving exactly as today |
| Collision handling | Skip duplicate titles among `source: "auto"` tasks | Reuses the exact idempotency rule already shipped in `decide`, no new logic to design/test |

## Dependencies
**Requires:** none — builds entirely on existing `onboarding_tasks`, `submission_forms`, and `assertOrganizer` patterns.
**Enables:** future adaptive/behavior-based checklist logic (out of scope now) would build on this template data model rather than the old flat array.

## Risks & Mitigations
- **Risk:** none for the settings shell — `src/pages/settings/` and `/settings/*` routes already exist (`EventDetails.tsx`, `EmailDelivery`, `Library`), this feature adds one more page in the same pattern.
- **Risk:** Seeding 6 templates onto every existing event could silently fail for events with unusual state. **Mitigation:** seed script is idempotent (checks for existing templates by name before inserting, mirrors `convex/seed.ts` conventions) and only additive — never overwrites organizer-edited templates.
