# Public Embeds — Technical Design

**Last Updated:** 2026-08-12

## Evidence Summary

- The current schema has event, room, track, speaker, submission, and agenda tables but no saved
  embed definition (`convex/schema.ts:5-14`, `convex/schema.ts:32-72`,
  `convex/schema.ts:133-148`).
- The public Convex query already rejects unpublished events and projects only published agenda
  items and speakers attached to accepted submissions (`convex/publicEmbeds.ts:26-81`).
- The public page is a client component that reads its route params and fetches through the
  repository (`src/pages/public/EmbedPage.tsx:1-45`).
- The unrouted generator keeps all state in memory and produces only agenda/speakers iframe URLs
  from a manually entered slug (`src/pages/public/Embeds.tsx:18-99`).
- `App.tsx` lazy-loads public pages and exposes legacy `/e/:eventSlug/:feed`, but has no CMS route
  (`src/App.tsx:9-48`).
- Admin navigation has Dashboard, Program, Portals, and Configure sections but no CMS section
  (`src/components/AppLayout.tsx:22-55`).
- The repository boundary already contains a `PublicEmbedsRepo`, but it has only `get(eventSlug)`
  (`src/data/repo.ts:48-52`, `src/data/transport.ts:63-65`).
- Cloudflare Workers serves the Vite bundle and rewrites missing asset paths to `index.html`; no
  checked-in configuration currently constrains framing (`wrangler.jsonc:1-10`).
- The Convex browser backend currently runs without Clerk, while Clerk is mounted only for the
  Airtable backend (`src/data/provider.tsx:8-25`). This is a known authorization gap, not something
  this feature may silently claim is solved.

## Database / Schema Changes

### Current Schema (affected tables)

```ts
events: defineTable({
  name: v.string(), slug: v.string(), type: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  location: v.optional(v.string()), timezone: v.string(), startDate: v.number(), endDate: v.number(),
  theme: v.optional(v.string()), logoStorageKey: v.optional(v.string()), backgroundStorageKey: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]),

tracks: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  color: v.optional(v.string()),
  sortOrder: v.number(),
}).index("by_event", ["eventId"]),

speakers: defineTable({
  eventId: v.id("events"), email: v.string(), firstName: v.string(), lastName: v.string(),
  bio: v.optional(v.string()), salutation: v.optional(v.string()), honorific: v.optional(v.string()),
  pronouns: v.optional(v.string()), gender: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()), xUrl: v.optional(v.string()),
  facebookUrl: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  headshotStorageKey: v.optional(v.string()),
  status: v.union(v.literal("invited"), v.literal("active"), v.literal("inactive")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_event_email", ["eventId", "email"]),

submissions: defineTable({
  eventId: v.id("events"), formId: v.id("submission_forms"),
  speakerId: v.optional(v.id("speakers")), tagIds: v.optional(v.array(v.id("tags"))),
  title: v.string(),
  status: v.union(v.literal("draft"), v.literal("pending"), v.literal("accept_queue"),
    v.literal("accepted"), v.literal("decline_queue"), v.literal("declined"),
    v.literal("withdrawn")),
  answers: v.any(), submittedAt: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_form", ["formId"]).index("by_speaker", ["speakerId"]),

agenda_items: defineTable({
  eventId: v.id("events"), submissionId: v.optional(v.id("submissions")), title: v.string(),
  roomId: v.id("rooms"), trackId: v.optional(v.id("tracks")),
  startTime: v.number(), endTime: v.number(), speakerIds: v.array(v.id("speakers")),
  isPublished: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"])
  .index("by_room", ["roomId"])
  .index("by_submission", ["submissionId"]),
```

### Required Changes

Add this exact block to `convex/schema.ts`:

```ts
embeds: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  format: v.literal("styled_html"),
  view: v.union(
    v.literal("agenda"),
    v.literal("schedule_itinerary"),
    v.literal("session_list"),
    v.literal("speaker_gallery"),
    v.literal("speaker_list"),
  ),
  enabled: v.boolean(),
  theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
  primaryColor: v.string(),
  dateFormat: v.union(v.literal("weekday_long"), v.literal("weekday_short"), v.literal("numeric")),
  timeFormat: v.union(v.literal("12_hour"), v.literal("24_hour")),
  trackIds: v.array(v.id("tracks")),
  fields: v.object({
    agenda: v.object({
      title: v.boolean(),
      time: v.boolean(),
      room: v.boolean(),
      track: v.boolean(),
      speakers: v.boolean(),
    }),
    session: v.object({
      title: v.boolean(),
      time: v.boolean(),
      room: v.boolean(),
      track: v.boolean(),
      speakers: v.boolean(),
    }),
    speaker: v.object({
      name: v.boolean(),
      headshot: v.boolean(),
      bio: v.boolean(),
      links: v.boolean(),
      sessions: v.boolean(),
    }),
  }),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
  .index("by_event_enabled", ["eventId", "enabled"]),
```

