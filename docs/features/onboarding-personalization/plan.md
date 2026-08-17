# Onboarding Personalization — Implementation Plan

**Implementation note (post-planning revision):** T001–T003 below originally targeted the
`organizers` table/`OrganizersRepo`. That was wrong — `organizers` only ever has a row for the
bootstrap owner or someone an owner explicitly adds, so a normal user's first signup would have
silently no-op'd. Actually shipped as a new `userProfiles` table + `ProfilesRepo`, keyed purely
on Clerk `userId`, no authorization meaning. Superseded tasks marked below; the shape (which
fields, which UI step calls it) is otherwise unchanged from the plan.

## Phase 1: Schema & Backend
- [x] T001 (superseded): `signupRole`/`referralSource` (plus `displayName`, added mid-build —
      see Phase 2 note) live on a new `userProfiles` table in `convex/schema.ts`, not on
      `organizers`.
- [x] T002 (superseded): `save` mutation added to new `convex/userProfiles.ts`, not
      `convex/organizers.ts` — looks up/creates the caller's row by `identity.subject` directly,
      no `organizerForIdentity`/organizer-row dependency. Patches only the fields provided,
      trims/caps `referralSource` at 200 chars.
- [x] T003 (superseded): new `ProfilesRepo` interface (`getMine`/`save`) in `src/data/repo.ts`,
      implemented in `src/data/transport.ts` — not added to `OrganizersRepo`.

## Phase 2: Frontend UI (REQUIRED — do not skip)

> A feature is NOT done until it is visible and usable in the UI. Every element below must
> exist exactly as described — do not build a generic placeholder.

### UI Spec

**New step — "A couple quick things"** (inserted as the new `step === 1`, pushing the current
steps 1–3 to 2–4; `stepMeta` becomes 5 entries: `welcome`, `identity`, `conference`, `email`,
`import`)

- Location: Onboarding wizard, step 2 of 5, same `<section className="space-y-6">` pattern and
  `max-w-lg` container as every other step
