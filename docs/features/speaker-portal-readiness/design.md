# Speaker Portal Documents, Onboarding, and Readiness — Design

**Last Updated:** 2026-08-17
**Status:** Planned — not implemented

## Current implementation (verified 2026-08-17)

| Concern | Location | State |
|---|---|---|
| Portal shell + nav | `src/pages/portal/PortalLayout.tsx:9-21` — Home, Submissions, Profile, Availability, Schedule, Files | Complete |
| Identity resolution | `src/pages/portal/PortalIdentity.tsx`; tests `portal-identity-resolution`, `portal-handoff` | Complete, hardened |
| Bio / links / headshot | `PortalPages.tsx:98` `PortalProfilePage` → `speakers.updateProfile`, `requestHeadshotUpload`, `saveHeadshot`, `getHeadshotUrl`; 10 MB, image types only | Complete |
| Documents (speaker side) | `src/pages/portal/SpeakerDocuments.tsx` → `convex/speakerDocuments.ts` | Complete |
| Documents (organizer side) | — | **Missing** |
| Tasks | `onboarding_tasks` (`convex/schema.ts:367-382`), `convex/tasks.ts`, portal `TaskList` (`PortalPages.tsx:23-30`), organizer `TasksAdmin.tsx` | Complete |
| Task-linked forms | `onboarding_tasks.linkedFormId` → `/portal/forms/:id?task=` (`PortalPages.tsx:29`), `PortalTaskFormPage.tsx`, `convex/portalFormResponses.ts` | Complete |
| Task templates | `task_templates` + `convex/taskTemplates.ts`; six seeded templates | Complete |
| Readiness rollup | `src/lib/readiness.ts`, `src/lib/speaker-operations.ts`, `src/pages/program/Readiness.tsx` | Complete |
| Own schedule | `convex/agenda.ts:122-141` `listForSpeaker` — published-only, own-sessions-only, uses `assertOrganizerOrOwnsSpeaker` | Complete |

## The authorization asymmetry

```
convex/agenda.ts:125          await assertOrganizerOrOwnsSpeaker(ctx, eventId, speakerId);   // organizer OR speaker
convex/speakerDocuments.ts:18 assertOwnsSpeaker(identity, speaker);                          // speaker ONLY
```

Both are correct for what they were written for. The documents module simply never had an organizer
use case, so it never grew one. The fix is to add an organizer read path, not to relax
`requireScope` — the write paths must stay speaker-only (FR-001).

## Schema changes

`convex/schema.ts:253-262`, additive and backward-compatible:

```ts
speaker_documents: defineTable({
  // NEW. Denormalized so an organizer can list an event's documents without joining every
  // submission. Optional for rows written before this change; the migration backfills it from
  // the submission, and the organizer query treats a missing eventId as not-this-event (deny).
  eventId: v.optional(v.id("events")),
  // WAS required. Now optional so an invited speaker with no CFP submission can upload.
  submissionId: v.optional(v.id("submissions")),
  speakerId: v.id("speakers"),
  kind: v.union(v.literal("slides"), v.literal("supporting_doc")),
  fileUrl: v.string(),      // durable Convex storage id, resolved per read — unchanged
  fileName: v.string(),
  createdAt: v.number(),
})
  .index("by_submission", ["submissionId"])   // unchanged
  .index("by_speaker", ["speakerId"])         // unchanged
  .index("by_event", ["eventId"]),            // NEW
```

**Migration.** A one-shot `internalMutation` in `convex/migrations.ts` (the file already exists and
holds `backfillOrganizations`): for every `speaker_documents` row with no `eventId`, read its
speaker and copy `speaker.eventId`. Idempotent; safe to run repeatedly. Until it runs, the
organizer query returns nothing for legacy rows — it **fails closed**, matching how
`organizers.organizationId` is treated (`convex/schema.ts:50-53`).

## Convex signatures

**Changed — `convex/speakerDocuments.ts` `requireScope`**

Split into two helpers so intent is explicit at each call site:

```ts
// Write scope: speaker only. Used by requestUpload, save, remove. Behaviour unchanged except
// that submissionId is now optional; when present it must still belong to this speaker.
async function requireOwnScope(ctx, eventId, speakerId, submissionId?)

// Read scope: organizer of the event, or the speaker themselves.
async function requireReadScope(ctx, eventId, speakerId)
```

**Changed — `requestUpload` / `save`**

`submissionId: v.optional(v.id("submissions"))`. When omitted, the document is speaker-scoped.
`save` writes `eventId` on every new row.

**Changed — `list`**