Required-field invariants are enforced server-side even though booleans are persisted for a stable
shape:

- Agenda: `title`, `time`, and `room` must always be `true`.
- Session: `title` must always be `true`.
- Speaker: `name` must always be `true`.

### Migration

This is a new table only. Deploying the schema creates `embeds` and its two indexes. No existing
record changes and no backfill are required. The seed mutation creates two demo records. Legacy
slug-based public routes remain independent and require no migration.

## Domain Types

Add these exact types to `src/data/types.ts`:

```ts
export type EmbedId = Brand<string, "EmbedId">;
export type EmbedView = "agenda" | "schedule_itinerary" | "session_list" | "speaker_gallery" | "speaker_list";
export type EmbedTheme = "light" | "dark" | "system";
export type EmbedDateFormat = "weekday_long" | "weekday_short" | "numeric";
export type EmbedTimeFormat = "12_hour" | "24_hour";

export interface EmbedFieldOptions {
  agenda: { title: boolean; time: boolean; room: boolean; track: boolean; speakers: boolean };
  session: { title: boolean; time: boolean; room: boolean; track: boolean; speakers: boolean };
  speaker: { name: boolean; headshot: boolean; bio: boolean; links: boolean; sessions: boolean };
}

export interface Embed {
  id: EmbedId;
  eventId: EventId;
  name: string;
  format: "styled_html";
  view: EmbedView;
  enabled: boolean;
  theme: EmbedTheme;
  primaryColor: string;
  dateFormat: EmbedDateFormat;
  timeFormat: EmbedTimeFormat;
  trackIds: string[];
  fields: EmbedFieldOptions;
  createdAt: number;
  updatedAt: number;
}

export type EmbedWrite = Omit<Embed, "id" | "createdAt" | "updatedAt"> & { id?: EmbedId };

export interface PublicEmbedSession {
  key: string;
  title: string;
  startTime?: number;
  endTime?: number;
  roomName?: string;
  trackKey?: string;
  trackName?: string;
  speakerNames?: string[];
}

export interface PublicEmbedSpeaker {
  key: string;
  name: string;
  headshotUrl?: string;
  bio?: string;
  links?: PublicEmbedSpeakerLink[];
  sessions?: Array<{ title: string; startTime?: number; roomName?: string }>;
}

export interface PublicEmbedView {
  name: string;
  view: EmbedView;
  theme: EmbedTheme;
  primaryColor: string;
  dateFormat: EmbedDateFormat;
  timeFormat: EmbedTimeFormat;
  event: { name: string; timezone: string };
  tracks: Array<{ key: string; name: string }>;
  sessions: PublicEmbedSession[];
  speakers: PublicEmbedSpeaker[];
}
```

`key` values are request-local opaque aliases such as array positions (`session-0`), never stored
database IDs. They exist only for React keys and local expansion state.

## Backend / API

### Affected Existing Functions

| Type | Function | Current behavior | Required change |
|---|---|---|---|
| Convex query | `publicEmbeds:get` | Accepts `eventSlug`; returns one combined agenda/speakers projection | Retain temporarily for legacy routes; add the functions below in the same module |
| Repository read | `publicEmbeds.get(eventSlug)` | Calls the legacy query | Rename to `getLegacy` until old routes are retired |

There is no REST endpoint and no background job. The feature uses Convex queries/mutations through
the existing repository transport. Public data reflects the current database on every request, so
there is no cache job, webhook, cron, or manual refresh.

### New Convex Functions

#### `publicEmbeds.list` — query

```ts
args: { eventId: v.id("events") }
return: Embed[] // Convex docs normalized to id by the transport
index: embeds.by_event ["eventId"]
```

Return rows sorted by `createdAt` descending. Organizer authorization must use the repo's eventual
Clerk identity/admin pattern; the current unauthenticated Convex provider is a release blocker for
production claims.

