# Public Events API — Implementation Plan

## Phase 1: Schema Migration (do this fully, alone, before Phase 2)
- [x] T001: Add optional `startsAt`/`endsAt` alongside optional legacy `startDate`/`endDate`, and
      temporarily allow both lowercase and uppercase event status literals in `convex/schema.ts`
      (additive cutover; readers project old rows into the new shape until backfill runs).
- [x] T002: Add `description`, `contactEmail`, `logoFileId` (`v.optional(v.string())`) and
      `programPublishedAt` (`v.optional(v.number())`) to `events` in `convex/schema.ts`.
- [x] T003: Write `convex/migrations/eventsRenameFields.ts` — an internal mutation that backfills
      every existing `events` row: `startsAt = startDate`, `endsAt = endDate`,
      `status = uppercase(status)` (`draft→DRAFT`, `published→ACTIVE`, `archived→ARCHIVED`).
- [x] T004: Run the migration mutation via `npx convex run` in dev. The newly provisioned
      deployment initially contained zero rows; after seeding, all three representative rows were
      verified with final date fields and `DRAFT`/`ACTIVE`/`ARCHIVED` statuses.
- [x] T005: Update every reader/writer of `startDate`/`endDate` to `startsAt`/`endsAt`:
      `convex/eventValidation.ts`, `convex/events.ts`, `convex/publicForms.ts`, `convex/seed.ts`,
      `src/data/types.ts`, `src/components/availability/AvailabilityEditor.tsx`,
      `src/pages/portal/PortalAvailability.tsx`, `src/pages/settings/EventDetails.tsx`,
      `src/pages/public/SubmissionPage.tsx`, `src/pages/program/Readiness.tsx`,
      `src/pages/program/Availability.tsx`, `src/pages/program/Agenda.tsx`,
      `src/pages/onboarding/OnboardingWizard.tsx`, and the 5 test files that reference these
      fields (`src/test/portal-handoff.test.tsx`, `src/test/availability-editor.test.tsx`,
      `src/test/data-adapter.contract.test.ts`, `src/test/readiness.test.ts`,
      `src/test/reviewer-queue.test.tsx`).
- [x] T006: Update every reader/writer of `events.status` literal values (NOT
      `submissions`/`evaluations`/`submission_forms` status — those are separate, unrelated enums
      and must not change) to the new `DRAFT`/`ACTIVE`/`ARCHIVED` values: `convex/events.ts`,
      `convex/seed.ts`, `src/pages/settings/EventDetails.tsx`,
      `src/pages/dashboard/DashboardHome.tsx`.
- [x] T007: Run the full test suite; fix any test still asserting old field names/values.
- [x] T008: Once T005-T007 are green in dev, drop `startDate`, `endDate`, and the lowercase
      `status` union member from `convex/schema.ts`. Re-run the migration script one last time in
      prod before deploying the schema drop, then deploy.

## Phase 2: API Key Infrastructure
- [x] T009: Add `api_keys` table to `convex/schema.ts` per design.md (`label`, `keyHash`,
      `keyPrefix`, `createdByUserId`, `createdAt`, `lastUsedAt`, `revokedAt`, indexed
      `by_keyHash`).
- [x] T010: `convex/apiKeys.ts` + `convex/apiKeysActions.ts` — `list` query (organizer-only, via
      `assertOrganizer`, never returns `keyHash`), `generate` Node action (organizer-only,
      generates a cryptographically random `sk_live_` key, stores its sha256 hash + identifying
      prefix, returns the raw key once), `revoke` mutation (organizer-only, sets `revokedAt`).
- [x] T011: Helper `convex/apiKeyAuth.ts` — given a raw `Authorization` header value, hashes and
      looks up `api_keys` by `by_keyHash`, returns the matching row or `null` if missing/revoked;
      also a fire-and-forget `lastUsedAt` patch on success.

## Phase 3: Public HTTP Endpoint
- [x] T012: `convex/http.ts` — add `GET /api/v1/events` route using `httpAction`. Validates the
      Bearer token via the Phase 2 helper (401 on missing/invalid/revoked), queries all `events`,
      maps each to the documented response shape (ISO 8601 strings for all timestamp fields, no
      `orgId`), returns `{ data: Event[] }`. Unhandled errors → 500 with the shared error shape,
      logged via the existing `@sentry/node` wiring.
