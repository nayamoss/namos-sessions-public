# Onboarding Multi-Source Import — Technical Design

## SDLC Analysis Summary

- **Database/schema:** applies. `content_integrations`, `content_oauth_states`, and
  `content_oauth_pending` must recognize Google Sheets and Trello. `speakers.sourceRef` and
  `submissions.sourceRef` already provide provider-record idempotency.
- **Backend/API:** applies. New Convex Node actions perform Google/Trello authorization, source
  discovery, preview, import, refresh/error handling, and encrypted credential storage. Existing
  Notion actions are extended with preview and an onboarding return destination.
- **Frontend:** applies. `/onboarding` is a Vite/React client page, not a Server Component. The
  source step must manage its own repo calls, redirect return parameters, local file parsing, and
  result state.
- **State/data flow:** applies. File sources parse locally and confirm through a mutation; remote
  sources authorize, configure, preview through an action, then confirm through an action.
- **Auth/permissions:** applies. All writes and credential reads are event-organizer-only. OAuth
  state is user/event/provider-bound and single-use.
- **Edge/error states:** applies and are specified below.
- **Deployment:** the frontend is a Vite static build on Netlify/Vercel (`netlify.toml:1-3`,
  `vercel.json:2-5`); provider work therefore stays in Convex Node actions and HTTP callbacks.
  `export const maxDuration` is not applicable. Bounded 500-row/card operations avoid creating a
  new Netlify or Vercel serverless function.
- **AI SDK:** N/A — no AI parsing is permitted. `ai@6.0.64` and `@ai-sdk/openai@3.0.96` exist but
  are intentionally unused.
- **Third-party packages:** `papaparse@5.5.4`, `lucide-react@0.462.0`, `react-router-dom@7.18.2`,
  and `zod@3.25.76` already exist. No Google/Trello SDK or Markdown parser is installed or needed;
  use standards-based `fetch`, `URL`, Web Crypto, and a small table parser.

## Database / Schema Changes

### Current Schema (affected tables)

From `convex/schema.ts:228-252`, `274-291`, and `619-657`:

```ts
speakers: defineTable({
  eventId: v.id("events"),
  email: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  bio: v.optional(v.string()),
  salutation: v.optional(v.string()),
  honorific: v.optional(v.string()),
  pronouns: v.optional(v.string()),
  gender: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()),
  xUrl: v.optional(v.string()),
  facebookUrl: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),
  sourceRef: v.optional(v.string()),
  sanityDocId: v.optional(v.string()),
  headshotStorageKey: v.optional(v.string()),
  confirmationStatus: v.optional(v.union(v.literal("awaiting"), v.literal("confirmed"), v.literal("declined"))),
  checkedInAt: v.optional(v.number()),
  checkedInByUserId: v.optional(v.string()),
  status: v.union(v.literal("invited"), v.literal("active"), v.literal("inactive")),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
  .index("by_event_email", ["eventId", "email"])
  .index("by_event_sourceRef", ["eventId", "sourceRef"])
  .index("by_event_checkedIn", ["eventId", "checkedInAt"]),

submissions: defineTable({
  eventId: v.id("events"),
  formId: v.id("submission_forms"),
  idempotencyKey: v.optional(v.string()),
  speakerId: v.optional(v.id("speakers")),
  tagIds: v.optional(v.array(v.id("tags"))),
  trackId: v.optional(v.id("tracks")),
  sponsorId: v.optional(v.id("sponsors")),
  title: v.string(),
  status: v.union(v.literal("draft"), v.literal("pending"), v.literal("accept_queue"), v.literal("accepted"), v.literal("maybe"), v.literal("decline_queue"), v.literal("declined"), v.literal("withdrawn")),
  answers: v.any(),
  sourceRef: v.optional(v.string()),
  submittedAt: v.optional(v.number()),
  lastSpeakerEditAt: v.optional(v.number()),
  speakerEditCount: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
  .index("by_form", ["formId"])
  .index("by_form_idempotency", ["formId", "idempotencyKey"])
  .index("by_speaker", ["speakerId"])
  .index("by_event_sourceRef", ["eventId", "sourceRef"]),

content_integrations: defineTable({
  eventId: v.id("events"),
  provider: v.union(v.literal("notion"), v.literal("airtable"), v.literal("sanity")),
  authMethod: v.union(v.literal("notion_internal_token"), v.literal("notion_oauth"), v.literal("airtable_pat"), v.literal("airtable_oauth"), v.literal("sanity_token")),
  direction: v.union(v.literal("pull"), v.literal("push")),
  target: v.union(v.literal("speakers"), v.literal("submissions"), v.literal("public_program")),
  config: v.object({
    notionDatabaseId: v.optional(v.string()),
    airtableBaseId: v.optional(v.string()),
    airtableTableName: v.optional(v.string()),
    sanityProjectId: v.optional(v.string()),
    sanityDataset: v.optional(v.string()),
  }),
  credentialHint: v.string(),
  credentialEnvelope: v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() }),
  oauthExpiresAt: v.optional(v.number()),
  status: v.union(v.literal("connected"), v.literal("error")),
  lastError: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
  lastSyncCursor: v.optional(v.string()),
  updatedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_event_provider", ["eventId", "provider"]),

content_oauth_states: defineTable({
  stateHash: v.string(),
  provider: v.union(v.literal("notion"), v.literal("airtable")),
  eventId: v.id("events"),
  userId: v.string(),
  target: v.union(v.literal("speakers"), v.literal("submissions")),
  verifierEnvelope: v.optional(v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() })),
  expiresAt: v.number(),
  createdAt: v.number(),
}).index("by_stateHash", ["stateHash"]),

content_oauth_pending: defineTable({
  pendingId: v.string(),
  provider: v.union(v.literal("notion"), v.literal("airtable")),
  eventId: v.id("events"),
  userId: v.string(),
  target: v.union(v.literal("speakers"), v.literal("submissions")),
  credentialEnvelope: v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() }),
  oauthExpiresAt: v.optional(v.number()),
  expiresAt: v.number(),
  createdAt: v.number(),
}).index("by_pendingId", ["pendingId"]),
```

