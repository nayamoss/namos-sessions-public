# In-App Notifications — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-14

## Problem Statement

`NotificationBell.tsx` in the app shell is a non-functional placeholder — a bell icon with no
data source, no unread state, and no persistence. Its own comment admits this: "Notification
persistence is event-scoped and lands with the organizer inbox... harmless indicator here so the
shell has no dependency on the retired Kanrei org hooks." There is no `notifications` table, no
query, no mutation, and no organizer inbox anywhere in this codebase — the comment describes a
system that does not exist.

Meanwhile, real events already happen silently with no signal to the people who need to see
them: invites get accepted or declined, submissions arrive, reviewers get assigned, decisions
get sent (or fail to send), and comms deliveries fail. Today the only way to notice any of this
is to go looking for it page by page. Comms failures are especially costly here — this app
already ships `comms_log` as "append-only evidence of attempted delivery" specifically so a
provider outage doesn't make a submission disappear silently, but nothing surfaces a failed row
to a human. The log exists; nobody reads it.

## User Stories

**As an** event organizer or reviewer, **I want to** see a real unread count on the bell and a
list of what happened while I was away, **so that** I don't have to hunt through pages to find
out a decision failed to send or someone joined my team.

**Acceptance Criteria:**
- GIVEN a triggering event occurs on an event I belong to WHEN I next load the app THEN the bell
  shows an accurate unread count within one Convex subscription tick (no manual refresh).
- GIVEN I open the notification panel WHEN I view the list THEN each row shows what happened,
  when, which event it belongs to, and links to the relevant record (submission, member, etc.).
- GIVEN I click a notification WHEN it opens THEN it is marked read and the unread count
  decrements immediately.
- GIVEN I have multiple unread notifications WHEN I click "Mark all read" THEN every notification
  for me is marked read and the badge clears.

**As an** organizer, **I want to** get emailed immediately when a decision fails to send or an
invite is accepted, **so that** I don't need the app open to catch the events that matter most.

**Acceptance Criteria:**
- GIVEN a comms delivery lands as `status: "failed"` in `comms_log` WHEN that happens THEN every
  organizer on the event receives both an in-app notification and an email, using the existing
  `emailDelivery.ts` send path.
- GIVEN an invited member accepts their invite WHEN that happens THEN the organizer(s) who sent
  the invite get an in-app notification and an email.
- GIVEN any other tracked event (submission received, reviewer assigned, decision sent
  successfully, invite declined, member removed) WHEN it happens THEN it produces an in-app
  notification only — no email.

## Functional Requirements

- FR-001: A `notifications` table persists one row per recipient per event, so unread state is
  per-user, not per-event.
- FR-002: Notifications are created server-side, inline in the same mutation/action that causes
  the underlying event — never inferred after the fact by polling.
- FR-003: Recipients are every current `event_members` row for that event (both `organizer` and
  `reviewer` roles) plus org-wide `organizers`, resolved the same way `assertEventAccess` already
  resolves event membership.
- FR-004: The bell shows a live unread count via a Convex subscription (`useQuery`), no polling.
- FR-005: Clicking a notification marks it read and navigates to the linked record.
- FR-006: A "Mark all read" action exists and clears the badge for the current user.
- FR-007: High-priority notifications (comms delivery failure, invite accepted) additionally
  send an email through `deliverEventEmail` (existing `convex/emailDelivery.ts`), addressed to
  the affected organizer(s)' identity email.
- FR-008: Notification creation must not throw or block the triggering mutation/action if it
  fails — a notification-write failure must never roll back or error out the real operation
  (e.g. a decision send should not fail because a notification insert failed).
- FR-009: Every notification write is scoped and authorized the same way existing writes are —
  no notification is created for a user without an event_members/organizers row on that event.

## Non-Functional Requirements

- NFR-001: Unread count and list must update in real time (Convex reactivity) — no manual
  refresh, no client-side polling interval.
- NFR-002: Notification volume in this app is small (event-scoped teams, not public fan-out) —
  synchronous per-recipient inserts inside the triggering mutation are sufficient; no queue or
  batch fan-out infrastructure is needed.
- NFR-003: Email fan-out for high-priority notifications reuses the existing encrypted
  per-event integration resolution (`resolveEventIntegration`) and RESEND_* env fallback —
  no new provider, no new credential storage.

## Out of Scope

- Push notifications (browser/mobile) — in-app + existing email transport only.
- User-configurable notification preferences (mute/unmute by type) — everyone gets everything
  in FR-003's recipient set for now.
- Notification digests or scheduled summaries — this is a live event-triggered stream, not a
  cron job.
- Automated reminder emails — that scope belongs to `docs/features/comms-notifications/`, not
  here.
- A public API or webhook for notifications — in-app UI only.

## Success Metrics

- Every event in the FR-003 trigger list (member changes, submission activity, review/decision
  activity, comms delivery failures) produces a `notifications` row within the same request that
  causes it — verified by triggering each event in the running app and watching the bell update
  live, no refresh.
- A failed `comms_log` row and an accepted invite each produce both an in-app notification and a
  real email, verified end-to-end in the browser with a real provider.
- Mark-as-read and mark-all-read are provably scoped to the current user only — verified with two
  different organizer accounts on the same event.
