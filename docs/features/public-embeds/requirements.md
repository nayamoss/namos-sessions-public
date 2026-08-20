# Public Embeds — Requirements

> **Brief-coverage audit, 2026-08-17:**
> [`BRIEF-ADDENDUM-2026-08-17.md`](./BRIEF-ADDENDUM-2026-08-17.md). Kill My SaaS requirement 9 is
> covered in source, including both named views, the responsive renderer, the public URL, the
> iframe snippet, and the published-only projection. Three gaps: the seeded speaker gallery is
> `enabled: false`, no `schedule_itinerary` embed is seeded, and the seed clears headshots so an
> enabled gallery renders blank avatars. Mobile behaviour has never been verified at a device width
> in a real browser. Seed changes plus a recorded mobile pass; no embed code work is proposed.

**Type:** Feature

**Status:** Done

**Priority:** Medium
**Last Updated:** 2026-08-13

## Problem Statement

Remote `main` already exposes safe, read-only public agenda, session-list, schedule-itinerary, and
speaker-gallery pages through PR #63, but an organizer
cannot discover, configure, save, preview, enable, disable, or copy an embed from the admin UI.
`src/pages/public/Embeds.tsx` is an unrouted snippet generator that requires manually typing an
event slug. Those public foundations are not the durable CMS > Embeds workflow shown in the
competition brief.

The requested feature restores the previously cut CMS surface and lets an organizer publish
mobile-friendly, event-scoped agenda, schedule itinerary, session list, speaker gallery, and
speaker list embeds without exposing draft proposals, declined speakers, email addresses,
submission answers, internal IDs, or unpublished agenda items.

## User Stories

**As an** event organizer **I want to** create and configure a saved embed **so that** I can place
the right subset of my event program on an external website without rebuilding it by hand.

**As an** event organizer **I want to** preview desktop and mobile states and copy ready-to-paste
iframe code **so that** I can verify the result before handing it to my website team.

**As an** attendee **I want to** browse the embedded program on desktop or mobile **so that** I
can find sessions and speakers without leaving the event website.

### Acceptance Criteria

- GIVEN an organizer has an event WHEN they open the sidebar and select CMS > Embeds THEN the
  application shows saved embeds for that event with search and All, Enabled, and Disabled filters.
- GIVEN no embeds exist WHEN the organizer opens CMS > Embeds THEN the page explains what embeds
  do and offers one visible `Add embed` action.
- GIVEN the organizer selects `Add embed` WHEN they choose a view, name it, configure supported
  style, filter, and field options, and save THEN the embed appears in the list and remains after
  refresh.
- GIVEN an embed is open WHEN the organizer changes its configuration THEN Preview updates from
  the draft configuration without publishing those unsaved changes to the external URL.
- GIVEN an enabled saved embed WHEN the organizer selects Get code THEN the application presents
  a copyable, titled, lazy-loaded, responsive iframe snippet whose URL contains an opaque embed ID.
- GIVEN an embed is disabled WHEN its public URL is requested THEN no event content renders and a
  neutral unavailable state is shown.
- GIVEN an enabled embed WHEN published agenda or accepted-speaker data changes THEN a subsequent
  load of the iframe reflects the current data without a manual sync or cache refresh.
- GIVEN a public embed request THEN the response contains only the fields enabled by that embed and
  never includes private records or fields.
- GIVEN the external host is 375px wide WHEN it loads the generated code THEN the embed has no
  horizontal page overflow and its controls remain operable by touch and keyboard.
- GIVEN clipboard access is unavailable or denied WHEN the organizer selects Copy code THEN the
  code remains selectable and the page shows an inline recovery message.

## Functional Requirements

- FR-001: Add a discoverable `CMS` navigation section with an `Embeds` item linking to the active
  event's `/events/:eventSlug/cms/embeds` route.
- FR-002: List only the active event's saved embeds, grouped by format, with name, view type,
  enabled status, duplicate, edit, and delete actions.
- FR-003: Search saved embeds by name, view label, format label, or opaque embed ID without
  refetching the dataset.
