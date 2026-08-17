# Airtable CMS Sync — Technical Design

> Depends on `docs/features/notion-cms-sync/design.md` having shipped: the `content_integrations`
> table, `convex/credentialEncryption.ts`, `convex/contentIntegrations.ts`, and
> `convex/contentIntegrationsActions.ts` already exist by the time this feature is built. This
> doc only describes what changes/adds on top of that foundation.

## Database / Schema Changes

### Current Schema (as of Notion feature landing)
```ts
content_integrations: defineTable({
  eventId: v.id("events"),
  provider: v.union(v.literal("notion"), v.literal("airtable"), v.literal("sanity")),
  authMethod: v.union(v.literal("notion_internal_token")), // Airtable adds a literal here
  direction: v.union(v.literal("pull"), v.literal("push")),
  target: v.union(v.literal("speakers"), v.literal("submissions")),
  config: v.object({ notionDatabaseId: v.optional(v.string()) }), // Airtable adds fields here
  credentialHint: v.string(),
  credentialEnvelope: v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() }),
  status: v.union(v.literal("connected"), v.literal("error")),
  lastError: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
  lastSyncCursor: v.optional(v.string()),
  updatedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_event_provider", ["eventId", "provider"]),
```

### Required Changes
Extend the union literals already designed to be extended (per Notion design.md's own comment
"extended by later features"):
```ts
authMethod: v.union(v.literal("notion_internal_token"), v.literal("airtable_pat")),
config: v.object({
  notionDatabaseId: v.optional(v.string()),
  airtableBaseId: v.optional(v.string()),
  airtableTableName: v.optional(v.string()),
}),
```
No new table. `speakers`/`submissions` already have `sourceRef` + `by_event_sourceRef` from the
Notion feature — Airtable reuses it with the `"airtable:"` prefix.

### Migration
Additive union-literal extension only. No data migration.

---

## Backend / API

### Naming decision — critical, read before implementing
This codebase already defines `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID` in `.env.example:11-12`
for the *unrelated* `VITE_DATA_BACKEND=airtable` data-adapter feature
(`src/data/airtable/reactive.tsx`, `functions/api/data.ts`). **This feature's env vars and
credential fields must use distinct names** to avoid an organizer's CMS-sync Airtable base
silently being confused with (or overwritten by) the app's own data-backend Airtable config,
and vice versa:
- Do not add any new top-level env var for this feature — the Airtable personal access token is
  entered per-event by the organizer through the UI and stored encrypted in
  `content_integrations`, exactly like the Notion token. No server-wide Airtable credential env
  var is needed.
- If a `.env.example` entry is ever needed for local testing, name it
  `CMS_SYNC_AIRTABLE_TEST_PAT` — never `AIRTABLE_API_KEY`.

### New Convex Files
- `convex/airtableSync.ts` — `"use node"` action module: Airtable API calls + field mapping +
  import loop. Sibling to `convex/notionSync.ts`, same shape.

### Modified Convex Files
- `convex/contentIntegrationsActions.ts` — add `connectAirtable` and extend `importNotion`'s
  pattern into a provider-dispatching `import` action (or add a sibling `importAirtable` — pick
  whichever the Notion implementation actually produced; if `importNotion` was written generic
  enough to take a `provider` arg, extend it, otherwise add `importAirtable` following the exact
  same structure). Document the actual choice made when this ships.

### New Convex Actions

**`contentIntegrationsActions.connectAirtable`** (action)
- Args: `{ eventId: v.id("events"), personalAccessToken: v.string(), baseId: v.string(), tableName: v.string(), target: v.union(v.literal("speakers"), v.literal("submissions")) }`
- Auth: `assertEventOrganizerAction(ctx, args.eventId)`
- Validates before saving: `GET https://api.airtable.com/v0/{baseId}/{tableName}?maxRecords=1`
  with `Authorization: Bearer {personalAccessToken}`.
  - 401/403 → "That personal access token isn't valid, or doesn't have access to this base."
  - 404 → "That base or table wasn't found — check the base ID and table name."
- On success, upserts `content_integrations` with `provider: "airtable"`,
  `authMethod: "airtable_pat"`, `direction: "pull"`, `target`,
  `config: { airtableBaseId: baseId, airtableTableName: tableName }`, `credentialHint` = last 4
  chars of the token, `status: "connected"`.

**`contentIntegrationsActions.importAirtable`** (action)
- Args: `{ eventId: v.id("events") }`
- Loads stored integration, decrypts PAT.
- Calls `GET https://api.airtable.com/v0/{baseId}/{tableName}?pageSize=100` (+ `offset` param
  from `lastSyncCursor` if present), up to 2 pages (200 records) per run.
- Maps each record's `fields` object per the mapping table below, upserts via
  `internal.speakers.upsertBySourceRef` / `internal.submissions.upsertBySourceRef` (already
  built for Notion — reused as-is since both call sites just need `{eventId, sourceRef, fields}`)
  with `sourceRef = "airtable:" + record.id`.
- Persists `offset` (if present in the response) as `lastSyncCursor`; absent `offset` means end
  of table — clear the cursor.
- Returns `{ created, updated, skipped, hasMore }`, same shape as Notion's import result.

**`contentIntegrationsActions.disconnect`** — already generic from the Notion feature (takes a
`provider` union member); no change needed, just pass `"airtable"`.

### Field Mapping (Airtable column name → target field, fixed in v1)
For `target: "speakers"`:
| Airtable field | Type expected | Maps to |
|---|---|---|
| `Name` | Single line text | `firstName` (first word) + `lastName` (remainder) |
| `Email` | Email | `email` (required — row skipped if empty) |
| `Bio` | Long text | `bio` |
| `LinkedIn` | URL | `linkedinUrl` |
| `Website` | URL | `websiteUrl` |

