# Reviewer Rounds, Assignments, Scoring, and AI-Assist Boundaries — Design

**Last Updated:** 2026-08-17
**Status:** Planned — not implemented

## Current implementation (verified 2026-08-17)

| Concern | Location | State |
|---|---|---|
| Plans | `convex/schema.ts:308-324` — `rounds`, `scoringScaleMax` (5\|10), `criteria[]`, `anonymized?`, `aiAssistEnabled` | Complete |
| Criteria model | `convex/schema.ts:7-14` — `{ id, label, type: number\|text, max?, weight?, required }`; `text` never enters the total | Complete |
| Scores | `convex/schema.ts:18-22` — `criteriaScores[]` keyed by `criterionId`, never by index | Complete |
| Assignments | `convex/schema.ts:325-336` — indexed `by_plan_submission_reviewer_round` | Complete |
| `savePlan` | `convex/evaluations.ts:117-140` — validates 1–5 rounds, name ≤160 chars, `criteria === undefined` means "don't touch", `[]` means "clear" | Complete |
| `assign` / `assignByFilter` | `convex/evaluations.ts:305-386` | Complete |
| `myQueue` | `convex/evaluations.ts:264+` — blinded projection removes keys; `IDENTIFYING_ANSWER_KEYS` at `:194` | Complete, limitation documented |
| `reviewerProgress` | `convex/evaluations.ts:387-404` | Complete |
| UI | `Evaluation.tsx`, `ScorecardForm.tsx`, `CriteriaEditor.tsx`, `AssignByFilterCard.tsx` | Complete except rounds cap |
| Tests | `evaluation-scorecards`, `evaluation-score`, `reviewer-queue`, `reviewer-progress`, `reviewer-progress-panel`, `assignment-filter`, `evaluation-layout` | Good |

## Gap analysis

| Gap | Evidence | Kind |
|---|---|---|
| Rounds control caps at 2 | `Evaluation.tsx:726-733` — `SelectItem` values `1` and `2` only; state typed `1 \| 2` at `:723` | **Product** (UI/server contract mismatch) |
| No round advancement | No mutation creates round N+1 from round N | **Product** |
| Seeded plan is trivially simple | `convex/seed.ts:161` — `rounds: 1`, no `criteria`, `anonymized` unset | Demo |
| No blinded plan seeded | — | Demo |
| `aiAssistEnabled` read by nothing | `grep aiAssistEnabled` → schema, seed, savePlan args, types, and a hardcoded `false` at `Evaluation.tsx:399`. No consumer. | **Product** (dead flag) |

## Change 1 — Rounds 1–5

`src/pages/program/Evaluation.tsx`

- `newPlanRounds` state type `1 | 2` → `number`, clamped 1–5 on set.
- `SelectItem` list generated from `Array.from({ length: 5 })`.
- The assignment-round select at `:840-855` already derives its options from
  `selectedPlan.rounds`, so it needs no change once plans can exceed 2.
- Existing clamp at `:264` (`Math.min(Math.max(1, current), plan?.rounds ?? 1)`) already protects a
  stale round selection when a plan's round count shrinks.

No schema change. No server change. This is a UI correction to match `savePlan`.

## Change 2 — `advanceRound`

New mutation in `convex/evaluations.ts`:

```ts
export const advanceRound = mutation({
  args: {
    eventId: v.id("events"),
    evaluationPlanId: v.id("evaluation_plans"),
    toRound: v.number(),                       // must be >1 and <= plan.rounds
    submissionIds: v.array(v.id("submissions")),
    reviewerUserIds: v.array(v.string()),
    allowUnscored: v.optional(v.boolean()),    // default false
  },
  handler: async (ctx, args) => {
    // 1. assertEventOrganizerAccess(ctx, args.eventId)
    // 2. load plan; assert plan.eventId === args.eventId
    // 3. assert Number.isInteger(toRound) && toRound > 1 && toRound <= plan.rounds
    // 4. assert every submissionId belongs to this event
    // 5. assert every reviewerUserId is an event_members row with role organizer|reviewer
    // 6. for each submission: unless allowUnscored, require >=1 evaluations row whose
    //    assignmentId belongs to this plan at round (toRound - 1)
    // 7. for each (submission, reviewer): look up by_plan_submission_reviewer_round;
    //    insert only when absent
    // returns { created: number, skippedExisting: number, skippedUnscored: Id<"submissions">[] }
  },
});
```

**Idempotency:** the uniqueness check uses the existing compound index, so calling twice with the
same arguments returns `created: 0` and the same `skippedExisting` count. Nothing is updated or
deleted — this mutation only ever inserts.

**Why reviewers are an explicit argument rather than "carry forward round 1's reviewers":** a
second round usually means *different, more senior* reviewers. Carrying forward would encode the
wrong default and would make blind round-2 review impossible to staff deliberately.

## Change 3 — Seed

`convex/seed.ts`, all idempotent:

1. Patch the existing `Program committee review` plan to `rounds: 2` and add weighted criteria:
   `Relevance` (number, max 5, weight 3, required), `Depth` (number, max 5, weight 2, required),
   `Speaker readiness` (number, max 5, weight 1, required), `Notes` (text, not required).
   Use `ctx.db.patch` so a previously seeded plan gains them on rerun.