### Required Changes

Replace only the three integration definitions with the following additive unions/fields. Do not
change indexes or make existing fields required:

```ts
content_integrations: defineTable({
  eventId: v.id("events"),
  provider: v.union(
    v.literal("notion"), v.literal("airtable"), v.literal("sanity"),
    v.literal("google_sheets"), v.literal("trello"),
  ),
  authMethod: v.union(
    v.literal("notion_internal_token"), v.literal("notion_oauth"),
    v.literal("airtable_pat"), v.literal("airtable_oauth"),
    v.literal("sanity_token"), v.literal("google_oauth"), v.literal("trello_token"),
  ),
  direction: v.union(v.literal("pull"), v.literal("push")),
  target: v.union(v.literal("speakers"), v.literal("submissions"), v.literal("public_program")),
  config: v.object({
    notionDatabaseId: v.optional(v.string()),
    airtableBaseId: v.optional(v.string()),
    airtableTableName: v.optional(v.string()),
    sanityProjectId: v.optional(v.string()),
    sanityDataset: v.optional(v.string()),
    googleSpreadsheetId: v.optional(v.string()),
    googleSheetName: v.optional(v.string()),
    trelloBoardId: v.optional(v.string()),
  }),
  credentialHint: v.string(),
  credentialEnvelope: v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() }),
  oauthExpiresAt: v.optional(v.number()),
  status: v.union(v.literal("connected"), v.literal("error")),
  lastError: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
  lastSyncCursor: v.optional(v.string()),
  updatedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_event_provider", ["eventId", "provider"]),

content_oauth_states: defineTable({
  stateHash: v.string(),
  provider: v.union(v.literal("notion"), v.literal("airtable"), v.literal("google_sheets"), v.literal("trello")),
  eventId: v.id("events"),
  userId: v.string(),
  target: v.union(v.literal("speakers"), v.literal("submissions")),
  returnTo: v.optional(v.union(v.literal("onboarding"), v.literal("settings"))),
  verifierEnvelope: v.optional(v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() })),
  expiresAt: v.number(),
  createdAt: v.number(),
}).index("by_stateHash", ["stateHash"]),

content_oauth_pending: defineTable({
  pendingId: v.string(),
  provider: v.union(v.literal("notion"), v.literal("airtable"), v.literal("google_sheets"), v.literal("trello")),
  eventId: v.id("events"),
  userId: v.string(),
  target: v.union(v.literal("speakers"), v.literal("submissions")),
  returnTo: v.optional(v.union(v.literal("onboarding"), v.literal("settings"))),
  credentialEnvelope: v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() }),
  oauthExpiresAt: v.optional(v.number()),
  expiresAt: v.number(),
  createdAt: v.number(),
}).index("by_pendingId", ["pendingId"]),
```

### Migration

This is an additive Convex schema migration: expand literal unions and add optional config and
return-destination fields. There is no data backfill. Existing Notion/Airtable/Sanity rows remain
valid because all new object fields are optional. Deploy the schema before invoking new actions.
Do not remove or rewrite existing `sourceRef` values.

## Canonical Import Contracts

Add to `src/data/types.ts` and mirror with Convex validators in `convex/importRows.ts`:

```ts
export type OnboardingImportSource = "csv" | "google_sheets" | "trello" | "notion" | "markdown";
export type ImportTarget = "speakers" | "submissions";

export interface SpeakerImportPreviewRow {
  id: string;                 // UI key; never trusted as an auth identifier
  sourceKey: string;          // provider record/card/row key used to build sourceRef
  sourceLabel: string;        // row number or card name shown in skipped results
  kind: "speaker";
  firstName: string;
  lastName: string;
  email: string;
  bio?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  talkTitle?: string;
  talkAbstract?: string;
  error?: string;
}

export interface SubmissionImportPreviewRow {
  id: string;
  sourceKey: string;
  sourceLabel: string;
  kind: "submission";
  title: string;
  status: "pending" | "accepted" | "declined";
  notes?: string;
  error?: string;
}

export type ImportPreviewRow = SpeakerImportPreviewRow | SubmissionImportPreviewRow;
export interface ImportPreview {
  rows: ImportPreviewRow[];
  totalRows: number;
  hasMore: boolean;
}
export interface ImportResult {
  createdSpeakers: number;
  updatedSpeakers: number;
  createdSubmissions: number;
  updatedSubmissions: number;
  skipped: Array<{ sourceLabel: string; reason: string }>;
  hasMore: boolean;
}
```

