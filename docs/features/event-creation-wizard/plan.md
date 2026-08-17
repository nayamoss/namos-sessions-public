# Event Creation Wizard — Implementation Plan

## Phase 1: Foundation
- [x] T001: Read `src/pages/events/EventsLanding.tsx` (current `EventEditor`), `src/components/shared/WizardShell.tsx`, `src/pages/onboarding/OnboardingWizard.tsx` (save-early pattern reference), `src/pages/program/SubmissionForms.tsx` + `src/components/forms/TemplateGallery.tsx` + `src/pages/program/SubmissionFormBuilder.tsx` (CFP flow to re-host), `convex/events.ts`, `convex/eventMembers.ts`, `convex/forms.ts` in full before writing any code.
- [x] T002: Scaffold `src/pages/events/EventCreationWizard.tsx` with `WizardShell` and the 5-step skeleton (Basics, CFP, Branding, Team, Review), no field logic yet — just navigation between empty steps to confirm the shell works.

## Phase 2: Basics + Save-Early
- [x] T003: Build the Basics step (name, slug auto-derive, start/end date, timezone `Select`, location, type) reusing validation logic from the current `EventEditor` (`slugify`, `timestamp`, schedule check).
- [x] T004: Wire Basics "Next" to `repo.events.save(...)`, capture `eventId`/`slug` in wizard state, show inline error on failure, disable/label the button "Creating…" while in flight.

## Phase 3: CFP Fork
- [x] T005: Build the CFP fork step (Yes/Skip cards).
- [x] T006: On "Yes," embed `TemplateGallery` inline; on template selection call `repo.forms.createFromTemplate(templateId, eventId)`, capture `formId`.
- [x] T007: Re-host `SubmissionFormBuilder`'s existing step components inside this wizard for the newly created form, scoped to `eventId`/`formId`. **If this isn't cleanly extractable** (see design.md Risks), fall back to ending the wizard at Review and navigating to `/events/{slug}/program/forms/{formId}/edit` instead — do not force an awkward embed.
- [x] T008: On "Skip," advance straight to Branding with no CFP created.

## Phase 4: Branding + Team (optional/skippable steps)
- [x] T009: Build Branding step (theme `CharCounterInput` only — no logo upload, per design.md). "Skip" advances without a mutation call if unchanged; otherwise patches via `repo.events.save({ eventId, ...fields, theme })`.
- [x] T010: Build Team step: repeatable email + role invite rows (calls `repo.eventMembers.add` per row on Next), plus "copy team from an existing event" `Select` (fetches source members via `repo.eventMembers.list`, inserts each via `repo.eventMembers.add`, excluding the creator, respecting `EVENT_TEAM_MEMBER_LIMIT`). "Skip" advances without calls.

## Phase 5: Review + Wire-Up
- [x] T011: Build Review step — summary cards per prior step with "Edit" links back (`onStepChange`), "Finish" button.
- [x] T012: Wire "Finish" to `onSaved(eventId, slug)`; if a CFP was created, navigate into its edit route instead of the plain event workspace.
- [x] T013: Replace `EventEditor`'s `{ mode: "new" }` usage in `EventsLanding.tsx` with `EventCreationWizard`. Leave `{ mode: "duplicate" }` (existing `EventEditor` duplicate form) untouched.

## Phase 6: Frontend UI — Final Verification (REQUIRED, do not skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI.
> This phase MUST be walked through literally in a browser, step by step.

### UI Spec (recap — see design.md for full detail; this is the checklist to verify against)

- **Location:** `EventsLanding.tsx`, "+ New event" button opens `EventCreationWizard` in the `AppLayout` detail panel (same slot `EventEditor` used).
- **Step 1 Basics:** Name input (autofocus), slug input (auto-fills from name until touched, shows `/events/{slug}` preview), start/end date inputs (2-col grid), timezone select, location input, type input. Error text (red, `role="alert"`) on validation/save failure. Footer: Back (disabled on step 1) / Next ("Creating…" while saving).
- **Step 2 CFP fork:** Two selectable cards — "Yes, add a CFP now" / "Skip for now." Footer: Back / Next.
  - Yes path: `TemplateGallery` cards render inline; selecting one shows the CFP builder steps (setup/welcome/abstract/participant/routing/settings/notifications) OR (fallback) advances wizard to Review and defers CFP building to a redirect.
  - Skip path: advances to Branding.
