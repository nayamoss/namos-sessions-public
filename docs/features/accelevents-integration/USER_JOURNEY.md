# Accelevents One-Way Integration — User Journey

## User

An authenticated event administrator responsible for publishing an accepted conference program
from this application into the event's existing Accelevents registration/attendee platform.

## Starting State

- The organizer is signed into this application's admin workspace with a verified Clerk account
  whose user ID is authorized in `EVENT_ADMIN_USER_IDS`.
- One local event exists with its real timezone/date window.
- The event has accepted speakers and accepted submissions; syncable submissions have published
  agenda items, rooms, start/end times, and assigned speakers.
- The organizer has owner access to an eligible Accelevents account, an API key, the destination
  event URL slug, and its numeric event ID.
- No Accelevents connection exists for this local event on first use.

## Entry Point

The organizer signs in, opens the Configure section in the application sidebar, and selects
`Integrations`. They do not visit a hidden route, call an API, or open a database console.

## User Journey Steps

1. The Integrations page loads the active local event and current integration status.
2. The organizer sees an Accelevents card labeled `Not connected` with the explanation that it
   sends accepted speakers and scheduled sessions to Accelevents.
3. The organizer selects `Configure`. An inline detail pane opens beside the main card grid.
4. The organizer enters the Accelevents event URL slug, numeric event ID, and API key, and chooses
   whether automatic sync should be enabled.
5. The organizer selects `Test and connect`.
6. The application verifies their Clerk session and administrator authorization, tests both
   Accelevents speaker and session access for the named event, encrypts the API key server-side,
   and clears it from frontend state.
7. The card changes to `Connected`; the detail pane advances to `Review sync`.
8. The application derives eligible accepted speakers and accepted/published/scheduled sessions,
   compares them with external mappings/hashes, and shows create/update/unchanged/skip counts.
9. The organizer reviews any blocked rows. Each row names the exact missing or invalid field (for
   example, missing speaker email or session outside the destination event dates).
10. If blocked data exists, the organizer leaves Integrations, fixes it in the owning Profile,
    Abstracts, Agenda, or Event Settings screen, returns to Integrations, and selects `Review sync`
    again.
11. When the preview is acceptable, the organizer selects `Start sync`.
12. The application queues a background run. The UI shows queued/running progress and updates
    speaker results before session results.
13. The server creates or updates each speaker, immediately stores the external mapping, and then
    creates or updates sessions using the mapped external speaker IDs.
14. The run reaches `Succeeded` or `Partial`. The UI shows created, updated, unchanged, skipped,
    and failed counts plus a safe result for every row.
15. The organizer opens Accelevents and visibly confirms the speakers, sessions, schedule values,
    rooms, and speaker-session relationships exist there.
16. The organizer changes one mapped field locally, returns, reviews, and runs another sync. Only
    that changed record is updated; unchanged records are not written again.
17. If a retryable row failed, the organizer selects `Retry failed`; completed records are not
    duplicated and only the failed slice runs again.
18. The organizer enables automatic sync. The UI persists the choice and explains the hourly
    cadence, increasing to every 15 minutes when the event is live or within 48 hours.
19. Later, the organizer may select `Disconnect`, read that remote records will remain, type
    `DISCONNECT`, and confirm. Automatic sync stops, the credential is removed, and the card returns
    to `Not connected` while non-secret run history remains.

## Expected Outcome

The organizer can see the accepted speakers and scheduled sessions in Accelevents with their
speaker-session relationships, without manually re-entering the program and without turning
Accelevents into a second source of truth.

## Visible Success State

- The integration card says `Connected`.
- The latest run says `Succeeded` (or explicitly itemizes a `Partial` result).
- Aggregate counts and per-record results are visible in this application.
- A second unchanged preview labels all mapped records `Unchanged`.
- The corresponding speakers, sessions, times, rooms, and relationships are visible in the
  Accelevents event.
- Automatic sync visibly shows its saved enabled/disabled state and last successful timestamp.

## Failure & Recovery States

