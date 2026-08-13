# Reviewer Progress Tracking + Bulk Reminders — Requirements

**Feature folder:** `docs/features/reviewer-progress/`
**Surface:** `/program/evaluation` (organizer, Evaluation plans tab)
**Related plans:** [`evaluation-scoring`](../evaluation-scoring/plan.md) · [`comms-notifications`](../comms-notifications/plan.md)

---

## 1. Problem Statement

Sessionboard's Call for Papers page lists two review-workflow capabilities we do not have:

- *"Real-time completion rate tracking for reviewers"*
- *"Bulk reminder functionality for outstanding assignments"*

Today `/program/evaluation` renders four aggregate `StatCard`s — Evaluation plans, Assigned
reviews, Evaluated submissions, Review progress % — computed in
`src/pages/program/Evaluation.tsx` from `assignments.length` and the count of `evaluations`
rows with a score. That answers *"is the committee done?"* It does not answer the question an
organizer actually has three days before the program is locked: **which reviewer is behind,
and by how much?**

Consequences today:

1. An organizer cannot see per-reviewer completion without manually switching the "My reviewer
   queue" reviewer selector one name at a time and counting rows by eye.
2. There is no way to nudge a lagging reviewer. The retired reminder handler was
   but is **speaker-task specific** — it requires `submissionId`, `speakerId`, `sessionTitle`
   and `portalUrl`, and its body reads *"This is a reminder about '<session>' … complete your
   speaker tasks."* It cannot be pointed at a reviewer without rewriting its contract.
