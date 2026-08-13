# Reviewer Assignment by Tag or Track — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-11

## Problem Statement

There is exactly one way to create review assignments in this product today, and it is manual.
`convex/evaluations.ts` exposes a single `assign` mutation that takes a literal
`submissionIds: v.array(v.id("submissions"))` and a literal `reviewerUserIds: v.array(v.string())`,
and the UI that feeds it — the "Assign submissions" card in `src/pages/program/Evaluation.tsx` —
is a checkbox-per-row table over *every* submission in the event with no filter, no search and no
grouping. An organizer who wants "every AI-tagged abstract goes to these three reviewers" has to
find those rows by eye, tick them one at a time, and repeat the exercise for each topic. At two
hundred submissions this is not a workflow, it is data entry, and it is data entry where a missed
checkbox silently means an unreviewed submission.

The data to do better already exists and is already populated. `submissions.tagIds` is an optional
array of `tags` ids (`docs/features/tags-library/plan.md`, issue #27) and `submissions.trackId` is
an optional `tracks` id; both are on the table in `convex/schema.ts` today, both are organizer-
maintained, and neither is used by the evaluation surface at all.

Sessionboard's Call for Papers page — the host's named primary interest — lists **"reviewer
assignment by tag or track"** as a review-workflow capability. Requirement 4 (submission evaluation
workflows) is graded and unstruck, and sits second in the host's own priority order: *"we have to
**evaluate them** and put them on the schedule and communicate them and make them show up."*