Validation is shared between local parsers and server mapping:

- speaker: trim all text; lowercase email; require first/last/email; names ≤ 200 chars; email ≤
  320 chars and matches the existing `normalizedSpeakerEmail` validation; URL fields must be
  `http:` or `https:`; talk title ≤ 300 chars.
- submission: trim text; require title ≤ 300 chars; normalize status case-insensitively to
  `pending|accepted|declined`; notes ≤ 20,000 chars.
- `sourceRef`: server constructs it; clients never submit a complete sourceRef. Google speaker key
  is normalized email; Google submission key is normalized title; Trello/Notion key is immutable
  provider record ID; file speaker key is normalized email; file submission key is normalized
  title. Resulting form is `<provider>:<source-id>:<target>:<source-key>` with source IDs omitted
  for local files. A changed submission title is intentionally a new manual/Sheet row; this
  limitation is displayed below those templates.

## Backend / API

### Affected Existing Functions

| Type | Function / path | Current behavior | Required change |
|---|---|---|---|
| Convex mutation | `speakers.bulkImport` (`convex/speakers.ts:45-105`) | CSV-only speaker + optional accepted talk import; skips duplicate emails | Move shared row-write logic into `convex/importRows.ts`; retain this function as a compatibility wrapper until callers/tests move. |
| Convex internal mutation | `speakers.upsertBySourceRef` (`convex/speakers.ts:326-366`) | Upserts one remote speaker by sourceRef | Before insert, check `by_event_email`; return `{ created:false, skippedReason }` for an email owned by another sourceRef. Preserve update behavior for an exact sourceRef. |
| Convex internal mutation | `submissions.upsertBySourceRef` (`convex/submissions.ts:475-511`) | Upserts one remote submission by sourceRef | Add optional `speakerId` arg and set it for speaker-row past talks; preserve existing callers when absent. |
| Convex query/internal mutations | `contentIntegrations.*` (`convex/contentIntegrations.ts:24-113`) | Notion/Airtable/Sanity provider unions and encrypted record CRUD | Expand provider/auth/config validators and OAuth state/pending validators exactly as in schema. Status remains credential-free. |
| Convex action | `contentIntegrationsActions.startOAuth` (`convex/contentIntegrationsActions.ts:127-135`) | Starts Notion/Airtable OAuth and stores state | Add Google Sheets and optional `returnTo`; Trello uses a separate start action because its fragment-token flow differs. |
| Convex internal action | `completeOAuthCallback` (`convex/contentIntegrationsActions.ts:137-146`) | Exchanges Notion/Airtable code and creates pending credentials | Add Google token exchange/refresh fields and return the stored `returnTo`. |
| HTTP GET | `/oauth/notion/callback`, `/oauth/airtable/callback` (`convex/http.ts:34-59`) | Exchanges code and redirects to event Settings | Add Google route; choose `/onboarding` when OAuth state says onboarding, otherwise preserve event Settings redirect. Never place token/code in final redirect. |
| Convex action | `importNotion` (`convex/contentIntegrationsActions.ts:229-335`) | Reads and writes up to 200 Notion rows | Extract read/map into a preview helper; add `previewNotion`; keep import result compatible while repo maps it to the unified result. |
| React component | `ImportDataStep` (`src/pages/onboarding/steps/ImportDataStep.tsx:27-165`) | Owns CSV parsing, preview, import, and success UI | Become the multi-source orchestration shell described below. |
| React page | `OnboardingWizard` (`src/pages/onboarding/OnboardingWizard.tsx:146-650`) | Renders import step at step 5 and finishes onboarding | Pass `onFinish`; stop duplicating a second Finish control outside the import shell; preserve Back and Skip. |
| Settings page | `Integrations` (`src/pages/settings/Integrations.tsx:168-230`) | Shows Notion/Airtable/Sanity | Add Google Sheets and Trello cards/dialogs using the shared provider panels. |

### New Convex Functions

All functions below are repo methods in `src/data/repo.ts`, transport operations in
`src/data/transport.ts`, and mappings in `src/data/convex/index.ts`.

#### Local file import

**`importRows.importManual`** — mutation in `convex/importRows.ts`

- Args:
  `{ eventId: Id<"events">, source: "csv" | "markdown", target: "speakers" | "submissions", rows: Array<SpeakerRow | SubmissionRow> }`.
- `SpeakerRow` contains every `SpeakerImportPreviewRow` field except `id` and `error`.
- `SubmissionRow` contains every `SubmissionImportPreviewRow` field except `id` and `error`.
- Returns `ImportResult` with `hasMore: false`.
- Validates organizer access, event existence, target/kind agreement, ≤500 rows, every field and
  status, and recomputes provider-prefixed sourceRef from `sourceKey`.
- Creates/updates through `speakers.upsertBySourceRef` and `submissions.upsertBySourceRef`.
- For a speaker `talkTitle`, calls `formTemplates.ensureImportForm` with
  `internalName: "Imported talks"`, then upserts the accepted linked submission with source key
  `<speaker-source-key>:talk` and `answers.abstract`.

#### Google Sheets

**`contentIntegrationsActions.startOAuth`** — existing action, expanded