For `target: "submissions"` (reuses the same "Airtable Import" default `submission_forms` row
pattern the Notion feature established, created once per event on first submissions-target
import):
| Airtable field | Type expected | Maps to |
|---|---|---|
| `Title` | Single line text | `title` (required — row skipped if empty) |
| `Status` | Single select (`Pending`/`Accepted`/`Declined`) | `status` |
| `Notes` | Long text | stored in `answers.notes` |

### Validation & Business Logic
Same rules as Notion: validate live before saving; import never deletes; skipped rows counted
and surfaced, never silently dropped.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/settings/Integrations.tsx` | Add an `Airtable` `IntegrationCard` to the "Content sources" section added by the Notion feature, alongside the Notion card. Same `Dialog` wiring pattern. |
| `src/data/repo.ts` | Add `connectAirtable`, `importAirtable` to the `contentIntegrations` slice added by the Notion feature. |
| `src/data/types.ts` | Add `AirtableConnectInput` type; extend `ContentIntegration.provider` union (already `"notion" | "airtable" | "sanity"` if Notion's types were written against the full schema union — confirm and align). |

### New Components

**`AirtableIntegrationForm`**
- File: `src/components/shared/AirtableIntegrationForm.tsx` — same structure as
  `NotionIntegrationForm.tsx`, different fields.
- Props: `{ eventId: EventId }`
- Elements (not-connected form):
  - Help text: "Create a personal access token at airtable.com/create/tokens with `data.records:read`
    scope for the base below."
  - Text input, label "Personal Access Token", type `password`, placeholder `pat...`
  - Text input, label "Base ID", placeholder `appXXXXXXXXXXXXXX`
  - Text input, label "Table Name", placeholder `Speakers`
  - Select "Import into" (Speakers/Submissions)
  - "Connect" button, disabled until all three fields non-empty
  - Inline red error text on failure
- Elements (connected panel): identical structure to `NotionIntegrationForm`'s connected panel
  — status badge, target + last-synced text, "Import now" button, summary text, "Disconnect"
  button behind confirm dialog.
- Behavior: identical interaction pattern to `NotionIntegrationForm`.
- Third-party: none new.

### Settings > Integrations grid change
Add to the "Content sources" section (created by the Notion feature) in
`src/pages/settings/Integrations.tsx`:
```tsx
<IntegrationCard
  icon={Table} // lucide-react
  name="Airtable"
  description="Import speakers or submissions from an Airtable base."
  status={airtableIntegration ? (airtableIntegration.status === "error" ? "error" : "connected") : "not_connected"}
  detail={airtableIntegration ? `Imports into ${airtableIntegration.target}` : undefined}
  onOpen={() => setAirtableModalOpen(true)}
/>
```

---

## State / Data Flow
Identical shape to Notion's, substituting the Airtable action names:
`AirtableIntegrationForm → repo.contentIntegrations.connectAirtable → Convex action
contentIntegrationsActions.connectAirtable → Airtable API validation → content_integrations
upsert → status re-fetch → connected panel.`
`"Import now" → repo.contentIntegrations.importAirtable → Convex action importAirtable →
Airtable API page fetch → per-record upsertBySourceRef → {created,updated,skipped,hasMore} →
summary text.`

## Auth / Permissions
Identical to Notion — `assertEventOrganizerAction` on every action; token never returned to the
browser.

## Edge Cases & Error States
| Scenario | Handling |
|---|---|
| PAT lacks `data.records:read` scope | Airtable returns 403 → "That personal access token isn't valid, or doesn't have access to this base." |
| Table renamed in Airtable after connecting | Next import returns 404 → integration `status` flips to `"error"`, `lastError` set, organizer must reconnect with the new table name |
| Row missing required field | Counted in `skipped`, not written |
| Airtable rate limit (429, 5 req/sec per base) | Action throws with the retry guidance; organizer retries manually |
| Two organizers import concurrently | Idempotent per `sourceRef`, same guarantee as Notion |

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reuse `content_integrations` + `credentialEncryption.ts` from Notion feature | Yes, no new infra | The whole point of shipping Notion first was to build this shared foundation once |
| Distinct env-var naming from the existing data-adapter Airtable vars | `CMS_SYNC_AIRTABLE_TEST_PAT` (test only) — no server-wide prod env var at all | Prevents confusing this feature's per-event Airtable connection with the app's own `VITE_DATA_BACKEND=airtable` data source |
| Pull-only, manual trigger, fixed mapping | Same as Notion | Consistency between the two providers; same scope reasoning |

## Dependencies
**Requires:** `docs/features/notion-cms-sync/` shipped (shared table + action module + crypto
helper).
**Enables:** `docs/features/sanity-cms-sync/` follows the same `content_integrations` extension
pattern.

## Risks & Mitigations
- **Risk:** Confusing this feature's Airtable connection with the existing `VITE_DATA_BACKEND`
  Airtable adapter in code review or in the UI. **Mitigation:** the Settings > Integrations card
  is explicitly labeled "Import speakers or submissions from an Airtable base" (a content
  action, not a backend-switch action), and no shared code or env var names are reused — see
  Naming decision above.
- **Risk:** Airtable field name mismatches (organizer's actual column names differ from the
  fixed mapping). **Mitigation:** same as Notion — documented exactly in the connect form's help
  text; a future mapping-UI issue can follow if this proves too rigid in practice.
