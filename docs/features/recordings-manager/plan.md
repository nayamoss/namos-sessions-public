# Recordings Manager — Implementation Plan

Route: `/events/:eventSlug/program/recordings` · Authorized event organizer
Requirements: [requirements.md](./requirements.md) · Design: [design.md](./design.md)
Acceptance journey: [USER_JOURNEY.md](./USER_JOURNEY.md)

## Outcome

Ship a recording operations hub that is faster to scan than the reference, keeps attachment and
publication separate, safely stages replacements, and makes the published recording available in
Namos attendee surfaces.

## Phase 0 — Contract and migration safety (4–6h)

- [ ] T001: Add `EventAsset`, `SessionRecording`, manager-row projection, source/status unions, and
  branded IDs to `src/data/types.ts`.
- [ ] T002: Add `event_assets` and `session_recordings` to `convex/schema.ts` with the indexes and
  invariants in design.md.
- [ ] T003: Add an idempotent migration from valid `agenda_items.videoUrl` values into unpublished
  hosted recordings; record invalid values as migration exceptions without deleting them.
- [ ] T004: Add schema and migration tests covering reruns, cross-event mismatches, invalid URLs,
  already-migrated rows, and no implicit publication.

## Phase 1 — Backend lifecycle and repository boundary (10–14h)

- [ ] T005: Implement `convex/recordings.ts` list/get projections with organizer access and
  server-side filters/sort/pagination suitable for 500 sessions.
- [ ] T006: Implement upload-target request and completion using durable storage IDs and direct
  browser-to-storage transfer.
- [ ] T007: Implement hosted URL and existing-event-asset attachment with HTTPS, MIME, configured
  size, event-scope, and agenda-scope validation.
- [ ] T008: Implement publish/unpublish eligibility, including session-end checks and an auditable
  explicit override.
- [ ] T009: Implement `active`/`replacement`/`replaced` roles so the current public recording stays
  live until a ready candidate is promoted atomically through `Publish replacement`.
- [ ] T010: Implement detach/retry plus bounded bulk publish/unpublish with per-record outcomes.
- [ ] T011: Add activity records for every lifecycle mutation and scheduled cleanup for abandoned
  uploads.
- [ ] T012: Add `RecordingsRepo` to the repository, transport, and Convex adapters; add normalization
  parity tests for every read/write.

## Phase 2 — Manager workspace (12–16h)

- [ ] T013: Add the lazy route and Program navigation item directly after Schedule using `Video`.
- [ ] T014: Build `Recordings.tsx` with an identity-only page title and a dedicated `ContentToolbar`
  containing search, styled filters/sort, selection actions, and `Add recording`.
- [ ] T015: Build the coverage strip and manager `DataGrid`; derive Missing, Processing, Ready,
  Published, and Needs attention from backend flags.
- [ ] T016: Add compact mobile cards without a horizontal-scroll dependency.
- [ ] T017: Wire `?session=` and filter query parameters so rows, Readiness links, and browser
  refresh reopen the correct manager state.
- [ ] T018: Build the `RecordingDetailPane` states: missing, source draft, uploading, processing,
  failed, ready draft, published, and staged replacement.
- [ ] T019: Build source-specific forms for Upload, Event asset, and Hosted URL. Use existing app
  dropdown/listbox primitives; ship no visible native selects.
- [ ] T020: Add preview, metadata, history, publish/unpublish, replace, retry, and guarded detach.
- [ ] T021: Add determinate upload progress, cancellation, retryable error copy, toasts, and live
  announcements.
- [ ] T022: Add selection with bulk publish/unpublish. Keep detach/delete out of bulk actions.

## Phase 3 — Public playback and readiness (8–12h)

- [ ] T023: Extend the public agenda projection with a recording only when event, agenda item, and
  recording publication gates all pass.
- [ ] T024: Add attendee-session playback: in-app player for direct files, allowlisted embeds for
  supported hosts, safe external link otherwise.
- [ ] T025: Add an opt-in `recording` field to embed configuration and render it in session detail
  views without changing existing saved embeds unexpectedly.
- [ ] T026: Add recording coverage to Readiness and Program Control Room with deep links to Missing
  and Needs attention filters.
- [ ] T027: Add passive status/linkage in the Agenda session detail pane without duplicating attach
  and publish controls.
- [ ] T028: Extend seed data with all lifecycle states and at least one safe replacement scenario.

## Phase 4 — Verification and release (8–12h)

- [ ] T029: Add backend tests for authorization, cross-event IDs, hosted URL normalization, publish
  eligibility, replacement atomicity, abandoned-upload cleanup, and partial bulk failures.
- [ ] T030: Add component tests for toolbar placement, filters, row/detail routing, upload progress,
  publication confirmation, mobile cards, and no-native-select guardrails.
- [ ] T031: Add public projection tests proving draft, processing, failed, replaced, and cross-event
  recordings never appear publicly.
- [ ] T032: Run `npm run typecheck`, focused tests, the full suite, lint, and production build.
- [ ] T033: Execute every step in `USER_JOURNEY.md` in an authenticated browser at desktop, 390px,
  and dark mode; record evidence and any fixes.
- [ ] T034: Run the migration in a disposable deployment, compare before/after counts, rerun it to
  prove idempotency, then follow the production deployment runbook.
- [ ] T035: Update `docs/features/INDEX.md` with exact verification status and remove the legacy
  `agenda_items.videoUrl` read path only after review.

## Dependencies and sequencing

- Phase 0 precedes every implementation phase because it defines the data and migration boundary.
- Phase 1 must land before the manager UI; temporary in-component mock data is not acceptable.
- Phase 2 and the organizer-only parts of Phase 3 can proceed in parallel after the repository
  contract stabilizes.
- Public playback must not ship before publication/access tests pass.
- Do not add provider automation, transcripts, or editing before the v1 lifecycle passes the full
  acceptance journey.

## Verification checklist

- [ ] Page header contains identity only; all controls live in the toolbar/body.
- [ ] No visible native `<select>` and no sparkle/starburst icon.
- [ ] 500 seeded sessions remain searchable, filterable, and paginated without resolving every
  playback URL.
- [ ] Upload, hosted link, and existing asset sources all reach Ready.
- [ ] Attach never publishes implicitly.
- [ ] Publish before session end is blocked unless explicitly overridden and audited.
- [ ] Failed replacement leaves the previous published recording available.
- [ ] Bulk publication reports eligible, skipped, and failed rows accurately.
- [ ] Attendee site and embeds expose only active published recordings.
- [ ] Refresh, event switch, logout/login, light/dark theme, and mobile layouts pass.
- [ ] Migration is additive, idempotent, and does not discard legacy values.

## Cut line

Keep for v1: event-scoped manager route, dense coverage view, three source modes, direct upload
progress, preview, draft/publish lifecycle, safe replacement, bulk publish/unpublish, public
playback, readiness links, activity history, migration, and full browser verification.

Defer: provider sync, transcoding pipeline, captions/transcripts, chapters, clip editing, playback
analytics, paywalls, speaker-controlled publication, and a general asset-library UI.

**Estimated implementation:** 42–60 hours, including migration and authenticated release proof.