- Args: `{ eventId: Id<"events">, provider: "notion" | "airtable" | "google_sheets", target: ImportTarget, returnTo?: "onboarding" | "settings" }`.
- Returns `{ url: string }`.
- Google URL: `https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code`, exact
  callback URL, random state, `access_type=offline`, `include_granted_scopes=true`,
  `prompt=consent`, and scope `https://www.googleapis.com/auth/spreadsheets.readonly`.

**HTTP `GET /oauth/google-sheets/callback`** — `convex/http.ts`

- Query: provider sends `code`, `state`, or `error`.
- Exchanges at `https://oauth2.googleapis.com/token` using server-only client ID/secret and exact
  redirect URI; stores encrypted `{ accessToken, refreshToken?, expiresAt? }` in pending state.
- Redirects to `/onboarding?content_oauth=<pendingId>&provider=google_sheets` or the event Settings
  path. Error redirects carry only `content_oauth_error`, never provider response bodies.

**`contentIntegrationsActions.getGoogleSpreadsheet`** — action

- Args: `{ eventId: Id<"events">, pendingId: string, spreadsheetInput: string }`.
- Returns `{ spreadsheetId: string, title: string, sheets: Array<{ sheetId: number, title: string }> }`.
- Parses a bare ID or Google URL; validates pending user/event/provider; refreshes access token if
  needed; calls `GET https://sheets.googleapis.com/v4/spreadsheets/{id}?fields=properties.title,sheets.properties(sheetId,title)`.
- 401 → reconnect message; 403/404 → inaccessible-sheet message; 429 → retry-later message.

**`contentIntegrationsActions.finishGoogleSheetsOAuth`** — action

- Args: `{ eventId: Id<"events">, pendingId: string, spreadsheetId: string, sheetName: string }`.
- Returns `{ status: "connected" }`.
- Revalidates metadata and worksheet membership, consumes pending credentials, and upserts
  `provider:"google_sheets"`, `authMethod:"google_oauth"`, `direction:"pull"`, target from pending,
  config IDs, hint `Google OAuth`, expiry, and current user.

**`contentIntegrationsActions.previewGoogleSheets`** — action

- Args: `{ eventId: Id<"events"> }`; returns `ImportPreview`.
- Loads/refreshed encrypted OAuth, requests the escaped range `'<sheet>'!A1:Z502` through
  `spreadsheets.values.get`, maps header row by exact documented names, and returns at most 500
  data rows. It writes no event records.

**`contentIntegrationsActions.importGoogleSheets`** — action

- Args: `{ eventId: Id<"events"> }`; returns `ImportResult`.
- Re-reads the source rather than trusting preview rows, validates/mutates through shared import
  helpers, records `lastSyncedAt`, and stores provider error state on failure.

#### Trello

**`contentIntegrationsActions.startTrelloAuthorization`** — action

- Args: `{ eventId: Id<"events">, target: ImportTarget, returnTo?: "onboarding" | "settings" }`.
- Returns `{ url: string }`.
- Creates a 10-minute hashed OAuth-state row, then builds `https://trello.com/1/authorize` with
  server-configured `TRELLO_API_KEY`, `name=Namos Sessions`, `scope=read`, `expiration=30days`,
  `response_type=token`, `callback_method=fragment`, and a same-origin return URL containing the
  opaque state. No write/account scope.

**`contentIntegrationsActions.completeTrelloAuthorization`** — action

- Args: `{ eventId: Id<"events">, state: string, token: string }`.
- Returns `{ pendingId: string }`.
- Auth-checks the event, atomically consumes user/event/provider-bound state, validates token via
  `GET https://api.trello.com/1/members/me?fields=id,fullName`, encrypts it into 15-minute pending
  credentials, and never returns the token.

**`contentIntegrationsActions.listTrelloBoards`** — action

- Args: `{ eventId: Id<"events">, pendingId: string }`.
- Returns `Array<{ id: string, name: string }>` from
  `GET /1/members/me/boards?fields=id,name&filter=open` after pending ownership validation.

**`contentIntegrationsActions.finishTrelloAuthorization`** — action

- Args: `{ eventId: Id<"events">, pendingId: string, boardId: string }`.
- Returns `{ status: "connected" }`.
- Confirms the selected board is accessible, consumes pending credentials, and upserts
  `provider:"trello"`, `authMethod:"trello_token"`, `direction:"pull"`, pending target,
  `config:{trelloBoardId}`, hint `Trello token`, and `oauthExpiresAt` 30 days from authorization.

**`contentIntegrationsActions.previewTrello`** — action

- Args: `{ eventId: Id<"events"> }`; returns `ImportPreview`.
- Uses board nested resources, not per-card loops: board lists; visible cards with
  `fields=id,name,desc,idList` and `customFieldItems=true`; custom-field definitions only for
  speaker target. Maps ≤500 cards and returns `hasMore` when the provider response exceeds that.

**`contentIntegrationsActions.importTrello`** — action

- Args: `{ eventId: Id<"events"> }`; returns `ImportResult`.
- Re-reads source, maps card IDs to `sourceRef = trello:<boardId>:<target>:<cardId>`, imports
  through shared helpers, and persists last-sync/error state.

#### Notion preview and generic disconnect

