# Communications, Reminders, and Calendar Invites — User Journey

**Status:** Planned. Must be driven in a browser against an event with a real email integration.
Sends to `@seed.invalid` addresses will fail at the provider; that is expected and is itself part
of the failure-path journey.

---

## Journey A — Chair sends a decision with a calendar invite

**Entry point:** organizer → submissions → an accepted submission with a scheduled session.

| Step | Action | Expected |
|---|---|---|
| A1 | Open the submission | Status `accepted`; a scheduled agenda item is linked |
| A2 | Preview the decision email | Rendered with tokens resolved: speaker name, event name, session title, portal URL, schedule time, location |
| A3 | Send | Two `comms_log` rows appear — one `email`, one `calendar_invite` — both against the same speaker |
| A4 | Download the `.ics` | Exactly one `BEGIN:VCALENDAR`; content type `text/calendar; charset=utf-8; method=REQUEST`; `UID` matches the agenda item's `calendarUid` |
| A5 | Add it to a calendar client | Event appears at the right time in the event's timezone |
| A6 | Move the session to another room on the agenda, re-send | Same `UID`, higher `SEQUENCE`; the calendar client **updates** the existing entry rather than creating a second one |
| A7 | Send a decision for a submission with no scheduled session | Email sent, no calendar invite, no error — the invite is conditional, not a failure |
| A8 | Send a decision for a submission that is still `pending` | Blocked with "a decision can only be sent once the submission is accepted or declined" |

**Success state:** templated communication plus a per-speaker calendar invite that stays correct
when the schedule changes.

## Journey B — Chair sends a manual reminder

**Entry point:** organizer → Speakers → a speaker with an overdue task.

| Step | Action | Expected |
|---|---|---|
| B1 | Open the speaker | Overdue task visible |
| B2 | Preview the reminder | Reminder template resolved with this speaker's tokens |
| B3 | Send | One `comms_log` row, `dispatchedBy` starting `user:` |
| B4 | Speaker's own view | The task is **not** marked complete — a reminder is a nudge, not a completion |
| B5 | Speaker with no email on file | The send control is disabled with a stated reason, not silently absent |

## Journey C — Chair turns on automatic reminders

**Entry point:** organizer → Communications → Automation.

| Step | Action | Expected |
|---|---|---|
| C1 | Open Automation with nothing configured | "Reminders are sent manually" plus an enable action |
| C2 | Enable `task_overdue_reminder`, offset 24h, cooldown 72h | Saved; the UI states explicitly that tasks already overdue will not be retro-reminded |
| C3 | Wait for the first pass (or invoke the dispatcher) | `Last run <time> · N reminders dispatched` |
| C4 | Check the log | One row per dispatched speaker, `dispatchedBy` starting `schedule:` |
| C5 | Invoke the pass again immediately | Zero new sends — the cooldown window is already claimed |
| C6 | Create a new overdue task, wait for the next pass | That speaker is reminded; previously reminded speakers are not |
| C7 | Disconnect the email integration, run the pass | No sends attempted; the run summary states why |
| C8 | Re-enable the schedule after disabling it | `activatedAt` resets; the backlog is not flushed |

**Failure state to avoid:** enabling automation and immediately mailing everyone who has ever been
overdue. That is the single worst outcome of this feature and NFR-004 exists to prevent it.

## Journey D — Chair recovers a failed send

**Entry point:** organizer → Communications → Delivery log.

| Step | Action | Expected |
|---|---|---|
| D1 | Find a `failed` row | The provider error is shown, unredacted enough to act on and without leaking credentials |
| D2 | Click `Retry` | A **new** row appears with `attemptCount: 2`, linked to the original |
| D3 | Look at the original row | Still present, still `failed` — evidence is never rewritten |
| D4 | Retry a row that succeeds | New row `sent`; the pair reads as failure-then-recovery |
| D5 | Look for `Retry` on a `sent` row | Not offered |
| D6 | Retry past the attempt bound | Blocked with a stated reason and a pointer to the integration settings |
| D7 | Retry after the session was rescheduled | The re-sent message carries the **new** time — retry re-derives, it does not replay |

**Recovery guarantee:** a provider outage never loses a submission. `comms_log` is written before
the outcome is known, and `submission_confirmation_requests.commsLogId`
(`convex/schema.ts:667-672`) exists precisely so that a confirmation attempt is provable even when
every later step fails.

## Journey E — Judge verifies requirement 3 in the seeded demo

| Step | Action | Expected |
|---|---|---|
| E1 | Open Communications | Templates for every kind, each with a plain-language description |
| E2 | Read the log | Sent, queued, failed, and calendar-invite rows all present in the seed |
| E3 | Click into a calendar-invite row | Linked to a real scheduled session and a real speaker |
| E4 | Open Automation | A configured but disabled schedule, demonstrating the mechanism without the demo emitting mail |
| E5 | Click `Retry` on the seeded failed row | Works, producing the failure-then-recovery pair |

## Authorization and privacy checks

| Attempt | Expected |
|---|---|
| Reviewer opens the communications log | Blocked |
| Organizer of another event retries a log row | Blocked |
| Public API token with any scope reads `comms_log` | No such scope exists (`convex/schema.ts:181-184`) |
| Any browser query returns a `credentialEnvelope` | Never — provider credentials are action-only |
| The dispatcher is invoked over HTTP | No route exists |
</content>
