# Attendee Site — implementation notes

## Reuse first
- `convex/publicEmbeds.ts` — the `get` query already returns published-only agenda + speakers
  scoped to a slug with the correct privacy projection. Extend it (add fields like venue,
  event dates, a room/track list, session descriptions/abstracts, per-item id or slug for
  deep-linking, and an "updatedAt"/last-published timestamp) rather than writing a second query
  that duplicates the privacy filtering logic.
- Session descriptions and speaker associations fail closed per agenda item. A description is
  public only while that item's linked submission is `accepted`. A speaker is public on a
  specific item only when the same accepted linked submission names that speaker and the item
  includes the speaker in `speakerIds`. The schema has no proposal relationship for other
  organizer-attached speakers, so those attachments cannot be made public safely.
- `src/lib/public-embed.ts` — has `agendaDayTrackGroups`, `sessionTrackGroups`,
  `itineraryDayGroups` grouping helpers already. Reuse or extend, don't reimplement day/track
  grouping from scratch.
- `src/pages/public/EmbedPage.tsx` and `src/components/PublicLayout.tsx` — match the existing
  visual language (spacing, typography, card treatment) for consistency. `PublicLayout` is
  presumably the shared chrome for public-facing pages — use it.

## New pieces likely needed
- A new page component, e.g. `src/pages/public/AttendeeSite.tsx`, mounted at `/e/:eventSlug` in
  `src/App.tsx` (add it near the existing `/e/:eventSlug/:feed` route — note that React Router
  route ordering matters: `/e/:eventSlug` and `/e/:eventSlug/:feed` don't conflict since one has
  an extra segment, but verify empirically).
- Session detail: either an in-page expand or a `/e/:eventSlug/session/:sessionId` sub-route
  (or similar) — pick based on what best supports deep-linking + back button behavior with
  React Router.
- A small client-side "favorites" module using `localStorage`, namespaced per event slug so it
  doesn't collide across events.
- Add-to-calendar: generate an `.ics` data URI or a Google Calendar URL per session — no backend
  needed.
- "Now" / "Up next": derive client-side from `Date.now()` compared against each item's start/end
  time in `event.timezone`; there's already a `time()`-formatting pattern in `EmbedPage.tsx` to
  follow for timezone handling.

## Verification
- `npm run test` (or the project's actual test script — check `package.json`) including the
  existing `src/test/public-embed-views.test.tsx` must still pass.
- `npm run build` / typecheck must pass.
- Browser-verify manually: seed or find an existing published event with a multi-day, multi-track
  agenda in dev data, visit `/e/<that-slug>`, and click through: day switch, track filter, search,
  save a session, open a session detail deep link directly (paste the URL fresh), add-to-calendar
  link, and confirm layout at phone width and desktop width. Also re-check
  `/e/<that-slug>/agenda` (an existing embed feed) still renders correctly — this must not
  regress.