**`contentIntegrationsActions.previewNotion`** — action

- Args `{ eventId: Id<"events"> }`; returns `ImportPreview` for the first 500 mapped pages without
  writes. It reuses `queryNotionDatabase` and existing field mappings.
- Existing `importNotion` remains the confirmed writer; map its existing count result into the
  unified result without altering established sourceRefs.
- Expand `disconnect` provider validator to Google Sheets and Trello.

### Environment Configuration

Append placeholders to `.env.example` beside current content OAuth values:

```dotenv
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
TRELLO_API_KEY=your-trello-power-up-api-key
```

Extend the callback comment to include `/oauth/google-sheets/callback`. These are read only through
`process.env` inside Convex Node actions; no `VITE_` equivalent is allowed.

### Provider Modules

- `convex/googleSheetsSync.ts`: URL/ID parsing, token refresh, metadata/values fetch, row mapping,
  escaped A1 range construction, provider-specific errors.
- `convex/trelloSync.ts`: authorization URL, member/board validation, nested board fetches, custom
  field decoding, list/status mapping, rate-limit messages.
- `convex/importRows.ts`: public manual mutation plus internal canonical row validators and write
  helpers shared by remote actions.
- No third-party provider SDK. Native `fetch` matches current `notionSync.ts` and avoids adding a
  large client dependency for a small read-only surface.

## Frontend Components

### Modified Components

| File | Exact change |
|---|---|
| `src/pages/onboarding/OnboardingWizard.tsx` | Keep step 5 and `ErrorBoundary`; pass `eventId`, `onBack={goBack}`, and `onFinish={complete}` to the import shell. Remove the duplicate bottom Back/Finish controls for this step; the shell owns them so nested provider states cannot be bypassed accidentally. Keep `Skip and finish` visible in the shell. |
| `src/pages/onboarding/steps/ImportDataStep.tsx` | Replace CSV-specific component with source/state orchestrator and shared header/footer. |
| `src/pages/onboarding/importCsv.ts` | Generalize target-specific CSV parsing and canonical validation; preserve exports used by current tests or update tests atomically. |
| `src/components/shared/NotionIntegrationForm.tsx` | Extract reusable provider body hooks/props and accept return destination + compact onboarding presentation; do not duplicate OAuth logic. |
| `src/pages/settings/Integrations.tsx` | Add Google Sheets and Trello cards/dialogs, with status loading included in the existing parallel load. |
| `src/data/types.ts`, `src/data/repo.ts`, `src/data/transport.ts`, `src/data/convex/index.ts` | Add contracts and operations listed above. |
| `src/lib/analytics.ts` | Add safe `onboarding_import_source_selected`, `onboarding_import_previewed`, and `onboarding_import_completed` schemas with only `source`, `target`, and aggregate counts. |

### New Components

#### `ImportSourceChooser`

- File: `src/pages/onboarding/steps/ImportSourceChooser.tsx`
- Props:
  ```ts
  interface ImportSourceChooserProps {
    value: OnboardingImportSource | null;
    onSelect: (source: OnboardingImportSource) => void;
  }
  ```
- Location: onboarding step 5, immediately below title/description.
- Container: `grid gap-3 sm:grid-cols-2`; CSV occupies no special oversized tile.
- Each source is a real `<button type="button">` with
  `rounded-[12px] bg-card p-4 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`.
- Elements per card: 9×9 `rounded-[10px] bg-primary/10 text-primary` icon container using
  existing Lucide icons (`FileSpreadsheet`, `Table2`, `PanelsTopLeft`, `FileText`, `Braces`),
  `text-sm font-medium` name, `mt-1 text-xs text-muted-foreground` description. No blue button or
  blue provider branding.
- Exact labels/descriptions: `CSV — Upload a spreadsheet export`, `Google Sheets — Connect a live
  worksheet`, `Trello — Import cards from one board`, `Notion — Connect an existing database`,
  `Markdown — Upload a structured Markdown table`.
- Selected card: `bg-primary/10 ring-2 ring-primary/35`; pressing Enter/Space selects it and moves
  focus to the target chooser.

#### `ImportTargetChooser`

- File: `src/pages/onboarding/steps/ImportTargetChooser.tsx`
- Props:
  ```ts
  interface ImportTargetChooserProps {
    value: ImportTarget;
    onChange: (target: ImportTarget) => void;
    disabled?: boolean;
  }
  ```
- Location: top of every selected-source panel.
- Elements: label `Import into`; two-button segmented control with `Speakers` and `Submissions`.
  Wrapper `inline-flex rounded-[10px] bg-muted p-1`; active button
  `rounded-[8px] bg-background px-3 py-2 text-sm font-medium`; inactive button
  `rounded-[8px] px-3 py-2 text-sm text-muted-foreground hover:text-foreground`.
- Changing target clears preview/result and source-specific selection after a confirmation when
  unsaved preview data exists; it never changes an already-saved integration silently.

#### `FileImportPanel`

- File: `src/pages/onboarding/steps/FileImportPanel.tsx`
- Props:
  ```ts
  interface FileImportPanelProps {
    eventId: EventId;
    source: "csv" | "markdown";
    target: ImportTarget;
    onImported: (result: ImportResult) => void;
  }
  ```
