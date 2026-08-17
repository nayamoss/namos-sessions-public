# Public Embeds — User Journey

## User

Primary user: an authenticated event organizer who manages the active event program.

Secondary user: an unauthenticated attendee viewing the organizer's agenda, sessions, or speakers
inside the event website.

## Starting State

- The organizer is in the admin application with one active event selected.
- The active event has at least one track and may have published agenda items and accepted speakers.
- The organizer has permission to manage that event. Production completion requires a verified
  server-side organizer check; demo-only browser access does not satisfy this condition.
- The organizer may be creating the first embed or returning to saved embeds.
- The attendee needs no account, cookie, or event ID. They arrive through an iframe placed on an
  external website.

## Entry Point

The organizer opens the application dashboard, finds the `CMS` section in the left sidebar, and
selects `Embeds`. The organizer never needs to know or type the event-scoped CMS route.

## User Journey Steps

1. The organizer selects `CMS > Embeds` in the sidebar.
2. The application opens the `Embeds` page and loads saved embed definitions for the active event.
3. While loading, the organizer sees card-shaped skeleton rows rather than an empty flash.
4. If embeds exist, the organizer sees All, Enabled, and Disabled counts, a search field, the
   `Styled HTML` group, and one card per embed. If none exist, the organizer sees what embeds do and
   one `Add embed` action.
5. The organizer can search by name, view, or ID and switch status tabs. Results update immediately
   without refetching.
6. The organizer selects `Add embed`.
7. The application opens `New embed`. The Type section is expanded with a required Name field, an
   Enabled switch, five View choices, and the locked Styled HTML format. A live preview occupies
   the adjacent pane on desktop and appears below settings on smaller screens.
8. The organizer enters an internal name and selects Agenda, Schedule itinerary, Session list,
   Speaker gallery, or Speaker list.
9. The organizer expands Style options and chooses Light, Dark, or System, a valid non-blue default
   primary color, and date/time formatting.
10. The organizer expands Filters and optionally selects one or more event tracks. No selection
    means all tracks.
11. The organizer expands Field options. Required fields are checked and locked; optional fields
    can be shown or hidden. Only groups relevant to the selected view appear.
12. Every settings change updates the draft Preview. The organizer switches between desktop and
    375px mobile frames and confirms the layout remains readable.
13. Before the first save, Get code explains `Save this embed to generate permanent code.` rather
    than generating a disposable link.
14. The organizer selects Save.
15. The application validates the draft. Invalid fields show inline errors without erasing other
    work. A valid draft is written for the active event.
16. On success, the route changes to the permanent embed editor, the title shows the saved name, an
    `Embed saved` toast appears, and Get code becomes available.
17. The organizer opens Get code and sees a titled, lazy-loaded, responsive iframe snippet.
18. The organizer selects `Copy code`. The application writes the exact snippet to the clipboard
    and shows `Embed code copied`. If clipboard permission is blocked, the code remains selectable
    and the application explains how to copy it manually.
19. The organizer pastes the snippet into an HTML or CMS code block on an external website.
20. The external website loads `/embed/:embedId` inside the iframe. The public route checks that
    the embed is enabled and the event published, then returns only configured public fields.
21. The attendee sees the configured view, theme, event data, search/filter controls where
    applicable, and a small `Powered by Namos Sessions` footer.
22. The attendee searches or filters within the embed. The already-loaded public dataset updates
    immediately without navigating the parent website.
23. The organizer later changes a published session or accepted speaker profile. On the next iframe
    load/refresh, the attendee sees the new public data without the organizer regenerating code.
24. The organizer returns to `CMS > Embeds`, finds the saved card, and can edit, duplicate, disable,
    copy, or delete it.
25. If the organizer disables it, the list card and counts update immediately and existing iframe
    URLs show only `This embed is unavailable.` with no event metadata.
26. If the organizer duplicates it, a disabled copy appears and opens in the editor, preventing
    accidental publication.
27. If the organizer deletes it, an inline confirmation explains that existing websites will show
    an unavailable message. Confirming removes the card; Cancel leaves it untouched.

## Expected Outcome

The organizer can manage a durable, configurable event-program embed entirely through the product
and paste working code into an external website. Attendees see only current, intentionally
published agenda/session/speaker information in a mobile-friendly view.

## Visible Success State

- After Save: the permanent editor route loads, dirty state clears, `Embed saved` appears, and Get
  code displays a permanent snippet.
- After Copy: `Embed code copied` appears.
- After external placement: the configured view renders inside the website at desktop and 375px.
- After toggle: the card's Enabled/Disabled badge and tab counts update.
- After duplicate: a new disabled `[name] copy` record appears.
- After delete: the card disappears and its old public URL shows the unavailable state.

## Failure & Recovery States

