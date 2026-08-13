# Accelevents One-Way Integration — Implementation Plan

## Phase 1: External Contract Gate

- [ ] T001: Obtain an owner-generated Accelevents API key with API access and create a disposable
  Accelevents event matching one local seeded event. Do not place credentials in repository files.
- [ ] T002: Against the disposable event, prove and record sanitized request/response fixtures for
  list/create/update speaker and list/create/update session.
- [ ] T003: Prove the exact request needed to associate an external speaker with an external
  session, retrieve the session, and confirm the relationship. If the API cannot do this, stop and
  mark the feature blocked; do not implement a speakers-and-sessions sync that silently loses the
  relationship.
- [ ] T004: Confirm API-key header name/format, pagination shape, event URL + event ID validation,
  rate-limit headers, error bodies, and the actual type of `linkedIn`; encode sanitized fixtures in
  `src/test/fixtures/accelevents/`.

## Phase 2: Authentication and Secret Foundation

- [ ] T005: Refactor `src/data/provider.tsx`, `src/data/backend.ts`, and
  `src/components/AccountMenu.tsx` so configured Convex deployments mount Clerk and sensitive
  organizer pages can obtain a bearer token; retain an explicit auth-disabled demo mode.
- [ ] T006: Extract/reuse the existing server-side Clerk verification pattern and enforce
  `EVENT_ADMIN_USER_IDS` on every integration endpoint.
- [ ] T007: Add `ACCELEVENTS_INTEGRATION_ENCRYPTION_KEY`,
  `ACCELEVENTS_INTEGRATION_SERVICE_SECRET`, and `ACCELEVENTS_SCHEDULER_SECRET` placeholders to
  `.env.example`; document generation and Convex placement without committing secrets.
- [ ] T008: Add encryption/decryption tests proving an API key never appears in status responses,
  errors, or serialized fixtures.

## Phase 3: Schema and Service Boundary

- [ ] T009: Add the four exact tables and indexes from `design.md` to `convex/schema.ts`; no
  backfill and no provider fields on existing domain tables.
- [ ] T010: Implement `convex/acceleventsIntegrations.ts` service-secret-only status, upsert,
  toggle, result, list-auto-sync, and disconnect functions.
- [ ] T011: Implement `convex/acceleventsSync.ts` export, mapping, run, item, claim, update, latest,
  and completion functions with atomic active-run protection.
- [ ] T012: Add Convex tests for event isolation, secret rejection, mapping idempotency, duplicate
  run prevention, run aggregation, and disconnect history retention.

## Phase 4: Accelevents Client and Mapping

- [ ] T013: Build the Accelevents client in the Convex Node-action layer with native fetch, abort timeouts,
  pagination, Zod validation, sanitized errors, and the sandbox-proven request shapes.
- [ ] T014: Build canonical speaker mapping for names/email/pronouns/bio/LinkedIn/X/headshot plus
  exact normalized-email fallback only when no external mapping exists.
- [ ] T015: Build canonical session mapping for title/description/event-timezone start/end/room,
  default format and visibility, and proven speaker association.
- [ ] T016: Hash a stable, sorted JSON serialization of mapped fields using SHA-256; skip remote
  writes when mapping and hash are unchanged.
- [ ] T017: Implement `404` recreation, unique-email recovery for duplicate-speaker response,
  connection-fatal auth errors, item-fatal validation errors, and three bounded retries for
  `429`/`5xx`/network failures.
- [ ] T018: Add fixture-backed client/mapper tests including non-ASCII text, timezone boundaries,
  missing optional fields, duplicate emails, immutable remote email, stale IDs, and incomplete
  sessions.

## Phase 5: Server Endpoints and Background Processing

- [ ] T019: Implement authenticated `accelevents-status`, `accelevents-connect`,
  `accelevents-preview`, `accelevents-sync-start`, `accelevents-sync-run`,
  `accelevents-settings`, and `accelevents-disconnect` functions with the exact schemas in
  `design.md`.
- [ ] T020: Make connect test both speaker and session host endpoints before encrypting/saving the
  API key; never save on failure.
- [ ] T021: Build deterministic preflight eligibility and reasons. Speakers are processed before
  sessions, and any invalid/unmapped speaker blocks their sessions.
- [ ] T022: Implement `accelevents-sync-background.mjs`: claim run, persist every success before
  advancing, update mappings, preserve partial results, and complete aggregate status.
- [ ] T023: Implement the every-15-minute scheduled dispatcher and hourly/within-48-hours cadence
  selection; dispatch to background rather than doing remote work within the scheduled function.
- [ ] T024: Add stale-run recovery and guarantee scheduler/manual requests return the existing
  active run rather than racing.
- [ ] T025: Add integration tests with a fake Accelevents server for full success, partial failure,
  retry/resume, remote deletion/recreate, no-op resync, scheduler cadence, and disconnect.

## Phase 6: Frontend UI

> A feature is not done until an organizer can connect, preview, sync, understand failures, retry,
> and disconnect through the running application without developer tools.

### UI Spec

**Location:** Configure sidebar > Integrations > Accelevents, `/settings/integrations`.

**Integrations page elements:**

- App chrome title `Integrations`; no subtitle in the header.
- Skeleton cards while the event and status load.
- Event-empty card with `Create an event before connecting integrations.`
- Responsive, borderless card grid.
- Accelevents card with plug icon, concise description, live status badge, last-success text, and
  `Configure`/`View sync` action.
