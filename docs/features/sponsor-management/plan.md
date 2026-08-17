# Sponsor Management — Implementation Plan

## Phase 1: Schema & Backend Foundation
- [x] T001: Add `sponsor_tiers`, `sponsors`, `sponsor_contacts` tables to `convex/schema.ts` per design.md, with the indexes listed there.
- [x] T002: Widen `onboarding_tasks.targetType` union to include `"sponsor"`, add `sponsorId: v.optional(v.id("sponsors"))`, add `by_sponsor` index.
- [x] T003: Add `sponsorId: v.optional(v.id("sponsors"))` to `submissions`.
- [x] T004: Add `assignSponsorId: v.optional(v.id("sponsors"))` to the `routingRules[]` object in `submission_forms`.
- [x] T005: Deploy schema (`npx convex dev` / `npx convex deploy` per project convention) and confirm existing seeded data still validates.

## Phase 2: Backend — Sponsors, Tiers, Contacts
- [x] T006: Create `convex/sponsorTiers.ts` — `list`, `create`, `update`, `remove` (with the sponsors-still-assigned guard).
- [x] T007: Create `convex/sponsors.ts` — `list` (with resolved tier name + primary contact), `get` (with contacts + open task count), `create`, `update`, `remove` (cascades contacts, unassigns tasks/submissions).
- [x] T008: Create `convex/sponsorContacts.ts` — `listBySponsor`, `create`, `update`, `remove`, all enforcing the single-primary-contact rule.
- [x] T009: Extend `convex/tasks.ts` `create`/`list` to accept and validate `sponsorId`/`targetType: "sponsor"`, mirroring the existing `speakerId`/`submissionId` validation blocks.
- [x] T010: Extend the task-template "apply to target" mutation in `convex/taskTemplates.ts` to accept a sponsor target.

## Phase 3: Backend — Routing Integration
- [x] T011: Extend `SubmissionRoutingRule`/`RoutingResult` types and `evaluateRoutingRules` in `convex/categoryRouting.ts` to carry `assignSponsorId`.
- [x] T012: Extend `validateRoutingRules` to resolve and check `assignSponsorId` belongs to the event, and include it in the "every rule needs at least one target" check.
- [x] T013: In `convex/publicForms.ts` (~line 167-176), spread `routing.assignSponsorId` onto the inserted submission when present.
- [x] T014: Update/extend `src/test/category-routing.test.ts` to cover the new `assignSponsorId` path, including the negative case (sponsor from another event is rejected).

## Phase 4: Data Adapter Wiring
- [x] T015: Add `Sponsor`, `SponsorTier`, `SponsorContact` interfaces and `SponsorId`/`SponsorTierId` branded types to `src/data/types.ts`; widen `OnboardingTask.targetType` and add `sponsorId` to `OnboardingTask` and `Submission`.
- [x] T016: Add `SponsorsRepo`, `SponsorTiersRepo`, `SponsorContactsRepo` interfaces to `src/data/repo.ts` and wire into the top-level `Repo` type.
- [x] T017: Implement the three repo interfaces in `src/data/convex/index.ts` against the Phase 2 Convex functions.

## Phase 5: Frontend UI (REQUIRED — do not skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### UI Spec

**Sponsors list page**
- Location: new route `/program/sponsors`, added to the `Program` section of the sidebar nav (`src/components/AppLayout.tsx`), positioned after "Speakers". Nav item hidden when the current event's `sponsorsEnabled` is false.
- Elements:
  - `ContentToolbar`: search input (left), tier filter dropdown (left), "Add sponsor" primary button (right), "Manage tiers" secondary button (right)
  - `DataGrid` with columns: Sponsor name, Tier (color dot + label), Status badge (Prospect/Confirmed/Declined), Primary contact (name + email), Open tasks (count)
  - Empty state: `Handshake` icon (Lucide, size 40, muted), "No sponsors yet" heading, "Add your first sponsor to start tracking tiers, contacts, and deliverables." subtext, "Add sponsor" CTA button — all inside a `bg-neutral-100 rounded-[12px] p-8` card
  - Loading state: `SkeletonList` (4 rows)
  - Error state: inline `role="alert"` red text below the toolbar
- Behavior: clicking a row opens `SponsorDetail` as a flex-sibling detail panel (never an overlay); clicking "Add sponsor" opens `AddSponsorPane` in the same panel slot; clicking "Manage tiers" opens `SponsorTiersPane`.
- Data: `sponsors.list(eventId)`, `sponsorTiers.list(eventId)` via the repo layer.

**Add sponsor pane**
- Location: detail-panel flex sibling, opened from the list toolbar
- Elements: Sponsor name input (required, autofocus), Tier select (+ "No tier" option), Status select (Prospect/Confirmed/Declined, default Prospect), Website URL input, Notes textarea, inline error text, "Cancel" ghost button, "Add sponsor" submit button (label → "Adding…" while saving, disabled)
- Behavior: Enter/submit validates non-empty trimmed name; on success, closes pane and selects the new sponsor row.
- Data: `sponsors.create(...)`.

**Sponsor detail panel**
- Location: detail-panel flex sibling, opened from a list row
- Elements:
  - Header: inline-editable sponsor name, tier select, status select, close (X) button top-right
  - Website input, Notes textarea (both autosave on blur)
  - Contacts section: contact cards (name, email, phone, role, "Primary" badge), edit (pencil) and remove (trash) icon buttons per card, "Add contact" button opening an inline form (name, email, phone, role, "Set as primary" checkbox)
  - Tasks section: checklist rows (title, status badge, due date), "Add task" button, "Apply template" dropdown listing this event's task templates
  - Danger zone: "Remove sponsor" destructive button → `AlertDialog` confirmation warning that contacts are deleted and linked tasks/submissions are unassigned, not deleted
