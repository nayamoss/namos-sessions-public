# Namos Sessions Email Templates — Build Plan

Scope: this repo only (Namos Sessions / Kanrei CFP tool, formerly Takumi Talks). Do not touch
other projects.

## Why this differs from the earlier Sentio plan

This app's real email surface is narrow: CFP submission → review → decision → reminder, plus
organizer-authored blasts. Payments/billing do not exist here (explicitly "NOT NEEDED — do not
build" per AGENTS.md). Account-lifecycle email (verification, password reset, login alerts) is
owned by Clerk already — do not duplicate it. There is no blog/comment system in this app.

The existing `comms_templates` Convex table stores `subject` + `body` as plain text with
`{{speakerName}} {{eventName}} {{sessionTitle}} {{portalUrl}}` token substitution
(`convex/schema.ts`, the retired decision/reminder handlers,
`src/lib/confirmation-email.ts`). Upgrade these from plain text to real branded HTML React Email
components — same tier of design quality as `comment-submitted.tsx` built for Sentio — while
**preserving the ability for an organizer to add a custom message on top of the base template**
(a `customMessage?: string` prop rendered as an inserted paragraph/block, not a full override,
so the branded shell/structure stays consistent even when an organizer adds their own note).

## Brand evidence (Kanrei palette — real, from this repo's own source)

- `tailwind.config.ts`: `fontFamily.sans = ["Inter", "system-ui", "sans-serif"]`,
  `fontFamily.display`/`serif = ["'Instrument Serif'", "Georgia", "serif"]`
- `src/index.css` `:root`: near-white background `hsl(0 0% 98%)`, near-black foreground
  `hsl(0 0% 9%)`, white card `hsl(0 0% 100%)`, muted `hsl(0 0% 91%)` / muted-foreground
  `hsl(0 0% 45%)`, **border/input are literally transparent** (`0 0% 0% / 0`) — comment in the
  file says "separation uses fill color, not borders." Radii: `--r: 8px`, `--r-lg: 12px`.
- `src/lib/clerk-appearance.ts`: coral accent `#F58E63` — "brand coral accent," used sparingly
  as the sole accent color, everything else is grayscale.
- Dark mode exists (`.dark` block) but email clients don't reliably honor `prefers-color-scheme`
  well enough to rely on it — build the light-mode version as the real deliverable.

Rules: no borders, no box-shadows, no gradients, no emoji. Serif (Instrument Serif/Georgia) for
headings only, Inter for body. Coral `#F58E63` used deliberately, not as a wash. Radius 8-12px,
not pill-shaped (unlike Sentio's pill style — this brand uses tighter radii, don't copy Sentio's
999px pills). Voice: direct, calm, no exclamation points — matches existing plain-text copy in
`src/lib/confirmation-email.ts` and the retired decision-email handler.

## Templates to build (all as `.tsx` React Email components)

Location: `src/emails/templates/` (new directory — this repo has no existing emails/ dir, follow
whatever local convention `src/components/` already uses for shared UI primitives).

1. **submission-confirmation.tsx** — the one true "must have." Confirms a CFP submission was
   received, links to the speaker portal. Base copy from `src/lib/confirmation-email.ts`.
2. **decision-accepted.tsx** — session accepted, links to portal + speaker tasks. Base copy
   from the retired decision-email handler (`decision === "accepted"` branch).
3. **decision-declined.tsx** — session not accepted, kind/brief, links to portal. Base copy
   from the same file's declined branch.
4. **decision-consolidated.tsx** — NEW: one speaker, multiple submissions, mixed outcomes.
   Render a per-submission outcome list (accepted/declined) in one email rather than sending
   three contradictory ones. This is the differentiator called out in
   `docs/features/comms-notifications/plan.md`.
5. **reminder.tsx** — speaker task/deadline reminder. Base copy from
   the retired reminder-email handler.
6. **admin-alert.tsx** — NEW/lightweight: organizer-facing notification of a new or updated
   submission. Cut candidate per the plan doc, but build it — it's cheap once the shared layout
   exists.
7. **custom-blast.tsx** — organizer-authored ad-hoc message (the `"custom"` kind already in the
   `comms_templates` schema union). This is the template where `customMessage` IS the primary
   content, not an addition — full-width body slot, same branded shell (logo, footer,
   unsubscribe-equivalent — check whether this app needs an unsubscribe link at all, it's
   transactional/organizer-to-speaker, not a marketing list).

Every template except `custom-blast.tsx` must accept an optional `customMessage?: string` prop:
when present, render it as an inserted paragraph immediately after the main message and before
the CTA button, visually distinguished (e.g. a muted inset block, not just another paragraph) so
it's clear which part is templated and which part the organizer typed.

## Explicitly out of scope for this pass

- Any payment/billing email (payment receipt, failed payment, card expiring, subscription
  canceled, trial ending) — this app has no payments, per AGENTS.md.
- Any Clerk-owned account email (email verification, password reset, password changed, login
  alert) — Clerk sends these itself.
- Any blog/comment-moderation email — this app has no blog.
- Calendar `.ics` generation — already implemented separately in
  `src/lib/calendar-invite-core.mjs`, not a template.

## Batch 2 — expanded to 20 total (user explicitly wants the fuller set, not just the cut-line "must haves")

Same brand rules, same `customMessage?: string` slot pattern as Batch 1. All still skip
payments/Clerk-account/blog — those genuinely don't exist in this app regardless of count.

8. **submission-updated.tsx** — speaker edited their submission, confirms what changed
9. **submission-withdrawn.tsx** — speaker withdrew their submission, confirms withdrawal
10. **cfp-closing-soon.tsx** — deadline reminder sent to anyone with a draft/incomplete
    submission before the CFP window closes
11. **speaker-task-assigned.tsx** — a new speaker-portal task was assigned (bio, AV needs,
    headshot, etc.), links to the task
12. **speaker-task-completed.tsx** — confirms a speaker-portal task was marked complete
13. **session-scheduled.tsx** — time/room assigned for an accepted session
14. **schedule-changed.tsx** — time/room changed after initial scheduling
15. **event-reminder.tsx** — day-of/week-of reminder to accepted speakers with logistics
16. **waitlisted.tsx** — session placed on a waitlist (distinct from declined — may still be
    accepted later)
17. **waitlist-promoted.tsx** — moved off the waitlist to accepted
18. **review-assigned.tsx** — a reviewer/admin is assigned submissions to review
19. **review-reminder.tsx** — reviewer hasn't completed assigned reviews, deadline approaching
20. **post-event-thanks.tsx** — thank-you / feedback request sent to speakers after the event

## Build rules

- Add `@react-email/components` and `@react-email/render` as dependencies (not currently
  installed) — same packages Sentio's repo uses, for consistency across your projects.
- Placeholder props only — no real emails/domains/secrets.
- Keep the existing `{{speakerName}} {{eventName}} {{sessionTitle}} {{portalUrl}}` token
  concept intact conceptually: template props should map 1:1 to those tokens plus the new
  `customMessage`, so wiring these into the existing `comms_templates`/send-function flow later
  is a straightforward prop-mapping exercise, not a rearchitecture.
- Do NOT wire these into send actions or Convex mutations yet, do NOT touch
  `comms_templates` schema, do NOT send real email, do NOT commit/push without explicit
  approval.
- After building, render every template to real HTML via `@react-email/render`, once with a
  realistic name AND with name absent, AND once with `customMessage` populated AND once without
  — save all rendered HTML locally (not published anywhere) to
  `/private/tmp/claude-501/-Users-nieoln-GitHub-sites-01-active-projects/00c728b2-3643-41e3-b809-b575e8e1f9b9/scratchpad/namos-sessions-email-previews/`.
- Run the project's typecheck command at the end and fix errors in the new files.
- Report back: template name | file path | rendered preview paths | one-line description.
  Confirm SEND PATH WIRED: no, REAL EMAIL SENT: no, DEPLOYED: no, COMMITTED: no.
