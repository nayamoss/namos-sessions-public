# Speaker Portal Documents, Onboarding, and Readiness — Plan

**Status:** Planned — DO NOT IMPLEMENT YET
**Phase in `kill-my-saas-brief/plan.md`:** 3, with seed work folded into Phase 1
**Prerequisite to resolve before starting:** whether `ctx.storage.store` is callable from an
`internalMutation` in the pinned Convex version (`convex@^1.42.3`). It determines T5's shape.

## Task breakdown

### T1 — Schema and migration

**Files:** `convex/schema.ts`, `convex/migrations.ts`

1. `speaker_documents`: add `eventId: v.optional(v.id("events"))`, make `submissionId` optional, add
   `.index("by_event", ["eventId"])`.
2. New `internalMutation backfillSpeakerDocumentEvents`: page `speaker_documents`, for each row with
   no `eventId` read `speakerId` → `speaker.eventId` → patch. Idempotent.
3. Document in `docs/deployment/production.md` that the backfill runs immediately after deploy,
   mirroring the existing note for `migrations:backfillOrganizations`.

**Deploy order:** schema (optional fields are safe against existing rows) → backfill → the query
that depends on it. Deploying the query first is harmless because it fails closed.

### T2 — Split the scope helpers

**Files:** `convex/speakerDocuments.ts`

1. `requireOwnScope(ctx, eventId, speakerId, submissionId?)` — current body, with the submission
   check applied only when `submissionId` is provided.
2. `requireReadScope(ctx, eventId, speakerId)` — delegates to `assertOrganizerOrOwnsSpeaker`
   (`convex/speakers.ts:216`).
3. `requestUpload`, `save`, `remove` → `requireOwnScope`. `list` → `requireReadScope`.
4. `save` writes `eventId` from the resolved speaker, never from the client argument.

### T3 — `listForEvent`

**Files:** `convex/speakerDocuments.ts`, `src/data/repo.ts`, `src/data/types.ts`

Organizer-only rollup returning per-speaker counts and `lastUploadedAt`. No storage URL resolution.

### T4 — Organizer UI

**Files:** `src/pages/program/Speakers.tsx`, new `src/components/speakers/SpeakerDocumentsPanel.tsx`

1. Documents section in the speaker detail panel, read-only, grouped per `design.md`.
2. A `Files` indicator column in the speaker list.
3. `?view=missing-files` filter, following the existing `?view=` convention.
4. No new card surface, no border, no divider — reuse the detail panel's section pattern.

### T5 — Portal upload without a submission

**Files:** `src/pages/portal/SpeakerDocuments.tsx`, `src/data/repo.ts`

1. When `submissions.length === 0`, hide the submission select and upload with `submissionId`
   omitted.
2. When submissions exist, add a "Not tied to a session" option that omits it.
3. Group the listing into "Session files" and "Speaker files".

### T6 — Readiness signal

**Files:** `src/lib/speaker-operations.ts`, `src/lib/readiness.ts`,
`src/pages/program/Readiness.tsx`

Add `documentsMissing` to the speaker-operations projection and a readiness row that deep-links to
`/program/speakers?view=missing-files`. Both modules are pure — test without components.

### T7 — Seed

**Files:** `convex/seed.ts` (+ possibly a companion `internalAction`)

Headshots, documents, and an onboarding-state spread including a genuinely overdue task. Note:
`onboarding_tasks.dueDate` values in the seed are fixed `Date.UTC(2026, 8, …)` constants; at least
one must be computed relative to `now` so "overdue" is true whenever the demo is run.

## Test cases

| ID | Type | Case | Expected |
|---|---|---|---|
| TC-1 | contract | `list` called by an organizer of the event | Returns the speaker's documents |
| TC-2 | contract | `list` called by an organizer of a **different** event | Rejected |
| TC-3 | contract | `list` called by a reviewer `event_members` row | Rejected — reviewer is not organizer here |
| TC-4 | contract | `requestUpload` / `save` / `remove` called by an organizer | Rejected — write paths stay speaker-only |
| TC-5 | contract | `save` by the owning speaker with no `submissionId` | Row created with `eventId` and no `submissionId` |
| TC-6 | contract | `save` with a `submissionId` belonging to another speaker | Rejected |
| TC-7 | unit | `save` with a client-supplied `eventId` that differs from the speaker's | `eventId` written from the speaker record, not the argument |
| TC-8 | unit | Migration run twice | No duplicate patches, no errors |
| TC-9 | unit | `listForEvent` before migration, legacy rows only | Returns empty (fails closed), does not throw |
| TC-10 | unit | `listForEvent` returns counts only | No `fileUrl` field in the payload |
| TC-11 | unit | 11 MB upload | Rejected with the existing message |
| TC-12 | unit | `speaker-operations` with a speaker who has zero documents and a slides task | `documentsMissing` true |
| TC-13 | component | Portal Files for a speaker with no submissions | Upload possible, no submission select rendered |
| TC-14 | component | Organizer speaker panel with documents | No upload or delete control present in the DOM |
| TC-15 | contract | Public API / embeds / attendee site | No route or scope exposes `speaker_documents` |
| TC-16 | seed | Seed run twice | No duplicate documents, headshots, or tasks |

Existing suites that must stay green: `speaker-documents`, `portal-identity-resolution`,
`portal-handoff`, `speaker-detail`, `speaker-operations`, `speaker-tracking`, `readiness`,
`multi-tenant-isolation`, `seed-security-contract`.

## Browser verification steps

1. Portal as a seeded speaker with a submission: upload a deck and a supporting doc; reload; both
   persist; download both.
2. Portal as a seeded speaker with **no** submission: upload succeeds; the file appears under
   "Speaker files".
3. Organizer → Speakers → open that speaker: both files listed, downloadable, with no upload or
   delete control.
4. Organizer of a different event: attempt the same speaker's record; blocked.
5. Sign in as a reviewer: no documents visible anywhere.
6. Speaker list: `Files` column reflects counts; `?view=missing-files` filters correctly.
7. Readiness page: a "missing files" row exists and deep-links to the filtered speaker list.
8. Portal home: an overdue task shows an overdue marker; its `Complete form` link opens the linked
   form; completing the form updates the task state without a second manual tick.
9. Public embeds, attendee site, and a scoped API token: confirm no document is reachable.

## Rollback

Schema additions are optional fields; leaving them unread is safe. Reverting the guard split
restores today's speaker-only behaviour. The backfill only writes a field that nothing else reads.
No document is ever deleted by this work.
</content>
