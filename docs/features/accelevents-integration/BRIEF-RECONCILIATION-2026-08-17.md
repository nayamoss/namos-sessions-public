# Accelevents Integration — Audit and Reconciliation

**Date:** 2026-08-17
**Status:** Planned. **No Accelevents code exists in this repository.**
**Applies to:** `requirements.md`, `design.md`, `plan.md`, `USER_JOURNEY.md` in this folder, all
dated 2026-08-12.

This document audits the existing four-document package against the codebase as it stands on `main`
today, rather than duplicating it. Where the existing documents are still correct — which is most
of them — they stand unchanged. Where they encode an architecture that has since been replaced,
the reconciliation is recorded here and the affected section is superseded.

---

## 1. Implementation status: nothing exists

`grep -ril accelevents` across the repository (excluding `node_modules`, `dist`, `.git`) returns
**documentation only**:

```
docs/features/accelevents-integration/{requirements,design,plan,USER_JOURNEY}.md
docs/features/{event-workspace-switching,public-api,speaker-operations}/design.md
docs/research/{competitors,customer-complaints}.md
docs/user-journeys/pages/integrations.md
docs/features/INDEX.md
```

No table in `convex/schema.ts`. No `convex/accelevents*.ts`. No UI in
`src/pages/settings/Integrations.tsx`. No environment variable in `.env.example`. Brief requirement
7 is **MISSING**, not partial.

## 2. What the existing package gets right — keep as-is

| Area | Verdict |
|---|---|
| One-way scope discipline | **Keep.** Out-of-scope list (no attendees, ticketing, webhooks, two-way merge, remote deletion, OAuth) matches the brief exactly |
| Eligibility rules | **Keep.** Accepted speakers; accepted + published + scheduled sessions; everything else skipped with a visible reason |
| Speakers before sessions | **Keep.** FR-010's ordering constraint is correct and non-negotiable |
| Idempotency model | **Keep.** External id + SHA-256 `sourceHash`; no remote write when unchanged; recreate-and-remap when a remote record was deleted |
| Four-table schema | **Keep.** `accelevents_integrations` / `_entity_mappings` / `_sync_runs` / `_sync_items` with their indexes are well shaped, and `credentialEnvelope` already matches the house `{ version: 1, iv, ciphertext, tag }` shape |
| Never auto-delete remotely | **Keep.** Local ineligibility reports `Needs attention`; it never deletes remotely |
| Phase 1 external contract gate | **Keep, and treat as binding.** `plan.md` T001–T004 require proving the speaker↔session association against a real disposable event *before* implementation, and T003 says to stop and mark the feature blocked if the API cannot do it. That is exactly right, and it is the discipline the competing entry did not apply |
| Field mapping | **Keep.** Deferring track/tag export until contract tests prove the remote payload is the correct call |

**The Phase 1 gate is the most valuable thing in the existing package.** It should not be relaxed
under schedule pressure.

## 3. What must be reconciled — superseded

### R-1 — `EVENT_ADMIN_USER_IDS` does not exist and must not be created

**Existing text:** `requirements.md` FR-002 and `design.md:161, 435, 495` gate every integration
endpoint on "a verified Clerk session whose user ID is present in `EVENT_ADMIN_USER_IDS`".
`plan.md` T006 makes enforcing it a task.

**Reality:** there is no such variable anywhere in `.env.example`, `convex/`, or `src/`.
Authorization in this codebase is row-based:

- `organizations` — the tenant boundary (`convex/schema.ts:38-42`)
- `organizers` — owner/admin rows, explicitly *"a database row, never an env var or hardcoded
  list"* (`convex/schema.ts:43-47`)
- `event_members` — per-event organizer/reviewer rows (`convex/schema.ts:107-127`)
- `convex/functions.ts` — `requireIdentity`, `assertEventAccess`, `assertEventOrganizerAccess`,
  `isEventOrganizer`

An env-var admin allowlist would also violate the standing rule against hardcoding admin lists.

**Superseded by:** every Accelevents query and mutation uses `assertEventOrganizerAccess`
(`convex/functions.ts:121`); every action uses the `assertEventOrganizerAction` pattern already
used throughout `convex/commsActions.ts`. `requirements.md` FR-002 and `design.md` §Auth are
replaced accordingly. `plan.md` T006 is dropped.

### R-2 — Two of the three proposed secrets are unnecessary

**Existing text:** `design.md:498-500` and `plan.md` T007 propose
`ACCELEVENTS_INTEGRATION_ENCRYPTION_KEY`, `ACCELEVENTS_INTEGRATION_SERVICE_SECRET`, and
`ACCELEVENTS_SCHEDULER_SECRET`.

**Reality:**

- A **service secret** was needed when integration functions were reachable only by a trusted
  server-to-server caller. With `assertEventOrganizerAccess` the caller is an authenticated
  organizer; a shared secret adds a second, weaker authorization path. Drop it.
- A **scheduler secret** was needed for an external trigger. Convex has `cronJobs`, and
  `speaker-communications-delivery/` introduces `convex/crons.ts` for the same reason. An internal
  cron needs no secret and no public HTTP route. Drop it.
- The **encryption key** is genuinely needed and follows the existing pattern:
  `EMAIL_INTEGRATION_ENCRYPTION_KEY` and `CONTENT_INTEGRATION_ENCRYPTION_KEY` already exist in
  `.env.example` (lines 48 and 50) and are consumed by `convex/credentialEncryption.ts`.

