# Notion CMS Sync — Technical Design

## Database / Schema Changes

### Current Schema (reference pattern)
`convex/schema.ts:560` — the encrypted-integration pattern this feature copies:
```ts
email_integrations: defineTable({
  eventId: v.id("events"),
  provider: v.union(v.literal("resend"), v.literal("ses")),
  authMethod: v.union(v.literal("resend_oauth"), v.literal("resend_api_key"), v.literal("ses_api"), v.literal("ses_smtp")),
  sender: v.string(),
  region: v.optional(v.string()),
  credentialHint: v.string(),
  credentialEnvelope: v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() }),
  status: v.union(v.literal("connected"), v.literal("error")),
  lastError: v.optional(v.string()),
  updatedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]),
```

### Required Changes
New table, shared by this feature and the later Airtable/Sanity sync features (do not
scope it to `provider: "notion"` only — it is the general content-integration table):

```ts
content_integrations: defineTable({
  eventId: v.id("events"),
  provider: v.union(v.literal("notion"), v.literal("airtable"), v.literal("sanity")),
  authMethod: v.union(v.literal("notion_internal_token")), // extended by later features
  direction: v.union(v.literal("pull"), v.literal("push")),
  target: v.union(v.literal("speakers"), v.literal("submissions")), // what this connection imports into
  config: v.object({
    notionDatabaseId: v.optional(v.string()),
  }),
  credentialHint: v.string(),
  credentialEnvelope: v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() }),
  status: v.union(v.literal("connected"), v.literal("error")),
  lastError: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
  lastSyncCursor: v.optional(v.string()), // Notion pagination cursor for resumable imports
  updatedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_event_provider", ["eventId", "provider"]),
```

Also add an optional `sourceRef` field to the two importable tables, so a re-run of import can
match existing rows instead of duplicating them (Convex `defineTable` requires adding as
optional — no backfill needed, existing rows simply have it unset):

```ts
// speakers: defineTable({ ...existing fields..., sourceRef: v.optional(v.string()) })
//   .index("by_event", ["eventId"]).index("by_event_email", ["eventId", "email"])
//   .index("by_event_sourceRef", ["eventId", "sourceRef"]),
// submissions: defineTable({ ...existing fields..., sourceRef: v.optional(v.string()) })
//   .index("by_event", ["eventId"]).index("by_form", ["formId"])
//   .index("by_form_idempotency", ["formId", "idempotencyKey"]).index("by_speaker", ["speakerId"])
//   .index("by_event_sourceRef", ["eventId", "sourceRef"]),
```
`sourceRef` stores `"notion:<page_id>"` (provider-prefixed so Airtable/Sanity can reuse the same
column later without collision).

### Migration
Additive only — new table `content_integrations`, new optional column `sourceRef` with a new
index on both `speakers` and `submissions`. No backfill. Convex applies schema changes on next
`npx convex dev` / deploy; existing rows are valid immediately since the new field is optional.

---

## Backend / API

### New Convex Files
- `convex/contentIntegrations.ts` — internal queries/mutations for `content_integrations` CRUD
  (mirrors `convex/emailIntegrations.ts`'s split between public status query and internal
  upsert/get used by actions).
- `convex/contentIntegrationsActions.ts` — `"use node"` action module: connect/test/disconnect,
  mirrors `convex/emailIntegrationsActions.ts` structure exactly.
- `convex/notionSync.ts` — `"use node"` action module: Notion API calls + field mapping +
  import loop. Provider-specific logic lives here so `contentIntegrationsActions.ts` stays
  provider-agnostic (Airtable/Sanity add their own `airtableSync.ts` / `sanitySync.ts` siblings
  later without touching this file).

### Encryption helper reuse
Add `encryptCredentials` / `decryptCredentials` as provider-agnostic exports. Rather than
duplicating the AES-256-GCM implementation in `convex/emailDelivery.ts:1-30`, extract it: create
`convex/credentialEncryption.ts` with `encrypt(plaintext: string, envKey: string): Envelope` /
`decrypt(envelope: Envelope, envKey: string): string`, generic over any string payload (not
tied to the `Credentials` shape in `emailDelivery.ts`). Update `emailDelivery.ts` to call the
shared helper instead of its own inline `createCipheriv`/`createDecipheriv` — this is a
same-behavior refactor, not a behavior change, and de-duplicates the crypto code before a third
copy (Airtable) and fourth (Sanity) would otherwise appear.