#### `publicEmbeds.getAdmin` — query

```ts
args: { eventId: v.id("events"), embedId: v.id("embeds") }
return: Embed | null
```

Fetch by ID, return `null` unless `embed.eventId === eventId`, and apply the same organizer gate as
`list`.

#### `publicEmbeds.save` — mutation

```ts
args: {
  id: v.optional(v.id("embeds")),
  eventId: v.id("events"),
  name: v.string(),
  format: v.literal("styled_html"),
  view: embedViewValidator,
  enabled: v.boolean(),
  theme: embedThemeValidator,
  primaryColor: v.string(),
  dateFormat: embedDateFormatValidator,
  timeFormat: embedTimeFormatValidator,
  trackIds: v.array(v.id("tracks")),
  fields: embedFieldsValidator,
}
return: Id<"embeds">
```

Validation before write:

1. Confirm the event exists.
2. Apply organizer authorization for that event.
3. Trim `name`; require 1–80 characters.
4. Require `/^#[0-9A-Fa-f]{6}$/` for `primaryColor`.
5. Fetch each unique track ID and require it belongs to `eventId`; reject duplicates.
6. Force required field booleans to `true` or reject with a clear validation error.
7. For update, fetch the embed and require `embed.eventId === eventId`.
8. Set timestamps server-side; never accept them from the browser.

#### `publicEmbeds.duplicate` — mutation

```ts
args: { eventId: v.id("events"), embedId: v.id("embeds") }
return: Id<"embeds">
```

Require event ownership/organizer access, clone configuration, set name to an available value based
on `${source.name} copy`, force `enabled: false`, and set new timestamps.

#### `publicEmbeds.remove` — mutation

```ts
args: { eventId: v.id("events"), embedId: v.id("embeds") }
return: null
```

Require event ownership/organizer access, then delete. No cascade is required because no other
table references an embed.

#### `publicEmbeds.preview` — organizer query

```ts
args: {
  eventId: v.id("events"),
  view: embedViewValidator,
  theme: embedThemeValidator,
  primaryColor: v.string(),
  dateFormat: embedDateFormatValidator,
  timeFormat: embedTimeFormatValidator,
  trackIds: v.array(v.id("tracks")),
  fields: embedFieldsValidator,
}
return: PublicEmbedView | null
```

Apply organizer authorization, validate the draft configuration without writing it, and call the
same private projection helper as `getPublic`. This is how a new or dirty embed previews real event
data without sending raw organizer rows to the client.

#### `publicEmbeds.getPublic` — public query

```ts
args: { embedId: v.id("embeds") }
return: PublicEmbedView | null
```

Validation/projection:

1. Fetch embed; return `null` when missing or disabled.
2. Fetch its event; return `null` unless status is `published`.
3. Load agenda, rooms, tracks, submissions, and speakers by `eventId` using existing indexes.
4. Filter agenda to `isPublished === true`, then apply `trackIds` when non-empty.
5. Define public speakers as speakers referenced by accepted submissions; never return `email`,
   internal status, storage keys, submission answers, or DB IDs.
6. Omit every optional response property disabled in `fields` rather than sending it with null data.
7. Sanitize links to `http:`/`https:` and resolve fresh headshot URLs from storage.
8. Sort sessions chronologically and speakers by last name when available, then name.

### Deployment Constraints

`wrangler.jsonc` serves the Vite build and rewrites missing asset paths to `index.html`; there is
no long-running server work. Convex query duration is the only backend limit relevant here.

Add a narrowly scoped Cloudflare Worker response-header rule for `/embed/*` with
`Content-Security-Policy: frame-ancestors *`.

Before implementation, inspect the deployed response headers. If a platform-wide
`X-Frame-Options: DENY` or `SAMEORIGIN` is injected, remove/override it only for `/embed/*`.
Organizer, portal, and CFP routes must not be made broadly frameable as collateral damage.

## Frontend Components

### Modified Components

