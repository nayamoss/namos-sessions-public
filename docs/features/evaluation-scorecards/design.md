# Evaluation Scorecards — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

```ts
// convex/schema.ts
evaluation_plans: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  rounds: v.number(),
  scoringScaleMax: v.union(v.literal(5), v.literal(10)),
  // The evaluator UI deliberately leaves this as a visible stub. No AI score is generated.
  aiAssistEnabled: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]),

evaluations: defineTable({
  eventId: v.id("events"),
  submissionId: v.id("submissions"),
  assignmentId: v.optional(v.id("evaluation_assignments")),
  reviewerName: v.string(),
  score: v.optional(v.number()),
  comments: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
  .index("by_submission", ["submissionId"])
  .index("by_assignment", ["assignmentId"])
  .index("by_submission_reviewer", ["submissionId", "reviewerName"]),
```

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| evaluation_plans | ADD FIELD | `criteria` | `v.optional(v.array(criterion))` | Optional so existing plans stay valid |
| evaluations | ADD FIELD | `criteriaScores` | `v.optional(v.array(criterionScore))` | Optional; absent on legacy rows |
| evaluations | KEEP | `score` | unchanged | Read-only legacy value, never written by the new path |

Validator shapes:

```ts
const criterion = v.object({
  id: v.string(),
  label: v.string(),
  type: v.union(v.literal("number"), v.literal("text")),
  max: v.optional(v.number()),   // required when type === "number"
  weight: v.optional(v.number()), // default 1; ignored for text
  required: v.boolean(),
});

const criterionScore = v.object({
  criterionId: v.string(),
  value: v.optional(v.number()), // number criteria
  text: v.optional(v.string()),  // text criteria
});
```

No new indexes. Reads are already scoped by `by_event` / `by_assignment`.

### Migration

**None runs.** Both new fields are optional, so every existing row remains valid the moment
the schema deploys. Plans created before this change have `criteria: undefined`, which
FR-008 treats as "use the single-score path". Evaluations created before this change have
`criteriaScores: undefined` and keep rendering their `score` as a legacy value. There is no
backfill and no destructive step, which is deliberate given the deadline.

---

## Backend / API

### Affected Existing Endpoints

| Method | Path | Change |
|--------|------|--------|
| mutation | `evaluations:savePlan` | Accept optional `criteria` array; validate and persist |
| mutation | `evaluations:save` | Accept optional `criteriaScores`; make `score` optional; validate against the plan's criteria |
| query | `evaluations:list` | Returns the new field; no signature change |
| query | `evaluations:listPlans` | Returns the new field; no signature change |

### New Endpoints

None. This feature widens two existing mutations rather than adding operations, which keeps
the adapter surface unchanged and avoids the seven-file adapter dance for new ops.

### Validation & Business Logic

Server-side, in `convex/evaluations.ts`:

- `savePlan`: criterion `label` non-empty after trim; `id` unique within the plan; for
  `type: "number"`, `max` present and in `1..100`; `weight`, when present, `> 0` and `<= 100`.
  Reject with a clear `Error` message on violation — never silently coerce.
- `save`: if the plan has criteria, every `required` criterion must have a value.
  Each numeric value must be an integer in `0..criterion.max`. Any `criteriaScores` entry
  whose `criterionId` is not on the plan is dropped on write (FR-009 handles the read side).