New env var: `CONTENT_INTEGRATION_ENCRYPTION_KEY` (base64 32-byte key, same generation method as
`EMAIL_INTEGRATION_ENCRYPTION_KEY`). Add to `.env.example` next to the existing
`EMAIL_INTEGRATION_ENCRYPTION_KEY` / `AI_INTEGRATION_ENCRYPTION_KEY` lines (`.env.example:41-43`).

### New Convex Actions

**`contentIntegrationsActions.connectNotion`** (action)
- Args: `{ eventId: v.id("events"), notionToken: v.string(), notionDatabaseId: v.string(), target: v.union(v.literal("speakers"), v.literal("submissions")) }`
- Auth: `assertEventOrganizerAction(ctx, args.eventId)` (same helper `emailDelivery.ts` uses)
- Validates before saving:
  1. Calls Notion `GET https://api.notion.com/v1/users/me` with the token — a 401 means "That
     token isn't valid."
  2. Calls Notion `GET https://api.notion.com/v1/databases/{database_id}` with the token — a
     404 means "That database isn't shared with your Notion integration yet." (the single most
     common Notion integration failure — must be a specific message, not a generic 404)
- On success, upserts a `content_integrations` row with `provider: "notion"`,
  `authMethod: "notion_internal_token"`, `direction: "pull"`, `target`,
  `config: { notionDatabaseId }`, `credentialHint` = last 4 chars of the token prefixed with
  `"secret_...", status: "connected"`.
- Returns `{ status: "connected" as const }`.

**`contentIntegrationsActions.importNotion`** (action)
- Args: `{ eventId: v.id("events") }`
- Auth: `assertEventOrganizerAction`
- Loads the stored `content_integrations` row (provider `"notion"`) via
  `internal.contentIntegrations.getInternal`, decrypts the token.
- Calls Notion `POST /v1/databases/{database_id}/query` with `page_size: 100`, `start_cursor`
  from `lastSyncCursor` if present, up to 2 pages (200 rows) per run.
- For each Notion page result, maps properties (see Field Mapping below) and calls
  `internal.speakers.upsertBySourceRef` or `internal.submissions.upsertBySourceRef` (new
  internal mutations, one per target table) keyed on `sourceRef = "notion:" + page.id`.