| File | Exact change |
|---|---|
| `src/components/AppLayout.tsx` | Add CMS > Embeds navigation using `Code2` and existing expanded/collapsed patterns |
| `src/App.tsx` | Lazy-load list/editor/public pages and add `/cms/embeds`, `/cms/embeds/new`, `/cms/embeds/:embedId`, `/embed/:embedId` |
| `src/pages/public/EmbedPage.tsx` | Replace combined legacy rendering with ID-based public shell and delegate to `EmbedRenderer` |
| `src/pages/public/Embeds.tsx` | Delete after list/editor use its utility behavior; it must not remain as a second UI |
| `src/lib/public-embed.ts` | Replace one-line slug URL helper with typed URL/snippet/default/validation helpers |
| `src/data/types.ts` | Add persisted/admin/public embed types |
| `src/data/repo.ts` | Expand `PublicEmbedsRepo` |
| `src/data/transport.ts` | Add organizer/public operations |
| `src/data/convex/index.ts` | Map operations to new Convex functions and normalize admin rows |
| `src/data/airtable/index.ts` | Explicitly fail closed for unsupported embed operations |

### New Components

#### `EmbedsListPage`

- **File:** `src/pages/cms/EmbedsListPage.tsx`
- **Props:** none.
- **Location:** CMS > Embeds.
- **Elements/classes:** exact list UI, cards, toolbar, status tabs, skeleton, empty/error states,
  dropdown actions, and inline delete panel are specified in `plan.md` Phase 5.
- **Data:** active event from `events.list`; rows from `publicEmbeds.list`.
- **Interactions:** search/tabs/group collapse are local; add/edit route; duplicate/toggle/delete
  call repository methods; Copy uses generated permanent code.
- **Third-party:** no new library. Existing lucide-react `Code2`, `Copy`, `Ellipsis`, `Plus`,
  `ChevronDown`; existing shadcn dropdown menu and buttons.

#### `EmbedEditorPage`

- **File:** `src/pages/cms/EmbedEditorPage.tsx`
- **Props:** none.
- **Location:** Add embed or edit a saved embed from CMS > Embeds.
- **Elements/classes:** exact Type, Style Options, Filters, Field Options sections and all states are
  specified in `plan.md` Phase 6.
- **Data:** event/tracks plus optional `getAdmin`; `save` persists one `EmbedWrite`.
- **Interactions:** all inputs update draft; preview reacts immediately; Save validates/persists;
  dirty Back reveals inline confirmation.

#### `EmbedPreviewPanel`

- **File:** `src/components/embeds/EmbedPreviewPanel.tsx`
- **Props:**

```ts
interface EmbedPreviewPanelProps {
  embedId?: EmbedId;
  draft: EmbedWrite;
  event: Event;
  mode: "preview" | "code";
  onModeChange: (mode: "preview" | "code") => void;
}
```

- **Location:** right/lower pane of the editor, never an overlay.
- **Elements/classes:** exact tabs, viewport buttons, reload/open, preview frame, code block,
  clipboard failure, loading/error states are specified in `plan.md` Phase 6.
- **Data:** saved/clean preview loads `/embed/:embedId`; draft preview calls the organizer-only
  `publicEmbeds.preview(draft)` query. The implementation must not pass raw speaker/submission rows
  into this component.

#### `EmbedRenderer`

- **File:** `src/components/embeds/EmbedRenderer.tsx`
- **Props:** `{ embed: PublicEmbedView }`.
- **Location:** public iframe page and editor draft preview.
- **Elements:** five view renderers, optional search/track filter, cards/rows, inline details,
  view-aware empty state, powered-by footer.
- **Behavior:** all filtering occurs over the fetched safe projection. No parent-window DOM access,
  arbitrary HTML, `dangerouslySetInnerHTML`, or postMessage.

#### `PublicEmbedPage`

- **File:** `src/pages/public/PublicEmbedPage.tsx`
- **Props:** none.
- **Location:** `/embed/:embedId`, loaded inside customer iframe or directly.
- **Elements/classes:** compact iframe root, skeleton, unavailable/error state, `EmbedRenderer`.
- **Data:** calls `publicEmbeds.getPublic(embedId)` on mount.

## Field Options by View

| View | Required | Optional | Hidden groups |
|---|---|---|---|
| Agenda | Agenda title, time, room | Agenda track, speakers; speaker headshot/bio/links | Session options |
| Schedule itinerary | Session title | Session time/room/track/speakers; speaker headshot/bio/links | Agenda options |
| Session list | Session title | Session time/room/track/speakers; speaker headshot/bio/links | Agenda options |
| Speaker gallery | Speaker name | Speaker headshot/bio/links/sessions | Agenda and session options |
| Speaker list | Speaker name | Speaker headshot/bio/links/sessions | Agenda and session options |