- Location: source detail below target chooser.
- Elements:
  - Outline button `Download CSV template` or `Download Markdown template`.
  - Helper text listing required/optional target columns and, for submissions, `Changing a title
    later is treated as a new manual row.`
  - Dropzone button `rounded-[12px] bg-card p-8 text-center hover:bg-primary/10`; Upload icon;
    label `Drop a CSV file or click to choose` or Markdown equivalent; hidden file input accepting
    `.csv,text/csv` or `.md,.markdown,text/markdown,text/plain`.
  - Parsing state: existing `SkeletonList rows={3}` with `Parsing CSV…`/`Parsing Markdown…`.
  - Empty error: `No data rows found.`; format error includes exact expected columns.
  - Preview: shared `ImportPreviewTable`.
  - Primary button `Import {validCount} rows`, disabled for zero valid rows or while importing;
    spinner + `Importing…` while pending.
  - Ghost button `Choose a different file` clears file, preview, and errors.
  - Inline destructive error `rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive`.
- Behavior: parser never interprets formulas/scripts; Markdown parser locates exactly one table,
  unescapes `\|`, strips alignment row, rejects a second table, and returns plain text only.

#### `GoogleSheetsImportPanel`

- File: `src/pages/onboarding/steps/GoogleSheetsImportPanel.tsx`
- Props: `{ eventId: EventId; target: ImportTarget; returnTo: "onboarding" | "settings"; onImported?: (result: ImportResult) => void }`.
- Disconnected elements: scope explanation; primary `Connect Google Sheets` button; inline OAuth
  error. Redirecting state shows Loader2 + `Redirecting…` and disables controls.
- OAuth-return elements: label `Spreadsheet URL or ID`; text input
  `bg-muted rounded-[10px] h-11`, placeholder `https://docs.google.com/spreadsheets/d/...`;
  `Continue` button. Loading shows `Checking spreadsheet…`.
- After metadata: readonly spreadsheet title; labeled worksheet Select with placeholder
  `Choose a worksheet`; primary `Use this worksheet`.
- Connected elements: success StatusBadge, selected spreadsheet/worksheet, `Preview rows` button,
  and ghost `Choose a different sheet` that disconnects only after AlertDialog confirmation.
- Preview/import uses shared table and confirmation. Provider errors are inline and retain input so
  the user can correct an inaccessible URL.

#### `TrelloImportPanel`

- File: `src/pages/onboarding/steps/TrelloImportPanel.tsx`
- Props identical to Google panel except provider-specific implementation.
- Disconnected elements: explanation `Namos requests read-only access for 30 days`; button
  `Connect Trello`; inline authorization error.
- Return behavior: `useEffect` reads query `content_auth` and hash `token`/`error`, immediately runs
  `history.replaceState` to clear the entire hash, calls `completeTrelloAuthorization`, and stores
  only returned `pendingId`.
- Pending elements: labeled Board Select, placeholder `Choose a board`, options from
  `listTrelloBoards`; `Connect board` button.
- Speaker-target help panel lists exact required custom fields. Submission target describes card
  name/list/description mapping.
- Connected elements: status, board name, `Preview cards`, confirmation table, disconnect
  AlertDialog, loading and error states matching Google.

#### `NotionOnboardingImportPanel`

- File: `src/pages/onboarding/steps/NotionOnboardingImportPanel.tsx`
- Props: `{ eventId: EventId; target: ImportTarget; onImported: (result: ImportResult) => void }`.
- Composes the refactored Notion connection body with `returnTo="onboarding"`; it must not copy
  credential or OAuth code from `NotionIntegrationForm`.
- Adds a `Preview rows` step before calling the existing confirmed import action.
- If an existing Notion connection targets the other record type, show exact text
  `Notion is connected for {target}. Disconnect it in Settings to change the target.` and buttons
  `Use {target}` / `Choose another source`; do not silently repoint it during onboarding.

#### `ImportPreviewTable`

- File: `src/pages/onboarding/steps/ImportPreviewTable.tsx`
- Props:
  ```ts
  interface ImportPreviewTableProps {
    preview: ImportPreview;
    target: ImportTarget;
    busy: boolean;
    onConfirm: () => void;
    onReset: () => void;
  }
  ```
- Uses existing `DataGrid`, `rowActivation="none"`, `minWidth={680}`, `ariaLabel="Import preview"`.
- Speaker columns: First name, Last name, Email, Talk title, Status. Submission columns: Title,
  Status, Notes, Validation. Invalid status is `text-destructive`; ready is plain `Ready`.
- Beneath: `{valid} rows ready to import, {invalid} rows will be skipped.`; when `hasMore`, add
  destructive-neutral warning `Only the first 500 rows are shown. Narrow or split the source.`
  and disable confirm.
- Primary confirm and ghost reset buttons as described above.

#### `ImportResultPanel`

- File: `src/pages/onboarding/steps/ImportResultPanel.tsx`
- Props: `{ result: ImportResult; onAnother: () => void; onFinish: () => void; finishing: boolean }`.
- Elements: heading `Data imported`; sentence listing nonzero created/updated speaker/submission
  counts; skipped count; collapsible `Review skipped rows` list with source label and reason;
  outline `Import another source`; primary `Finish setup` with Loader2/`Finishing…`.