External practice agrees on the shape, and on the shape of what to leave out. Large conferences
route submissions to reviewers on **subject area / track** as the primary signal, solving the
remaining allocation as an optimization under load and conflict constraints
([CSCW 2026 review process](https://cscw.acm.org/2026/blog/reviewprocess.html)). Abstract-management
platforms sell topic-and-track routing as the headline automation — categorize on the submission
form, then pair the submission with reviewers who know the niche
([vFairs](https://www.vfairs.com/blog/best-abstract-management-software/)). The mature platforms
then layer two further things on top: **workload balancing** and **conflict-of-interest detection**
([Dryfta](https://dryfta.com/best-peer-review-software-for-academic-conferences/)). Current best-
practice writing frames balancing as a fairness objective in its own right — max-min fairness over
reviewer load rather than raw throughput
([Lumina Datamatics](https://www.luminadatamatics.com/resources/blog/balancing-speed-and-quality-best-practices-for-efficient-peer-review-management-in-2026/)),
and 2026 conference programs are experimenting with reviewer-activity monitoring to reallocate work
before deadlines slip ([NeurIPS 2026](https://neurips.cc/Conferences/2026/ai-reviewing-experiment)).

The reading for this build: **the routing signal is the cheap 80%, and the optimizer is not.**
Ship filter-driven bulk assignment; name load balancing and COI as out of scope rather than
pretending a hackathon build does what OpenReview does.

## User Stories

**As a** program chair **I want to** assign every submission carrying a given tag to a set of
reviewers in one action **so that** topic experts get the submissions they are experts in without
me ticking two hundred checkboxes.

**Acceptance Criteria:**
- GIVEN an event with tags in its library WHEN I open Program → Evaluation → Evaluation plans THEN I can choose a tag as an assignment filter
- GIVEN I have chosen a tag, one or more reviewers, a plan and a round WHEN I confirm THEN every submission carrying that tag is assigned to every selected reviewer for that plan and round
- GIVEN the assignment completes THEN the assignment table and the per-plan progress counts reflect the new rows without a page reload

**As a** program chair **I want to** assign by track instead of tag **so that** a track chair
receives their whole track in one action.

**Acceptance Criteria:**
- GIVEN an event with tracks configured WHEN I switch the filter to Track THEN I can choose one track and the tag select is cleared and hidden
- GIVEN a track is chosen WHEN I confirm THEN every submission whose `trackId` matches is assigned to every selected reviewer

**As a** program chair **I want to** see exactly how many assignments I am about to create
**so that** I do not fat-finger a bulk write I cannot undo.

**Acceptance Criteria:**
- GIVEN I have chosen a filter and reviewers WHEN the form is complete THEN a live preview line states the matched submission count, the reviewer count and their product, in words, before I can confirm
- GIVEN the preview reads zero matched submissions THEN the confirm control is disabled and the preview explains why
- GIVEN I press the primary control THEN nothing is written until I press a second, explicitly-labelled inline confirm control in the same card
- GIVEN the write completes THEN an inline result line states how many assignments were created and how many were skipped as already existing

**As a** program chair **I want** re-running the same bulk assignment to be harmless **so that** a
double-click or a retry after a network blip does not duplicate anyone's queue.

**Acceptance Criteria:**
- GIVEN an assignment already exists for a plan, round, submission and reviewer WHEN a bulk assignment covers that same combination THEN no second row is created and the result line counts it as skipped
- GIVEN I run the same filter twice in a row THEN the second run reports zero created and N skipped

## Functional Requirements

- **FR-001:** A new Convex mutation resolves a tag-or-track filter to a set of submissions **server-side** and creates assignments. The client never sends a submission id list for this path.
- **FR-002:** The filter is **single-dimension** in v1: exactly one tag, or exactly one track, never both and never a list of either.
- **FR-003:** The mutation reuses the exact assignment semantics of the existing `assign` mutation — the full cross product of matched submissions × selected reviewers, idempotent per (plan, submission, reviewer, round) via the existing `by_plan_submission_reviewer_round` index.
- **FR-004:** The existing `assign` mutation keeps its current arguments, return type and behaviour. This feature is an additive second entry point on top of shared logic, not a rewrite.
- **FR-005:** Filter resolution excludes submissions in `draft` and `withdrawn` status. Every other status is eligible.
- **FR-006:** The tag or track named by the filter must belong to the same event; a cross-event id is rejected with a clear error.
- **FR-007:** The mutation returns a result object carrying the matched submission count, the created count, the skipped-as-existing count and the created assignment ids.
- **FR-008:** The organizer sees a live preview of the impact — matched submissions, reviewers, and total assignments — before any write is possible.
- **FR-009:** The write is gated by a two-step **inline** confirmation inside the card. No `window.confirm`, no `alert`, no `prompt`, no overlay dialog.
- **FR-010:** A bulk run that would create more than 500 assignment rows is rejected with a message telling the organizer to narrow the filter or split the reviewer set. Nothing partial is written.
- **FR-011:** The mutation calls `requireIdentity(ctx)` as its first statement, matching every other function in `convex/evaluations.ts`.
- **FR-012:** Zero matched submissions is an explicit, non-error state: the preview says so and the confirm control is disabled. It must never present as a failed write.
- **FR-013:** The feature adds no field to `evaluation_plans` and changes no existing table. It is schema-neutral.

## Non-Functional Requirements

- **NFR-001:** No schema change and no new index. Filter resolution reads submissions through the existing `by_event` index and filters in the handler.
- **NFR-002:** One mutation round-trip per bulk assignment. The preview costs zero extra network calls — it is computed from data the Evaluation page already loads.
- **NFR-003:** UI complies with `docs/DESIGN-SYSTEM.md`: no borders, shadows, gradients, dividers or blue buttons; radii ≤ 14px; page header holds only the title; filters left and actions right in the toolbar row.
- **NFR-004:** Additive to `feature/56-evaluation-scorecards`, `feature/57-blind-review` and `improvement/59-reviewer-progress`. It touches no field and no function those three claim.

## Out of Scope

Named here so they are visibly deferred rather than quietly missing.

- **Automatic load balancing / reviewer capacity.** Assigning "3 reviewers per submission, spread evenly across a 12-person committee under a per-reviewer cap" is a constrained optimization, which is what the mature platforms actually run — max-min fairness over reviewer load, plus reviewer-activity monitoring to reallocate before deadlines slip ([Lumina Datamatics](https://www.luminadatamatics.com/resources/blog/balancing-speed-and-quality-best-practices-for-efficient-peer-review-management-in-2026/), [NeurIPS 2026](https://neurips.cc/Conferences/2026/ai-reviewing-experiment), [Dryfta](https://dryfta.com/best-peer-review-software-for-academic-conferences/)). v1 assigns **all** selected reviewers to **all** matched submissions, which is the semantics the existing `assign` mutation already has. A chair who wants balance splits the work by running the filter once per reviewer subset. Building a solver here would cost more than the whole rest of the feature and would be the wrong thing to spend hackathon hours on.
- **Conflict-of-interest avoidance** (a reviewer assigned their own submission). This is the other capability the platforms pair with topic routing, and it is genuinely important. It is deferred for a concrete reason, not for convenience: **there is no mapping in this codebase from a `reviewerUserId` to a `speakers` record.** Reviewers are Clerk subjects (and, on the current UI, demo strings from `DEMO_REVIEWERS`); authors are `speakers` rows keyed by email. Until reviewer identities are real Clerk users with resolvable emails, any COI check would be a string-comparison guess that fails silently. The design names the exact hook point so it can be added in one place later.
- **Combined tag + track filters**, multi-tag filters, and boolean expressions (`AI AND NOT Sponsored`). Each additional dimension multiplies the UI states — filter chips, an AND/OR toggle, an empty-intersection state — for a workflow a chair can achieve with two sequential runs. Single-dimension keeps the surface to one radio and one select.
- **Filtering by anything other than tag or track** — status, form, submission date, speaker attribute. The Sessionboard capability is specifically "by tag or track".
- **Bulk unassign / undo.** There is no unassign mutation in the codebase at all today, for either the manual or the bulk path. This feature does not add one. See Risks in `design.md` — this is the single largest risk the feature carries, and the mitigation is the preview and the confirm step, not a rollback.
- **Saved / persisted assignment rules** that auto-apply to future submissions as they arrive. Note that `submission_forms.routingRules` already carries an unused `reviewerUserIds` field, which is where that would eventually live; this feature deliberately does not touch it.
- **Per-round differing filters** stored on the plan. The organizer picks the round at run time.
- **Airtable support.** The Airtable adapter already rejects the evaluation-plan lifecycle operations, including `evaluations.assignments.assign`. The new operation joins that rejection list rather than pretending to work.

## Success Metrics

- Assigning one tag's worth of submissions to three reviewers takes **one confirmed action** instead of one checkbox per submission.
- The number of client→server round trips to assign a whole track is **1**, independent of how many submissions the track holds.
- Re-running an identical bulk assignment creates **0** rows and reports the skip count.
- Zero native browser dialogs introduced (`grep -rn "window.confirm\|window.alert\|window.prompt" src/` stays at its current count).
- The README can claim "reviewer assignment by tag or track" against the Sessionboard CFP page with a demo path a judge can walk in under 30 seconds.