## State / Data Flow

### Organizer list

```text
EmbedsListPage mount
  → events.list()
  → active Event
  → publicEmbeds.list({ eventId })
  → embeds table by_event
  → Embed[] normalized by Convex transport
  → rows state
  → StatusTabs/search filter locally
  → cards render
```

Local state:

```ts
embeds: Embed[]
activeEvent: Event | null | undefined
status: "all" | "enabled" | "disabled"
query: string
collapsedFormats: Set<"styled_html">
deleteCandidate: Embed | null
loading: boolean
error: string | null
```

Mutation flow:

```text
toggle/duplicate/delete action
  → repository mutation with eventId + embedId
  → server ownership/validation
  → embeds table write
  → returned ID/success
  → update or refetch rows
  → counts/cards/toast visibly update
```

### Organizer editor

```text
route embedId? + active event
  → getAdmin({ eventId, embedId }) or defaultEmbed(eventId)
  → draft state
  → each input handler changes one typed field
  → publicEmbeds.preview(draft) returns a safe non-persisted projection
  → EmbedRenderer rerenders
  → Save calls save(draft)
  → server validates and writes
  → route becomes /cms/embeds/:id
  → code becomes available + success toast
```

Local state:

```ts
draft: EmbedWrite
savedSnapshot: EmbedWrite | null
mode: "preview" | "code"
viewport: "desktop" | "mobile"
loading: boolean
saving: boolean
error: string | null
clipboardError: string | null
confirmLeave: boolean
```

`isDirty` is derived by stable comparison of draft to saved snapshot. Track, view, or field changes
trigger a preview re-render. Saving/refetching clears dirty state.

### Public embed

```text
external website iframe src=/embed/:embedId
  → PublicEmbedPage route param
  → publicEmbeds.getPublic(embedId)
  → embeds row → event → agenda/rooms/tracks/submissions/speakers
  → server filters + projects only enabled fields
  → PublicEmbedView
  → EmbedRenderer
  → local search/track/expand state changes visible output without refetch
```

Full display trace examples:

```text
agenda_items.title → getPublic sessions[].title → PublicEmbedView.sessions → EmbedRenderer card h2
rooms.name → getPublic sessions[].roomName → PublicEmbedView.sessions → time/location meta
speakers.bio → getPublic speakers[].bio only when enabled → speaker card expanded paragraph
tracks.name → getPublic tracks[] + sessions[].trackKey → track filter/control and badge
```

## Auth / Permissions

- Public `getPublic` is intentionally unauthenticated because the generated iframe must work on an
  external website. Its protection is strict server-side projection, enabled state, and published
  event state.
- Organizer list/get/save/duplicate/remove require an authenticated event admin. The Airtable
  server path already verifies Clerk and checks the Convex `organizers` table, but embed
  management is not being added to Airtable.
- The current Convex frontend is unauthenticated (`src/data/provider.tsx:16-20`) and the raw Convex
  functions use generated `query`/`mutation` with no auth wrapper (`convex/functions.ts:1-3`). The
  implementation must either first wire the verified Clerk identity/admin gate for Convex or label
  admin CRUD as demo-only and keep the issue incomplete. Do not fake an ownership check with a
  browser-supplied user ID.
- Frontend gates are usability only: hide admin navigation from non-organizer shells once roles are
  connected. Backend checks remain authoritative.
- Public responses intentionally exclude emails, internal statuses, answers, notes, storage keys,
  and all database IDs.

## Edge Cases & Error States

