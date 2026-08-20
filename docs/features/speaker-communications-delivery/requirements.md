# Communications, Reminders, and Calendar Invite Delivery/Recovery — Requirements

**Type:** Feature (scheduling + recovery) on top of a complete send pipeline
**Status:** Planned — not implemented
**Priority:** High (brief requirement 3)
**Last Updated:** 2026-08-17
**Related packages:** `comms-notifications/`, `in-app-notifications/` (#158, open),
`reviewer-progress/`, `public-cfp-submission/`, `readiness-operations/`

## Problem Statement

The send pipeline is complete and careful. Templates carry seven kinds; token resolution is tested;
decision, reminder, and consolidated-decision sends all render React Email components; ICS
attachments are generated with a stable `calendarUid` and a `calendarSequence` that increments only
when a calendar-relevant field actually changes (`convex/agenda.ts:243-252`); provider credentials
for Resend and SES are AES-256-GCM encrypted and never browser-readable; and every attempt writes
an append-only `comms_log` row **before** the outcome is known, so a provider outage can never make
a submission look like it never happened.

Three things are missing, and only one of them is large.

1. **Nothing is automatic.** Every send is an organizer-initiated `action`. The word in the brief is
   "automated": a reminder that only fires when a human remembers to fire it is not a reminder
   system, it is a mail-merge button. There is no `convex/crons.ts` in this repository at all;
   `ctx.scheduler` is used only for `runAfter(0)` fan-out from three mutations.
2. **A failed send is a dead end.** `comms_log` records `status: "failed"` with an error, and the
   UI shows it. Nothing retries it. The seed even plants a failed row, which demonstrates the
   logging and simultaneously demonstrates that there is nothing to do about it.
3. **Calendar invites are invisible in the demo.** They work — `src/test/calendar-invite.test.ts`
   asserts a single `BEGIN:VCALENDAR` and the correct `text/calendar; method=REQUEST` content type —
   but the seed writes zero `channel: "calendar_invite"` rows, so a judge sees an email log with no
   evidence that calendar invites exist.

## User Stories

**As an event organizer** I want speakers with overdue onboarding tasks to be reminded automatically
**so that** chasing them is not my job.

**As an event organizer** I want a failed send to be retryable from the log **so that** a transient
provider outage does not turn into a speaker who never heard from us.

**As an event organizer** I want to see, per speaker, exactly what was sent and when **so that** I
can answer "did they get the acceptance?" without checking my own outbox.

**As a speaker** I want a calendar invite for my session that updates when the session moves **so
that** my calendar is right without me re-adding it.

**As a judge** I want to see reminders, decisions, and calendar invites in one operations surface
**so that** requirement 3 is provable in one place.

### Acceptance Criteria

- GIVEN a speaker with an onboarding task overdue by the configured threshold WHEN the scheduled
  reminder pass runs THEN one reminder is sent and one `comms_log` row is written.
- GIVEN the same speaker and the same overdue task WHEN the pass runs again before the configured
  cooldown elapses THEN no second reminder is sent.
- GIVEN a scheduled pass WHEN it runs THEN it only dispatches work; the sends themselves happen in
  separate actions so one slow provider cannot stall the pass.
- GIVEN an event with no email integration configured WHEN the pass runs THEN it records the skip
  and does not repeatedly attempt sends that cannot succeed.
- GIVEN a `comms_log` row with `status: "failed"` WHEN an organizer retries it THEN a new attempt is
  made, a new log row is written, and the original failed row is preserved as evidence.
- GIVEN a `comms_log` row with `status: "sent"` WHEN an organizer views it THEN no retry control is
  offered.
- GIVEN a scheduled session whose time or room changes WHEN a calendar invite is re-sent THEN the
  ICS carries the same `UID` and a higher `SEQUENCE`, so calendar clients update rather than
  duplicate.
- GIVEN the seeded demo WHEN an organizer opens communications THEN templates covering every kind,
  a log containing sent/queued/failed email rows **and** calendar-invite rows, and a working retry
  are all present.

## Functional Requirements

- FR-001: Add a scheduled reminder pass. It selects eligible speakers, enqueues per-speaker send
  actions, and records what it dispatched.
- FR-002: Reminder eligibility, cadence, and cooldown are **event-configurable data**, not constants
  in code and not environment variables.
- FR-003: Add `retry` to the communications log for `failed` rows only. A retry creates a new
  attempt row; it never mutates or deletes the failed one (`comms_log` is append-only by design —
  `convex/schema.ts:585-586`).
- FR-004: Record attempt bookkeeping (`attemptCount`, `lastAttemptAt`) so a retry loop is bounded.
- FR-005: Seed calendar-invite log rows and a template for every kind.
- FR-006: Group the organizer communications page into operations — templates, send actions,
  delivery log, retry — so the workflow is legible in one place. Copy and grouping only; no new
  layout system.
- FR-007: Every automated send writes the same `comms_log` evidence as a manual one, with the actor
  recorded as the schedule rather than a user.

## Non-Functional Requirements

- NFR-001 (no new secrets for scheduling): The cron runs inside Convex. It does not need a shared
  scheduler secret, an external trigger, or a public HTTP endpoint. If a design ever proposes one,
  that is a signal the work has drifted out of Convex.
- NFR-002 (idempotency): A reminder is keyed on `(eventId, speakerId, kind, windowStart)`. Running
  the pass twice in one window sends once.
- NFR-003 (bounded retries): Automatic retry is bounded and backed off; manual retry from the UI is
  always allowed but records `attemptCount`.
- NFR-004 (no silent bulk send): A newly enabled schedule must not immediately fire a backlog at
  every historically overdue speaker. First activation establishes a baseline.
- NFR-005 (privacy): `comms_log` rows are organizer-only. They are already absent from every public
  query; that stays true.
- NFR-006 (deliverability honesty): The UI never claims delivery. `sent` means the provider accepted
  the message; bounces are not tracked and the copy must not imply they are.

## Out of Scope

- Inbound email, reply threading, or an inbox. (An uncommitted `commsInbox.ts` was referenced in
  `docs/features/INDEX.md` on 2026-08-17 but is not present on `main`; it has no feature package and
  is not in scope here.)
- Bounce/complaint webhooks from Resend or SES.
- SMS, push, or Slack channels.
- Per-recipient send-time optimization or throttling beyond a simple cadence.
- Rewriting the React Email templates or `EMAIL_TEMPLATES_PLAN.md`.

## Success Metrics

- A speaker with an overdue task receives exactly one reminder per cooldown window, with no human
  action.
- A failed send is recoverable from the log in one click, with both the failure and the recovery
  visible afterwards.
- Calendar invites are visible in the demo log and a re-send updates rather than duplicates a
  calendar entry.
</content>