3. Written Brief #3 explicitly names *"reminders"* as part of a required requirement
   (see [`ROADMAP.md`](../../ROADMAP.md) — "Nothing named inside requirements 1-6 is
   cuttable"). Reviewer reminders are the review-side half of that.

This feature closes the gap with a computed per-reviewer breakdown and an organizer-triggered
reminder send that reuses the existing email delivery path.

---

## 2. Research Findings

Competitive scan of conference review tooling (Aug 2026):

| # | Finding | Consequence for this plan |
|---|---|---|
| R1 | Review platforms centre on a dashboard giving "real-time overviews of review statuses… monitoring progress and identifying bottlenecks" (Dryfta, ConfSubmitHub) | Per-reviewer progress belongs **on the existing Evaluation page**, not on a new route. Organizers expect it next to the aggregate stats. |
| R2 | EDAS sends overdue-review reminders "either in one message for each paper or in one message for each tardy reviewer" | Choose **one message per tardy reviewer**, listing their outstanding count. One email per assignment would send a reviewer with 8 open items 8 emails. |
| R3 | Systems are expected to "surface who's behind without requiring manual follow-up" | The threshold control is the product: the organizer states a bar ("under 50%") and the system selects recipients. |
| R4 | Comprehensive dashboards "take initial time to master and may offer more features than basic needs" | Keep the UI to one table + one threshold input + two button affordances. No per-reviewer charts, no deadline model, no reviewer scoreboard. |
| R5 | Bulk send is the failure-prone surface in these tools — partial failures are the norm | Per-recipient result reporting is a requirement, not a nicety. One reviewer's bounce must not report the whole batch as failed. |

Sources: [Dryfta — best peer review software](https://dryfta.com/best-peer-review-software-for-academic-conferences/) ·
[ConfSubmitHub — reviewer management](https://www.confsubmithub.com/features/reviewer-management) ·
[EDAS — managing reviews](https://edas.info/doc/reviews.html) ·
[Sessionboard — streamline your CFP](https://www.sessionboard.com/blog/how-to-streamline-your-call-for-papers)

---

## 3. User Stories

### US-1 — See who is behind

> **GIVEN** I am an organizer on `/program/evaluation` with an evaluation plan selected
> **WHEN** the page loads
> **THEN** I see a row per reviewer assigned on that plan showing their name, assigned count,
> completed count, and completion percentage, ordered least-complete first.

### US-2 — Remind one reviewer

> **GIVEN** a reviewer row showing 2 of 9 complete
> **WHEN** I press **Remind** on that row and then press **Confirm send** in the inline
> confirmation that replaces the button
> **THEN** exactly one email is sent to that reviewer naming their outstanding count and the
> row reports the outcome inline ("Reminded just now" / "Could not send — <reason>").

### US-3 — Remind everyone below a bar

> **GIVEN** six reviewers, three of whom are under 50% complete
> **WHEN** I set the threshold field to `50` and press **Remind all below 50%** and confirm
> **THEN** three emails are sent — one per reviewer, not one per outstanding assignment — and
> a per-reviewer result list reports which succeeded and which failed.

### US-4 — Nothing to remind about

> **GIVEN** every reviewer on the plan is at 100% complete
> **WHEN** I look at the reminder controls
> **THEN** the bulk remind button is disabled with the helper text "Every reviewer on this plan
> is complete." and no per-row **Remind** button is offered.

### US-5 — No reviewers yet

> **GIVEN** a plan with no assignments
> **WHEN** I view the plan
> **THEN** the progress table shows the empty state "No reviewers assigned to this plan yet."
> and the threshold control and bulk button are absent.

### US-6 — Reviewer without a deliverable address

> **GIVEN** a reviewer recorded as the demo string `Reviewer 2`, which is not an email address
> and does not match any speaker record
> **WHEN** I view their row
> **THEN** the row shows their progress normally, the **Remind** button is disabled with the
> reason "No email on file", and they are excluded from the bulk send and from its count
> ("Remind all below 50% (2 of 3 have an email)").

### US-7 — Provider not configured

> **GIVEN** no email integration is connected and no `RESEND_*` fallback is set
> **WHEN** I trigger a reminder
> **THEN** the request returns `202` with `status: "skipped"`, the progress table still renders
> normally, and each attempt is written to `comms_log` as `failed` with the provider reason —
> the page never blocks or errors. *(Rule: "Email degrades, never blocks."
> [`AGENTS.md`](../../../AGENTS.md))*

---

## 4. Functional Requirements

### Progress computation

- **FR-001** The system SHALL expose a query returning per-reviewer progress for one evaluation
  plan, derived at read time from `evaluation_assignments` and `evaluations`. It SHALL NOT
  introduce a new stored table or denormalised counter.
- **FR-002** Each returned row SHALL contain: `reviewerUserId`, `assigned` (assignment count on
  that plan), `completed` (assignments whose linked `evaluations` row has a numeric `score`),
  `completionRate` (0–100 integer, `0` when `assigned` is 0), and `toEmail` (the resolved
  address, or omitted when unresolvable).
- **FR-003** Completion SHALL be keyed on `evaluations.assignmentId`, matching the existing
  `reviewByAssignment` logic in `Evaluation.tsx`. An `evaluations` row without an
  `assignmentId` (an ad-hoc review) SHALL NOT count toward any reviewer's completion.
- **FR-004** Rows SHALL be returned sorted ascending by `completionRate`, then ascending by
  `reviewerUserId`, so the most-behind reviewer is first and the order is stable.
- **FR-005** The query SHALL be scoped by `eventId` **and** `evaluationPlanId`, and SHALL
  return an empty array for a plan that does not belong to the event rather than throwing.
- **FR-006** Progress SHALL refresh after any score is saved on the same page load, without a
  full route change.

### Email address resolution

- **FR-007** A reviewer's send address SHALL be resolved, in order: (a) `reviewerUserId` itself
  when it is a syntactically valid email address; (b) the `email` of a `speakers` row in the
  same event whose `email` equals `reviewerUserId` case-insensitively. If neither matches, the
  reviewer SHALL be marked `emailResolved: false`.
- **FR-008** Unresolvable reviewers SHALL never be sent to, SHALL never be counted in a bulk
  send total, and SHALL NOT cause the bulk send to fail.

### Reminders

- **FR-009** The system SHALL expose an organizer-triggered send that accepts either a single
  `reviewerUserId` or a `thresholdPercent`, and sends **exactly one email per reviewer**
  regardless of how many assignments are outstanding.
- **FR-010** The reminder body SHALL name the event, the plan, the reviewer's outstanding
  count, and a link to the reviewer queue. It SHALL NOT list individual submission titles
  (avoids leaking other reviewers' scope and keeps the message short).
- **FR-011** Delivery SHALL go through `convex/emailDelivery.ts`
  (`deliverEventEmail`), so a per-event Resend/SES integration is used when connected and the
  `RESEND_*` env fallback otherwise. No third send path SHALL be introduced.
- **FR-012** Every attempt — sent, failed, or skipped — SHALL write one `comms_log` row via
  `comms:recordDelivery` with `channel: "email"`.
- **FR-013** A bulk send SHALL return a per-recipient result array. A failure for one recipient
  SHALL NOT abort the remaining sends and SHALL NOT change the HTTP status of the batch.
- **FR-014** The organizer SHALL be required to pass an inline confirmation step before any
  send. Native `window.confirm` / `alert` / `prompt` SHALL NOT be used
  ([`DESIGN-SYSTEM.md`](../../DESIGN-SYSTEM.md) — inline confirmation panel).
- **FR-015** The threshold SHALL be an integer 1–100, default `50`, and SHALL select reviewers
  whose `completionRate` is **strictly less than** the threshold.
- **FR-016** The send endpoint SHALL require organizer authentication via the existing
  `requireOrganizer(request)` helper in `_email-delivery.mjs`.

### Non-functional

- **FR-017** The progress query SHALL add no more than two Convex index reads per plan
  (`evaluation_assignments.by_plan`, `evaluations.by_event`) and SHALL NOT fan out one query
  per assignment.
- **FR-018** The feature SHALL be implemented for both data adapters (`src/data/convex`,
  `src/data/airtable`) behind `EvaluationRepo`, consistent with
  [`ARCHITECTURE.md`](../../ARCHITECTURE.md).

---

## 5. Out of Scope

Explicitly **not** in this feature. Each is a deliberate cut, not an oversight.

| Excluded | Why |
|---|---|
| **Automatic or scheduled reminders** (cron, Convex scheduler, `crons.ts`, deadline-triggered sends) | Reminders are organizer-triggered on demand only. A scheduled job that fires during judging would send real email to seed addresses with nobody watching. This is the single most important exclusion. |
| Reviewer-facing deadlines / due dates on assignments | Requires a schema change to `evaluation_assignments` and a whole due-date UX. "Behind" here means *below a completion bar*, not *past a date*. |
| A stored `reviewer_progress` table or denormalised counters | Derivable data. Storing it introduces a staleness class of bug for zero read benefit at demo scale. |
| Reminder template editing in the comms template admin | The reminder body is a fixed server-side template for now. Wiring it to `comms_templates` is a follow-up once template admin UI (#28) exists. |
| Per-reviewer email address management UI | Address resolution is read-only (FR-007). Adding reviewer records with editable emails is a Clerk-identity problem, tracked separately. |
| Reviewer leaderboards, average-score-by-reviewer, reviewer bias/calibration analytics | Analytics, not workflow. Finding R4 — resist feature sprawl. |
| Reminding reviewers about a *specific* submission | Finding R2 — one message per tardy reviewer, never one per paper. |
| SMS / Slack / in-app notification channels | `comms_log.channel` only models `email` and `calendar_invite`. |
| Changes to the reviewer queue scoring UI | This feature is read + send only. |

---

## 6. Success Metrics

| # | Metric | Target |
|---|---|---|
| M1 | Time for an organizer to identify the most-behind reviewer on a plan | < 5 seconds, zero clicks after page load (currently: N reviewer-selector switches plus manual counting) |
| M2 | Emails sent to a reviewer with N outstanding assignments in one bulk run | Exactly 1, for any N |
| M3 | Bulk send with one bad address among five | 4 sent, 1 failed, 5 `comms_log` rows, batch reports partial success — never a blanket failure |
| M4 | Progress query cost | ≤ 2 Convex index reads per plan; no per-assignment fan-out |
| M5 | Reminders sent without an explicit organizer click | 0 — verified by the absence of any scheduler registration |
| M6 | Native browser dialogs introduced | 0 — `grep -rn "window.confirm\|window.alert\|window.prompt"` stays clean |
| M7 | New send paths introduced | 0 — the new function imports `deliverEventEmail` from `_email-delivery.mjs` |