- Inline detail pane, never a modal/sheet/dialog, for connection, preview, run detail, or disconnect.

**Connect elements and behavior:**

- Event URL slug, numeric event ID, password API-key input, automatic-sync switch.
- Link to Accelevents' API-key instructions.
- `Cancel` and accent `Test and connect`; the latter is disabled when invalid/testing.
- Invalid credentials stay on the form with an alert; successful credentials are cleared from
  component state and the connected status plus review screen appear.

**Preview elements and behavior:**

- Eligible Speakers, Eligible Sessions, Unchanged, and Blocked count cards.
- Speaker/Session grouped rows with create/update/unchanged/skip badges.
- Exact per-row blocking reasons; no generic `Invalid data` bucket.
- Empty state when nothing is eligible.
- `Back` and accent `Start sync`; Start disabled when nothing can sync or the external association
  contract is unproven.

**Sync elements and behavior:**

- Connection summary and masked credential hint.
- Automatic-sync switch with cadence explanation.
- `Review sync`, accent `Sync now`, timestamps, progress, aggregate counts, and per-item outcomes.
- Poll every two seconds while queued/running; announce changes with `role=status`.
- Partial runs show `Retry failed`; retry never re-sends successful unchanged items.
- Error copy remains safe/actionable and never renders a remote body or secret.

**Disconnect elements and behavior:**

- Warning says Accelevents records remain and automatic sync stops.
- Type `DISCONNECT`; destructive button disabled until exact; Cancel preserves everything.
- Success returns card to `Not connected`, keeps historical run evidence, and sends no remote delete.

### Tasks

- [ ] T026: Add lazy `/settings/integrations` route, Configure navigation item, design-system title
  entry, UI inventory, and page inventory proof row.
- [ ] T027: Build `IntegrationsPage` and `AcceleventsIntegrationCard` with loading, empty, auth,
  error, connected, syncing, and attention states.
- [ ] T028: Build `AcceleventsConnectPanel` with exact fields, validation, secret handling, and
  test-and-connect behavior.
- [ ] T029: Build `AcceleventsPreview` with count cards and complete row-level eligibility reasons.
- [ ] T030: Build `AcceleventsSyncPanel` with persisted status, two-second polling, progress,
  results, toggle, manual sync, and retry.
- [ ] T031: Build inline `AcceleventsDisconnectConfirm` with exact typed confirmation.
- [ ] T032: Add component tests for keyboard activation, semantic status/error announcements,
  disabled states, secret clearing, polling cleanup, retry, and disconnect confirmation.

## Phase 7: Seed, Documentation, and Verification

- [ ] T033: Add secret-free seed states for disconnected, successful run, partial run, and blocked
  preflight; do not fake a connected credential.
- [ ] T034: Update `docs/features/INDEX.md`, `docs/ROADMAP.md`, `docs/CONTEXT.md`,
  `docs/PAGES.md`, `docs/UI-INVENTORY.md`, `docs/DESIGN-SYSTEM.md`, `.env.example`, setup docs, and
  README integration limits in the same feature commit.
- [ ] T035: Run `npm run typecheck`, `npm test`, `npm run build`, `npm run lint`, `git diff --check`,
  and the repository secret scanner. Root `tsconfig.json` is not sufficient; retain the existing
  `tsconfig.app.json` + Convex command.
- [ ] T036: Run through `USER_JOURNEY.md` in a real browser using the existing project server only;
  prove connected, preview, first sync, Accelevents-side records/associations, no-op resync, mapped
  update, refresh persistence, recoverable failure/retry, automatic toggle, and disconnect.
- [ ] T037: Inspect browser network payloads, built assets, Cloudflare/Convex logs, and stored Convex
  documents to prove the API key is absent everywhere except its encrypted envelope.
- [ ] T038: Run the scheduled function manually in a deploy preview and prove the published deploy's
  next schedule; keep deployment proof separate from local checks and browser proof.

## Task Dependencies

```text
T001-T004 external contract
  -> T013-T018 client/mapping

T005-T008 auth/secrets + T009-T012 schema/service
  -> T019-T025 endpoints/workers
  -> T026-T032 UI
  -> T033-T038 release verification
```

The critical path stops at T003 if Accelevents cannot associate speakers with sessions through an
available API. Do not round a partial export up to completion.

## Verification Checklist

- [ ] Every acceptance criterion in `requirements.md` has automated evidence or a named browser/provider proof.
- [ ] Feature is reachable from Configure > Integrations and usable without developer tools.
- [ ] External speaker/session association is proven in a disposable Accelevents event.
- [ ] Initial sync, no-op resync, mapped update, retry, automatic dispatch, and disconnect work.
- [ ] Accelevents-only fields survive resync.
- [ ] Local ineligibility does not delete remote data and is visibly reported.
- [ ] No duplicates are created after retries, scheduler overlap, refresh, or repeated clicks.
- [ ] API key is encrypted at rest and absent from browser responses, logs, and build artifacts.
- [ ] Auth-disabled demo mode does not expose connection or sync actions.
- [ ] All tests/build/lint/diff/secret checks pass or remaining pre-existing warnings are itemized.
- [ ] Live browser proof, deployed scheduled-function proof, and provider-side proof are reported separately.
- [ ] Feature docs/index/page inventories are current in the same commit.
