# Comms & Notifications — Completion Requirements

**Type:** Feature (completion of in-progress feature #3/#10, see `docs/features/INDEX.md`)
**Status:** Blocked (implementation complete; live deployment/provider/client verification pending)
**Priority:** High
**Last Updated:** 2026-08-12

## Problem Statement

> **Implementation update (2026-08-12):** the legacy failures described below are now fixed in
> code. Decisions/reminders run as organizer-gated Convex actions, saved templates drive rendered
> email, agenda co-speakers are included, consolidated decisions are available, `.ics` attachments
> travel through Resend and both SES transports, results are persisted, and the legacy handlers
> are removed. Shared-dev deployment is currently blocked by unrelated sponsor task documents
> whose parallel schema has not merged; real provider and calendar-client verification remains.

Submission-confirmation email is done and browser-verified (server-side Convex action,
`convex/confirmationEmailActions.ts`). Everything downstream of it — decisions, reminders,
calendar invites — previously ran through legacy serverless handlers with a confirmed bug:

- The retired calendar-invite wrapper opened a bare, unauthenticated `ConvexHttpClient`
  and calls `agenda:list`, `events:listRooms`, `events:get` — all three require organizer
  auth via `assertEventAccess`. The call throws, is caught, and the calendar attachment is
  silently dropped from every decision and reminder email.
- The retired decision-email and reminder-email handlers logged delivery the same broken
  way: `comms:recordDelivery` also requires `assertEventAccess`, so the unauthenticated write
  throws, is caught, and `comms_log` never receives a row for a decision or reminder send.
- Both handlers hardcode subject/body text instead of loading the organizer's saved
  `comms_templates` — template edits in Communications have no effect on what actually sends.
- `reminder-email.mjs` has no caller anywhere in `src/` — it is dead code from the product's
  perspective. There is no UI path to send or schedule a speaker reminder.
- `Abstracts.tsx:sendDecision` posts to `decision-email` with a single `toEmail` — co-speakers
  never receive a decision. There is no pre-send recipient/preview confirmation and no
  per-recipient queued/sent/failed result; a click either "worked" or produced one error string.
- Neither retired handler verified Clerk identity itself — payload shape was the only check.

This matters because requirement #3 in the brief ("Comms & Notifications") cannot leave
`in-progress` until the full organizer→speaker journey is provably real, not just
unit-tested against mocks that don't exercise the auth boundary. See
`docs/features/comms-notifications/USER_JOURNEY.md` for the authoritative completion contract.

## User Stories

**As an** organizer, **I want to** send a decision to every speaker on a submission, including
co-speakers, using my saved template and a real calendar invite, **so that** speakers get one
correct, complete message instead of a silently degraded one.

**Acceptance Criteria:**
- GIVEN an accepted submission with a primary speaker and a co-speaker WHEN I click "Send
  decision" THEN I see the exact recipient list, the template that will be used, and whether a
  calendar invite will attach, before anything sends.
- GIVEN I confirm the send WHEN delivery completes THEN I see a queued/sent/failed result per
  recipient, and every attempt (success or failure) is a row in `comms_log`.
- GIVEN the submission is scheduled WHEN the decision email sends THEN the `.ics` attachment is
  present and opens correctly in Gmail, Apple Calendar, and Outlook.

**As an** organizer, **I want to** send a task reminder to a speaker from the Speakers page,
**so that** I don't have to invoke a backend handler that has no UI.

**Acceptance Criteria:**
- GIVEN a speaker with an outstanding task WHEN I open their detail pane and choose
  Message → Task reminder THEN I see the resolved reminder template and can send it.
- GIVEN the reminder sends WHEN I check `comms_log` THEN there is a row for it.

**As an** organizer, **I want to** edit a template and have it actually used, **so that**
Communications isn't cosmetic.

**Acceptance Criteria:**
- GIVEN I edit and save the acceptance template WHEN I next send a decision THEN the sent email
  uses my saved subject/body, not the hardcoded copy in `decision-email.mjs`.

## Out of Scope

- Direct Google/Microsoft calendar API sync — `.ics` attachment remains the delivery mechanism
  (matches Pretalx precedent already documented in `plan.md`).
- Automated/scheduled reminder cron — sends stay organizer-triggered, same as the existing
  reviewer-reminder precedent (`convex/reviewerRemindersActions.ts`) and per that file's own
  explicit non-goal.
- Admin new-submission alert emails — already flagged `cut candidate` in `plan.md`.
- Rewriting the confirmation-email path — it already works and is out of scope for this pass.

## Success Metrics

- `comms_log` contains a row for every decision and reminder send attempt (currently: zero).
- A real decision email sent through the running app carries a working `.ics` attachment,
  verified opening in Gmail, Apple Calendar, and Outlook.
- Editing a template in Communications changes the next sent email's content.
- A co-speaker receives their own decision email, not just the primary speaker.
