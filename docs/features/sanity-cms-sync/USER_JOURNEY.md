# Sanity CMS Sync — User Journey

## User
An authenticated event organizer on an existing event, who also runs a Sanity-powered public
marketing/event website.

## Starting State
Organizer is signed in, has at least one event with some published agenda sessions and
confirmed speakers, has a Sanity project with `namosSession` and `namosSpeaker` document types
already added to its schema, and has created an API token with Editor (write) permissions at
manage.sanity.io.

## Entry Point
Organizer navigates to `Settings > Integrations` and sees a "Sanity" card in the "Content
sources" section.

## User Journey Steps
1. Organizer clicks the "Sanity" card. A dialog opens with the not-connected form: help text
   about required document types and token permissions, Project ID/Dataset/API Token fields.
2. Organizer fills in their project ID, dataset name (e.g. "production"), and API token, then
   clicks "Connect".
3. The app validates read access and write permission against Sanity. On failure (invalid
   token, wrong project/dataset, or a read-only token), the specific error shows inline and
   nothing is saved. On success, the panel switches to connected state.
4. Organizer clicks "Publish now"; button spinners and disables during the run.
5. Publish completes: "22 published" is shown (or "20 published, 2 failed" with an expandable
   list of which sessions/speakers failed and why).
6. Organizer opens Sanity Studio and confirms the sessions and speakers appear as documents,
   correctly linked (each session references its speakers).
7. Organizer later publishes another session in Namos Sessions (marks it `isPublished`),
   returns to Settings > Integrations, opens the Sanity card, and clicks "Publish now" again.
   The new session appears as a new Sanity document; previously published sessions are updated
   in place (same `_id`s), not duplicated.

## Expected Outcome
Sanity documents matching this event's published sessions and confirmed speakers exist in the
target dataset, re-publishable without creating duplicates, with failures surfaced per-document
rather than silently dropped.

## Visible Success State
- Sanity `IntegrationCard` shows "Connected" and "Publishing to {dataset}".
- Sanity Studio shows `namosSession`/`namosSpeaker` documents matching the event's public
  program.
- Each publish run shows an inline published/failed summary in the dialog.

## Failure & Recovery States
- **Invalid token** → "That API token isn't valid." → organizer re-copies the token and retries.
- **Read-only token** → "That token doesn't have write access — create one with Editor
  permissions in manage.sanity.io." → organizer creates a new token with correct permissions.
- **Project/dataset not found** → "That project ID or dataset wasn't found." → organizer
  corrects and retries.
- **Sanity schema missing `namosSession`/`namosSpeaker` types** → those documents show up in
  the "failed" list with Sanity's validation error as the reason → organizer adds the document
  types in their Sanity schema and re-publishes.
- **More than 100 published sessions+speakers** → summary shows "more remain" → organizer clicks
  "Publish now" again to continue.

## Persistence Expectations
- After refresh: card state persists; published Sanity documents are unaffected by anything in
  this app (they live in Sanity's own dataset).
- After logout/login: connection state is per-event server state, unaffected.
- After disconnect: card returns to "Not connected"; documents already published to Sanity
  remain there — disconnecting stops future publishes, it does not remove existing ones (stated
  explicitly in the connected panel's help text before the organizer disconnects).

## Frontend Wiring Trace
1. Click "Sanity" card → `setSanityModalOpen(true)` → `Dialog` renders `SanityIntegrationForm`.
2. Click "Connect" → `repo.contentIntegrations.connectSanity({eventId, projectId, dataset,
   apiToken})` → Convex action `contentIntegrationsActions.connectSanity` → Sanity read +
   write-permission validation → `content_integrations` upsert → status re-fetch → connected
   panel.
3. Click "Publish now" → `repo.contentIntegrations.publishSanity({eventId})` → Convex action
   `publishSanity` → query published `agenda_items` + confirmed `speakers` → build documents →
   batched Sanity mutate calls → `internal.agenda.setSanityDocId` /
   `internal.speakers.setSanityDocId` write-back → `{published, failed, hasMore, failures}` →
   summary + optional failures list rendered.
4. Click "Disconnect" → confirm dialog → `repo.contentIntegrations.disconnect({eventId,
   provider:"sanity"})` → row deleted → card returns to "Not connected"; no Sanity-side deletion
   occurs.
