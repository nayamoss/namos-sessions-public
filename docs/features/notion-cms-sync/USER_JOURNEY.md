# Notion CMS Sync — User Journey

## User
An authenticated event organizer (already an event member/organizer per
`assertEventOrganizerAction`) on an existing event.

## Starting State
Organizer is signed in, has at least one event, and has a Notion database already populated
with speaker or submission data, shared with a Notion internal integration they created
themselves at notion.so/my-integrations (outside this app).

## Entry Point
Organizer navigates to `Settings > Integrations` from the app sidebar (existing nav item — no
new route needed) and sees a new "Notion" card in the integrations grid.

## User Journey Steps
1. Organizer clicks the "Notion" card. A dialog opens showing the not-connected form: help
   text explaining how to create a Notion internal integration and share a database with it,
   a Token field, a Database ID field, and an "Import into" dropdown (Speakers/Submissions).
2. Organizer pastes their Notion internal integration token and database ID, selects "Speakers",
   and clicks "Connect".
3. The app calls Notion to validate the token and confirm the database is shared with it. If
   either check fails, the dialog shows the specific error inline and nothing is saved —
   organizer corrects and retries.
4. On success, the dialog switches to the connected panel: a green "Connected" badge, "Importing
   into speakers", and an "Import now" button.
5. Organizer clicks "Import now". The button shows a spinner and disables.
6. Import completes. The panel shows "12 created, 2 updated" (and "3 skipped" if any rows were
   missing a required field).
7. Organizer closes the dialog and navigates to the event's Speakers page — the imported
   speakers are visible there with names, emails, and bios populated from Notion.
8. Organizer edits their Notion database (adds a row, fixes a typo in an existing row), returns
   to Settings > Integrations, opens the Notion card again, and clicks "Import now" a second
   time. The new row is created; the edited row is updated in place — the Speakers page shows
   no duplicates.

## Expected Outcome
Speaker (or submission) records matching the Notion database exist in the event, re-runnable
without creating duplicates, with the organizer able to see exactly how many rows were
created/updated/skipped on each run.

## Visible Success State
- The Notion `IntegrationCard` on Settings > Integrations shows a green "Connected" badge and
  "Imports into speakers" detail text.
- The event's Speakers (or Submissions) list shows the imported records with real data.
- Each "Import now" run shows an inline created/updated/skipped count in the dialog.

## Failure & Recovery States
- **Invalid token** → dialog shows "That token isn't valid." → organizer re-copies the token
  from Notion and retries; nothing was saved.
- **Database not shared with integration** → dialog shows "That database isn't shared with your
  Notion integration yet." → organizer shares the database in Notion (Share > invite the
  integration) and retries.
- **Notion rate limit during import** → panel shows the rate-limit error with when to retry;
  organizer waits and clicks "Import now" again — already-imported rows are untouched.
- **Row missing required field (no email, no title)** → not an error; counted in "skipped" and
  shown to the organizer, rest of the import proceeds normally.

## Persistence Expectations
- After refresh: the Notion card still shows "Connected" and the correct target; imported
  speakers/submissions persist in the event exactly as any other speaker/submission would.
- After logout/login: connection state is per-event in Convex, unaffected by the organizer's
  session — reappears identically.
- After disconnect: the card returns to "Not connected", but previously imported
  speakers/submissions remain in the event unchanged (only the credential is deleted).

## Frontend Wiring Trace
1. Click "Notion" card → `setNotionModalOpen(true)` → `Dialog` renders `NotionIntegrationForm`.
2. Click "Connect" → `repo.contentIntegrations.connectNotion({ eventId, notionToken,
   notionDatabaseId, target })` → Convex action `contentIntegrationsActions.connectNotion` →
   Notion API validation → `content_integrations` upsert → action returns `{status:"connected"}`
   → form re-fetches `repo.contentIntegrations.status({eventId, provider:"notion"})` → renders
   connected panel.
3. Click "Import now" → `repo.contentIntegrations.importNotion({eventId})` → Convex action
   `contentIntegrationsActions.importNotion` → Notion database query → per-row
   `internal.speakers.upsertBySourceRef` (or `submissions.`) → action returns
   `{created, updated, skipped, hasMore}` → form sets local `lastImportSummary` state → summary
   text renders.
4. Click "Disconnect" → confirm `AlertDialog` → `repo.contentIntegrations.disconnect({eventId,
   provider:"notion"})` → Convex action deletes the row → dialog closes →
   `Integrations.tsx`'s `loadContentIntegrationStatus` re-fetches → card returns to
   "Not connected".
