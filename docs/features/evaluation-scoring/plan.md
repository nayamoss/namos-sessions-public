# Evaluation & Scoring

**Phase 6 · ~6-8h** · Written Brief #4 · Walkthrough: *Program > Evaluation*

Routes: `/program/evaluation` (admin), `/program/evaluation/queue` (reviewer)

## Goal

Conference committee reviews submissions. Admin creates evaluation plans and assigns
submissions to reviewers; reviewers see only their own queue and score.

From the walkthrough: *"we can create evaluation plans… and we can assign sessions to be
evaluated by conference committees. So here we can say, all right, this team is evaluating
whatever numbers of submissions… as an evaluator I can look through all these things."*

## Screens

**Admin — Evaluation Plans:** list of plans; create plan (name, rounds, scoring scale max);
assign submissions → reviewers as a **multi-select table, not drag-and-drop** (DnD isn't worth
the hours here). Progress per plan: assigned / evaluated / in progress.

**Reviewer — My Queue:** only rows from `evaluation_assignments` for the current user. Per
submission: the abstract content, a score input (1..`scoringScaleMax`), comments, submit.
Advance to next unscored item.

Dashboard cross-reference: the *Evaluations* tab shows "Review progress", "Evaluation 2.0
plans: 1", "Evaluated submissions", "Reviews in progress", "Most active plan".

## Schema

```ts
evaluation_plans: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  rounds: v.number(),
  scoringScaleMax: v.number(),        // 5 or 10
  aiAssistEnabled: v.boolean(),       // stub — see below
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]),

evaluation_assignments: defineTable({
  evaluationPlanId: v.id("evaluation_plans"),
  submissionId: v.id("submissions"),
  reviewerUserId: v.string(),
  round: v.number(),
  createdAt: v.number(),
}).index("by_plan", ["evaluationPlanId"])
  .index("by_reviewer", ["reviewerUserId"]).index("by_submission", ["submissionId"]),

evaluation_scores: defineTable({
  assignmentId: v.id("evaluation_assignments"),
  submissionId: v.id("submissions"),
  reviewerUserId: v.string(),
  round: v.number(),
  score: v.number(),
  comments: v.optional(v.string()),
  aiSuggestedScore: v.optional(v.number()),   // stub, likely unused
  aiRationale: v.optional(v.string()),
  submittedAt: v.number(),
}).index("by_submission", ["submissionId"])
  .index("by_reviewer", ["reviewerUserId"]).index("by_assignment", ["assignmentId"]),
```

`submissions.rating` is the denormalized average, written on score submit so the Abstracts
grid can sort by it without a join.

## AI-assisted review — stub only, deliberately

Written Brief #4 says "including optional AI-assisted review". But swyx said on the
walkthrough: **"I don't care about the AI workflow thing."** He pre-rejected it. The schema
fields exist; leave them unused and note the deliberate cut in the README. Spending hours here
to look impressive is spending hours on something the judge told you he doesn't value.

## The decision action

`decideSubmission(id, status)` lives here conceptually but is called from the Abstracts grid:

- flips `submissions.status` (including into/out of the queue states)
- on transition to `accepted`, **auto-creates the default onboarding task set**
- **must be idempotent** — Airtable has no transactions, so a retry must not double-create
  tasks (see [`ARCHITECTURE.md`](../../ARCHITECTURE.md))
- optionally triggers the decision email (see [comms-notifications](../comms-notifications/plan.md))

## Tasks

1. `EvaluationRepo`
2. Plans list + create/edit
3. Assignment UI (multi-select table)
4. Reviewer queue + scoring form
5. Write-through of `submissions.rating`
6. `decideSubmission` incl. idempotent task creation
7. Reviewer role gating — a reviewer must not see the full admin surface (done: `evaluations:myQueue`
   joins a reviewer's own assignments server-side, and the page falls back to a reduced
   queue-only surface when the organizer-scoped load is refused)

## Verification

- [x] Reviewer A cannot see reviewer B's assignments (index lookup is scoped to the caller's own
      verified identity; `myQueue` returns no other reviewer's name, submission, or plan)
- [ ] Score submission updates the grid's Rating column
- [ ] Accept creates onboarding tasks exactly once, even on double-click
- [ ] Multi-round assignment works (round 2 doesn't overwrite round 1)

## Cut line

Keep: plans, assignment, reviewer queue, scoring, accept/decline. Droppable: multi-round
(ship round 1 only), per-plan progress stats, AI assist (already stubbed).