- FR-004: Filter the fetched list client-side by All, Enabled, or Disabled.
- FR-005: Create and edit one persisted `Styled HTML` format with five views: `agenda`,
  `schedule_itinerary`, `session_list`, `speaker_gallery`, and `speaker_list`.
- FR-006: Persist an internal name, enabled state, view, theme, primary color, date/time format,
  selected track IDs, and visible field selections.
- FR-007: Support `light`, `dark`, and `system` themes. Primary color must be a valid six-digit hex
  value and must not default to blue.
- FR-008: Limit filters in this release to zero or more event tracks. An empty track selection
  means all tracks.
- FR-009: Offer field toggles appropriate to each view. Required fields remain selected and
  disabled; optional fields may be shown or hidden.
- FR-010: Provide Preview and Get code modes, plus desktop/mobile viewport controls, reload, and
  open-in-new-tab actions.
- FR-011: Generate an iframe snippet with `src`, a descriptive `title`, `loading="lazy"`,
  `width="100%"`, a view-appropriate height, `style="border:0;width:100%;"`, and
  `referrerpolicy="strict-origin-when-cross-origin"`.
- FR-012: Resolve public embeds by opaque embed ID rather than by an organizer-editable event slug
  and view alone.
- FR-013: Public queries must reject disabled embeds and embeds belonging to an unpublished event.
- FR-014: Agenda/session projections include only published agenda items. Speaker projections
  include only speakers attached to accepted submissions and only safe public-profile fields.
- FR-015: Deleting an embed requires an inline confirmation and makes the public URL unavailable.
- FR-016: Duplicating an embed creates a disabled copy named `[original name] copy` so copied
  configuration is never published accidentally.
- FR-017: Seed one enabled agenda embed and one disabled speaker-gallery embed for the demo event.

## Non-Functional Requirements

- NFR-001: The CMS route is lazy-loaded and public embed routes do not ship the admin page bundle.
- NFR-002: List filtering and tab changes complete from the already-loaded dataset with no network
  request.
- NFR-003: The public projection is assembled server-side; the client must never receive private
  rows and filter them after download.
- NFR-004: Public embed pages are read-only and require no authentication, cookies, forms, scripts
  injected by organizers, or parent-window messaging.
- NFR-005: No raw custom CSS or HTML input is accepted in this release.
- NFR-006: Every iframe has an accessible title; every editor control has a visible label; Preview
  and Get code are keyboard-operable.
- NFR-007: The generated iframe works on HTTPS hosts and in a blank external HTML fixture.
- NFR-008: Public pages must be intentionally frameable. Deployment headers must not set
  `X-Frame-Options: DENY/SAMEORIGIN` or a restrictive `frame-ancestors` policy on `/embed/*`.
- NFR-009: Organizer mutations enforce active-event ownership server-side once admin identity is
  wired. Until that gate exists for the Convex backend, the feature must not claim production
  authorization.

## Out of Scope

- JSON, XML, iCal, basic/un-styled HTML, and JavaScript SDK output formats.
- Raw custom CSS, raw HTML, `srcdoc`, arbitrary script execution, or organizer-supplied iframe URLs.
- `postMessage` auto-height resizing or a parent-site SDK.
- Cache snapshots, a manual Refresh cache action, or a 60-minute synchronization delay; reads are
  live against current published data.
- Domain allowlists for sites permitted to host an embed. The first release is public-by-design.
- Attendee personalization, saved itineraries, registration, or authenticated interactions inside
  an embed.
- Language, level, tag, format, status, or room filters until those fields exist consistently in
  the event/session model.
- Airtable parity for public embed reads or embed CRUD. The judged Convex deployment is the release
  target; Airtable must fail closed with a clear unsupported-operation error.

## Success Metrics

- An organizer can create, preview, save, copy, disable, duplicate, and delete an embed entirely
  through the UI without developer tools.
- The generated code renders in a blank external HTML page at desktop and 375px widths.
- Automated tests prove that unpublished agenda items, non-accepted speakers, emails, answers,
  statuses, and internal IDs never cross the public boundary.
- Saved configuration and enabled state survive refresh and a new browser session.
- A change to published agenda or accepted-speaker data appears on the next iframe load.
