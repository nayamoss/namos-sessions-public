# Recordings Manager — Requirements

**Type:** New feature
**Status:** Planned
**Priority:** High
**Last Updated:** 2026-08-20

## Problem statement

Namos can already persist an optional `videoUrl` on an `agenda_items` row, but that value has no
organizer-facing workflow and is not projected into the attendee site or public embeds. There is
no way to see recording coverage, upload or link a recording, distinguish draft from public,
replace a bad asset safely, diagnose processing failures, or publish recordings in bulk.

The live Cicero reference at `/organizer/recordings` correctly recognizes that recordings belong
to scheduled sessions and may come from an upload, an existing file, or a hosted URL. Its repeated
three-panel form on every session becomes very tall and makes operational scanning difficult. Namos
should keep the useful session/source relationship while designing a denser operations workspace
around status, review, publication, and exceptions.

## Product goal

Give an event organizer one trustworthy place to move every scheduled session through this
lifecycle:

`Missing → Attached/processing → Ready for review → Published → Replaced or unpublished`

The organizer should be able to answer “what is missing, what needs attention, and what is public?”
without opening sessions one by one.

## Primary user stories

### Find gaps quickly

As an event organizer, I want one row per scheduled session with recording and publication status
so that I can see coverage for the event at a glance.

Acceptance criteria:

- The page includes all scheduled sessions for the active event, including draft agenda items.
- Summary counts show total sessions, missing recordings, ready drafts, published recordings, and
  items needing attention.
- Search matches session title and speakers. Filters cover recording status, publication status,
  event day, room, track, and source type.
- A direct URL can reopen a selected session's recording detail.

### Attach and review a recording

As an event organizer, I want to upload a file, reuse an event asset, or attach a hosted HTTPS URL
so that the source can match the production workflow I already use.

Acceptance criteria:

- `Add recording` and an individual row action open the same detail pane; controls do not repeat
  inside every row.
- The source chooser supports direct upload, hosted URL, and an existing compatible event asset.
- A selected source is validated before attach. Invalid file type, configured size limit, unsafe
  URL, and unavailable asset errors are shown inline without losing the draft.
- Ready recordings can be previewed in the pane before publication.
- Replacing a published recording never removes the currently public source until the replacement
  is ready and the organizer explicitly publishes it.

### Publish deliberately

As an event organizer, I want draft and public recording states to be separate so that attaching a
file cannot accidentally expose it to attendees.

Acceptance criteria:

- Every newly attached recording starts unpublished.
- Publish is disabled until the source is ready and the session has ended, unless an organizer
  uses an explicit override that is recorded in activity history.
- Organizers can publish, unpublish, replace, and detach from the detail pane.
- Bulk publish/unpublish is available only after selecting eligible rows and reports partial
  failures per session.
- The attendee site and enabled public embeds expose only the active published recording.

### Recover from failures

As an event organizer, I want failed or stale processing to be obvious and retryable so that one
bad file does not block the rest of the event.

Acceptance criteria:

- Uploading, processing, ready, failed, and unavailable-host states are visually distinct.
- A failure includes a human-readable reason and a retry or replace action.
- The manager preserves the previous public recording while a replacement fails.
- Refresh, event switching, and a new authenticated session preserve all recording state.

## Functional requirements

- FR-001: Add `/events/:eventSlug/program/recordings` and a `Recordings` item under Program,
  immediately after Schedule, using the contextual `Video` icon.
- FR-002: Keep the page header identity-only. Place search, filters, sort, view utilities, selection
  actions, and `Add recording` in a dedicated toolbar row below the title.
- FR-003: Render a responsive manager table on desktop and compact session cards on small screens;
  both open the same right-side `DetailPane`.
- FR-004: Derive a single operational display status per row from source processing, publication,
  and source availability while retaining those fields separately in storage.
- FR-005: Support direct upload, existing event asset, and hosted HTTPS URL sources through one
  `RecordingsRepo` contract.
- FR-006: Persist draft/public state independently from agenda `isPublished`; publishing the
  schedule must never publish a recording implicitly.
- FR-007: Add safe replacement semantics: stage the new source, keep the previous public source,
  then atomically promote the replacement when ready.
- FR-008: Add selection with bulk publish and bulk unpublish; no bulk detach or delete.
- FR-009: Project only published recordings into attendee session details and public embed data.
- FR-010: Add a recording-coverage item to Readiness and the Program Control Room, linked to the
  manager with the relevant filter already applied.
- FR-011: Record attach, replace, publish, unpublish, detach, retry, and failed-processing events in
  the existing activity system.
- FR-012: Add realistic seed states: missing, processing, ready draft, published hosted, published
  upload, failed replacement, and unavailable hosted source.

## Non-functional requirements

- NFR-001: All reads and writes are event-scoped and enforced with
  `assertEventOrganizerAccess`; IDs from another event fail closed.
- NFR-002: Hosted URLs must be HTTPS. The backend stores a URL but does not fetch arbitrary remote
  content in v1, avoiding an SSRF surface.
- NFR-003: Uploaded media uses durable storage IDs, never expiring resolved URLs. Public URLs are
  resolved only when an authorized or published query needs them.
- NFR-004: Large uploads must be direct-to-storage and show progress; media bytes may not pass
  through a Convex action or the browser application's own server process.
- NFR-005: Status and bulk actions are keyboard accessible, expose non-color labels, and announce
  upload/publish outcomes through the existing toast/live-region conventions.
- NFR-006: No visible native `<select>` controls. Reuse the app's styled Select, DropdownMenu,
  Popover, and Command primitives.
- NFR-007: The manager must remain usable with 500 scheduled sessions through pagination or
  windowing; filtering should not require loading media bytes or resolving every playback URL.

## Out of scope for v1

- Video editing, clipping, concatenation, live-stream capture, or browser-based transcoding.
- Automatic imports from YouTube, Vimeo, Mux, Cloudflare Stream, Zoom, or a venue capture system.
- Automatic speech-to-text, chapters, captions, and transcript editing.
- Attendee playback analytics or entitlement/paywall controls.
- A general digital-asset-management rewrite of the existing Settings Library; v1 introduces only
  the minimum event-asset record needed to reuse compatible media.

## Success measures

- An organizer can identify every missing or failed recording in under 30 seconds for a seeded
  500-session event.
- Attach → preview → publish → attendee playback survives refresh and event switching.
- Replacing a published recording never creates a public broken state.
- Public payload tests prove that draft, processing, failed, and cross-event recordings never
  leave the organizer boundary.