- Empty-success handling: if all rows skipped, heading `Nothing new was imported`, keep skipped
  disclosure, and still offer another source or finish.

## State / Data Flow

### Local file

```text
ImportDataStep selectedSource/target
→ FileImportPanel reads File.text()
→ parseCsvForTarget or parseMarkdownTable
→ validateImportRows returns ImportPreview (no write)
→ organizer confirms
→ repo.importRows.importManual({eventId, source, target, valid rows})
→ assertEventOrganizerAccess
→ per-row upsertBySourceRef / duplicate-email skip / optional linked past talk
→ ImportResultPanel
→ Import another resets nested state OR Finish calls organizers.completeOnboarding
```

### Google / Notion authorization-code sources

```text
panel connect click
→ startOAuth({eventId, provider, target, returnTo:"onboarding"})
→ content_oauth_states (hashed, 10 min)
→ provider consent
→ Convex HTTP callback consumes state + exchanges code
→ encrypted content_oauth_pending (15 min)
→ redirect /onboarding?content_oauth=...&provider=...
→ panel validates/selects provider container
→ finish provider action consumes pending + writes content_integrations
→ preview action reads provider, returns normalized rows only
→ confirm action re-reads source + writes rows
→ reactive status/result render
```

### Trello fragment source

```text
startTrelloAuthorization → hashed content_oauth_states → Trello consent
→ /onboarding?content_auth=<state>&provider=trello#token=<secret>
→ panel immediately clears hash
→ completeTrelloAuthorization({eventId,state,token})
→ token validation + encrypted content_oauth_pending
→ list boards → finish selection → content_integrations
→ previewTrello → confirm importTrello → result
```

### Component Local State

- `ImportDataStep`: `selectedSource: OnboardingImportSource | null`, `target: ImportTarget`,
  `result: ImportResult | null`, `finishing: boolean`.
- `FileImportPanel`: `file: File | null`, `preview: ImportPreview | null`, `parsing: boolean`,
  `importing: boolean`, `error?: string`.
- `GoogleSheetsImportPanel`: `integration`, `pendingId`, `spreadsheetInput`, `spreadsheetMetadata`,
  `sheetName`, `connecting`, `loadingMetadata`, `saving`, `previewing`, `importing`, `preview`,
  `error`.
- `TrelloImportPanel`: `integration`, `pendingId`, `boards`, `boardId`, `completingToken`,
  `loadingBoards`, `saving`, `previewing`, `importing`, `preview`, `error`.
- `NotionOnboardingImportPanel`: existing Notion states plus `preview`, `previewing`.
- Repo completion/status calls trigger local state updates; Convex subscriptions update saved
  integration status. A target/source change explicitly clears stale preview/result.

### DB-to-UI Trace

- Saved provider status: `content_integrations` → `contentIntegrations.status` (credential removed
  at `convex/contentIntegrations.ts:24-35`) → repo `ContentIntegration` → provider status badge,
  selected source name, and last-sync text.
- Provider rows: external API response → provider mapper → `ImportPreview.rows` → panel state →
  `ImportPreviewTable` cells. Preview is not persisted.
- Confirmed rows: provider/manual action → `speakers`/`submissions` + import form → aggregate
  `ImportResult` → `ImportResultPanel`. Sensitive row data is not returned after confirmation.

## Auth / Permissions

- `/onboarding` remains behind Clerk authentication and the existing incomplete-onboarding route
  guard in `src/App.tsx:165,305`.
- Creating the organization/event occurs before step 5 (`OnboardingWizard.tsx:309-332`), so every
  import action has an event to scope.
- Queries/mutations call `assertEventOrganizerAccess` (`convex/functions.ts:121-130`); Node actions
  call the established `assertEventOrganizerAction` pattern used by current integrations.
- OAuth states bind `identity.subject`, event, provider, target, and return destination. Finish/list
  actions compare the current identity and event before decrypting pending credentials.
- Integration status may be read by event members under current `assertEventAccess`, but no status
  response includes `credentialEnvelope`; import/connect/disconnect remain organizer-only.
- No import surface is public. Speaker portal users cannot access organizer imports.

## Edge Cases & Error States

