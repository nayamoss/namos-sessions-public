# Task Templates + Automated Onboarding — Implementation Plan

## Phase 1: Schema & Backend
- [ ] T001: Add `task_templates` table to `convex/schema.ts` per design.md (eventId, name, description?, items[], isSeeded, createdAt/updatedAt) with `by_event` index.
- [ ] T002: Add `defaultOnboardingTemplateId: v.optional(v.id("task_templates"))` to the `events` table in `convex/schema.ts`.
- [ ] T003: Create `convex/taskTemplates.ts` with `list`, `get`, `create`, `update`, `remove`, `setDefault`, `applyToSubmission` — all gated by `assertOrganizer(ctx)`, matching `convex/tasks.ts` conventions.
- [ ] T004: Update `convex/submissions.ts` `decide` mutation: replace the hardcoded `taskTitles` array with a lookup — load `event.defaultOnboardingTemplateId`, resolve template items if set, fall back to the current 4-item array if not. Keep the existing per-submission dedup-by-title check unchanged.
- [ ] T005: Add a one-time idempotent seed step (in `convex/seed.ts` or a new `convex/seedTaskTemplates.ts` run script) that creates the 6 starter templates — Standard Speaker Onboarding, Keynote Speaker, Workshop Facilitator, Panelist, Virtual/Remote Speaker, Sponsor-Nominated Speaker — on events that don't already have templates by those names.
- [ ] T006: Unit tests for `applyToSubmission` dedup logic and `decide`'s fallback-vs-template branching (extend existing `src/test/task-status.test.ts` patterns or add `convex/taskTemplates.test.ts` matching repo test conventions).

## Phase 2: Data Layer (types, repo, transport)
- [ ] T007: Add `TaskTemplate` and `TaskTemplateItem` types to `src/data/types.ts`, mirroring `OnboardingTask`.
- [ ] T008: Add `taskTemplates.*` operations to `src/data/transport.ts`, matching the existing `tasks.*` pattern (lines 7-78).
- [ ] T009: Add `taskTemplates` methods to `src/data/repo.ts`'s repo object, matching the existing `TasksRepo` pattern (lines 87-121).

## Phase 3: Frontend UI (REQUIRED — see full UI Spec in design.md)

> A feature is NOT done until it is visible and usable in the UI. Every element below must exist.

### UI Spec Summary (full detail in design.md § Frontend Components)

**Settings entry point**
- Location: `src/components/AppLayout.tsx` settings nav array (~line 67-69) — add `{ to: "/settings/task-templates", label: "Task templates", icon: ClipboardList }` alongside the existing Event settings / Library / Email delivery entries.
- New route in `src/App.tsx`: `<Route path="/settings/task-templates" element={<TaskTemplates />} />`, next to the existing `/settings/*` routes (lines 60-64).

**`src/pages/settings/TaskTemplates.tsx`** (new page)
- Elements: page header "Task Templates" (H1, `text-xl`) + subtitle "Reusable checklists applied automatically or on demand."; toolbar row with "+ New template" button (right side, accent style); template card list below.
- Each template card (`bg-neutral-100 rounded-[12px] p-4`, no border/shadow): name, item count, "Default" badge if it matches `events.defaultOnboardingTemplateId`, "Set as default" button (hidden if already default), "Edit" button, "Delete" button (disabled + tooltip if it's the current default).
- Empty state (all templates deleted): icon + "No templates yet" + "Create your first template" CTA, inside a card per layout rules.
- Loading state: `SkeletonList` (existing shared component), 3 rows.
- Editor panel (`TaskTemplateEditor`, inline flex sibling below the list, opens on "+ New template" or "Edit"): name input, description input, repeating item rows (title, description, target type select, linked portal form select, due-date-offset number input, remove-row × button), "+ Add item" button, "Save template" / "Cancel" buttons, inline red validation error text.
- Behavior: "Save template" blocked until name is non-empty and at least one item has a non-empty title; delete requires a `Dialog` confirmation (destructive style) per layout rules.
- Data: `taskTemplates.list/create/update/remove/setDefault`.

**`TasksAdmin.tsx` changes** (`src/pages/portal/TasksAdmin.tsx`)
- Add a "Copy from…" `Button` (outline style) immediately left of the existing "Add" button in the `ContentToolbar` primaryAction slot (line 175).
- Clicking it opens `CopyFromTemplatePicker` in the same panel slot currently used by the "Add task" section (line 150), toggled the same way `addOpen` is.
- `CopyFromTemplatePicker` elements: heading "Copy from template" + subtext, selectable list of templates (name + item count, single-select), "Apply template" button (disabled until a template is picked), "Close" button top-right, result text after apply ("Added N tasks (M already existed and were skipped).").
- Behavior: "Apply template" calls `taskTemplates.applyToSubmission`, then calls the existing `loadTasks()` function (line 127) to refresh the list — same call-then-reload pattern the file already uses.

### Tasks
- [ ] T010: Build `TaskTemplates` settings page with the elements listed above.
- [ ] T011: Build `TaskTemplateEditor` component (create + edit modes) and wire to `taskTemplates.create`/`update`.
- [ ] T012: Add settings nav entry and route for `/settings/task-templates`.
- [ ] T013: Build `CopyFromTemplatePicker` component and wire into `TasksAdmin.tsx`'s existing panel slot and "Copy from…" toolbar button.
- [ ] T014: Wire "Set as default" / delete-blocked-while-default logic in `TaskTemplates.tsx` to `taskTemplates.setDefault`/`remove`.
- [ ] T015: Verify full user flow in browser end-to-end (see Verification Checklist).

## Task Dependencies
- T001-T002 (schema) block T003-T005 (backend functions/seed) and T007 (types).
- T003 blocks T009 (repo) and T004 (decide rewrite).
- T007-T009 (data layer) block all of Phase 3 (T010-T014).
- T005 (seed) should land before manual QA so templates exist to test against.

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [ ] Existing accepted-submission flow with NO default template set still creates the same 4 legacy tasks (regression check)
- [ ] Setting an event default template and accepting a submission creates that template's tasks instead
- [ ] "Copy from…" on a submission with existing auto tasks correctly skips title collisions and reports skipped count
- [ ] Task Templates settings page reachable from nav, create/edit/delete/set-default all work in the browser
- [ ] Deleting a template that is the current default is blocked with a clear message
- [ ] Feature is accessible and usable in the UI (not just implemented in the backend)
- [ ] No regressions introduced to `TasksAdmin.tsx`'s existing manual "Add task" flow
- [ ] Docs updated if needed
