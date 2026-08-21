# Recordings Manager — Acceptance Journey

**Route:** `/events/:eventSlug/program/recordings`
**User:** Authorized event organizer

This feature is not done until the complete journey passes in the running application and survives
refresh, event switching, and a new authenticated session.

## 1. Coverage and discovery

1. Open Recordings for a seeded event containing missing, processing, ready, published, failed,
   replaced, and hosted recordings.
2. Confirm the coverage counts match the visible dataset and no recording from another event is
   present.
3. Search by session title and speaker.
4. Filter by Missing, Needs attention, Ready, Published, source, day, room, and track; clear all
   filters.
5. Sort by schedule time, title, status, and last updated.
6. Open one session and refresh; the same detail pane reopens from the URL.

## 2. Attach each source type

1. Open a missing session, upload a supported video, observe determinate progress, and confirm it
   becomes Ready but remains Unpublished.
2. Try an unsupported type and oversized file; confirm inline correction and preserved state.
3. Attach a compatible existing event asset to another session.
4. Attach a valid hosted HTTPS URL to a third session.
5. Try an HTTP URL, malformed URL, and asset from another event; confirm each fails closed.

## 3. Review and publish

1. Preview a ready direct upload and hosted recording.
2. Attempt to publish before the session ends; confirm the default block and the explicit audited
   override path.
3. Publish an eligible recording and confirm its public timestamp/actor.
4. Open the attendee session detail and verify playback/link behavior.
5. Confirm another ready-but-unpublished recording is absent from attendee and embed payloads.
6. Unpublish the recording and confirm it disappears publicly without detaching the source.

## 4. Safe replacement and recovery

1. Republish a recording, then begin replacement with a new upload.
2. Force the replacement to fail; confirm the previous recording remains public and playable.
3. Retry or choose a valid replacement, preview it, and promote it.
4. Confirm the old row is retained as replaced history and the new source is the only public one.
5. Detach an unpublished recording after canceling once and then confirming the named impact.

## 5. Bulk and operational handoff

1. Select a mixture of eligible, ineligible, and failed recordings.
2. Bulk publish and confirm the result reports published, skipped, and failed sessions separately.
3. Bulk unpublish the published selection.
4. Open Readiness and Program Control Room, confirm the recording counts, and follow both deep
   links back to the correct filtered manager state.

## 6. Persistence, responsiveness, and isolation

1. Refresh after each mutation and confirm state persists.
2. Switch to another event and confirm counts, filters, selections, details, assets, and recordings
   do not leak across the event boundary.
3. Sign out/in and confirm durable state remains while unauthorized access is denied.
4. Repeat the core attach → preview → publish flow at 390px with no horizontal page overflow.
5. Repeat the main manager/detail states in dark mode and verify labels, progress, focus, and status
   contrast.

## Success and recovery

Failures preserve the organizer's draft and provide a retry or replacement path. No failed,
processing, draft, replaced, or cross-event recording is ever exposed publicly. A broken
replacement never takes a working public recording offline.
