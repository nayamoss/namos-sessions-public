# Communications & Calendar Invites — User Journey

This is the completion and QA contract for brief requirement #3. Passing unit tests or calling a
Convex action directly does not complete the feature.

## 1. Users

- An authenticated event organizer configures and sends communications.
- A primary speaker and any co-speakers receive messages at their own email addresses and add the
  attached invitation to Gmail, Outlook, or Apple Calendar.

## 2. Starting state

- The organizer is signed in, has access to the selected event, and has connected a verified
  email sender.
- The event has an accepted submission with a primary speaker, at least one co-speaker on its
  agenda item, a scheduled time and room, and an outstanding speaker task.
- QA uses controlled inboxes, never seeded `.invalid` addresses.

## 3. Entry points

1. The organizer opens **Communications** from the organizer navigation to edit templates and
   inspect delivery history.
2. The organizer opens **Abstracts**, selects a decided submission, and uses **Send decision**.
3. The organizer opens **Speakers**, selects a speaker, and uses **Send reminder** from the inline
   detail pane.

No journey begins from a Convex dashboard or direct function call.

## 4. User journey steps

### A. Configure and preview reusable copy

1. On Communications, the organizer selects the acceptance, rejection, or reminder template.
2. They edit the subject and body. Supported personalization tokens are visible beside the form.
3. They preview the copy with a real speaker/session context and see all tokens resolved.
4. They save. **Template saved** appears, and the same content remains after refresh.

### B. Send a decision and calendar invitation

1. On Abstracts, the organizer selects an accepted or declined submission and chooses **Send
   decision**.
2. The inline detail pane shows the saved template name, resolved subject/body, every recipient
   (primary and co-speakers), and either **Calendar invite attached** or **Not scheduled — email
   only**. Nothing sends yet.
3. The organizer confirms once. Controls disable while delivery is in progress.
4. The app sends separately to each valid recipient, records every outcome, and shows sent,
   failed, or skipped beside each recipient. One failure does not block the others.
5. For an accepted scheduled session, each successful message includes exactly one `.ics` file
   with the correct UTC start/end, room/event location, stable UID, and sequence.
6. Each recipient opens the message in Gmail, Outlook, or Apple Calendar and sees the event at the
   correct local time. Adding a resend/update with the same UID does not create a duplicate.

### C. Send a task reminder

1. On Speakers, the organizer selects a speaker with an outstanding task and chooses **Send
   reminder**.
2. The inline detail pane shows the resolved reminder subject/body, task/due date, recipient, and
   calendar-attachment state. Nothing sends yet.
3. The organizer confirms. The visible result changes to sent, failed, or skipped and the
   persisted last-contact value updates after success.

### D. Inspect and recover

1. The organizer returns to Communications and sees every decision/reminder attempt in the send
   log, including recipient, subject, source submission/speaker, time, status, and safe error.
2. A failed recipient can be retried without resending to recipients that already succeeded.
3. Missing provider, missing email, missing schedule, expired identity, and network failures all
   produce a visible recovery instruction; the underlying decision/task state remains unchanged.

## 5. Expected outcome

Organizer-authored copy is what recipients receive; every relevant speaker is addressed; accepted
scheduled sessions carry a valid calendar invitation; and delivery state is visible and durable.

## 6. Visible success state

- Template save confirmation survives refresh.
- The send confirmation lists real recipients and resolved content before delivery.
- Per-recipient results appear after delivery and persist in Communications.
- Speakers see the correct event in their own calendar client.

Provider responses or database rows alone are not visible success states.

## 7. Failure and recovery states

| Failure | Visible behavior | Recovery |
|---|---|---|
| Provider missing or invalid | Send pane says delivery is unavailable; no false success | Configure Email Delivery and retry |
| Speaker email missing/invalid | Recipient is shown as skipped before confirmation | Correct the speaker profile |
| Submission not scheduled | Pane says email only; no invite is promised | Schedule it, then resend if an invite is required |
| Partial multi-recipient failure | Each result remains visible separately | Retry failed recipients only |
| Double click/request retry | Send controls remain disabled; one logical attempt is made | Wait for the current result |
| Auth expires | No provider call is made; sign-in recovery is shown | Sign in and reopen the same record |
| Refresh/back navigation | Saved templates and attempts reload from the backend | Resume from the source record or Communications |

## 8. Persistence expectations

- Templates and delivery attempts survive refresh, logout/login, and another browser session.
- Notified/last-contact indicators derive from persisted successful delivery rows.
- Calendar UID is stable for an agenda item and sequence increases after calendar-relevant edits.
- Retrying failures never erases earlier attempts or duplicates already successful recipients.

## QA execution

Execute A–D through the running app with controlled inboxes. Open one delivered invitation in
Gmail, Outlook, and Apple Calendar. Unit tests and direct action calls may supplement this run but
cannot replace it.

## 9. Execution evidence — 2026-08-12

- TypeScript passed for both app and Convex projects.
- ESLint passed with zero errors (existing repository warnings remain).
- Vitest passed all 354 tests, including reminder preview/confirmation success and provider-failure UI states.
- The production Vite build passed.
- Shared-dev deployment was attempted and rejected before function publication because three
  unrelated sponsor-management task rows contain `targetType: "sponsor"` and `sponsorId`, while
  that parallel feature's schema is not on this branch. Exact failing document:
  `k572sjv3tzs0crp9xyqnrn68058caszy`.
- Browser control could not start because the local browser runtime failed to launch. More
  importantly, the new preview/actions cannot be executed against shared dev until the sponsor
  schema conflict is merged or those documents are migrated by their owning feature.
- Real provider delivery and Gmail/Outlook/Apple Calendar opening remain unverified release gates;
  this feature must remain `blocked`, not `done`, until those steps pass with controlled inboxes.
