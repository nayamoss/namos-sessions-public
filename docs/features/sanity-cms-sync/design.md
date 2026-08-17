# Sanity CMS Sync — Technical Design

> Depends on `docs/features/notion-cms-sync/design.md` having shipped: `content_integrations`
> table, `convex/credentialEncryption.ts`, `convex/contentIntegrations.ts`,
> `convex/contentIntegrationsActions.ts` already exist. This is otherwise a net-new provider —
> no existing Sanity code anywhere in this codebase or portfolio to port from.

## Database / Schema Changes

### Current Schema (as of Notion + Airtable landing)
`content_integrations.provider` union already includes `"sanity"` (added speculatively by the
Notion feature's design). Extend `authMethod` and `config`:
```ts
authMethod: v.union(v.literal("notion_internal_token"), v.literal("airtable_pat"), v.literal("sanity_token")),
direction: v.union(v.literal("pull"), v.literal("push")), // Sanity is the first "push" user
config: v.object({
  notionDatabaseId: v.optional(v.string()),
  airtableBaseId: v.optional(v.string()),
  airtableTableName: v.optional(v.string()),
  sanityProjectId: v.optional(v.string()),
  sanityDataset: v.optional(v.string()),
}),
```
Note: `content_integrations.target` (`"speakers" | "submissions"`) was designed for pull
connections that import into one table. Sanity pushes both `agenda_items` and `speakers`
together, so `target` does not apply — extend it to allow `v.literal("public_program")` as the
value used for push-direction connections, meaning "everything the public API already exposes."

### Required Changes — new fields on source tables
```ts
// agenda_items: defineTable({ ...existing..., sanityDocId: v.optional(v.string()) })
//   .index("by_event", ["eventId"]).index("by_room", ["roomId"])
//   .index("by_submission", ["submissionId"]),
// speakers: defineTable({ ...existing..., sanityDocId: v.optional(v.string()) })
//   .index("by_event", ["eventId"]).index("by_event_email", ["eventId", "email"])
//   .index("by_event_sourceRef", ["eventId", "sourceRef"]),
```
`sanityDocId` stores the deterministic Sanity `_id` this app assigns
(`"namosSession-" + agendaItemId` / `"namosSpeaker-" + speakerId`) — deterministic IDs mean
`createOrReplace` is idempotent without needing a separate lookup step, unlike Notion/Airtable
where the *source* system's ID had to be captured into `sourceRef`. This is the opposite
direction of data ownership, so the ID-matching mechanism is intentionally different from the
pull features.

### Migration
Additive optional fields only, plus one new allowed literal on an existing union
(`content_integrations.target`). No backfill.

---

## Backend / API

### New Convex Files
- `convex/sanitySync.ts` — `"use node"` action module: Sanity API calls (validate, mutate) +
  document-shape builders for sessions and speakers.

### Modified Convex Files
- `convex/contentIntegrationsActions.ts` — add `connectSanity`, `publishSanity`.

### New Convex Actions

**`contentIntegrationsActions.connectSanity`** (action)
- Args: `{ eventId: v.id("events"), projectId: v.string(), dataset: v.string(), apiToken: v.string() }`
- Auth: `assertEventOrganizerAction(ctx, args.eventId)`
- Validates before saving: `GET https://{projectId}.api.sanity.io/v2023-05-03/data/query/{dataset}?query=*[0]`
  with `Authorization: Bearer {apiToken}`.
  - 401 → "That API token isn't valid."
  - 404 (unknown project/dataset) → "That project ID or dataset wasn't found."
  - A token with read-only permissions passes this check but fails at publish time — the
    validate step additionally does a dry-run mutate with `returnIds: true` and an empty
    mutation array (`{"mutations": []}` against the mutate endpoint) to confirm the token has
    write access; a 403 here → "That token doesn't have write access — create one with Editor
    permissions in manage.sanity.io."
- On success, upserts `content_integrations` with `provider: "sanity"`,
  `authMethod: "sanity_token"`, `direction: "push"`, `target: "public_program"`,
  `config: { sanityProjectId: projectId, sanityDataset: dataset }`, `credentialHint` = last 4
  chars of the token, `status: "connected"`.

**`contentIntegrationsActions.publishSanity`** (action)
- Args: `{ eventId: v.id("events") }`
- Loads stored integration, decrypts token.
- Queries `agenda_items` where `eventId` matches and `isPublished === true`
  (`convex/agenda.ts` already has a query for published agenda — reuse it, don't re-implement
  the filter), and `speakers` where `eventId` matches and `confirmationStatus === "confirmed"`.
- Builds Sanity documents per the Document Shape section below.
- Sends batched `POST https://{projectId}.api.sanity.io/v2023-05-03/data/mutate/{dataset}` with
  up to 50 `createOrReplace` mutations per request (Sanity's practical batch ceiling), up to 100
  documents total per run (matches NFR-002).
- On each successful batch, writes the assigned `sanityDocId` back onto the source
  `agenda_items`/`speakers` rows via new internal mutations
  `internal.agenda.setSanityDocId` / `internal.speakers.setSanityDocId` (trivial single-field
  patches — do not reuse `upsertBySourceRef`, which is shaped for the opposite data-ownership
  direction).
- Returns `{ published: number, failed: number, hasMore: boolean }`. `failed` covers per-document
  Sanity validation errors (e.g. a session missing a title) — collected, not thrown, so one bad
  row doesn't abort the whole run; the organizer sees the count and (client-side) can inspect
  which session/speaker failed via a returned list of `{ name, reason }` (bounded to first 10 for
  the summary UI).

### Document Shape (fixed in v1)
**Session** (`_type: "namosSession"`, `_id: "namosSession-" + agendaItemId`):
```json
{
  "_type": "namosSession",
  "_id": "namosSession-<agendaItemId>",
  "title": "string",
  "startTime": "ISO 8601 string",
  "endTime": "ISO 8601 string",
  "speakerRefs": [{"_type": "reference", "_ref": "namosSpeaker-<speakerId>"}],
  "videoUrl": "string | omitted if unset"
}
```
**Speaker** (`_type: "namosSpeaker"`, `_id: "namosSpeaker-" + speakerId`):
```json
{
  "_type": "namosSpeaker",
  "_id": "namosSpeaker-<speakerId>",
  "name": "firstName + ' ' + lastName",
  "bio": "string | omitted if unset",
  "linkedinUrl": "string | omitted if unset",
  "websiteUrl": "string | omitted if unset"
}
```
This mirrors exactly the fields already exposed by the existing public speakers/agenda read
endpoints (see `docs/features/public-events-api/`) — no new "what counts as public" decision is
made here. The organizer's Sanity Studio must have `namosSession`/`namosSpeaker` document types
matching these shapes; documenting this requirement in the connect form's help text is the
correct place, not building a schema-provisioning tool (out of scope).

### Validation & Business Logic
- Publish only ever reads `isPublished: true` agenda items and `confirmationStatus: "confirmed"`
  speakers — the same boundary the existing public API and public embeds already enforce, so
  this feature cannot leak draft/unconfirmed data to a public site.
- Publish never deletes a Sanity document, even if the source session becomes unpublished later
  (see requirements.md Out of Scope) — document this limitation directly in the connected
  panel's help text so it isn't a silent surprise.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/settings/Integrations.tsx` | Add a `Sanity` `IntegrationCard` to the "Content sources" section, alongside Notion/Airtable. |
| `src/data/repo.ts` | Add `connectSanity`, `publishSanity` to the `contentIntegrations` slice. |
| `src/data/types.ts` | Add `SanityConnectInput`, `SanityPublishResult` types. |

### New Components

**`SanityIntegrationForm`**
- File: `src/components/shared/SanityIntegrationForm.tsx`
- Props: `{ eventId: EventId }`
- Elements (not-connected form):
  - Help text: "Create an API token with Editor permissions at manage.sanity.io, and add
    `namosSession` / `namosSpeaker` document types to your Sanity schema (see docs) before
    connecting."
  - Text input, label "Project ID", placeholder `abc12345`
  - Text input, label "Dataset", placeholder `production`
  - Text input, label "API Token", type `password`
  - "Connect" button, disabled until all three fields non-empty
  - Inline red error text on failure
- Elements (connected panel):
  - Status badge, "Publishing to {dataset}" + relative last-published time
  - "Publish now" button (spinner while running, disabled meanwhile)
  - Post-publish summary text: "14 published" or "12 published, 2 failed" — when `failed > 0`,
    an expandable `<details>` list showing the first 10 `{name, reason}` pairs
  - "more remain" note when `hasMore`
  - Static help text: "Disconnecting stops future publishes — documents already in Sanity are
    not removed."
  - "Disconnect" button behind confirm `AlertDialog`
- Behavior: same interaction pattern as `NotionIntegrationForm`/`AirtableIntegrationForm`.
- Third-party: none new.

### Settings > Integrations grid change
```tsx
<IntegrationCard
  icon={Globe} // lucide-react
  name="Sanity"
  description="Publish confirmed sessions and speakers to a Sanity dataset."
  status={sanityIntegration ? (sanityIntegration.status === "error" ? "error" : "connected") : "not_connected"}
  detail={sanityIntegration ? `Publishing to ${sanityIntegration.dataset}` : undefined}
  onOpen={() => setSanityModalOpen(true)}
/>
```

---

## State / Data Flow
`SanityIntegrationForm → repo.contentIntegrations.connectSanity → Convex action
contentIntegrationsActions.connectSanity → Sanity read + write-permission dry-run validation →
content_integrations upsert → status re-fetch → connected panel.`

`"Publish now" → repo.contentIntegrations.publishSanity → Convex action publishSanity → query
published agenda_items + confirmed speakers → build documents → batched Sanity mutate calls →
per-doc sanityDocId written back to source rows → {published, failed, hasMore, failures} →
summary text + optional failures list rendered.`

## Auth / Permissions
Identical pattern to Notion/Airtable — `assertEventOrganizerAction` on every action; token never
returned to the browser. Additionally: publish only ever reads data already gated by the
existing `isPublished`/`confirmationStatus` flags, so no new data-exposure surface is created
beyond what public embeds/public API already expose.

## Edge Cases & Error States
| Scenario | Handling |
|---|---|
| Token is read-only | Caught at connect time by the write-permission dry-run check, not discovered later at publish time |
| Sanity schema missing `namosSession`/`namosSpeaker` types | Sanity returns a validation error per document → counted in `failed`, reason surfaced |
| Session missing required field (title) | This shouldn't occur — `agenda_items.title` is required at creation — but defensively counted in `failed` if it does |
| Event has >100 published sessions+speakers | `hasMore: true` in response; organizer clicks "Publish now" again to continue |
| Sanity mutate rate limit | Action throws with retry guidance; organizer retries manually |
| Organizer disconnects then reconnects | Documents already in Sanity are matched again via the deterministic `namosSession-<id>` / `namosSpeaker-<id>` IDs — no duplicates even after a disconnect/reconnect cycle, since the ID scheme doesn't depend on the stored integration at all |

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Push, not pull | Sanity is publish-target, not a source | Sanity's role in this portfolio (and generally) is powering a public site's content, not organizer planning data — opposite of Notion/Airtable's role |
| Deterministic Sanity `_id`s instead of a stored `sourceRef` | `"namosSession-" + agendaItemId` | This app owns the source data; Sanity is the mirror. A deterministic ID makes `createOrReplace` idempotent without a lookup round-trip, and survives disconnect/reconnect cleanly |
| Only publish already-public data (`isPublished`/`confirmed`) | Hard filter, not organizer-configurable | Reuses the existing trust boundary from public-events-api/public-embeds instead of creating a second one that could drift out of sync with it |
| No delete-on-unpublish | Explicit non-goal | This app doesn't own the Sanity dataset; silent deletion of a live site's content is a worse failure mode than a stale document, and is called out to the organizer directly in the UI |

## Dependencies
**Requires:** `docs/features/notion-cms-sync/` shipped (shared table + crypto helper + action
module). Does not require Airtable to have shipped — independent of it.
**Enables:** none currently planned; establishes the "push" half of `content_integrations` for
any future push-direction provider.

## Risks & Mitigations
- **Risk:** Organizer's Sanity schema doesn't match the fixed `namosSession`/`namosSpeaker`
  shape. **Mitigation:** connect-form help text states the required document types up front;
  failures are surfaced per-document rather than aborting the whole publish.
- **Risk:** Publishing draft/unconfirmed data by mistake. **Mitigation:** the Convex query used
  is the same `isPublished`/`confirmationStatus` filter the existing public API already trusts
  — no new filter logic to get wrong.