**Superseded by:** exactly one new entry in `.env.example`:

```
# Convex deployment env. Base64-encoded 32-byte key, distinct from the email and content keys.
ACCELEVENTS_INTEGRATION_ENCRYPTION_KEY=replace-with-a-different-base64-32-byte-key
```

Encryption uses `convex/credentialEncryption.ts`'s `encrypt` / `decrypt` unchanged.

### R-3 — Clerk mounting is already done

**Existing text:** `plan.md` T005 asks for a refactor of `src/data/provider.tsx`,
`src/data/backend.ts`, and `src/components/AccountMenu.tsx` so that configured Convex deployments
mount Clerk.

**Reality:** Clerk is mounted app-wide in `src/App.tsx`, with `RequireAuth`, `RequireOnboarding`,
sign-in/sign-up routes, and a portal path deliberately excluded from organizer onboarding
(`App.tsx:304-321`). Multi-tenant organizations shipped under #191/#192.

**Superseded by:** T005 is dropped as already satisfied. Verify rather than build.

### R-4 — Tenancy is now explicit

**Existing text:** the package predates `organizations` and describes scope as `eventId` only.

**Reality:** `events.organizationId` (`convex/schema.ts:159`) is the tenant boundary, and
everything below an event inherits through it (`convex/schema.ts:154-157`).

**Superseded by:** `eventId` scoping remains correct and sufficient — the four Accelevents tables
inherit their tenant through `events`, exactly as `rooms`, `speakers`, and `agenda_items` do. No
`organizationId` column is added. The reconciliation is that this is now a documented inheritance,
not an unstated assumption. `requirements.md`'s "Organization-wide integrations… out of scope" line
stands.

### R-5 — There is a house integration pattern now; follow it

**Existing text:** the package describes a bespoke "integrations service" distinct from the
`Repository`.

**Reality:** `email_integrations` (`convex/schema.ts:605-618`) and `content_integrations`
(`:619-644`) established the pattern: an `eventId`-indexed row, `credentialHint` +
`credentialEnvelope`, `status` / `lastError` / `lastSyncedAt`, credentials resolved only inside
actions, and a card on `src/pages/settings/Integrations.tsx`. Notion, Airtable, and Sanity all use
it (#216/#219/#220, converted to OAuth under #226/#232).

**Superseded by:** Accelevents becomes a fourth card on the existing Integrations page, following
the same shape. `NFR-008`'s point — that this is not the swappable program-data `Repository` — is
retained and is correct.

### R-6 — Sync scheduling uses Convex crons

**Existing text:** `requirements.md` specifies hourly dispatch outside 48 hours and 15-minute
dispatch inside; `NFR-005` says the scheduler only dispatches.

**Reality:** no cron infrastructure exists yet. `speaker-communications-delivery/` introduces
`convex/crons.ts`.

**Superseded by:** the cadence requirement stands. Its implementation is a Convex `cronJobs` entry
dispatching an `internalAction` that enqueues per-event sync actions — the same claim-then-dispatch
shape specified in `speaker-communications-delivery/design.md`. The two features should share the
cron file, not each invent one.

### R-7 — Auto-sync default

**Existing text:** `autoSyncEnabled` is a configurable flag.

**Reconciliation:** it must default to **false**, and the seeded demo integration must be
disconnected (`requirements.md` FR-014 already says "disconnected and completed-run states without
real credentials" — good). A seeded event that auto-syncs on a schedule to a live third-party
service is not acceptable in a demo deployment.

## 4. The completion bar

`requirements.md`'s success metrics and `plan.md`'s Phase 1 already state this; it is restated here
because it is the point on which the competing entry fell short.

**Requirement 7 is not complete until:**

1. A real disposable Accelevents event exists and real credentials are configured.
2. One sync run creates a speaker remotely.
3. The same run creates a session remotely.
4. That session is **associated with that speaker** remotely, verified by reading the record back.
5. A rerun with no local changes performs **zero** remote writes.

A mocked run, a recorded fixture, or a UI that reports success with no credentials configured does
**not** satisfy this. If credentials cannot be obtained, requirement 7 is reported as
`PARTIAL — integration surface built, remote contract unverified`, stated plainly. This is
decision D-4 in `kill-my-saas-brief/plan.md`.

## 5. Net effect on the existing plan

| Existing task | Disposition |
|---|---|
| T001–T004 (contract gate) | **Keep, binding** |
| T005 (mount Clerk) | **Drop** — already done |
| T006 (`EVENT_ADMIN_USER_IDS`) | **Replace** with `assertEventOrganizerAccess` / `assertEventOrganizerAction` |
| T007 (three secrets) | **Reduce** to one encryption key |
| T008 (secret-leak tests) | **Keep** |
| T009 (four tables) | **Keep** |
| T010–T011 (service-secret-only functions) | **Rewrite** as organizer-gated Convex functions |
| T012 (isolation / idempotency tests) | **Keep**, adding a cross-organization isolation case alongside the existing `src/test/multi-tenant-isolation.test.ts` |
| Everything after | **Keep**, re-checked against the above |

Estimated saving from reconciliation: the entire Phase 2 authentication foundation, which is
already built.
</content>