| Scenario | Handling |
|---|---|
| No active event | Disable Add/Save; show `Create an event before creating an embed.` |
| No saved embeds | Explanatory empty state plus Add embed |
| Search/filter yields none | `No embeds match these filters.` plus Clear filters |
| List query fails | Inline error and Retry; do not render stale counts as current |
| Existing embed not found for event | Return to list with `That embed was not found for this event.` |
| Blank/long name | Block save; enforce 1–80 trimmed characters client and server |
| Invalid color | Block save; exact inline error and server validation |
| Track from another event | Reject server-side; retain draft and show save failure |
| Duplicate track IDs | Deduplicate client-side and reject malformed server input |
| Double-click Save | Disable while saving; one insert only |
| Duplicate embed | Create disabled clone to avoid accidental publication |
| Delete used embed | Inline warning; after deletion the public URL shows unavailable without metadata |
| Disabled embed | Public query returns null; page shows unavailable |
| Event archived/draft | Public query returns null even if embed is enabled |
| No published sessions | View-aware empty message, not a blank frame |
| No accepted speakers | View-aware empty message |
| Optional field missing | Omit its element and preserve layout spacing |
| Invalid social URL | Omit link; accept only `http:`/`https:` |
| Headshot storage resolution fails | Render initials fallback; never expose storage key |
| Clipboard denied/unavailable | Keep selectable code and show manual-copy recovery text |
| Preview query fails | Preserve settings and show Retry within preview pane |
| Network fails during save | Preserve draft and dirty state; inline retry error |
| Refresh during unsaved edit | Unsaved edits may be lost in v1; dirty state warns only on in-app Back |
| Refresh after save | Load saved configuration from DB and reproduce same code |
| External host blocks iframe | Code remains valid; document that the host's own CSP must allow this origin |
| App deployment blocks framing | Release blocker; verify `/embed/*` response headers in deployed environment |
| Malicious embed ID | Convex validator rejects malformed IDs or returns unavailable; no metadata leak |
| Very long content | Clamp gallery bio preview; expanded detail wraps; no horizontal overflow |
| Rapid public data edits | Next query returns latest committed data; no stale cache is promised |
| Airtable backend selected | Fail closed with explicit unsupported message; never return private Airtable data |

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Saved configuration | New `embeds` table | Multiple embeds per event need stable identity and persistent options |
| Public URL | `/embed/:embedId` | Opaque, stable, and independent of mutable event slug/view |
| Output | Responsive iframe | Works in generic CMS/HTML blocks without shipping a parent SDK |
| Data freshness | Live public query | Simpler and fresher than Sessionboard's 60-minute cache; no job required |
| Initial formats | Styled HTML only | Matches screenshot's locked format while controlling scope |
| Initial views | All five named Sessionboard views | User explicitly restored embeds; these are the documented product outputs |
| Filters | Tracks only | Tracks exist consistently; format/level/language fields do not |
| Styling | Theme + primary color only | Useful branding without raw CSS/XSS risk; default coral, never blue |
| Custom HTML/CSS | Excluded | Avoids sanitization/execution surface and arbitrary site code |
| Resizing | Fixed responsive widths/heights | No postMessage SDK in v1; fewer cross-origin security concerns |
| Legacy routes | Preserve temporarily | Avoid breaking already-verified agenda/speaker links |
| Airtable | Explicitly unsupported | Public Airtable bridge is not safely implemented; fail closed |

## Dependencies

- Requires published events, agenda items, accepted submissions, speakers, rooms, tracks, Convex
  storage URL resolution, `AppLayout`, `ContentToolbar`, `StatusTabs`, existing UI primitives, and
  the repository adapter.
- Production-safe organizer CRUD requires verified Convex/Clerk admin authorization; this is an
  existing cross-cutting dependency, not a browser-supplied workaround.
- Enables event website agenda/session/speaker publishing and future JSON/iCal/domain-allowlist
  output without changing the organizer information architecture.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Private data leaks through public query | Allowlist response fields server-side; negative serialization tests |
| Embed works locally but deployment forbids framing | Verify actual `/embed/*` headers in a foreign-origin fixture |
| Scope expands into a full widget SDK | Fixed iframe, no postMessage, no auto-height, no raw CSS/HTML |
| Five views become duplicate components | One typed safe projection and one `EmbedRenderer` with small view functions |
| Filters reference fields the schema lacks | Track-only v1; document later filters as out of scope |
| Unauthenticated organizer mutations | Treat Clerk/Convex admin gate as a production release blocker; never claim it is solved |
| Current public route regressions | Keep legacy query/routes and test them until links are migrated |
| Source app uses blue design | Follow local tokens/coral and clone information architecture only |

## Research Sources

- [Sessionboard Agenda & Speaker Embeds](https://learn.sessionboard.com/sessions/embeds) — five view types, filters, field options, preview/code workflow, and update behavior.
- [MDN iframe reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) — iframe title/loading/referrer/sandbox behavior and cross-origin constraints.
- [MDN CSP frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors) — response-header control for which sites may frame a route.
- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) — sandboxing guidance for untrusted framed content; this feature avoids organizer-supplied HTML entirely.