2. Insert a second plan `Blind shortlist review` with `rounds: 1`, `anonymized: true`, and the same
   criteria — this makes blind review demonstrable side by side with an unblinded plan.
3. Extend the assignment fixtures so a subset of submissions carries round-2 assignments with
   round-2 scores for one reviewer and none for another, producing a realistic mid-round state.
4. Leave the existing three `reviewerFixtures` (behind-and-reachable, complete, behind-with-no-email)
   untouched — they already produce the reviewer-progress states the demo needs.

## Change 4 — the AI-assist decision

This is a **go/no-go**, recorded as D-2 in `kill-my-saas-brief/plan.md`. The design for each branch:

### Branch A — remove the flag (recommended if Phases 0–4 run long)

- Drop `aiAssistEnabled` from `savePlan` args and the `EvaluationPlan` type.
- Leave the schema field in place as `v.boolean()` (removing a required field from a Convex schema
  requires the rows to be migrated first); mark it deprecated in a schema comment.
- Product copy states plainly that review is human-only. This is defensible and honest.

### Branch B — build it, bounded

If built, the boundary is non-negotiable and enforced structurally, not by UI convention:

- **Separate table.** Suggestions live in a new `evaluation_ai_suggestions` table, never in
  `evaluations`. There is no code path from a suggestion to a score that does not pass through a
  human-initiated mutation.

```ts
evaluation_ai_suggestions: defineTable({
  eventId: v.id("events"),
  evaluationPlanId: v.id("evaluation_plans"),
  submissionId: v.id("submissions"),
  round: v.number(),
  model: v.string(),
  // Per-criterion suggested values, same criterionId keying as evaluationCriterionScore, so an
  // accepted suggestion maps one-to-one onto a real scorecard without a translation layer.
  suggestedScores: v.array(evaluationCriterionScore),
  rationale: v.string(),
  status: v.union(v.literal("suggested"), v.literal("accepted"), v.literal("dismissed")),
  // Who acted. A suggestion with status "accepted" and no actor is a bug, not a state.
  actedByUserId: v.optional(v.string()),
  actedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_submission_round", ["submissionId", "round"])
  .index("by_event", ["eventId"]),
```

- **Generation** is an `action` gated on `assertEventOrganizerAccess` plus
  `plan.aiAssistEnabled === true`, running through the existing `agent_provider_settings` /
  `agent_managed_allowances` / `agent_usage_records` path so cost is metered like every other model
  call in this app. No new provider integration.
- **Acceptance** is `evaluations.save` called by the reviewer, with the suggestion prefilled into
  the form. The written row's `reviewerName` is the human. The suggestion row is patched to
  `accepted` with `actedByUserId`.
- **Blind-review interaction:** on an `anonymized` plan, the suggestion is generated from the same
  redacted projection `myQueue` produces. It must not be generated from the full submission — that
  would launder identity back into the reviewer's view through the rationale text.
- **UI:** a collapsed panel labelled `Suggested — not a score`, with `Use these values` and
  `Dismiss`. Never prefilled silently. Never shown on a plan with `aiAssistEnabled: false`.
- **Never:** auto-status, auto-accept, auto-decline, batch application, or a suggestion counted in
  `reviewerProgress`.

## Authorization summary

| Function | Guard |
|---|---|
| `savePlan`, `assign`, `assignByFilter`, `advanceRound` | `assertEventOrganizerAccess` |
| `listPlans` | `assertEventOrganizerAccess` |
| `listAssignments` | organizer for the all-reviewers view; self-only when `reviewerUserId` is passed (`convex/evaluations.ts:147-155`) |
| `myQueue`, `save` | reviewer identity; blinded projection applied server-side |
| AI generation (Branch B) | `assertEventOrganizerAccess` + plan flag + allowance check |

## UI states

| Surface | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Plan editor | Existing skeleton | "No evaluation plan yet" with a create action | Inline `role="alert"`, form values retained | Saved indicator, no navigation |
| Round advance dialog | Disabled confirm with spinner | "Nothing selected" — confirm stays disabled | Names which submissions failed and why | `created / skippedExisting / skippedUnscored` reported, not just "done" |
| Reviewer queue | Existing skeleton | "Nothing assigned to you" | Inline alert; queue not blanked | Score saved indicator |
| AI suggestion (Branch B) | Skeleton inside the collapsed panel | Panel absent | "Suggestion unavailable" — never blocks scoring | Values copied into the form on explicit accept |

## Risks

| Risk | Mitigation |
|---|---|
| A chair advances everything by accident | The dialog requires an explicit selection; there is no "advance all" default, and the result reports counts |
| Round-2 assignment to a reviewer who saw round 1 | Allowed and sometimes correct; surfaced in the dialog as "already reviewed in round 1" so it is a choice |
| AI rationale leaks speaker identity on a blinded plan | Generation consumes the redacted projection only |
| Weighted totals confuse reviewers | The scorecard shows per-criterion input and the weighted total separately, as it does today |
</content>
