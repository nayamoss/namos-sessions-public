# Dashboard

> **2026-08-11 correction:** Speaker Tracking is moving to the canonical Program-level
> [`Speakers` operations workspace](../speaker-operations/plan.md). The dashboard keeps Today
> orientation and a concise needs-attention link; it must not duplicate the full queue.

**Phase 12 · ~2-3h** · Screenshots: *Dashboard* (brief p.30-33)

Route: `/dashboard` · Admin only

## Status: optional orientation; speaker operations are owned elsewhere

swyx labeled this screenshot **"(optional but nice to have, best efforts)"**.

Written Brief #6 — *"real-time dashboard showing which speakers still have outstanding
onboarding tasks"* — is not optional, but a duplicated passive tab is not the right product
surface. It is now owned by the [Speaker Operations workspace](../speaker-operations/plan.md).

> **Keep Dashboard concise. Link into Speaker Operations; never embed the full queue here.**

## What their dashboard actually has

Header: *"SATURDAY, AUGUST 8 · 65 DAYS TO EVENT"*, *"Good morning, Sw"*, `+ Add Dashboard`.

**Dashboard tabs:** Today · Review Progress · Speaker Tracking · Submissions Pipeline

**Today** — stat cards (Submissions 4, Accepted Speakers 2, Exhibitors 0, Sponsors 0);
SUBMISSION STATUS row (Accepted 1 · Pending 3 · Declined 0 · Drafts 0 · Withdrawn 0); then a
**smart-nudge line**:
> *"Also check: 1 accepted sessions still need a time slot on the agenda (Agenda) · 3 session
> submissions are awaiting a decision (Participants) · +1 more"*

Sub-tabs beneath: Submission Forms (submission pacing chart w/ "days before event" vs
"calendar date" toggle, per-form progress cards, Recent Submissions table) · Participants
(participants-by-role bar, submission-status donut, *"2 accepted speakers are missing a bio or
headshot"*) · Evaluations (review progress) · Agenda.

**Speaker Tracking** — *"Confirmation status, outstanding tasks, and an overdue list for
accepted speakers."* Widgets: ACCEPTED SPEAKERS · OUTSTANDING SPEAKER TASKS · TOP SPEAKERS BY
OUTSTANDING TASKS · SPEAKER CONFIRMATION MIX.

**`+ Add Dashboard`** opens a gallery of prebuilt templates (Event Overview, Submissions
Pipeline, Speaker Tracking, Review Progress, Evaluation Plans by Tracks, Schedule Health) plus
**AI prompt** and **Build manually** tabs.

> **Do not build the dashboard builder.** It's a product in itself, and it's inside a screen he
> marked optional. Hardcode the views.

## What to build now

**Must:** Today stat cards and submission status counts already derived from Dashboard data.

**Must:** a concise needs-attention nudge that links to
`/program/speakers?view=needs-attention` when accepted speakers have unfinished onboarding work.

**Nice:** the rest of the smart-nudge line. *"N accepted sessions
still need a time slot"* is a real workflow prompt, cheap to compute, and it demonstrates
understanding of the job rather than just cloning boxes.

**Remove:** the Today / Speaker Tracking tab bar and `SpeakerTrackingContent` import. A one-view
Dashboard does not need tabs.

**Skip:** dashboard builder, AI prompt, template gallery, pacing charts, Add Widget, custom dashboards.

## Code reuse

Kanrei's `src/pages/Dashboard.tsx` already has the card-grid layout, Recharts scaffolding, and
a "Recent X" list pattern. Swap the compliance metrics for these. This is why the estimate is
2-3h rather than a day.

## Tasks

1. Today stat cards + submission status row
2. Smart-nudge computation (unscheduled accepted sessions, awaiting decisions, speakers needing
   onboarding attention)
3. Remove the duplicated Speaker Tracking tab and client-side tab state

## Verification

- [ ] Speaker needs-attention count matches the [Speaker Operations](../speaker-operations/plan.md)
  queue and [portal-tasks](../portal-tasks/plan.md) admin view
- [ ] Nudges link through to the relevant filtered screen
- [x] Dashboard renders no duplicated Speaker Tracking workspace or one-item tab bar
- [ ] Seeded data makes the Today surface non-zero; the genuine empty state remains tested

## Cut line

Cut Dashboard enhancements before cutting any part of [Speaker Operations](../speaker-operations/plan.md).
If time is truly gone, keep the Today counts and link directly to the speaker queue.