| Scenario | Required handling |
|---|---|
| No source selected | Show chooser; Finish is not implied; `Skip and finish` remains explicit. |
| Empty CSV/Markdown/table | `No data rows found.`; no network call. |
| Multiple Markdown tables or prose-only file | Reject with `Use one Markdown table with the documented headers.` |
| File >500 rows | Reject locally with current split-file guidance; server independently enforces cap. |
| Missing required headers | Show exact expected headers for selected target. |
| Some invalid rows | Preview all rows; invalid rows are marked and excluded; valid rows may proceed. |
| All rows invalid | Confirm disabled; keep reset and skip actions enabled. |
| Duplicate speaker email | Skip and report; never overwrite a differently sourced speaker. |
| Exact provider sourceRef rerun | Update mapped fields and count as updated. |
| Manual/Sheet submission title changes | Treated as new row; display this limitation before import. |
| OAuth denied | Return to same onboarding source with readable denial and reconnect action. |
| OAuth state expired/replayed/wrong user | Reject, delete expired state when found, and require reconnect. |
| Onboarding refresh mid-OAuth | Query/pending state resumes when valid; otherwise source chooser remains usable. |
| Google access token expired | Refresh with encrypted refresh token; if unavailable/revoked, mark error and request reconnect. |
| Google Sheet URL malformed | Keep input, show `Enter a Google Sheets URL or spreadsheet ID.` |
| Worksheet renamed/deleted | Preview fails specifically and offers choose/reconnect; no writes. |
| Google app not verified/configured | Surface configuration failure; implementation cannot be considered deploy-ready until consent verification and production callback are proven. |
| Trello token in fragment | Clear synchronously before provider/network work; never log or send to analytics. |
| Trello token expires/revokes | Mark integration error and show reconnect. |
| Trello board archived/inaccessible | Specific board-access error; no import. |
| Trello custom fields missing | Each affected card is invalid with missing-field reason; cards are not silently dropped. |
| Trello/Google 429 | Show retry-later message; preserve connection; do not loop. |
| Provider partial fetch fails | Preview/import fails before writes where possible. For per-row mutation failure, retain explicit skipped reason and counts; never claim full success. |
| Existing Notion target differs | Do not repoint; explain and allow using existing target or another source. |
| User changes source with preview present | Confirm discard; changing before preview needs no confirmation. |
| User presses Back | Return to mobile step without completing onboarding; saved provider connection remains manageable. |
| User skips | Complete onboarding exactly once through current idempotent mutation; no provider disconnect. |
| User imports zero new rows | Show `Nothing new was imported`, skipped detail, another-source and finish actions. |
| Mobile 390px | Cards stack; tables scroll inside their viewport; action buttons wrap; no page-level horizontal overflow. |

## Testing Strategy

- Unit: CSV speaker/submission validation, Markdown table parsing/escaped pipes/multiple tables,
  Google URL parsing/range escaping/row mapping, Trello custom-field/list mapping, canonical source
  refs, 500-row caps, duplicate email behavior, provider error mapping.
- Component: source and target keyboard selection; file states; Google/Notion query-parameter OAuth
  resume; Trello fragment extraction and immediate clearing; preview/result/skip/back/finish;
  connected-target mismatch; no sensitive analytics payloads.
- Contract: repo operation names resolve in Convex adapter; provider unions remain synchronized
  across schema, types, transport, actions, and disconnect.
- Browser: full onboarding from saved event through every source; consent redirects for Google,
  Trello, Notion; persisted data checked in Speakers/Abstracts; repeat imports; Settings management;
  390px viewport; denial, expired state, invalid file, inaccessible source, and 429 fixture states.
- Regression: current `src/test/onboarding-import.test.ts`, content integrations, route guards,
  Airtable/Sanity, and `npm run check`.

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Work packaging | One FULL feature/issue | The sources share one onboarding experience, canonical preview/result contract, auth storage, and verification journey; separate issues would duplicate and risk incompatible contracts. |
| Google discovery | Paste URL/ID, then choose worksheet | Avoids Drive-wide scopes and Google Picker configuration while still importing live Sheets data. |
| Google scope | `spreadsheets.readonly` only | Read-only and narrower than Drive access; edits are out of scope. |
| Trello auth | `/1/authorize`, read scope, 30-day fragment return + Namos state nonce | Matches current official Trello API; fragment is cleared immediately and token is encrypted. |
| Markdown format | One GFM table | Deterministic and previewable without AI or a new parser dependency. |
| Provider SDKs | None | Current provider modules use native fetch; exact endpoints are small and package versions are unnecessary. |
| Import semantics | Preview then explicit confirm | Avoids writes during source discovery and makes skipped/invalid rows visible. |
| Deletes | Never | Import is migration/pull, not authoritative synchronization. |
| Source mapping | Existing `sourceRef` with provider prefixes | Current indexes and Notion/Airtable behavior already establish this contract. |
| Onboarding completion | Separate explicit action after result | Lets organizers import multiple sources and prevents a successful partial import from unexpectedly ending setup. |

## Dependencies

**Requires:** production Google OAuth app + Sheets API enabled + consent verification; Trello Power-Up
API key and allowed return origins; existing content encryption key; exact callback URLs configured
in Convex and provider consoles; an event saved before step 5.

**Enables:** later reuse of Google Sheets/Trello connections from Settings, lower-friction migration
from organizer tools, and future target-specific import templates without redesigning onboarding.

## Risks & Mitigations

- **OAuth provider setup can block live proof:** track provider-console setup as a deployment gate;
  local mocks/unit tests are not production OAuth evidence.
- **Trello fragment briefly contains a token:** clear the fragment before any await/log/analytics and
  exchange it for an opaque pending ID immediately.
- **Fixed mappings may not match organizer data:** publish templates/help text, preview errors, and
  never auto-map ambiguous fields.
- **Large sources can exceed action time:** hard cap 500, nested Trello reads, bounded Google range,
  no per-card loops, manual retry.
- **One integration per provider/event:** existing unique lookup behavior is retained and the UI
  confirms before replacing a selected container.
- **Cross-source duplicates:** duplicate speaker email check fails safe; submissions use provider
  source refs and disclose title-key limitations for tabular/manual sources.
- **Existing dirty documentation work:** implementation must preserve unrelated work and edit the
  feature index narrowly; no bulk doc formatting.
