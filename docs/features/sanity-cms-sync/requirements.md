# Sanity CMS Sync — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-16

## Problem Statement
Notion and Airtable sync (see their respective `docs/features/`) pull external planning data
*into* an event. Sanity is different in kind: it's a headless CMS typically used to power a
public marketing/event website, and nothing in this portfolio currently has a Sanity
integration to build from (confirmed — no `@sanity/client` reference anywhere in
`01-active-projects`). This feature is a genuine net-new build, not a port.

Direction is therefore **push, not pull**: publish this event's already-public content
(published agenda sessions, confirmed speakers) *out* to a Sanity dataset, so a Sanity-powered
marketing site can display accurate program/speaker info without an organizer manually copying
it. This mirrors data already exposed by the existing `docs/features/public-events-api/` and
`docs/features/public-embeds/` features — this feature reuses those same field projections
rather than inventing a new "what to expose" decision.

## User Stories
**As an** event organizer with a Sanity-powered marketing site **I want to** push this event's
published sessions and confirmed speakers to my Sanity dataset **so that** my public site stays
in sync without manual re-entry, using the same field set I already expose through the public
API.

**Acceptance Criteria:**
- GIVEN an organizer with a Sanity project ID, dataset name, and API token (write-scoped) WHEN
  they enter these into Settings > Integrations THEN the connection is validated against the
  real Sanity API before being saved.
- GIVEN a connected Sanity integration WHEN the organizer clicks "Publish now" THEN published
  agenda sessions and confirmed speakers are created/updated as documents in the target Sanity
  dataset, matched by a stored Sanity document ID so re-running never creates duplicates.
- GIVEN a Sanity API error (invalid token, dataset not found, schema/type mismatch) WHEN publish
  runs THEN the organizer sees the specific error and no partial publish is silently treated as
  success.

## Functional Requirements
- FR-001: Organizer can connect one Sanity integration per event.
- FR-002: Connecting validates the project ID, dataset, and token against Sanity's API (a query
  to `https://{projectId}.api.sanity.io/v{apiVersion}/data/query/{dataset}`) before any
  credential is stored.
- FR-003: Publish is push-only (Namos Sessions → Sanity), manually triggered via "Publish now" —
  no automatic sync/webhook in v1, same scope discipline as Notion/Airtable.
- FR-004: Only `agenda_items` where `isPublished: true` and `speakers` where
  `confirmationStatus: "confirmed"` are published — unpublished/draft content never leaves this
  app, matching the existing public-API/public-embeds trust boundary.
- FR-005: Each published document stores its Sanity `_id` on the source Convex row (new
  `sanityDocId` field) so re-publishing updates the same Sanity document (`createOrReplace`)
  instead of creating duplicates.
- FR-006: Organizer can disconnect, which stops future publishes but does not delete already-
  published Sanity documents (this app doesn't own the Sanity dataset — deleting a live site's
  content on disconnect would be destructive and surprising).
- FR-007: Document shape pushed to Sanity is fixed in v1 (documented in design.md) — no
  organizer-configurable schema mapping.

## Non-Functional Requirements
- NFR-001: Sanity API token stored AES-256-GCM encrypted via the shared
  `convex/credentialEncryption.ts` helper (built by the Notion feature) — no new crypto code.
- NFR-002: Publish is bounded to 100 documents per "Publish now" run (Sanity's mutate endpoint
  accepts batched transactions; batch in groups of 50 mutations per request), with a "more
  remain" indicator if the event has more published sessions/speakers than the batch covers.

## Out of Scope
- Pull (importing FROM Sanity into this app) — push only in v1.
- Organizer-configurable Sanity schema/field mapping.
- Scheduled/automatic publish — manual "Publish now" only.
- Deleting Sanity documents when the source session/speaker is unpublished or removed in Namos
  Sessions (a stale-but-present Sanity doc is safer default than silent deletion on a dataset
  this app doesn't own; can be a follow-up if organizers ask for it).

## Success Metrics
- An organizer can go from "have a Sanity project" to "sessions/speakers visible in Sanity
  Studio" in under 3 minutes.
- Zero duplicate Sanity documents created on repeated "Publish now" runs against unchanged data.
