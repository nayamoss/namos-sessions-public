# Recordings Manager — Product and Technical Design

**Last Updated:** 2026-08-20

## Direction

The reference page is useful as a capability checklist, not as a layout template. Namos will not
render three attach forms inside every session card. Its original direction is a compact production
queue: scan many sessions in the main surface, then do focused work in the existing right-side
detail pane.

What we retain from the reference:

- Recordings are attached to scheduled sessions, not stored as an unrelated video gallery.
- Organizers may upload, reuse a known event asset, or link to a hosted recording.
- A session without a recording is an explicit state, not an empty field hidden in Agenda.

What Namos adds:

- Coverage metrics, filters, sorting, selection, and bulk publication.
- A real draft/review/published lifecycle and safe replacements.
- Processing/error states, activity history, readiness integration, and attendee playback.
- A dense table/detail-pane composition matching the existing Namos shell.

## Existing Namos foundations and gaps

- `convex/schema.ts` and `AgendaItem` already carry optional `videoUrl`, and `agenda:save` preserves
  it, but the Agenda form does not expose it.
- `convex/files.ts` can generate an upload URL and resolve a storage ID, but there is no
  event-owned asset record to list, authorize, reuse, or describe uploaded media.
- Settings → Library manages tags only; it is not a media library.
- `publicEmbeds.ts`, `PublicEmbedAgendaItem`, the attendee site, and embed session detail omit
  `videoUrl`, so even a manually populated value never becomes a deliberate attendee experience.
- The existing repository/transport/Convex adapter boundary, `DataGrid`, `ContentToolbar`,
  `DetailPane`, activity system, Readiness, and Program Control Room are all reusable foundations.

## Information architecture

- Route: `/events/:eventSlug/program/recordings`
- Navigation: Program → Recordings, directly after Schedule.
- Page header: `Recordings` with an optional passive total count only.
- Toolbar below the header:
  - Search by session or speaker.
  - Styled Filter menu: status, publication, source, day, room, track.
  - Styled Sort menu: schedule time, title, status, last updated.
  - `Add recording` primary action.
  - Selection actions replace the normal utilities only while rows are selected.
- Body:
  - Coverage strip: Missing, Needs attention, Ready drafts, Published.
  - Desktop `DataGrid`; compact mobile cards below the existing breakpoint.
  - Right-side `DetailPane` for attach, preview, metadata, publication, replacement, and history.

## Manager row

Each row contains:

- Selection checkbox.
- Session identity: title, speakers, and optional session code if one is introduced elsewhere.
- Schedule: event-local date/time and room.
- Recording: source icon + file/host label, or `No recording`.
- Operational status badge.
- Public state: Published/Unpublished and published timestamp when present.
- Last updated.
- Overflow menu: Open details, Preview, Publish/Unpublish, Replace, Detach.

Clicking the row opens details. Checkbox and menu interactions do not open the pane.

The display status is derived in this priority order:

1. `Needs attention` — failed processing or unavailable source.
2. `Processing` — upload or provider work is incomplete.
3. `Published` — active source is ready and public.
4. `Ready` — active source is ready but unpublished.
5. `Missing` — no active source.

## Detail pane states

### No recording

Show session context, then three source choices as a compact segmented body control:

- Upload video
- Choose event asset
- Hosted URL

Only the selected source form renders. The footer owns Cancel and Attach actions.

### Processing or failed

Show upload/provider status, source metadata, and the latest human-readable failure. Offer Retry
when retryable and Replace for all failures. Publish remains unavailable.

### Ready draft

Show a playable preview, source metadata, public availability summary, Replace, Detach, and Publish.

### Published

Show the public preview and URL context, published actor/time, Unpublish, and Replace. Replacement
opens a staged source form while the current public recording remains visibly marked `Live`.

## Data model

The existing `agenda_items.videoUrl` is insufficient because it conflates source and publication
and cannot represent processing or replacement. Introduce two event-scoped tables.

### `event_assets`

```ts
event_assets: defineTable({
  eventId: v.id("events"),
  kind: v.union(v.literal("video"), v.literal("audio"), v.literal("document"), v.literal("image")),
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  createdByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
```

V1 recording upload creates a video asset. The existing Settings Library remains tag-focused; a
full asset-library UI is a later feature. The recording source picker queries compatible video
assets only.

### `session_recordings`

```ts
session_recordings: defineTable({
  eventId: v.id("events"),
  agendaItemId: v.id("agenda_items"),
  sourceType: v.union(v.literal("asset"), v.literal("hosted")),
  assetId: v.optional(v.id("event_assets")),
  hostedUrl: v.optional(v.string()),
  hostLabel: v.optional(v.string()),
  processingStatus: v.union(
    v.literal("processing"),
    v.literal("ready"),
    v.literal("failed"),
  ),
  processingError: v.optional(v.string()),
  role: v.union(
    v.literal("active"),
    v.literal("replacement"),
    v.literal("replaced"),
  ),
  publicationStatus: v.union(v.literal("draft"), v.literal("published")),
  publishedAt: v.optional(v.number()),
  publishedByUserId: v.optional(v.string()),
  replacedAt: v.optional(v.number()),
  replacedByRecordingId: v.optional(v.id("session_recordings")),
  createdByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_agenda_item", ["agendaItemId"])
  .index("by_agenda_item_role", ["agendaItemId", "role"])
  .index("by_event_publication", ["eventId", "publicationStatus"])
```

