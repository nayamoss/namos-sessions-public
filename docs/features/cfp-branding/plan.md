# CFP Submission Page Branding — Implementation Plan

## Phase 1: Schema & Backend
- [x] T001: Add `accentColor: v.optional(v.string())` to the `events` table in `convex/schema.ts`.
- [x] T002: Add `accentColor: v.optional(v.string())` to `eventFields` in `convex/events.ts` so the existing event-update mutation accepts it.
- [x] T003: Add `accentColor?: string` to the `Event` interface in `src/data/types.ts`.
- [x] T004: In `convex/publicForms.ts`'s `get` query, resolve `event.logoStorageKey` to a URL (mirror `safeHeadshotUrl` from `convex/publicEmbeds.ts:177-187`) and include `logoUrl`/`accentColor` on the returned `event` object.
- [x] T005: Add `logoUrl?: string` and `accentColor?: string` to `PublicSubmissionFormConfig["event"]` in `src/data/types.ts`; confirm `src/data/repo.ts` passes them through untouched (it should — it just returns the Convex query result).

## Phase 2: Frontend UI

> ⚠️ A feature is NOT done until it is visible and usable in the UI.
> This phase MUST be specific. Do NOT write "create a component."

### UI Spec

**Appearance step — `SubmissionFormBuilder.tsx`**
- Location: New wizard step in `src/pages/program/SubmissionFormBuilder.tsx`, inserted into the
  `steps` array (currently at lines 118-126) right after `"welcome"` and before `"abstract"`,
  labeled `"Appearance"`.
- Elements:
  - Heading: "Appearance" + helper text: "Add your event's logo and accent color to the
    submission page speakers will see."
  - Logo upload control:
    - Drag-and-drop / click-to-browse area (image files only) showing either an empty-state
      icon+label ("Drop a logo here or click to upload") or the current logo thumbnail
      (`max-h-10`, matching the cap used on the public page).
    - Loading state: spinner overlay on the thumbnail area while uploading.
    - Error state: inline red text below the control ("Couldn't upload image — try again") on
      upload failure; previous logo (if any) stays visible/unchanged.
    - "Remove logo" button/link, visible only when a logo is set — clears `logoStorageKey`.
  - Accent color control:
    - Color swatch button (opens native `<input type="color">`) next to a hex text `Input`
      showing the same value, editable directly (typing a valid hex updates the swatch live).
    - "Reset to default" link/button — clears `accentColor`.
  - Live preview card (use `cardSurfaceClasses` from `src/components/ui/card`, matching the rest
    of the builder): a miniature, non-interactive replica of the public page chrome — wordmark
    (logo image if set, else event name text + accent-colored dot), a static progress bar filled
    to ~40% in the accent color, and a disabled button styled like `PrimaryButton` in the accent
    color. Updates live as the organizer edits logo or color. With nothing set, shows the current
    default look (text wordmark, default theme) — this IS the empty state, no separate empty-state
    copy needed since the preview itself communicates it.
- Behavior:
  - Selecting a file calls `generateUploadUrl` → uploads the file → saves the returned storage id
    to `logoStorageKey` via the existing event-update mutation path used elsewhere in this file.
  - Clicking "Remove logo" clears `logoStorageKey` via the same save path.
  - Editing the color swatch or hex input updates local draft state on every change (live preview
    reflects it immediately) and persists via the same on-blur/save pattern this file already uses
    for other event text fields.
  - Invalid hex text (doesn't match `^#[0-9a-fA-F]{6}$`) is not saved — swatch/preview keep the
    last valid value until a valid hex is entered.
- Data: reads/writes `event.logoStorageKey` and `event.accentColor` via `useCurrentEvent()` +
  the existing event-update call already used by this file's other steps.

**Public CFP page — `SubmissionPage.tsx`**
- Location: `src/pages/public/SubmissionPage.tsx`, the `Wordmark` component (currently lines
  49-55) and the page's outermost wrapper divs (currently lines 96 and 114).
- Elements:
  - `Wordmark` renders `<img src={logoUrl} className="max-h-10" alt={eventName} />` when
    `logoUrl` is present, falling back to the existing text + accent-dot rendering otherwise.
  - Outermost wrapper div gets an inline `style` with `--primary`/`--primary-foreground` CSS
    custom properties set from `accentColor` (via the hex→HSL conversion described below) —
    only when `accentColor` is present and valid; omitted entirely otherwise, leaving the page's
    default theme untouched.
- Behavior: no new user interaction — this is purely presentational, driven by the data already
  fetched for the page.
- Data: reads `logoUrl`/`accentColor` off the `PublicSubmissionFormConfig["event"]` object this
  page already fetches.

**New utility — hex → HSL conversion**
- File: `src/lib/color.ts` (new small utility, no existing color-conversion helper found in the
  codebase to reuse)
- Exports: `hexToHslTriplet(hex: string): string | null` (returns e.g. `"217 89% 61%"` or `null`
  if input doesn't match `^#[0-9a-fA-F]{6}$`), `contrastForeground(hex: string): string`
  (returns `"0 0% 100%"` or `"0 0% 0%"` HSL triplet based on relative luminance threshold, for
  `--primary-foreground`).

### Tasks
- [x] T006: Add `src/lib/color.ts` with `hexToHslTriplet` and `contrastForeground`, plus unit
      tests covering valid hex, invalid hex, and both light/dark luminance cases.
- [x] T007: Build the Appearance step in `SubmissionFormBuilder.tsx` with every element in the UI
      Spec above (logo upload, color picker, live preview card, remove/reset actions).
- [x] T008: Wire the Appearance step's logo upload to `generateUploadUrl` + the event-update
      mutation; wire the color picker to the event-update mutation for `accentColor`.
- [x] T009: Update `Wordmark` in `SubmissionPage.tsx` to render the logo image when `logoUrl` is
      present.
- [x] T010: Apply `accentColor` as scoped `--primary`/`--primary-foreground` inline styles on
      `SubmissionPage.tsx`'s outermost wrapper, using `src/lib/color.ts`.
- [ ] T011: Verify the full flow in browser — see Verification Checklist below.

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

## Task Dependencies
- T001 → T002 → T003 → T004 → T005 (schema before backend before types)
- T006 can run independently, but T009/T010 depend on it
- T007 → T008 (build the step before wiring saves)
- T009, T010 depend on T005 (need the new fields flowing through the public query first)
- T011 depends on everything above

## Verification Checklist
- [ ] Set a logo + accent color on a test event in the Appearance step; live preview updates
      correctly for both.
- [ ] Open that event's public CFP submission URL in a real browser — logo renders in the header,
      progress bar / wordmark dot / primary button all reflect the chosen accent color.
- [ ] Pick a very light accent color and confirm the primary button's text stays legible (dark
      text); pick a very dark accent color and confirm it switches to light text.
- [ ] Remove the logo and reset the accent color; confirm the public page reverts to today's
      default look.
- [ ] Open a *different, untouched* event's public CFP page and confirm it looks pixel-identical
      to before this change (no regression for events that never set branding).
- [ ] Try uploading a non-image file / a broken upload (e.g. throttle network) and confirm the
      error state shows without clearing an existing logo.
- [ ] All acceptance criteria in `requirements.md` met.
- [ ] Feature is accessible and usable in the UI (not just implemented in the backend).
- [ ] No regressions introduced.
- [ ] Docs updated if needed.
