# CFP Submission Page Branding — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-17

## Problem Statement
Competing CFP tools (e.g. SessionBoard's `submit/<event>/<form>` pages) let organizers put their
own logo and accent color on the public call-for-proposals page. Namos Sessions' public CFP page
(`src/pages/public/SubmissionPage.tsx`) currently renders with zero event branding — no logo, no
color — even though the `events` table already has unused `logoStorageKey` and `theme` columns
(the latter is a free-text "conference theme" description field, not a color, and is not reusable
for this). Organizers have no way to make their submission page look like their event.

## User Stories
**As an** event organizer **I want to** upload my event's logo and pick an accent color for my
CFP submission page **so that** the page my speakers land on looks like my event, not a generic
Namos Sessions form.

**Acceptance Criteria:**
- GIVEN an organizer opens the submission form builder WHEN they go to the new Appearance step
  THEN they can upload a logo image and pick an accent color, with a live preview of both.
- GIVEN an organizer has set a logo and accent color WHEN a speaker opens the public CFP
  submission page for that event THEN the logo renders in the page header and the accent color
  is applied to the progress bar, the wordmark accent dot, and the primary action button.
- GIVEN an organizer has NOT set a logo or accent color WHEN a speaker opens the public CFP page
  THEN the page renders exactly as it does today (text wordmark, default theme colors) — no
  regression for events that don't opt in.
- GIVEN an organizer picks an accent color that would make button/progress-bar text illegible
  WHEN it's applied THEN foreground text on the accent-colored button stays legible (automatic
  light/dark text contrast based on the chosen color's luminance).

## Functional Requirements
- FR-001: Add `accentColor` (optional hex string) to the `events` table.
- FR-002: Add a logo upload control to the submission form builder that uses the existing
  `convex/files.ts` `generateUploadUrl` mutation and writes the resulting storage id to
  `events.logoStorageKey` (this column already exists and is already accepted by the `events`
  update mutation — it has just never had UI wired to it).
- FR-003: Add an accent-color picker to the submission form builder, writing to the new
  `events.accentColor` field.
- FR-004: `convex/publicForms.ts`'s `get` query (the query that actually powers the public CFP
  page) returns `logoUrl` (resolved via `ctx.storage.getUrl`, same pattern as
  `convex/publicEmbeds.ts`'s `safeHeadshotUrl`) and `accentColor` on the `event` object.
- FR-005: `SubmissionPage.tsx` renders the event logo in place of the text wordmark when
  `logoUrl` is present, and applies `accentColor` (converted to the app's `--primary` /
  `--primary-foreground` HSL CSS variables, scoped to the page root) so the progress bar, wordmark
  dot, and primary button pick it up automatically via existing `bg-primary` / `variant="accent"`
  styling — no new color classes needed.
- FR-006: A live preview inside the builder's Appearance step shows the logo + accent color
  applied to a miniature replica of the public page chrome (wordmark + progress bar + button),
  updating as the organizer edits either value.

## Out of Scope
- Multi-color themes, custom fonts, background images, or custom CSS (`backgroundStorageKey` and
  full theme systems like `naya-pw-20`'s theme builder are not part of this — v1 is logo + one
  accent color only, matching what SessionBoard's own submit page actually offers).
- Applying branding to any other public page (embeds, attendee site) — scoped to the CFP
  submission page only.
- `worker/public-cfp.ts` is NOT touched — it only handles the POST submission + rate limiting;
  the public page's data comes from the Convex `publicForms.get` query, not the Worker.

## Success Metrics
- An organizer can set a logo + accent color and see it live on the public CFP URL without any
  other change to the submission flow, fields, or validation.
- Events that don't set branding are pixel-identical to today's page.
