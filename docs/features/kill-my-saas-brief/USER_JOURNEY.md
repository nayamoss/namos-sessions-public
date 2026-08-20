# Kill My SaaS Brief — Judge Walkthrough Journey

**Persona:** a competition judge with 15 minutes, no onboarding, and no prior knowledge of Namos.
**Goal:** verify all nine brief requirements without being handed a URL list.
**Precondition:** the demo event is seeded (Phase 1 of `plan.md`) and the organizer landing page
leads with program state (Phase 2).

This is the journey the whole program is designed to make possible. It is written now, before
implementation, so that every feature package can be checked against it.

---

## Entry point

`https://<deployment>/events/ai-engineer-sandbox-event/dashboard`, signed in as an organizer.

There is exactly one entry point. Every step below is reachable from it by clicking, never by
typing a URL. If a step requires a typed URL, that step has failed.

---

## Step 1 — The landing page states the program's condition

**Sees:** a header, above the composer, in the first screenful at both 1280px and 1024px:

```
38 submissions   ·   24 awaiting decision
60 / 84 reviews complete   ·   2 reviewers behind
11 / 14 accepted sessions scheduled   ·   1 blocking conflict
43 outstanding speaker tasks   ·   6 overdue
```

**Every figure is a link.** "24 awaiting decision" → the submission list filtered to
`pending / accept_queue / maybe / decline_queue`. "2 reviewers behind" → reviewer progress.
"1 blocking conflict" → the agenda conflicts view. "6 overdue" → the task queue filtered to overdue.

**Success state:** the judge knows what this product does and what condition the event is in before
scrolling.
**Failure state to avoid:** the current behaviour — an empty composer saying "What should we work
on?" with all of the above hidden inside a collapsible 288px rail.
**Covers:** requirement 6.

## Step 2 — Follow "24 awaiting decision" into the CFP

**Does:** clicks through to submissions, opens one, sees the CFP it came from, opens that form.
**Sees:** the form builder showing a field with a visible condition ("Shown when Session format is
Workshop") and a routing rule ("When Session format is Workshop → assign sponsor Convex, set status
Accept queue"). Opens the public preview.
**Does:** on the public CFP, selects `Talk` — four fields. Selects `Workshop` — a fifth field
appears.
**Success state:** conditional logic and routing are observed, not described.
**Covers:** requirement 1.

## Step 3 — Follow "2 reviewers behind" into evaluation

**Sees:** an evaluation plan with **two rounds** and weighted criteria; an assignment table showing
reviewers across both rounds; a progress panel naming who is behind and offering a nudge.
**Does:** opens the reviewer queue and scores one submission against the rubric. Switches to the
blinded plan and observes that speaker identity is absent — not greyed out, absent.
**Success state:** multi-round, rubric-based, optionally blind human review is observed.
**Covers:** requirement 4.

## Step 4 — Follow "1 blocking conflict" into the agenda

**Sees:** the conflicts view naming two sessions sharing a room or a speaker.
**Does:** switches to the room grid, drags the offending session to a free room/time. The conflict
banner clears. Drags it back onto the occupied slot; the banner returns and `Publish schedule`
refuses with the room/speaker message. Cycles list → day → week → track → room; all populated.
Uses the keyboard move control on one session to confirm drag is not the only path.
**Success state:** drag-and-drop scheduling with real conflict detection and a publish gate.
**Covers:** requirement 5.

## Step 5 — Follow "43 outstanding speaker tasks" into speakers

**Sees:** the speaker list with onboarding state; opens one speaker.
**Sees:** bio, headshot, confirmation status, task list with overdue markers, **and the documents
that speaker has uploaded** — slides and supporting files, with names and timestamps.
**Does:** clicks a task's linked form to see what the speaker is being asked for.
**Success state:** the organizer can answer "did this speaker send their slides?" without asking.
**Covers:** requirement 2 (organizer half), requirement 6.

## Step 6 — Enter the speaker portal as a speaker

**Does:** signs in as a seeded speaker (or uses the organizer's portal preview path).
**Sees:** Home with tasks; Profile with bio, links and headshot upload; Files with slides and
supporting documents; Schedule with their own published sessions only; Availability; and
**Resources**.
**Does:** opens Resources and reads a published page containing headings, a list, a link, and one
allowlisted embed rendered inline.
**Does:** uploads a file on Files and reloads; it persists.
**Success state:** the speaker self-service surface is complete, including the wiki.
**Covers:** requirements 2 and 8.

## Step 7 — Communications and calendar invites

**Does:** returns to the organizer side, opens Communications.
**Sees:** templates grouped by kind; a delivery log with sent, queued and failed rows; a failed row
with a working retry.
**Does:** sends a reminder to a seeded speaker and a calendar invite for a scheduled session.
**Sees:** two new log rows — one `email`, one `calendar_invite` — and downloads the `.ics`.
**Success state:** templated communications, reminders and per-speaker calendar invites are
observed end to end, including the failure path.
**Covers:** requirement 3.

## Step 8 — Integrations

**Sees:** the Integrations page listing email providers, content providers, and an **Accelevents**
card.
**If credentials exist (D-4 approved):** connects, previews eligible accepted speakers and
published sessions with per-record blocked reasons, runs one sync, and sees a speaker and a session
land in the remote disposable event with the session associated to that speaker. Reruns: zero
remote writes.
**If credentials do not exist:** the card reads `Not connected`, sync is unavailable, and the
walkthrough states plainly that the remote contract is unverified.
**Success state:** either a proven one-way sync, or an honest disconnected state. Never a recorded
run presented as a real one.
**Covers:** requirement 7.

## Step 9 — Public surfaces, on a phone

**Does:** opens the embeds list, copies the iframe snippet for the speaker gallery, opens the
public URL for the gallery and the schedule itinerary at a 390×844 viewport.
**Sees:** a three-up gallery collapsing to one column with real headshots; a readable itinerary;
track filters that work with touch; no horizontal scroll; no unpublished session anywhere.
**Success state:** the public program is embeddable and usable on a phone.
**Covers:** requirement 9.

---

## Failure and recovery behaviour required by this journey

| Failure | Required behaviour |
|---|---|
| A subscription stalls (known defect, #211/#217) | Figures show a stale-data indicator with an "as of" time rather than silently asserting zero |
| A seeded query returns empty | Empty state names the missing fixture, not a generic "no data" |
| An email send fails | A `comms_log` row exists with the error and a retry control; the submission is never lost (`convex/schema.ts:585-586` precedent) |
| A drag drops onto an invalid slot | Move is rejected with the reason; the item returns to its original position |
| A resource page contains disallowed markup | The markup is stripped at write time; the author sees what was removed |
| An Accelevents record was deleted remotely | Next run recreates it and replaces the stale mapping; local state is never deleted to match |

## Persistence checks

Every step above must survive a full page reload and a sign-out/sign-in cycle. Specifically: the
uploaded document, the moved agenda item, the scored review, the published resource page, and the
Accelevents mapping are all server-persisted, not local state.
</content>
