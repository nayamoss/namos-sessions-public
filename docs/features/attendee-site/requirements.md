# Attendee Site (automatic mobile conference website)

## Why
Organizers currently have no single public, attendee-facing page for the conference schedule. The
raw building blocks exist (`convex/publicEmbeds.ts` public projection, `/e/:eventSlug/:feed`
embed feeds in `src/pages/public/EmbedPage.tsx`), but there is no polished, single-URL attendee
site comparable to what BusyConf calls an "automatic mobile website."

## Goal
When an organizer publishes their agenda, a responsive, public attendee site becomes available at:

```
/e/:eventSlug
```

No separate website builder, no manual publishing step beyond the existing "publish event /
publish agenda" flow already in the app.

## Scope (v1)
- New public route `/e/:eventSlug` (distinct from the existing `/e/:eventSlug/:feed` embed feeds —
  do not break those).
- Attendee site includes:
  - Event name, dates, venue/timezone, logo/branding (reuse existing event branding fields)
  - Day navigation when the agenda spans multiple days
  - Track/room filters
  - Chronological session list, grouped by day then track (reuse `agendaDayTrackGroups` from
    `src/lib/public-embed.ts` where possible instead of re-deriving grouping logic)
  - Session detail (abstract/description, speakers, room, track) — session detail can be a
    client-side expand/drawer or a sub-route; pick whichever fits existing routing conventions in
    this app, but the URL must be shareable/deep-linkable to a specific session
  - Speaker profiles (reuse existing `publicSpeakers` shape from `convex/publicEmbeds.ts`)
  - "Now" / "Up next" indicator based on current time vs `event.timezone`
  - Search across session titles/speakers
  - "Save to my schedule" using `localStorage` (no auth required for attendees)
  - Add-to-calendar link per session (.ics or Google Calendar link is fine for v1)
  - Fully responsive (phone, tablet, desktop) — ONE page, not separate mobile/desktop URLs
- Only published agenda items are visible (same privacy boundary already enforced in
  `convex/publicEmbeds.ts` — draft/unpublished items, ids, emails, submission statuses must never
  cross this boundary). Extend the existing public query rather than inventing a parallel one,
  unless the existing shape genuinely can't support this page's needs.
- "Last updated" timestamp shown on the page so attendees trust the freshness of late changes.

## Explicitly out of scope for v1
- Organizer-side "Attendee site" preview/configure/publish panel UI (branding toggle, QR code,
  "copy public URL" card) — note it as a natural follow-up, but do not block this PR on it unless
  it's small. If time allows, a minimal link to `/e/:eventSlug` from the existing Agenda page
  toolbar is a nice-to-have, not required.
- Offline/PWA support
- Native app packaging

## Non-negotiables
- No new border/shadow/gradient/divider UI — follow this repo's existing design conventions
  (check `src/components/PublicLayout.tsx` and existing public pages for the established look
  before inventing new patterns).
- Do not regress the existing `/e/:eventSlug/:feed` embed routes or their tests
  (`src/test/public-embed-views.test.tsx`).
- Respect the existing public-data privacy boundary in `convex/publicEmbeds.ts`.