- Missing local event -> `Create an event before connecting integrations.` -> create/save Event
  Settings and return.
- Signed out or unauthorized -> `Sign in as an event administrator to manage integrations.` ->
  sign in with an allowed account; no secret form is shown meanwhile.
- API unavailable on the Accelevents plan -> connection test explains plan/API access is required
  -> obtain access or leave disconnected.
- Invalid key/event slug/event ID -> no connection is saved -> correct the fields and retry.
- Missing speaker/session fields -> preview row names the owner screen and missing value -> fix the
  source record and rerun preview.
- Duplicate remote speaker email -> sync maps only one exact match; multiple matches fail visibly ->
  organizer resolves duplicates in Accelevents, then retries.
- Remote speaker email cannot change after login -> the row shows the immutable-email error ->
  organizer aligns the source/remote address manually and retries; no duplicate is created.
- Rate limit/network/5xx -> server retries three times, persists completed items, then marks a safe
  partial failure -> organizer selects `Retry failed` later.
- Credentials revoked during a run -> connection changes to `Needs attention`; remaining items stop
  -> organizer reconnects with a valid key and retries.
- Remote mapped record deleted -> next sync recreates it and updates the mapping -> result says
  `Created` rather than failing forever.
- Local record becomes ineligible/deleted -> no remote delete occurs -> integration reports `Needs
  attention` and the organizer decides what to do in Accelevents.
- Refresh/browser close during a run -> reopening Integrations reloads the persisted latest run and
  resumes polling -> no duplicate run is queued.
- Disconnect attempted during a run -> action is disabled until the run is terminal (or a queued
  run is cancelled) -> organizer then confirms disconnection safely.

## Persistence Expectations

- After refresh: connection status, masked hint, automatic-sync preference, latest run, item
  outcomes, mappings, and timestamps remain; the raw key is never repopulated.
- After navigating away and returning: the same state reloads from the server, not browser storage.
- After logout/login: an allowed organizer sees the same event-scoped state; an unauthorized user
  sees no integration data or controls.
- After a different browser session: status and run history remain because they are server-persisted.
- After worker/deployment restart: queued/running data remains recoverable and retries remain
  idempotent through mappings and source hashes.
- After disconnect/reconnect: historical non-secret runs remain; a new key is required; existing
  mappings may be reused only after the same destination event identity is retested.

## Frontend Wiring Trace

| User action | Handler | Backend/service action | Visible result |
|---|---|---|---|
| Open Integrations | `IntegrationsPage.load` | `repo.events.list` + authenticated GET status | Card badge, timestamps, latest run |
| Configure card | `setPanel("connect")` | none | Inline connection pane opens |
| Test and connect | `AcceleventsConnectPanel.submit` | POST connect -> auth -> Accelevents list tests -> encrypted Convex upsert | Key field clears; card `Connected`; preview opens |
| Review sync | `loadPreview` | POST preview -> build export + mappings/hashes | Counts, operations, and row reasons |
| Start sync | `startSync` | POST start -> persisted queued run/items -> background invocation | Queued run ID and progress UI |
| Watch progress | polling effect | GET run -> Convex run/items | Live aggregate and row status updates |
| Retry failed | `retryFailed` | POST start with failed run ID -> failed slice only | New retry run; successes remain untouched |
| Toggle automatic sync | `setAutoSync` | PATCH settings -> Convex integration patch | Switch and cadence copy persist |
| Scheduler fires | no browser action | scheduled dispatcher -> active-run guard -> background run | Latest run/timestamp updates next visit |
| Disconnect | `confirmDisconnect` | POST disconnect -> verify typed confirmation -> delete credential/config | Card `Not connected`; history retained |

## Completion Gate

This journey is not complete from mocks, source inspection, local tests, or Accelevents API calls
alone. Verification must drive the running app in a browser and separately inspect the disposable
Accelevents event to prove the remote speaker/session relationships. Deployment schedule proof,
browser proof, and provider-side proof must be reported as separate gates.