- Behavior: every field autosaves on blur/change; contact/task lists update reactively via Convex.
- Data: `sponsors.get`, `sponsorContacts.listBySponsor/create/update/remove`, `tasks.list/create` filtered by `sponsorId`.

**Sponsor tiers pane**
- Location: detail-panel flex sibling, opened from "Manage tiers"
- Elements: list of tier rows (color swatch, inline-editable name, sponsor count, reorder up/down buttons, trash button), "Add tier" input + button at the bottom
- Behavior: removing a tier with sponsors assigned shows inline error "Reassign or remove sponsors in this tier before deleting it." and does not delete; reordering writes updated `sortOrder` for all affected tiers in one call.
- Data: `sponsorTiers.list/create/update/remove`.

**Tasks admin — sponsor support**
- Location: existing `/portals/tasks` page (`src/pages/portal/TasksAdmin.tsx`)
- Elements: target-type filter/badge gains a "Sponsor" option alongside Contact/Group/Submission; task rows targeting a sponsor display the sponsor's name (resolved the same way speaker names are resolved today)
- Behavior: creating a task from this page supports picking a sponsor as the target.
- Data: existing `tasks.list`, extended per Phase 2.

**CFP form builder — routing rule target**
- Location: `src/pages/program/SubmissionFormBuilder.tsx` (wherever routing rule targets are configured today, alongside "assign tag"/"assign track"/"set status")
- Elements: add a "Link submission to sponsor" select (sponsor list for this event) as an additional target option on each routing rule row
- Behavior: selecting a sponsor sets `assignSponsorId` on that rule; existing tag/track/status/reviewer targets are unaffected and can combine with it.
- Data: `sponsors.list(eventId)` for the dropdown options; `forms.save` persists it via the widened `routingRules` schema.

### Tasks
- [x] T018: Build `Sponsors.tsx` page (list + toolbar + empty/loading/error states) per UI Spec.
- [x] T019: Build `AddSponsorPane` per UI Spec.
- [x] T020: Build `SponsorDetail` (fields, contacts section, tasks section, danger zone) per UI Spec.
- [x] T021: Build `SponsorTiersPane` per UI Spec.
- [x] T022: Add the Sponsors nav entry (gated on `sponsorsEnabled`) and route in `AppLayout.tsx`/`App.tsx`.
- [x] T023: Extend `TasksAdmin.tsx` to filter/display/create sponsor-targeted tasks.
- [x] T024: Extend the submission form builder's routing rule UI with the "Link submission to sponsor" target.
- [x] T025: Verify the full flow end-to-end in the browser: create tier → create sponsor → add contact → mark it primary → add task from a template → configure a CFP routing rule that assigns the sponsor → submit a test CFP response that matches the rule → confirm the resulting submission is linked to the sponsor and lands in the accept queue → confirm nothing sponsor-related is visible on the public CFP form itself beyond the dropdown option.

  **Authenticated live verification (2026-08-13):** the owner created `PR113 Verified Tier` and
  `PR113 Verified Sponsor`, added two contacts and changed the primary, applied the Sponsor
  Deliverables template, completed a task, persisted a Workshop → Accept queue → sponsor rule,
  and submitted `PR113 Routed Workshop 1415` through the public CFP. The sponsor detail showed
  that exact response in Accept Queue and linked to its exact Abstracts record. The public form
  exposed no sponsor internals. Reload/new-session persistence and the clean guarded-tier error
  passed at desktop and 390px, including dark mode.

> ⚠️ A feature is NOT done until it is visible and usable in the UI. Backend-only work that has
> no UI entry point must still have a plan for where/how the user will access it. If the UI
> phase is skipped, the feature is incomplete — no exceptions.

## Task Dependencies
- Phase 2 depends on Phase 1 (schema must exist before functions can read/write it).
- Phase 3 depends on Phase 1 (schema) and can run in parallel with Phase 2.
- Phase 4 depends on Phase 2 and Phase 3 (repo layer wraps the finished Convex functions).
- Phase 5 depends on Phase 4 (components call the repo layer, not Convex directly).
- T014 (routing test) depends on T011-T013.
- T025 (end-to-end browser verification) depends on every prior task.

## Verification Checklist
- [x] Exact `USER_JOURNEY.md` flow completed in an authenticated running browser
- [x] All acceptance paths are implemented and reachable in code
- [x] Feature has organizer UI entry points (not just backend operations)
- [x] `sponsorsEnabled` toggle correctly shows/hides the Sponsors nav item and route
- [x] Deleting a tier with sponsors assigned is blocked with a clear error
- [x] Deleting a sponsor cascades contacts and unassigns (not deletes) tasks/submissions
- [x] Exactly one contact can be primary at a time, enforced across create and update
- [x] A routing rule with `assignSponsorId` correctly links a public CFP submission to a sponsor, with no sponsor data exposed on the public form
- [x] `src/test/category-routing.test.ts` and existing task-related tests still pass
- [x] No regressions in existing Speakers/Tasks/Submission Form Builder flows
- [x] Docs updated if needed

The organizer-visible journey passed against the configured development deployment; automated
gates and the captured evidence supplement that browser record.