- [x] T013: Manual verification with `curl` against the live Convex development HTTP action: valid key →
      200 with real data; no header → 401; garbage token → 401; revoked key → 401.

## Phase 4: Frontend UI (REQUIRED — see UI Spec below)

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### UI Spec

**ApiKeys page** — `src/pages/settings/ApiKeys.tsx`, route `/settings/api` (inside existing
authenticated settings shell):
- Location: Settings section, alongside Event Details / Email Delivery / Library / Task
  Templates. Add an "API" entry to whatever settings nav renders those links today.
- Elements:
  - Page header: title "API" only, provided by `AppLayout`. The body begins with the supporting
    copy "Manage keys for the Events API." (`text-sm text-muted-foreground`). No controls or
    metadata render in shell chrome.
  - Toolbar row below header: nothing on the left; "Generate key" button on the right
    (`bg-[#40745C] text-white rounded-[6px]`, no border/shadow).
  - Keys list: one `bg-neutral-100 rounded-[12px] p-4` card per key, `space-y-3` stack, no
    dividers — label, masked key prefix (`font-mono text-sm text-muted-foreground`, e.g.
    `sk_live_a1b2c3d4••••••••`), "Created <date>" / "Last used <date>" or "Never used", "Revoke"
    button (`bg-neutral-200`, right-aligned).
  - Revoke confirmation: `Dialog` — "This immediately stops the key from working. This can't be
    undone." / Cancel / Revoke (dark red bg, white text).
  - Generate flow: the canonical inline `DetailPane` as a flex sibling that pushes the key list
    narrower on desktop and stacks below it on small screens — label text input ("What's this key
    for?"), Cancel + Generate buttons. On success, the pane content swaps to a one-time reveal: raw key
    in a selectable `font-mono` block + Copy button + "This is the only time you'll see this
    key — store it somewhere safe." + Done button.
  - Empty state: `bg-neutral-100 rounded-[12px] p-8`, centered, Lucide `KeyRound` icon (size 40,
    muted), "No API keys yet", "Generate a key to start pulling your events into another tool.",
    CTA "Generate key" (same accent style).
  - Loading state: `bg-neutral-100 rounded-[12px] h-16 animate-pulse` skeleton rows.
  - Error state: inline `text-sm text-destructive` line below the toolbar + "Try again" link.
- Behavior: Generate opens the inline pane; submitting calls `apiKeys.generate`, shows the one-time
  reveal, "Done" closes and the refreshed `apiKeys.list` data updates the list.
  Revoke opens the Dialog; confirming calls `apiKeys.revoke`.
- Data: `useRepo().apiKeys` through `src/data/`; feature code never imports `convex/react`.

**ApiDocs page** — `src/pages/public/ApiDocs.tsx`, public route `/api-docs` (no `AppLayout`, no
auth guard, same pattern as `EmbedPage.tsx`):
- Location: standalone public page using a conventional API-reference shell: compact product
  header, sticky section navigation, central contract documentation, and a sticky code/example
  rail on wide screens that stacks into reading order on narrow screens.
- Elements (in order):
  1. Product header plus section navigation for Overview, Authentication, List events, Event
     object, and Errors.
  2. Overview: "Events API", purpose, API version, base URL, and JSON response format.
  3. Authentication section explains the
     `Authorization: Bearer <key>` header; "Settings → API" renders as a real link to
     `/settings/api` when `useAuth().isSignedIn` is true, plain text otherwise.
  4. "List all events" operation heading followed by a full-width endpoint strip labeled
     `GET REQUEST` and `/api/v1/events`.
  5. Sticky code rail: curl request and realistic `200 OK` response examples in dark,
     horizontally scrollable code surfaces.
  6. Response contract: explicit `200 OK`, `{ data: Event[] }`, and a dense field-definition
     list per the Event object table in design.md. Explicitly note that no `orgId` is returned.
  7. Errors section: shared error shape shown once, then one
     row per status (400, 401, 403, 500) with a one-line description each. Note that 400/403 are
     reserved/currently unreachable (no query params, no per-key permission tiers yet).
  8. Footer: `text-sm text-muted-foreground` plain text — "No rate limit today — fair use
     applies."
  - No loading/error states — fully static content.
- Behavior: static page; only dynamic element is the conditional Settings link described above.
- Data: none from Convex; `useAuth()` from Clerk only.

### Tasks
- [x] T014: Build `ApiKeys.tsx` with every element listed above; wire to the Phase 2
      queries/mutations; handle loading, empty, and error states.
- [x] T015: Add "API" entry to the settings nav and the `/settings/api` route in `src/App.tsx`.
- [x] T016: Build `ApiDocs.tsx` with every element listed above.
- [x] T017: Add the public `/api-docs` route in `src/App.tsx` (outside `RequireAuth`, alongside
      `/e/:eventSlug/:feed`).
- [x] T018: Verify the full flow end-to-end in a real browser: sign in, generate a key from
      `/settings/api`, copy it, open `/api-docs` in an incognito/signed-out tab to confirm it
      reads fine unauthenticated, then `curl` the endpoint with the copied key from a terminal and
      confirm the response matches what the docs page documents. Revoke the key and confirm the
      same `curl` now 401s.

> ⚠️ A feature is NOT done until it is visible and usable in the UI, and until the documented
> contract has been checked against a real `curl` response — not assumed from the code.

## Task Dependencies
Phase 1 blocks Phase 2 and Phase 3 (the endpoint and any UI reading `events.status`/`startsAt`
need the final field names in place). Phase 2 blocks Phase 3 (the endpoint needs the key-auth
helper). Phase 4's `ApiKeys` page needs Phase 2; `ApiDocs` needs nothing but is easiest written
last so its documented examples can be copy-checked against the real Phase 3 response.

## Verification Checklist
- [x] All acceptance criteria in requirements.md met
- [x] Feature is accessible and usable in the UI (not just implemented in the backend)
- [x] `curl` against the live endpoint matches the docs page's documented response exactly
- [x] Revoked and missing/malformed keys both 401
- [x] No regressions in existing event-status/date-range features (Readiness, Availability,
      Agenda, Onboarding Wizard, Event Details, Dashboard) after the Phase 1 rename
- [x] Full test suite green
- [x] Docs updated if needed (this folder)

## Completion Evidence — 2026-08-12

- Provisioned `naya-moss/namos-sessions` with dev `merry-ox-749` and production
  `good-rabbit-379`; the additive schema and backfill ran on both before the final schema cutover.
- Both deployments had zero legacy rows at migration time. Development was then seeded with one
  event per final status and verified to contain only `startsAt`, `endsAt`, and uppercase status.
- A dedicated Clerk application and `convex` JWT template were configured. Browser testing found
  the missing email claim during owner bootstrap; the template was corrected and the full flow
  passed on retest.
- Live curl testing covered valid, missing, malformed, unknown, and revoked keys. Valid requests
  returned all documented fields and updated `lastUsedAt`; revocation took effect immediately.
- Browser regression testing passed Dashboard, Event Settings, Readiness, Availability, Agenda,
  public CFP, onboarding, and speaker portal availability/schedule rendering.
- A browser-review follow-up removed the nested `max-w-3xl` constraint from `/api-docs` and
  replaced the single narrow column with a dedicated wide, responsive reference grid. Retesting
  at 953×1081 and 375×812 confirmed no page-level horizontal overflow; code samples scroll
  within their own surfaces.
- A second visual review found that the wide card grid still did not read as API documentation.
  `/api-docs` was rebuilt around the API-reference convention documented in `design.md`: product
  context, section navigation, a named "List all events" operation, explicit contract metadata,
  dense field definitions, and a dedicated request/response code rail. Browser verification at
  1440×1000, 953×1081, and 375×812 confirmed the responsive structures and no page overflow.
- Post-rebase Phase 4 verification on 2026-08-12 used the dedicated development Clerk app and
  Convex deployment. A signed-in organizer generated and copied a one-time key; `/api-docs`
  rendered signed out with the endpoint, authentication, cURL, all 15 response fields, and all
  error statuses; live cURL returned 200 with DRAFT, ACTIVE, and ARCHIVED events whose fields and
  ISO timestamps matched the docs exactly; “Last used” updated in the UI; revocation removed the
  key and the same request immediately returned structured 401. Missing, malformed, and unknown
  credentials also returned structured 401 responses.