```ts
export const list = query({
  args: {
    eventId: v.id("events"),
    speakerId: v.id("speakers"),
    submissionId: v.optional(v.id("submissions")),  // filter, no longer required
  },
  // requireReadScope — organizer OR the speaker
});
```

The speaker portal keeps passing `submissionId` where it has one, so `SpeakerDocuments.tsx`'s
current grouping is preserved.

**New — `listForEvent`**

```ts
export const listForEvent = query({
  args: { eventId: v.id("events") },
  // assertEventOrganizerAccess — organizer only, never assertEventAccess (reviewers get nothing).
  // Returns per-speaker rollups: { speakerId, speakerName, slides: n, supportingDocs: n,
  //   lastUploadedAt } — counts, not URLs. The detail view calls list() for one speaker.
});
```

Returning counts rather than resolved URLs matters: `ctx.storage.getUrl` per document across every
speaker in an event would be an N-call fan-out on a list page.

**Unchanged:** `remove` stays speaker-only.

## Readiness integration

`src/lib/speaker-operations.ts` already computes `profileIncomplete` (missing bio or headshot) and
`needsAttention`. Extend `projectSpeakerOperationsRows` with a `documentsMissing` signal derived
from the `listForEvent` rollup, and add a matching row to `src/lib/readiness.ts`'s
`speaker_confirmations` category — or a new `speaker_documents` category if the copy gets muddled.

Both modules are pure functions with existing unit tests (`speaker-operations.test.ts`,
`readiness.test.ts`); the new signal is testable without a component.

## UI

**Organizer speaker record** (`src/pages/program/Speakers.tsx` detail panel — an inline flex sibling,
not a fixed overlay, per the existing three-pane pattern):

| State | Render |
|---|---|
| Loading | Skeleton rows inside the documents section |
| No documents | "No files uploaded yet" plus, when a task asks for them, "Slides requested — due 5 Sep" |
| Has documents | Grouped by submission when `submissionId` is present, otherwise under "Speaker files". Each row: file name, kind label, upload date, download link |
| Legacy row before migration | Not shown (fails closed). The migration is part of the same deploy |
| Error | Inline `role="alert"`; the rest of the speaker record still renders |

No upload or delete controls here — deliberately (FR-001).

**Speaker list column:** a compact "Files" indicator driven by `listForEvent` counts, filterable via
the existing `?view=` query-param pattern already used by `?view=profile-incomplete` and
`?view=needs-attention` (`DashboardHome.tsx:269,277`). Add `?view=missing-files`.

**Portal Files page** (`SpeakerDocuments.tsx`): when the speaker has no submissions, replace the
current submission `Select` with a plain "These files are attached to your speaker profile" note and
allow upload. When they have submissions, keep today's behaviour and add a "Not tied to a session"
option.

## Seed changes

`convex/seed.ts`, idempotent:

1. Upload nothing to real storage (the seed cannot generate binaries). Instead, seed
   `speaker_documents` rows only for speakers where a storage id can be produced — otherwise seed
   **task state** that implies the file, and note the limitation. *If* the seed can write a small
   generated PDF/PNG through `ctx.storage.store`, do so for 3–5 speakers; that is the preferred
   path because it makes the download link real.
2. Seed headshots the same way. Without them the speaker gallery renders sixty blank avatars, which
   is a worse demo than fewer speakers with photos.
3. Ensure the seeded onboarding-task spread includes: completed, pending, overdue (a `dueDate` in
   the past relative to `now`, not to the fixed `seededAt`), and one task with a `linkedFormId`.
4. Keep every address `@seed.invalid`.

**Open question for the implementer:** whether `ctx.storage.store` is callable from an
`internalMutation` in this Convex version. If it is action-only, the seed needs a companion
`internalAction` and `npm run seed:demo` runs both. Resolve before starting; it changes T4's shape.

## Risks

| Risk | Mitigation |
|---|---|
| Widening the read guard accidentally widens writes | Two named helpers; `requireOwnScope` keeps `assertOwnsSpeaker` untouched and is the only one the write paths call |
| Legacy rows invisible after deploy | Migration ships in the same deploy; failing closed is preferred to a permissive fallback |
| `by_submission` queries break when `submissionId` is optional | Every existing query passes a concrete id; the index tolerates absent values for other rows |
| N+1 `getUrl` calls on the speaker list | `listForEvent` returns counts only |
| Documents leak publicly | No public query, embed, attendee-site projection, or API scope references `speaker_documents`; `api_tokens.scopes` (`convex/schema.ts:181`) has no documents scope and gains none |
</content>
