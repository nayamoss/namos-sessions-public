# Speaker-Portal Resource / Wiki Pages with Sanitized HTML — Requirements

**Type:** Feature (new — nothing exists in source)
**Status:** Planned — not implemented
**Priority:** High (brief requirement 8; one of only two requirements with zero implementation)
**Last Updated:** 2026-08-17
**Related packages:** `speaker-portal/`, `portal-forms/`, `portal-tasks/`, `tags-library/`,
`security-public-cfp-abuse-controls/`

## Problem Statement

Speakers repeatedly need the same information: how to get to the venue, what the AV setup is, when
slides are due, what the recording policy is, how expenses are reimbursed. Today Namos has nowhere
to put it. The portal has Home, Submissions, Profile, Availability, Schedule, and Files
(`src/pages/portal/PortalLayout.tsx:9-21`) — six task surfaces and zero reference surfaces. The
information ends up in email, which means it is unsearchable, unversioned, and stale the moment a
detail changes.

`src/pages/settings/Library.tsx` sounds like the place for this and is not: it manages **tags**. It
is not a content library and is not a reuse path. What *is* reusable is the rich-text stack already
in the repository — TipTap authoring (`src/components/editor/RichTextEditor.tsx`), a single
sanctioned render path (`src/components/shared/RichText.tsx`, which is the only component that
calls `DOMPurify.sanitize` on organizer-authored HTML), markdown fallback normalization
(`src/lib/rich-text.ts`), and `dompurify@3.4.13` already in `package.json`.

The brief asks for "safe HTML embed support". That phrase hides the one genuinely new security
decision in this package: **DOMPurify's default profile strips `<iframe>` entirely.** Supporting an
embedded slide deck or venue map therefore requires deliberately widening the allowlist for a
specific set of hosts. Widening it carelessly turns a speaker portal into a clickjacking and
credential-phishing surface, on a page authored by whoever has organizer access.

## User Stories

**As an event organizer** I want to publish a speaker handbook in the portal **so that** I stop
answering the same five questions by email.

**As an event organizer** I want to draft a page and publish it when it is ready **so that**
half-written travel instructions are never visible to speakers.

**As an event organizer** I want to embed the venue map and the AV walkthrough video **so that**
speakers do not have to leave the portal to find them.

**As a speaker** I want a Resources section in my portal **so that** I can look something up
without searching my inbox.

**As a security reviewer** I want stored resource content to be already-sanitized **so that** a
policy change or a rendering mistake cannot resurrect dangerous markup.

### Acceptance Criteria

- GIVEN an organizer WHEN they create a resource page THEN it is created as a draft and is not
  visible in any speaker's portal.
- GIVEN a draft page WHEN the organizer publishes it THEN it appears in the portal's Resources
  section for every speaker on that event, ordered by the configured sort order.
- GIVEN a published page WHEN the organizer unpublishes it THEN it disappears from the portal
  immediately and its content is retained.
- GIVEN content containing `<script>`, an inline event handler (`onerror=`, `onclick=`), a
  `javascript:` URL, or an `<iframe>` whose host is not allowlisted WHEN the page is saved THEN all
  of it is removed **from the stored value**, and the author is told what was removed.
- GIVEN content containing an allowlisted embed WHEN the page is rendered in the portal THEN the
  embed renders, sandboxed, with no access to the parent page.
- GIVEN a stored page written before a policy tightening WHEN it is rendered THEN sanitization is
  applied again at render time, so the tightened policy takes effect without a migration.
- GIVEN a speaker on event A WHEN they request a resource page belonging to event B THEN the request
  is rejected.
- GIVEN a signed-out visitor WHEN they request any resource page THEN the request is rejected;
  resource pages are portal-only and are never public.
- GIVEN the seeded demo WHEN a speaker opens Resources THEN at least two published pages exist, one
  containing an allowlisted embed, and at least one draft exists that the speaker cannot see.

## Functional Requirements

- FR-001: New `portal_resource_pages` table, `eventId`-scoped, with title, slug, body HTML, sort
  order, publication state, and authorship/timestamps.
- FR-002: Organizer CRUD guarded by `assertEventOrganizerAccess`. Speaker read guarded by portal
  identity, restricted to published pages on the speaker's own event.
- FR-003: Sanitize on **write** (server-side, so the stored value is safe) and again on **read**
  (client-side, so an older row cannot bypass a tightened policy). One shared configuration module,
  used by both.
- FR-004: The embed allowlist is a fixed, code-defined host list in v1. It is not user-configurable
  and is not an environment variable.
- FR-005: Every rendered embed carries `sandbox`, `loading="lazy"`, `referrerpolicy`, and an
  explicit `title`.
- FR-006: Add `Resources` to the portal navigation and an organizer admin surface for authoring.
- FR-007: Report what sanitization removed at save time. Silently discarding an author's content is
  worse than refusing it.
- FR-008: Seed two published pages and one draft.

## Non-Functional Requirements

- NFR-001 (defense in depth): Sanitizing twice is deliberate, not redundant. Write-time
  sanitization protects the database; read-time sanitization protects against a stored row written
  by an older policy, a direct database edit, or an import.
- NFR-002 (no script, ever): No configuration of this feature may permit `<script>`, inline event
  handlers, `javascript:` URLs, `<object>`, `<embed>`, `<form>`, or `srcdoc`.
- NFR-003 (tenancy): Pages are `eventId`-scoped and inherit their organization through `events`,
  per `convex/schema.ts:154`.
- NFR-004 (not public): No public query, embed view, attendee-site projection, or API scope exposes
  resource pages. This is portal content, not marketing content.
- NFR-005 (accessibility): Rendered content uses semantic headings; embeds have accessible titles;
  the resource list is keyboard-navigable.
- NFR-006 (size): Body content is capped (proposed 100 KB) so a single page cannot become a
  denial-of-service payload for the portal.

## Out of Scope

- Page revision history and rollback.
- Per-speaker or per-track page visibility. In v1 a published page is visible to every speaker on
  the event.
- Comments, reactions, or speaker-authored pages.
- Public (attendee-facing) resource pages. If that is wanted later it is a separate surface with a
  different threat model.
- File attachments on resource pages — `speaker_documents` and the Files page already cover files.
- Cross-event or organization-level shared page libraries.
- Markdown import/export.

## Success Metrics

- A speaker can find venue, AV, and deadline information in the portal without email.
- A hostile paste containing `<script>`, `onerror=`, and a non-allowlisted iframe is stripped from
  the stored row, verified by reading the database, not by looking at the page.
- Zero resource content reachable while signed out or from another event.
</content>