- **Step 3 Branding:** Theme text field (char counter). "Skip" text link + Next button.
- **Step 4 Team:** Invite rows (email input + role select + remove button, "+ Add another"). "Copy team from an existing event" select (hidden if no other events exist). "Skip" text link + Next button.
- **Step 5 Review:** Summary cards (Basics, CFP, Branding, Team) each with an "Edit" link jumping back to that step. "Finish" button.
- **Empty/loading states:** Basics Next button shows "Creating…" while in flight; Team step's "copy from" select is hidden entirely when no other events exist (not shown disabled).
- **Error states:** Inline red `role="alert"` text under the relevant fields on every mutation failure, matching `EventEditor`'s existing error pattern.

### Tasks
- [x] T014: Start the dev server (reuse the already-running port — do not spin up a new one). **Note:** Codex's own sandbox could not reach Clerk auth to browser-verify (see below), so this was completed by a human follow-up pass instead, in a temporary dev server pointed at this worktree (the shared checkout's already-running server was on a different branch).
- [x] T015: In a real browser, click "+ New event," walk through all 5 steps with the CFP fork set to "Yes" — verify an event AND a CFP both exist at the end, and you land in the right place. Confirmed: event created, template selected, form created, landed on `/events/{slug}/program/forms/{formId}/edit` with the CFP builder loaded correctly.
- [x] T016: Repeat with CFP fork set to "Skip" — verify the event exists, no CFP was created, and Branding/Team can both be skipped entirely to reach Review in under a minute. Confirmed: Review showed "No CFP yet," Finish landed on `/events/{slug}/dashboard`.
- [x] T017: Try invalid inputs — all cases now verified in a follow-up browser pass against the merged `main`: empty name/slug (inline "Name and slug are required.", no advance), duplicate slug (inline "That event slug is already in use.", no advance), invalid invite email (inline "Enter a valid email address.", no advance), and the 8-person team limit (7 invites + the creator filled all 8 seats cleanly; the 8th invite attempt correctly threw "This event team is limited to 8 people." with no corruption — confirmed on the event's Team settings page showing "8 of 8 seats used" and "Team full").
- [x] T018: Close the wizard after Basics completes but before Review — verified indirectly: both test events created during this verification pass persisted as draft events in the list immediately after the Basics step, before Review was ever reached, confirming save-early works.
- [x] T019: Verify the untouched "Duplicate event" quick action still works exactly as before. Confirmed: panel opens with the pre-existing 4-field duplicate form, unaffected by this change.
- [x] T020: Verify against every acceptance criterion in `docs/features/event-creation-wizard/requirements.md`. Confirmed against all listed criteria.

**Bug found and fixed during this verification pass:** `WizardShell`'s step layout switched to a side-by-side sidebar+content layout at the `lg` viewport breakpoint regardless of its container's actual width. Inside `AppLayout`'s ~400px detail panel, this collapsed the CFP fork step's two option cards into overlapping, unreadable text, and cramped the Basics step's date/location/type fields. Fixed by adding an opt-in `layout="stack"` prop to `WizardShell` (default unchanged, so the CFP builder's existing full-page usage is unaffected) and using it in `EventCreationWizard`, plus dropping the CFP fork's `md:grid-cols-2` and Basics' two `sm:grid-cols-2` rows to single-column (the panel is too narrow for two columns regardless of breakpoint). Re-verified clean after the fix.

> ⚠️ A feature is NOT done until it is visible and usable in the UI. If any step above surfaces a bug, fix it and re-verify from T014 — do not report done with a known issue attached.

## Task Dependencies
- T003-T004 must complete before T005 (CFP fork needs a real `eventId` to scope `createFromTemplate` to).
- T006-T007 (CFP re-host) is the highest-risk phase — if T007's inline embed proves impractical, fall back per its own note before continuing to Phase 4.
- T013 (wiring into `EventsLanding.tsx`) should be last code change, once all steps are individually verified.
- Phase 6 (browser verification) runs after everything else and is not optional.

## Verification Checklist
- [x] All acceptance criteria in requirements.md met
- [x] Feature is accessible and usable in the UI (not just implemented in the backend) — reachable from "+ New event"
- [x] Existing "Duplicate event" flow still works, unmodified in behavior
- [x] No regressions to `OnboardingWizard.tsx` or `EventDetails.tsx` (both untouched — no diff to either file)
- [x] Docs updated: the CFP re-host fallback (T007) was used instead of the inline embed — deviation noted in design.md's Risks section