- Elements:
  - `<h1>` "A couple quick things" (`text-2xl font-semibold sm:text-3xl`, matches existing step
    headings)
  - `<p>` subtext: "Helps us set things up right for you — skip if you'd rather not say."
    (`mt-2 text-sm text-muted-foreground`)
  - `<Label>` "Are you running this solo or with a team?"
  - Segmented control: two `<button type="button">` elements side by side in a flex row, `gap-2`.
    Each: `h-11 flex-1 rounded-[10px] text-sm font-medium` — unselected state
    `bg-card text-foreground`, selected state `bg-primary text-primary-foreground` (or whatever
    token the existing `PrimaryButton` uses for its accent — reuse it, don't invent a new color).
    No border, no shadow. Labels: `Solo`, `With a team`.
  - `<Label>` "How did you hear about us?"
  - `<Select>` (existing shadcn component) `h-11 rounded-[12px] bg-card`, placeholder "Choose
    one", options: `Search`, `Social media`, `A colleague or friend`, `Another conference tool`,
    `Other`
  - Conditional `<Input>` (only rendered when `Other` is selected): `h-11 rounded-[12px] bg-card`,
    placeholder "Tell us more", `mt-2`
  - No error state — every field optional, nothing here can block Continue
  - Button row (identical layout/components to every other step): `Back` outline button,
    `PrimaryButton` "Continue", `Skip this step` ghost button
- Behavior:
  - Clicking a segmented-control option sets it selected (only one selected at a time — plain
    toggle, no multi-select)
  - Selecting `Other` in the Select reveals the follow-up Input; selecting anything else hides
    and clears it
  - Continue (click or Enter via existing keyboard handler): fires
    `repo.profiles.save({ signupRole, referralSource })` best-effort (don't
    await-block navigation — advance regardless of outcome; log failures via
    `friendlyErrorMessage` to console only, no user-facing error for this step), then `setStep`
    to the conference step
  - Skip: advances immediately, no mutation call
  - Back: returns to Welcome, same `goBack()` as every other step
- Data: writes to `repo.profiles.save`; reads nothing

**Collapsed "Your conference" step** (was `step === 1`, becomes `step === 2`)

- Location: same position in the flow relative to conference creation, now step 3 of 5
- Elements:
  - `<h1>` "Name your conference" (was "Tell us about your conference")
  - `<p>` subtext: "We've filled in sensible defaults below — change anything now, or later in
    Settings → Event Details."
  - Conference name `<Input>` — unchanged component, still `data-autofocus="true"`, still the
    only required field
  - `<Collapsible>` (Radix, already a dependency) wrapping URL slug, Event type, Timezone,
    Starts at, Ends at — exactly the same fields/components as today
    (`TimezoneCombobox`, `DateTimeField` ×2), collapsed by default. Trigger: ghost button/text
    "Customize details" with a chevron icon (Lucide `ChevronDown`, rotates when open — same
    pattern already used elsewhere for disclosure triggers in this codebase, check
    `ReadinessCategoryCard` or similar for the exact rotate-on-open class if one exists)
  - Error state: unchanged — "A conference name is required." inline error
- Behavior:
  - On first entering this step, if the organizer hasn't touched these fields yet, compute
    defaults once: `timezone` from `getBrowserTimezone()` (unchanged default), `startDate` = now
    + 14 days at 9:00 AM local, `endDate` = `startDate` + 1 day, `type` = "Conference" (unchanged
    default) — do NOT recompute on every render, only when the step is first shown with blank
    values
  - Continue: unchanged — `repo.events.save`, same validation, same error handling
- Data: unchanged — `repo.events.save` / `repo.events.listMine` as today

### Tasks
- [ ] T004: Add `identity` state (`{ signupRole?: "solo" | "team"; referralSource?: string }`)
      to `OnboardingWizard`, separate from `event` state.
- [ ] T005: Update `stepMeta` to 5 entries; renumber every `step === N` check and every
      `setStep(N)` call throughout `next()`, `goBack()`, and the `StepErrorFallback onSkip`
      handlers to match the new order (identity=1, conference=2, email=3, import=4).
- [ ] T006: Build the new identity step section per the UI Spec above (segmented control +
      Select + conditional Input + button row).
- [ ] T007: Wire Continue on the identity step to `repo.profiles.save`,
      best-effort per the Behavior spec.
- [ ] T008: Collapse the conference step's URL slug / event type / timezone / dates fields
      into a `Collapsible`, collapsed by default; compute smart defaults once on step entry.
- [ ] T009: Update `canSkip` threshold (`step >= 2` → `step >= 1`, since identity is now the
      first skippable step) and the footer keyboard-hint copy if it references step numbers.
- [ ] T010: Sweep for `__debugStep` and any other hardcoded step-index reference (docs, tests)
      and update to match the new 5-step order.
- [ ] T011: Verify full flow works end-to-end in browser: welcome → identity (answer, then
      separately test skip) → conference (test both collapsed-defaults path and
      customize-details path) → email → import → landing on dashboard. Confirm
      `profiles.save` actually persisted by checking the row via Convex
      dashboard or a `getMine()` call after completing.

## Task Dependencies
T001 → T002 → T003 → T007 (backend must exist before the frontend can call it)
T004, T005 can start independent of backend work
T006 depends on T004/T005 (needs state + step numbering in place)
T008 independent of the identity-step work, can be done in parallel
T011 depends on everything above

## Verification Checklist
- [ ] All acceptance criteria in `requirements.md` met
- [ ] Feature is accessible and usable in the UI (not just implemented in the backend)
- [ ] Skipping the identity step works identically to answering it — no dead end, no error
- [ ] Conference step is completable with only a name typed in — no other field required
- [ ] `DateTimeField` time-input width fix (already applied) still in place, no regression
- [ ] `__debugStep` and any other step-index references updated for the new 5-step order
- [ ] No regressions to email-connect or import-data steps
- [ ] Docs updated if needed