- No active event → Add/Save are disabled; the organizer sees `Create an event before creating an
  embed.` and can navigate to Event settings.
- List load fails → existing UI is not presented as current; the organizer sees `Embeds could not
  be loaded. Try again.` and Retry.
- Saved embed was removed or belongs to another event → the organizer returns to the list and sees
  `That embed was not found for this event.`.
- Name is blank → `Enter an embed name.` appears next to Name; all other draft choices remain.
- Primary color is invalid → `Use a six-digit hex color such as #E56B5D.` appears; Save remains
  disabled.
- Save request fails → the editor retains the entire draft, stays dirty, and shows `Embed could not
  be saved. Try again.`.
- Organizer selects Back with unsaved changes → an inline panel offers Stay or Leave without
  saving. Stay preserves the draft; Leave returns to the list.
- Preview fails → settings remain editable; preview shows `Preview could not be loaded.` and Retry.
- Clipboard is unavailable/denied → code remains visible/selectable; an inline message instructs
  manual copying.
- Embed is disabled, deleted, malformed, or its event is unpublished → attendee sees only `This
  embed is unavailable.`; no event name or other metadata leaks.
- Public request fails unexpectedly → attendee sees `This embed could not be loaded. Refresh to try
  again.` and can refresh the iframe/parent page.
- No matching content → attendee sees a view-specific empty message rather than a blank frame.
- Headshot cannot resolve → attendee sees initials fallback; the storage key is never exposed.
- External host CSP refuses the iframe → organizer checks that the host permits the app origin;
  generated code remains selectable and the app's deployed `/embed/*` headers are independently
  verified during release QA.

## Persistence Expectations

- After editor refresh following Save: name, enabled state, view, style, tracks, and field options
  reload exactly, and the permanent snippet is unchanged.
- After editor refresh before Save: unsaved changes may be lost in v1; in-app Back warns, but browser
  close/refresh recovery is out of scope.
- After leaving and returning: saved embeds appear under the active event and retain state.
- After logout/login or a new browser session: saved configuration remains because it is stored in
  Convex, not localStorage.
- After event content changes: the same snippet renders current published data on next load.
- After disabling or deleting: old iframe URLs remain unavailable across refresh and new sessions.
- Across events: an organizer viewing event A must never list/edit event B's embeds.

## Frontend Wiring Trace

| User action | Handler / repository | Backend/data action | Visible result |
|---|---|---|---|
| Select CMS > Embeds | React Router `Link` | Lazy-load list route | Embeds page and loading skeleton |
| Search/switch tab | `setQuery` / `setStatus` | None; filter fetched `Embed[]` | Cards/count result changes immediately |
| Add embed | navigate to the active event's `/cms/embeds/new` | None | New editor opens with defaults |
| Change setting | typed draft setter | Preview query/projection only | Preview rerenders, Unsaved changes appears |
| Save | `publicEmbeds.save(draft)` | Validate event/tracks/fields; insert/patch `embeds` | Permanent route, success toast, code unlocked |
| Copy code | `navigator.clipboard.writeText(snippet)` | None | Success toast or manual-copy recovery |
| Open public page | anchor to `/embed/:embedId` | `getPublic` safe query | Same configured public view in a new tab |
| Toggle enabled | `publicEmbeds.save({...embed, enabled})` | Patch `embeds.enabled` | Badge and status counts update; URL enables/disables |
| Duplicate | `publicEmbeds.duplicate` | Insert disabled cloned row | Disabled copy opens in editor |
| Delete | inline confirm → `publicEmbeds.remove` | Ownership check and delete | Card disappears; old URL unavailable |
| External iframe loads | route mount → `getPublic(embedId)` | Safe server projection of current data | Attendee sees configured view |
| Attendee searches/filters | local renderer state | None | Visible public rows/cards narrow instantly |
| Published data changes | existing agenda/speaker workflow | Existing table mutations | Same iframe shows current data on next load |

## Browser Verification Inventory

- Sidebar CMS section and Embeds link, expanded and collapsed.
- List loading, populated, empty-all, empty-filter, and API-error states.
- All/Enabled/Disabled tabs and search.
- Card click, Copy, Edit, Duplicate, Enable/Disable, Delete, and Cancel.
- Editor Name, Enabled, View, Format locked state, Theme, color text/color picker, date/time format,
  track multi-select/removal, all relevant field toggles, required-field locks.
- Preview/Get code tabs, desktop/mobile switch, reload, open, save gate, copy success/failure.
- Validation, save success/failure, dirty Back/Stay/Leave.
- All five public views plus search, track filter, inline detail expansion.
- Public loading, content-empty, unavailable, and network-error states.
- Blank external host at desktop and 375px; actual deployed response headers; live-data refresh.
