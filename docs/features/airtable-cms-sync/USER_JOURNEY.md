# Airtable CMS Sync — User Journey

## User
An authenticated event organizer on an existing event.

## Starting State
Organizer is signed in, has at least one event, and has an Airtable base with a table of
speaker or submission data, plus a personal access token created at
airtable.com/create/tokens with `data.records:read` scope granted on that base.

## Entry Point
Organizer navigates to `Settings > Integrations` and sees an "Airtable" card in the "Content
sources" section (next to the Notion card, if that feature has also shipped).

## User Journey Steps
1. Organizer clicks the "Airtable" card. A dialog opens with the not-connected form: help text
   on creating a personal access token, Token/Base ID/Table Name fields, and an "Import into"
   dropdown.
2. Organizer fills in the token, base ID (from the Airtable API docs page for their base),
   table name, selects "Submissions", and clicks "Connect".
3. The app validates the token against Airtable. On failure, the specific error shows inline
   and nothing is saved. On success, the panel switches to connected state.
4. Organizer clicks "Import now"; button spinners and disables during the run.
5. Import completes: "8 created, 0 updated" shown.
6. Organizer navigates to the event's Submissions page — the imported submissions appear with
   titles and statuses populated from Airtable.
7. Organizer edits a record's Status in Airtable from Pending to Accepted, returns and clicks
   "Import now" again — the existing submission's status updates in place, no duplicate row
   appears.

## Expected Outcome
Submission (or speaker) records matching the Airtable table exist in the event, re-runnable
without duplication.

## Visible Success State
- Airtable `IntegrationCard` shows "Connected" and "Imports into submissions".
- The event's Submissions list shows the imported records.
- Each import run shows an inline created/updated/skipped summary.

## Failure & Recovery States
- **Invalid/insufficient-scope token** → "That personal access token isn't valid, or doesn't
  have access to this base." → organizer fixes the token's scope/base access in Airtable and
  retries.
- **Base or table not found** → "That base or table wasn't found — check the base ID and table
  name." → organizer corrects and retries.
- **Table renamed after connecting** → next import fails, card shows "Error" status with the
  reason → organizer reconnects with the new table name.
- **Row missing required field** → counted as skipped, shown to organizer, rest of import
  proceeds.

## Persistence Expectations
- After refresh: card state and imported records persist exactly as any other event data.
- After logout/login: connection is per-event server state, unaffected.
- After disconnect: card returns to "Not connected"; imported records remain untouched.

## Frontend Wiring Trace
1. Click "Airtable" card → `setAirtableModalOpen(true)` → `Dialog` renders
   `AirtableIntegrationForm`.
2. Click "Connect" → `repo.contentIntegrations.connectAirtable({eventId, personalAccessToken,
   baseId, tableName, target})` → Convex action `contentIntegrationsActions.connectAirtable` →
   Airtable validation call → `content_integrations` upsert → status re-fetch → connected panel.
3. Click "Import now" → `repo.contentIntegrations.importAirtable({eventId})` → Convex action
   `importAirtable` → Airtable paginated list call → per-record
   `internal.speakers.upsertBySourceRef` / `submissions.` → `{created,updated,skipped,hasMore}`
   → summary text renders.
4. Click "Disconnect" → confirm dialog → `repo.contentIntegrations.disconnect({eventId,
   provider:"airtable"})` → row deleted → card returns to "Not connected".
