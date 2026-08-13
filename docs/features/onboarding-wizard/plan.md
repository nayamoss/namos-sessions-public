# Organizer Onboarding Wizard — Implementation Plan

## Phase 1: Schema & Backend Foundation
- [ ] T001: Add `onboardingCompletedAt: v.optional(v.number())` to the `organizers` table in
      `convex/schema.ts`.
- [ ] T002: Add `organizers.getMine` (query, `requireIdentity` only) and
      `organizers.completeOnboarding` (mutation, `assertOrganizer`, patches caller's own row) in
      `convex/organizers.ts`.
- [ ] T003: Add `speakers.bulkImport` mutation in `convex/speakers.ts` — validate rows (reuse
      `requiredSpeakerText`/`normalizedSpeakerEmail`), enforce the 500-row cap, skip existing
      `(eventId, email)` speakers, create/reuse the synthetic `"Imported from CSV"`
      `submission_forms` row using the exact field values in design.md's "Required Changes"
      section (all fields on `submission_forms` are required except the five noted there — do not
      guess at defaults) when any row has `talkTitle`, insert `submissions` (`status: "accepted"`,
      `answers: { abstract: talkAbstract ?? "" }`) for those rows. Return
      `{ importedSpeakers, importedTalks, skipped }`.
- [ ] T004: Wire `getMine`, `completeOnboarding`, `bulkImport` through `src/data/types.ts` →
      `src/data/repo.ts` (extend `OrganizersRepo`, `SpeakersRepo`) → `src/data/convex/index.ts`.
- [ ] T005: Block the three new operations in `src/data/airtable/index.ts` with the existing
      "Airtable does not yet provide the organizer/RBAC boundary." message pattern.
- [ ] T006: Add/update Convex unit tests for `organizers.getMine`/`completeOnboarding` and
      `speakers.bulkImport` (valid rows, duplicate-email skip, over-cap rejection, talk-row
      submission creation, synthetic form reuse across two imports for the same event).

## Phase 2: Extract Shared Email Integration Component
- [ ] T007: Extract the connect-form body of `src/pages/settings/EmailDelivery.tsx` into
      `src/components/shared/EmailIntegrationForm.tsx` (`{ eventId: EventId }` props), keeping all
      existing state/validation from `@/lib/email-integration-form` untouched.
- [ ] T008: Update `EmailDelivery.tsx` to load its event and render
      `<EmailIntegrationForm eventId={event.id} />` inside its existing `AppLayout`/loading/error
      wrapper.
- [ ] T009: Run the existing test suite touching this page/lib (e.g.
      `src/test/email-integration-auth.test.ts` and any `EmailDelivery`-specific tests) and fix
      any breakage from the extraction before moving on — this is a refactor, it must not change
      behavior.

## Phase 3: Frontend UI — Onboarding Wizard (REQUIRED, do not skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI. Every element below must be
> built exactly as specified — do not substitute a generic placeholder.

### UI Spec

**Route & guard**
- Add `const OnboardingWizard = lazy(() => import("@/pages/onboarding/OnboardingWizard"));` in
  `src/App.tsx`.
- Add `RequireOnboarding` component (full implementation in design.md) and restructure the routes
  currently under `RequireAuth` into three groups — **do not blanket-wrap everything under
  `RequireAuth`, that regresses the speaker portal (see design.md's Routing section)**:
  1. `/onboarding` — direct sibling inside `RequireAuth`, no onboarding gate.
  2. `/portal/*` — direct sibling inside `RequireAuth`, no onboarding gate (speaker-facing,
     `PortalHome` — speakers have no `organizers` row and must never hit this guard).
  3. Every other existing route (`/dashboard`, `/dashboard/speakers`, `/program/*`,
     `/settings/*`, `/portals/forms`, `/portals/tasks`) — nested inside a new
     `<Route element={<RequireOnboarding />}>` block.
- Public routes (`/e/:eventSlug/:feed`, `/submit/:eventSlug/:formId`, `/sign-in/*`, `/sign-up/*`)
  are untouched — confirm they still render with no auth/onboarding gate.
- Verify in the browser with a **speaker** account (one with no `organizers` row): confirm
  `/portal/*` still loads normally and is never redirected to `/onboarding`.

**`OnboardingWizard` page** (`src/pages/onboarding/OnboardingWizard.tsx`)
- Location: `/onboarding`, inside `PublicLayout` (`width="wide"`), no `AppLayout` sidebar.
- Elements:
  - H1 "Set up your conference" (`text-xl font-semibold`) + subtitle "This takes about 2 minutes.
    You can skip any step and come back later." (`text-sm text-muted-foreground`)
  - Page-level error line (`role="alert"`, `text-sm text-destructive`) above the wizard, shown for
    any failed load
  - `WizardShell` with steps `[{id:"welcome",label:"Welcome"}, {id:"conference",label:"Your conference"}, {id:"email",label:"Connect email"}, {id:"import",label:"Import data"}]`
  - "Skip this step" secondary button/link, visible only on the `email` and `import` steps,
    positioned inline with `WizardShell`'s Back/Next row (left of Back, or directly under the
    step content — pick whichever keeps the existing Back/Next row's layout intact per the
    toolbar/button placement rules; do not add a border or new panel for it)
  - Final step's Next button reads "Finish" instead of "Save" (pass a custom label override into
    `WizardShell` or, if that requires a `WizardShell` prop change, add an optional
    `finalLabel?: string` prop to `WizardShell` — keep the change backward compatible so
    `PortalForms.tsx`/`SubmissionFormBuilder.tsx` keep seeing "Save")
