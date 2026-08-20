# Speaker Portal Documents, Onboarding, Task-Linked Forms, and Readiness Proof — Requirements

**Type:** Feature (organizer document visibility) + Improvement (upload scope, seeding)
**Status:** Planned — not implemented
**Priority:** High (brief requirement 2; feeds requirement 6)
**Last Updated:** 2026-08-17
**Related packages:** `speaker-portal/`, `portal-tasks/`, `portal-forms/`, `task-templates/`,
`speaker-operations/`, `readiness-operations/`, `submission-editing/`, `speaker-availability/`

## Problem Statement

The speaker half of this requirement is done. A signed-in speaker can edit their bio and links,
upload a headshot, upload slides and supporting documents, complete task-linked forms, set
availability, edit their submission while it is editable, and see their own published sessions.
Uploads go to Convex storage; `speakerDocuments.list` resolves a fresh URL on every read rather
than persisting an expiring one.

The organizer half has a hole. **No organizer can see a speaker's uploaded documents.**
`convex/speakerDocuments.ts` scopes every entry point — `requestUpload`, `save`, `list`, `remove` —
through `requireScope`, which calls `assertOwnsSpeaker`. That is a speaker-identity check with no
organizer branch, unlike `agenda.listForSpeaker`, which uses `assertOrganizerOrOwnsSpeaker`. There
is no organizer-facing documents view in `src/pages/program/Speakers.tsx` or anywhere else. So the
product can collect slides and then cannot tell the organizer they arrived — which is the single
most common speaker-onboarding question there is.

A second, narrower gap: `speaker_documents` requires a `submissionId`, and `requireScope` asserts
the submission belongs to the speaker. An invited speaker with no submission — a keynote, a
sponsor-nominated panellist, anyone imported rather than routed through the CFP — has nowhere to
upload anything.

Third, the demo carries no evidence of any of this. The seed creates zero `speaker_documents` rows
and deliberately clears legacy headshot keys (`convex/seed.ts`, the `startsWith("seed/")` patch),
so the portal, the speaker gallery, and the readiness surface all render with nothing in them.

## User Stories

**As an event organizer** I want to see which speakers have uploaded slides **so that** I can chase
only the ones who have not.

**As an event organizer** I want a keynote speaker who never submitted through the CFP to be able to
upload a deck **so that** onboarding does not depend on the submission pipeline.

**As a speaker** I want one place that tells me everything outstanding **so that** I am not
reconstructing it from three emails.

**As a speaker** I want my task list to link straight to the form that satisfies it **so that**
"upload your slides" is one click, not a hunt.

**As a judge** I want the organizer's speaker view to show real onboarding state **so that**
"speaker portal" is demonstrably a two-sided feature and not just a speaker-side page.

### Acceptance Criteria

- GIVEN a speaker who has uploaded slides WHEN an organizer opens that speaker's record THEN the
  file is listed with its name, kind, size-appropriate label, and upload time, and is downloadable
  through a freshly resolved URL.
- GIVEN an organizer WHEN they attempt to upload or delete a file on a speaker's behalf THEN the
  action is not offered; organizer access to documents is read-only in this scope.
- GIVEN a speaker with no submission WHEN they open Files THEN they can upload documents that are
  scoped to their speaker record rather than to a submission.
- GIVEN a document uploaded before this change WHEN it is listed THEN it still resolves correctly
  through its `submissionId` linkage; no backfill is required for it to work.
- GIVEN a speaker WHEN they open the portal home THEN outstanding tasks, overdue markers, and a
  link to the form for each task-linked item are visible.
- GIVEN a task whose linked form has been completed WHEN the speaker returns THEN the task's state
  reflects the completion rather than requiring a second manual tick.
- GIVEN the seeded demo WHEN an organizer opens the speaker list THEN speakers exist in a spread of
  states — complete, missing headshot, missing bio, overdue task, uploaded slides, declined — and
  each is reachable from the readiness surface.
- GIVEN an unauthenticated request for a document URL WHEN it is made THEN it fails; no document is
  reachable without a scoped, verified session.

## Functional Requirements

- FR-001: Add an organizer-scoped **read** path for speaker documents. Do not widen `requestUpload`,
  `save`, or `remove` — those stay speaker-only.
- FR-002: Make `speaker_documents.submissionId` optional and add `eventId` plus a `by_event` index,
  so documents can be scoped to a speaker independent of a submission.
- FR-003: Preserve every existing document row. Existing rows keep their `submissionId`; the
  organizer view groups by submission when present and by speaker otherwise.
- FR-004: Surface documents in the organizer speaker record and feed their presence into the
  existing readiness/speaker-operations projections.
- FR-005: Seed headshots, documents, and a realistic spread of onboarding states.
- FR-006: Do not change the portal's visual layout or navigation structure beyond adding what this
  package and `portal-resource-pages/` require.

## Non-Functional Requirements

- NFR-001 (security): The organizer read path uses `assertOrganizerOrOwnsSpeaker`
  (`convex/speakers.ts:216`) — the existing, tested helper — not a new bespoke check. A reviewer is
  not an organizer for this purpose and gets no access.
- NFR-002 (storage): Document URLs continue to be resolved per read via `ctx.storage.getUrl`. An
  expiring provider URL is never persisted (the comment at `convex/schema.ts:257-261` is the
  contract).
- NFR-003 (limits): The 10 MB cap and the accepted-extension list stay as they are
  (`convex/speakerDocuments.ts:8`, `src/pages/portal/SpeakerDocuments.tsx:10`).
- NFR-004 (compatibility): `submissionId` becoming optional must not break `by_submission`; queries
  that use it filter on a defined value.
- NFR-005 (privacy): Speaker documents never appear in any public embed, the attendee site, the
  public API, or the reviewer projection.

## Out of Scope

- Organizer upload or deletion on a speaker's behalf. If a speaker's file is wrong, the speaker
  replaces it; an organizer acting silently in a speaker's name is a worse product.
- Virus scanning, document preview rendering, or format conversion.
- Versioning of uploaded documents.
- Changing the portal identity-resolution model (`PortalIdentity.tsx`, already hardened by
  `portal-redirect-fixes/` and `portal-handoff` tests).
- Sponsor document management.

## Success Metrics

- An organizer can answer "who has not sent slides?" from one screen.
- A keynote speaker with no submission can upload a deck.
- Zero regressions in `speaker-documents.test.tsx`, `portal-identity-resolution.test.tsx`, and
  `portal-handoff.test.tsx`.
- The seeded speaker list shows at least five distinct onboarding states.
</content>
