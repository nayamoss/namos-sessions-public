# Public embed

**Route:** `/embed/:embedId`  
**User:** Anonymous attendee on an external host page.

## Journey

1. The attendee loads the organizer-provided iframe snippet in a disposable external host page.
2. The embed renders its configured view, theme, fields, tracks, and responsive layout without needing a login.
3. The attendee uses any visible search/filter control and sees only the configured public dataset.
4. The organizer disables the embed; the attendee refreshes and sees unavailable with no event metadata.
5. They open an invalid ID and receive the same safe unavailable/error behavior.

## Success and recovery

This public page is read-only. Embed authoring, enable/disable, and delete flows are documented in [Embeds](./embeds.md).