- Behavior:
  - On mount: `Promise.all([repo.organizers.getMine(), repo.events.list()])`; pre-fill the
    conference-details draft from `events[0]` if present (supports re-entry per FR-008); show
    `SkeletonList` while loading.
  - Step "welcome" → Next: if `getMine()` returned `null`, call `repo.organizers.claimOwner()`;
    on failure, show the error inline on the step and do not advance; on success (or if a row
    already existed), advance.
  - Step "conference" → Next: call `repo.events.save(draft)`; on failure show inline error and do
    not advance; on success store the returned `eventId` for later steps and advance.
  - Step "email" → Next/Skip: both simply advance (`EmailIntegrationForm` manages its own
    save/test independently and doesn't block navigation).
  - Step "import" → Finish/Skip: both call `repo.organizers.completeOnboarding()` then
    `navigate("/dashboard", { replace: true })`.

**Step 1 — `WelcomeStep`** (`src/pages/onboarding/steps/WelcomeStep.tsx`)
- Elements: heading "Welcome", copy "You're signed in as:", read-only `Field label="Email"` with
  a disabled `Input` showing the Clerk session email (via `@clerk/clerk-react`'s `useUser()`),
  inline claim-error text when present.
- No loading/empty states beyond the parent wizard's.

**Step 2 — `ConferenceDetailsStep`** (`src/pages/onboarding/steps/ConferenceDetailsStep.tsx`)
- Elements exactly as listed in design.md: name (autofocus), slug (auto-derived until touched),
  type, timezone, start/end `datetime-local` inputs, helper text about Settings → Event Details.
  Move `toDateTimeLocalValue`/`parseDateTimeLocalValue` out of `EventDetails.tsx` into
  `src/lib/datetime.ts` (new file) and import from both files.
- Loading/error states: inherited from parent wizard (single load), inline save error shown above
  the field grid.

**Step 3 — `ConnectEmailStep`** (`src/pages/onboarding/steps/ConnectEmailStep.tsx`)
- Elements: heading "Connect email delivery" + subtitle (see design.md), then
  `<EmailIntegrationForm eventId={eventId} />` from Phase 2.
- No separate loading/error state — delegated to `EmailIntegrationForm`.

**Step 4 — `ImportDataStep`** (`src/pages/onboarding/steps/ImportDataStep.tsx`)
- Elements exactly as listed in design.md:
  - Heading + subtitle
  - "Download CSV template" button (client-side Blob download, header row
    `firstName,lastName,email,bio,talkTitle,talkAbstract` + one example row)
  - File-picker empty-state card: `bg-neutral-100 rounded-[12px] p-8`, `Upload` icon (size 40,
    muted), heading "Drop a CSV file or click to choose", subtext listing required/optional
    columns, hidden `<input type="file" accept=".csv,text/csv">` triggered by the card
  - Parsing loading state: `SkeletonList`
  - Preview table (`overflow-x-auto` wrapper, no page-level horizontal scroll): First name, Last
    name, Email, Talk title, Status columns; invalid rows show their specific error in
    `text-destructive` in the Status cell
  - Summary line: "`{validCount}` rows ready to import, `{invalidCount}` rows have errors and
    will be skipped."
  - "Import `{validCount}` speakers" primary button (`variant="accent"`), disabled when
    `validCount === 0`
  - "Choose a different file" secondary link/button, resets to the empty-state card
  - Post-import result card: "Imported `{importedSpeakers}` speakers and `{importedTalks}` talks.
    `{skipped.length}` rows were skipped: `{reasons}`." + "Done" button
  - "Skip this step" button/link (rendered by the parent `OnboardingWizard`, not duplicated here)
- Behavior:
  - File input `onChange` → `file.text()` → `Papa.parse(text, { header: true, skipEmptyLines: true })`
  - Client-side validate each parsed row with the same rules as `speakers.bulkImport`
    (non-empty first/last name ≤200 chars, valid email regex) plus the 500-row cap check before
    any network call
  - "Import" button calls `repo.speakers.bulkImport({ eventId, rows: validRows })`; merge its
    `skipped` (duplicate emails) into the client-side invalid list for the result summary

### Tasks
- [ ] T010: Add `papaparse` + `@types/papaparse` to `package.json`.
- [ ] T011: Build `OnboardingWizard` page and route/guard wiring exactly per the UI Spec above.
- [ ] T012: Build `WelcomeStep`.
- [ ] T013: Build `ConferenceDetailsStep`, moving the datetime helpers into `src/lib/datetime.ts`
      and updating `EventDetails.tsx` to import from there instead of its local copies.
- [ ] T014: Build `ConnectEmailStep` (thin wrapper around `EmailIntegrationForm` from Phase 2).
- [ ] T015: Build `ImportDataStep` (template download, file picker, client-side parse/validate,
      preview table, import call, result summary).
- [ ] T016: Remove the `// TEMPORARY` claim-owner banner and its state/handlers from
      `src/pages/dashboard/DashboardHome.tsx` now that Step 1 of onboarding owns this flow.
- [ ] T017: Add component/unit tests: `RequireOnboarding` redirect behavior (incomplete →
      redirects, complete → renders `Outlet`, already-on-`/onboarding` → no redirect loop), CSV
      row validation function (valid row, missing email, bad email, over-cap), `ImportDataStep`
      preview rendering with mixed valid/invalid rows.
- [ ] T018: Verify the full flow end-to-end in a real browser (see Verification Checklist) —
      never report this phase done from code review alone.

## Task Dependencies
- T001 → T002, T003 (schema before functions that touch the new field/table interactions)
- T002, T003 → T004 → T005 (repo wiring needs the Convex functions to exist first; Airtable block
  can be added alongside T004)
- T007 → T008 → T009 (extract, then rewire the page, then verify no regression) — do this before
  T014, since `ConnectEmailStep` depends on `EmailIntegrationForm` existing
- T004, T009 → T011–T016 (wizard UI needs both the new backend operations and the extracted email
  component available)
- T010 → T015 (papaparse must be installed before `ImportDataStep` can parse CSVs)
- T011–T016 → T017 → T018

## Verification Checklist
- [ ] All acceptance criteria in `requirements.md` met
- [ ] A fresh signed-up account (no `organizers` row) is redirected to `/onboarding` from
      `/dashboard`, `/program/*`, `/settings/*`, `/portals/*` — checked in the browser, not just
      route-table inspection
- [ ] Step 1 claims owner access automatically and shows the signed-in email
- [ ] Step 2 creates an event; revisiting `/onboarding` later pre-fills it from the existing event
- [ ] Step 3 can connect a real (or test) email integration inline, and can be skipped
- [ ] Step 4 template download produces a valid CSV; uploading it produces a correct preview;
      importing creates the expected speakers/submissions in Convex; a row with a bad email is
      shown as invalid and excluded; re-importing the same file skips already-imported speakers
      by email with a clear reason
- [ ] "Skip this step" on steps 3–4 advances without writing anything for that step
- [ ] "Finish" sets `onboardingCompletedAt` and lands on `/dashboard`; the dashboard no longer
      shows the old claim-owner banner
- [ ] After completion, an authenticated navigation to any protected route no longer redirects to
      `/onboarding`
- [ ] `Settings > Email Delivery` still works exactly as before the `EmailIntegrationForm`
      extraction (connect, test, disconnect)
- [ ] `npm run check` (typecheck + test + build) passes
- [ ] No regressions introduced — existing test suites for `organizers`, `events`, `speakers`,
      email integration, and route-guard all still pass
- [ ] Feature is accessible and usable in the UI (not just implemented in the backend)
- [ ] Docs updated if needed