Server invariants:

- Exactly one of `assetId` or `hostedUrl` is set and it matches `sourceType`.
- Asset, agenda item, recording, and caller access all resolve to the same event.
- Only a ready `active` row can be published.
- At most one `active` row and one `replacement` row exist per agenda item.
- A staged replacement uses `role: "replacement"`; the old `active` row stays unchanged and may
  remain public while the candidate processes or fails.
- Promoting a ready replacement atomically marks the old row `replaced`, marks the candidate
  `active`, links both rows, and carries public state forward only when the organizer explicitly
  chooses `Publish replacement`.
- Unpublish clears actor/time fields only if the activity record retains the history.

## Backend and repository contract

Add `convex/recordings.ts` and `RecordingsRepo` with:

```ts
list({ eventId, cursor?, filters?, sort? })
get({ eventId, agendaItemId })
requestUpload({ eventId, agendaItemId, fileName, mimeType, sizeBytes })
completeUpload({ eventId, agendaItemId, storageId, fileName, mimeType, sizeBytes })
attachAsset({ eventId, agendaItemId, assetId })
attachHosted({ eventId, agendaItemId, hostedUrl })
replaceWithAsset(...)
replaceWithHosted(...)
promoteReplacement({ eventId, recordingId, publish: boolean })
publish({ eventId, recordingId, overrideBeforeSessionEnd? })
unpublish({ eventId, recordingId })
detach({ eventId, recordingId })
retry({ eventId, recordingId })
bulkPublish({ eventId, recordingIds })
bulkUnpublish({ eventId, recordingIds })
```

`list` returns a server-joined manager projection containing the session, speakers, room, track,
recording summary, and eligibility flags. It does not resolve playback URLs for all rows. `get`
resolves the selected recording's authorized preview URL and activity history.

Hosted URLs are parsed and normalized with `new URL`, restricted to `https:`, and stored as links.
V1 playback supports direct browser-playable video URLs and known embeddable hosts through an
allowlisted renderer. Unknown HTTPS hosts remain `Open hosted recording` links; Namos does not
inject arbitrary iframe HTML.

## Upload architecture

Keep the domain contract storage-provider-neutral:

- The client asks for a one-time upload target.
- The browser uploads directly and reports progress.
- The completion mutation validates the returned storage ID and creates the asset/recording rows.
- Cancelled or abandoned uploads are cleaned by a scheduled job after a retention window.

The first implementation may adapt the existing Convex storage flow for the configured upload
limit. The UI must read that limit from configuration, not hardcode the reference page's 25 MB.
A future streaming provider can replace the upload adapter without changing the manager contract.

## Public projection

Extend `PublicEmbedAgendaItem` with an optional recording projection only when all are true:

- Event is published.
- Agenda item is published.
- Recording is ready, active, and published.
- Its source still resolves safely.

```ts
recording?: {
  kind: "video";
  playbackType: "direct" | "hosted";
  url: string;
  hostLabel?: string;
}
```

The attendee `SessionDetail` shows `Watch recording` beneath the session description after the
event/session has ended. Direct media opens the app player; hosted links open safely in a new tab
unless an allowlisted embed renderer exists. Existing embed definitions gain a `recording` session
field toggle defaulting to false for saved records and true for newly created attendee-oriented
views.

## Integration points

- `App.tsx`: lazy route.
- `AppLayout.tsx`: Program navigation item using `Video`, never a sparkle icon.
- Agenda session editor: show passive recording status and a link to the selected recording; do
  not duplicate the manager controls.
- Readiness and Program Control Room: derive missing/failed post-session counts and deep-link with
  `?status=missing` or `?status=attention`.
- Activity: add `recordings` source labels and recording-specific summaries.
- Analytics: coverage counts only in v1; attendee playback events are a later phase.

## Responsive and accessibility behavior

- Desktop keeps the DataGrid and adjacent detail pane visible.
- Tablet may let the pane replace the table column while preserving a clear Back to recordings
  action.
- Mobile renders compact cards and uses the existing sheet/detail pattern; no horizontal table
  scroll is required for the main workflow.
- Every icon button has a session-specific accessible name.
- Upload progress uses determinate progress text, not motion alone.
- Status badges include text and meet contrast in light/dark themes.
- Destructive detach uses the existing alert-dialog confirmation and names the affected session.

## Migration

Do not silently promote existing `agenda_items.videoUrl` values to public recordings.

1. Deploy additive tables and code that can read the old field only as `Legacy link` in the
   organizer manager.
2. Run an idempotent migration that creates draft hosted recordings from valid HTTPS values.
3. Leave invalid/non-HTTPS values untouched and report them as migration exceptions.
4. Verify event/agenda counts and draft recording counts.
5. Remove the legacy read path only after organizer review; remove the schema field in a later
   cleanup release.

## Key decisions

- Recordings are a Program operation, not a Settings/Library page.
- Attach never means publish.
- One active recording per session in v1; history is retained through replaced rows and activity.
- Bulk publishing exists; bulk detach/delete does not.
- Missing recordings are attention after a session ends, not a blocker before show day.
- Full transcoding, captions, chapters, and provider sync wait until the core lifecycle is proven.