- `save` must continue to accept the legacy shape (a bare `score`) so a plan with no criteria
  behaves exactly as today.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/pages/program/Evaluation.tsx` | Add criteria editor to the plan form; replace the single score input in the reviewer queue with the scorecard |
| `src/lib/evaluation-score.ts` | Add `weightedTotal()` alongside the existing `averageScore()` |
| `src/data/types.ts` | Add `EvaluationCriterion`, `EvaluationCriterionScore`; widen `Evaluation` and `EvaluationPlan` |
| `src/data/repo.ts` | Widen `EvaluationWrite` and `EvaluationPlanWrite` |
| `src/data/transport.ts` | Carry the new fields |
| `src/data/convex/index.ts` | No new op to map; confirm rows still normalize through the existing branch |
| `src/data/airtable/index.ts` | Mirror the widened write shapes |

### New Components

**CriteriaEditor**
- File: `src/pages/program/CriteriaEditor.tsx`
- Props: `{ criteria: EvaluationCriterion[] (required), scoringScaleMax: number (required), onChange: (next: EvaluationCriterion[]) => void (required), disabled?: boolean (optional) }`
- Location: Evaluation page → "Evaluation plans" tab → inside the plan form, in the content area below the existing name / rounds / scale fields
- Elements:
  - Section label: "Scoring criteria" (`text-sm font-medium`)
  - Helper text: "Reviewers score each criterion. Weights decide how much each one counts." (`text-sm text-muted-foreground`)
  - One row per criterion, each containing:
    - Label text input (placeholder "Originality")
    - Type select: "Score" | "Comment"
    - Max number input (shown only when type is Score, default 5)
    - Weight number input (shown only when type is Score, default 1)
    - Required checkbox
    - Remove button (icon, `variant="ghost"`)
  - "Add criterion" button (`variant="outline"`, `size="sm"`) below the rows
  - Empty state (no criteria yet), inside a card `bg-neutral-100 rounded-[12px] p-8`: Lucide `ListChecks` icon size 40 muted, heading "No criteria yet", subtext "Reviewers will record a single overall score until you add criteria.", CTA button "Add criterion" using the accent style
  - Inline error text (`text-sm text-destructive`) directly under any offending row
- Behavior:
  - "Add criterion" appends a row with a generated id, empty label, type Score, max = plan's `scoringScaleMax`, weight 1, required true
  - Editing any field calls `onChange` with the full next array — the parent owns state
  - Remove deletes that row immediately; no confirmation, since nothing is persisted until the plan is saved
  - Duplicate or empty labels surface inline error text and block the parent's save
- Third-party: none

**ScorecardForm**
- File: `src/pages/program/ScorecardForm.tsx`
- Props: `{ criteria: EvaluationCriterion[] (required), values: EvaluationCriterionScore[] (required), scoringScaleMax: number (required), onChange: (next: EvaluationCriterionScore[]) => void (required), error?: string (optional), saving?: boolean (optional) }`
- Location: Evaluation page → "My reviewer queue" tab → the active review panel, replacing the current single score input, above the existing comments textarea
- Elements:
  - One block per criterion:
    - Criterion label (`text-sm font-medium`), with "Required" as muted suffix text when applicable
    - For Score type: a row of buttons `0..max`, the selected one filled with the accent colour
    - For Comment type: a `Textarea`, 3 rows
  - Running weighted total, right-aligned: "Total 4.25 / 5" (`text-sm font-medium`)
  - Loading state: skeleton rows while the queue is loading
  - Empty state (plan has no criteria): falls back to the existing single score input — this component renders nothing
  - Error state: inline `text-sm text-destructive` above the save button, naming the first missing required criterion
- Behavior:
  - Clicking a value button sets that criterion's value and recomputes the total live
  - The parent's save button is disabled while `saving` is true, or while a required criterion is unset
  - Reopening an already-scored review prefills every value from `values`
- Third-party: none

---

## State / Data Flow

Data originates in Convex. `Evaluation.tsx` already loads plans, assignments and reviews via
`repo.evaluations.listPlans` / `listAssignments` / `list` into local `useState` on mount.

Criteria flow: `evaluation_plans.criteria` → `repo.evaluations.listPlans` → `plans` state →
selected plan → `CriteriaEditor` (edit path) and `ScorecardForm` (score path).

Scores flow: reviewer input → `criteriaScores` local draft state in `Evaluation.tsx`
(alongside the existing `scoreDraft` / `commentsDraft`) → `repo.evaluations.save` → Convex →
the component re-fetches the review list on success, which is the existing pattern at the
end of the current save handler.

Re-renders trigger on: plan selection change, active assignment change, any criterion value
change, and the post-save refetch.

---

## Auth / Permissions

Program chairs configure criteria; reviewers score. Today the app has **no authorization at
all** — `ctx.auth` and `getUserIdentity` appear in zero Convex functions, and the reviewer is
chosen from a demo dropdown.

This feature must not attempt to solve that. It adds no new permission checks and no new
exposure: `criteria` is organizer-authored configuration and `criteriaScores` is scoped to
an assignment the reviewer already selects today. When the in-flight Clerk work lands, the
`requireIdentity` guard added to `convex/evaluations.ts` covers these mutations automatically,
because they are the same two mutations that already exist.

One instruction for the implementer: do not add `reviewerUserId` filtering here. That belongs
to the auth work and would conflict with it.

---

## Edge Cases & Error States

- **Plan has no criteria** — reviewer queue shows the current single score input. Explicitly the fallback in FR-008, not an error.
- **Loading** — skeleton rows in the queue, matching the existing `SkeletonList` usage on the page.
- **Empty** — no criteria configured yet: the card empty state described in CriteriaEditor.
- **API failure on save** — inline `text-sm text-destructive` above the save button with the server's message; the draft values stay in state so nothing the reviewer typed is lost.
- **Validation failure** — blocked client-side before the call, with the first offending criterion named inline.
- **Criterion deleted after scoring** — orphaned `criteriaScores` entries are ignored on read; the total recomputes over surviving criteria only.
- **All weights zero or criteria all text** — the weighted total renders "—" rather than dividing by zero.
- **Legacy review opened** — the scorecard shows unset values and a muted "Legacy score: 4/5" line above it.

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Criteria scope | Per evaluation plan | Reuses an existing table; no new table, no round-config UI. Sessionboard is per-round, but per-plan captures the graded behaviour at a fraction of the cost. |
| Weighting | Supported, default 1 | The CFP page explicitly says "weighted evaluation criteria". Defaulting to 1 means unweighted use costs the chair nothing. |
| Legacy scores | Kept and labelled | No migration hours before a deadline. Optional fields make old rows valid on deploy. |
| New operations | None | Widening two existing mutations avoids the seven-file adapter dance, where a missed file fails at runtime rather than compile time. |
| Total computation | Pure function in `src/lib/` | Unit-testable without React, matching the existing `evaluation-score.ts`. |
| Criterion types | `number` and `text` only | Dropdowns and file uploads are Sessionboard features but not graded; they can be added later without a schema change. |

## Dependencies

**Requires:** nothing. Deliberately independent of the in-flight Clerk work so the two can land in either order.

**Enables:** blind/anonymous review (needs a per-plan flag next to `criteria`), reviewer progress tracking, and reviewer assignment by tag or track.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Adapter layer missed — fails at runtime, not compile time | Task list names every adapter file explicitly; contract test must cover the widened shapes |
| Conflicts with the in-flight `feat/clerk-backend` branch, which is editing `convex/evaluations.ts` | Land the Clerk branch first, then rebase this onto it. Do not develop the two in parallel against the same file. |
| Scope creep into per-round scorecards | Explicitly out of scope in requirements; criteria live on the plan |
| Breaking the existing single-score path | FR-008 fallback is an acceptance criterion and must have a regression test |