- Persists `lastSyncCursor` (Notion's `next_cursor`) and `lastSyncedAt` on the integration row
  so the next run continues rather than re-scanning from the start; when Notion returns
  `has_more: false`, clears the cursor so the next run starts over (picks up edits to
  already-seen rows).
- Returns `{ created: number, updated: number, skipped: number, hasMore: boolean }`. `skipped`
  counts rows missing a required field (e.g. no email for a `speakers` target) — these are
  never silently dropped; the count is surfaced to the organizer.

**`contentIntegrationsActions.disconnect`** (action)
- Args: `{ eventId: v.id("events"), provider: v.union(v.literal("notion"), v.literal("airtable"), v.literal("sanity")) }`
- Auth: `assertEventOrganizerAction`
- Deletes the `content_integrations` row. Does not touch already-imported `speakers` /
  `submissions` rows or their `sourceRef`.

### Field Mapping (Notion property name → target field, fixed in v1)
For `target: "speakers"`, the Notion database is expected to have these property names (case-
sensitive, must match exactly — documented in the connect modal's help text):
| Notion property | Type expected | Maps to |
|---|---|---|
| `Name` | title | `firstName` (first word) + `lastName` (remainder) |
| `Email` | email | `email` (required — row skipped if empty) |
| `Bio` | rich_text | `bio` |
| `LinkedIn` | url | `linkedinUrl` |
| `Website` | url | `websiteUrl` |

For `target: "submissions"`, an existing `submission_forms` row must already exist for the
event (the import creates a lightweight default form named "Notion Import" the first time a
submissions-target connection imports, via `internal.formTemplates` — reuses the existing form
creation path rather than inventing a new one):
| Notion property | Type expected | Maps to |
|---|---|---|
| `Title` | title | `title` (required — row skipped if empty) |
| `Status` | select (`Pending`/`Accepted`/`Declined`) | `status` (`pending`/`accepted`/`declined`; unrecognized values default to `pending`) |
| `Notes` | rich_text | stored in `answers.notes` |

### Validation & Business Logic
- Token and database ID are validated live against Notion before any row is written — no
  "connected" state is ever stored for a connection that doesn't actually work (same rule
  `emailIntegrationsActions.save` follows for email: "Saves only after a live send succeeds").
- Import never deletes: a Notion row removed from the database does not delete the
  corresponding speaker/submission — only creates/updates.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/settings/Integrations.tsx` | Add a "Content sources" section below the existing integration grid (line 96) with a `Notion` `IntegrationCard`; add `notionModalOpen` state and a `Dialog` wired the same way as the existing `emailProviderModal` dialog (lines 124-135). |
| `src/data/repo.ts` | Add `contentIntegrations: { status, connectNotion, importNotion, disconnect }` methods, same shape as the existing `emailIntegrations` repo slice. |
| `src/data/types.ts` | Add `ContentIntegration`, `ContentIntegrationTarget`, `NotionConnectInput`, `NotionImportResult` types (mirrors `EmailIntegration` types at `src/data/types.ts:177-190`). |

### New Components

**`NotionIntegrationForm`**
- File: `src/components/shared/NotionIntegrationForm.tsx` (sibling to `EmailIntegrationForm.tsx`)
- Props: `{ eventId: EventId }`
- Location: rendered inside the Notion `Dialog`'s `DialogContent` on `Settings > Integrations`
- Elements (two states — not-connected form vs. connected panel):
  - **Not connected:**
    - Help text block: "Create a Notion internal integration at notion.so/my-integrations,
      share your database with it, then paste the token and database ID below."
    - Text input, label "Internal Integration Token", type `password`, placeholder
      `secret_...`
    - Text input, label "Database ID", placeholder `32-character Notion database ID`, with
      helper text "Copy from the database URL — the 32-character segment before `?v=`."
    - Select, label "Import into", options "Speakers" / "Submissions" (`target`)
    - Button "Connect", disabled while token/database ID empty or while saving; on click calls
      `repo.contentIntegrations.connectNotion(...)`
    - Error state: red inline text below the button showing the thrown error message verbatim
      (matches `EmailIntegrationForm`'s error display pattern)
  - **Connected:**
    - `StatusBadge` (tone `success` if `status === "connected"`, `destructive` if `"error"`)
    - Text: "Importing into {target}" + last-synced relative time (`lastSyncedAt` via
      `date-fns` `formatDistanceToNow`, already a dependency)
    - Button "Import now" — calls `repo.contentIntegrations.importNotion({ eventId })`; while
      running, shows a spinner and disables itself
    - After import completes: inline summary text "12 created, 3 updated, 1 skipped" (skipped
      count only shown when > 0, styled `text-muted-foreground`)
    - If `status === "error"`: red inline text showing `lastError`
    - Button "Disconnect" (secondary/destructive variant), confirms via existing
      `AlertDialog` pattern used elsewhere in `src/components/shared/`, then calls
      `repo.contentIntegrations.disconnect({ eventId, provider: "notion" })`
- Behavior: form validates non-empty token/database ID client-side before enabling "Connect";
  all real validation happens server-side per design above.
- Third-party: none new — `date-fns` (already a dependency) for relative time formatting.

### Settings > Integrations grid change
`src/pages/settings/Integrations.tsx:96` grid gains a fourth card:
```tsx
<IntegrationCard
  icon={FileText} // lucide-react, already a dependency
  name="Notion"
  description="Import speakers or submissions from a Notion database."
  status={notionIntegration ? (notionIntegration.status === "error" ? "error" : "connected") : "not_connected"}
  detail={notionIntegration ? `Imports into ${notionIntegration.target}` : undefined}
  onOpen={() => setNotionModalOpen(true)}
/>
```
Loaded via a new `loadContentIntegrationStatus` callback following the exact shape of the
existing `loadEmailStatus` (`Integrations.tsx:43-59`).

---

## State / Data Flow
`NotionIntegrationForm: useState(connecting|importing) → repo.contentIntegrations.connectNotion
→ Convex action contentIntegrationsActions.connectNotion → Notion API validation →
content_integrations upsert → repo returns status → form re-renders "Connected" panel.`

`"Import now" click → repo.contentIntegrations.importNotion → Convex action
contentIntegrationsActions.importNotion → Notion API query → per-row upsertBySourceRef mutation
→ action returns {created, updated, skipped} → form renders summary text (local component
state, not persisted — a fresh "Import now" click always starts a new summary).`

Local component state in `NotionIntegrationForm`: `token: string`, `databaseId: string`,
`target: "speakers" | "submissions"`, `connecting: boolean`, `importing: boolean`,
`lastImportSummary: { created: number; updated: number; skipped: number } | null`.

## Auth / Permissions
- Every action requires `assertEventOrganizerAction(ctx, eventId)` — same check as all
  `email_integrations` actions. No new role/plan gating.
- The Notion token is never returned to the browser — `contentIntegrations.status` (query)
  returns only `credentialHint`, `status`, `target`, `lastSyncedAt`, matching how
  `emailIntegrations.status` withholds credentials today.

## Edge Cases & Error States
| Scenario | Handling |
|---|---|
| Notion token invalid | `connectNotion` throws before saving; form shows the exact message, nothing persisted |
| Database not shared with integration | `connectNotion` throws "That database isn't shared with your Notion integration yet." |
| Row missing required field (email/title) | Counted in `skipped`, not written, not thrown |
| Import called with no connection | Action throws "No Notion connection for this event." |
| Notion rate limit (429) | Action throws with Notion's `Retry-After` surfaced in the message; organizer retries "Import now" manually |
| Two organizers click "Import now" concurrently | Each run is independent; `upsertBySourceRef` is idempotent per `sourceRef` so a race produces at most a duplicate *update*, never a duplicate row |
| Event deleted while integration connected | Out of scope — no event deletion flow currently exists in this codebase |

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pull-only, not two-way | Notion is source-of-truth-in, not written back to | Two-way requires conflict resolution (edited in both places) that adds real scope for a "least effort" first integration; can be a follow-up issue |
| Manual trigger, no cron | "Import now" button only | This app has no existing scheduled-job infra for per-event user data (only reviewer reminders); adding one is out of scope here |
| Fixed field mapping, no mapping UI | Documented property names, case-sensitive | A mapping UI is its own feature-sized surface; ships once Airtable/Sanity prove out whether organizers actually want per-connection mapping |
| New `content_integrations` table, not reusing `email_integrations` | Separate table | Different `config` shape per provider (Notion database ID vs. Airtable base/table vs. Sanity project/dataset) doesn't fit `email_integrations`'s fixed `sender`/`region` columns |

## Dependencies
**Requires:** none — builds on existing `assertEventOrganizerAction`, `IntegrationCard`,
`Dialog` patterns already in the codebase.
**Enables:** `docs/features/airtable-cms-sync/` and `docs/features/sanity-cms-sync/` both
extend `content_integrations` and reuse `contentIntegrationsActions.ts` / the extracted
`credentialEncryption.ts` helper — ship this one first.

## Risks & Mitigations
- **Risk:** Notion API version drift (Notion versions its API via a required header). **Mitigation:**
  pin `"Notion-Version": "2022-06-28"` explicitly in every request in `notionSync.ts` rather than
  omitting it.
- **Risk:** Large Notion databases (>200 rows) need multiple "Import now" clicks. **Mitigation:**
  `hasMore` in the action's return value drives the UI to show "12 created, 3 updated — more
  rows remain, click Import now again" rather than silently truncating.
