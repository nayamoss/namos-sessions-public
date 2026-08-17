# Evaluation Scorecards — Implementation Plan

> **Sequencing note:** `feat/clerk-backend` is currently editing `convex/evaluations.ts`.
> Land that branch first, then rebase this one onto it. Do not develop both against that
> file at the same time.

## Phase 1: Schema & Types

- [x] T001: Add the `criterion` and `criterionScore` validators to `convex/schema.ts`; add optional `criteria` to `evaluation_plans` and optional `criteriaScores` to `evaluations`. Keep `score` exactly as it is.
- [x] T002: Add `EvaluationCriterion` and `EvaluationCriterionScore` to `src/data/types.ts`; widen `Evaluation` and `EvaluationPlan`.
- [x] T003: Widen `EvaluationWrite` and `EvaluationPlanWrite` in `src/data/repo.ts`. `score` becomes optional.
- [x] T004: Carry the new fields through `src/data/transport.ts`.
- [x] T005: Mirror the widened write shapes in `src/data/airtable/index.ts`.
- [x] T006: Confirm `src/data/convex/index.ts` needs no new op mapping (no new operations are added) and that evaluation rows still normalize through the existing row-normalizing branch. **If a row type stops normalizing, this fails at runtime, not compile time — verify by reading, not by assuming.**
- [x] T007: `npx convex dev --once` to push the schema. Confirm existing rows still load.

## Phase 2: Backend Validation

- [x] T008: In `convex/evaluations.ts` `savePlan`, accept and persist `criteria`. Validate: non-empty trimmed labels, unique ids within the plan, `max` present and `1..100` for number criteria, `weight` `>0` and `<=100` when present. Throw a clear `Error` on violation.
- [x] T009: In `convex/evaluations.ts` `save`, accept optional `criteriaScores` and make `score` optional. Validate every `required` criterion has a value and each numeric value is an integer within `0..max`. Drop entries whose `criterionId` is not on the plan.
- [x] T010: Confirm the legacy path still works — a `save` call carrying only `score` behaves exactly as today.

## Phase 3: Scoring Logic

- [x] T011: Add `weightedTotal(criteria, scores, scoringScaleMax)` to `src/lib/evaluation-score.ts`. Formula: `sum(value_i × weight_i) / sum(weight_i × max_i) × scoringScaleMax`, over `number` criteria only. Return `undefined` when the denominator is zero.
- [x] T012: Unit-test `weightedTotal` — weighted example matching the requirements doc, equal-weight case, all-text case, zero-weight case, orphaned criterion id, empty criteria.

## Phase 4: Frontend UI

> A feature is NOT done until it is visible and usable in the UI.

### UI Spec

**CriteriaEditor** — `src/pages/program/CriteriaEditor.tsx`

- **Location:** Evaluation page → "Evaluation plans" tab → inside the plan form, in the content area below the existing name / rounds / scale fields.
- **Elements:**
  - Section label "Scoring criteria" (`text-sm font-medium`)
  - Helper text "Reviewers score each criterion. Weights decide how much each one counts." (`text-sm text-muted-foreground`)
  - One row per criterion: label text input (placeholder "Originality"); type select "Score" | "Comment"; max number input (Score only, default 5); weight number input (Score only, default 1); required checkbox; remove icon button (`variant="ghost"`)
  - "Add criterion" button (`variant="outline"`, `size="sm"`) below the rows
  - Empty state inside a card `bg-neutral-100 rounded-[12px] p-8`: Lucide `ListChecks` icon size 40 muted, heading "No criteria yet", subtext "Reviewers will record a single overall score until you add criteria.", accent CTA button "Add criterion"
  - Inline error text (`text-sm text-destructive`) directly under the offending row
- **Behavior:** Add appends a row with a generated id, empty label, type Score, max = plan's `scoringScaleMax`, weight 1, required true. Any edit calls `onChange` with the full next array; the parent owns state. Remove deletes immediately with no confirmation, since nothing persists until the plan is saved. Duplicate or empty labels show inline errors and block the parent's save.
- **Data:** reads/writes `criteria` on the plan draft in `Evaluation.tsx`; persisted via `repo.evaluations.savePlan`.

**ScorecardForm** — `src/pages/program/ScorecardForm.tsx`

- **Location:** Evaluation page → "My reviewer queue" tab → active review panel, replacing the current single score input, above the existing comments textarea.
- **Elements:**
  - Per criterion: label (`text-sm font-medium`) with muted "Required" suffix where applicable; for Score, a row of buttons `0..max` with the selected one filled in the accent colour; for Comment, a `Textarea` of 3 rows
  - Running weighted total, right-aligned: "Total 4.25 / 5" (`text-sm font-medium`)
  - Muted "Legacy score: 4/5" line above the scorecard when the review predates this feature
  - Loading state: skeleton rows, matching existing `SkeletonList` usage on the page
  - Error state: inline `text-sm text-destructive` above the save button, naming the first missing required criterion
  - Empty state: plan has no criteria → this component renders nothing and the existing single score input shows instead
- **Behavior:** Clicking a value button sets that criterion and recomputes the total live. Save is disabled while saving, or while a required criterion is unset. Reopening a scored review prefills every value.
- **Data:** reads `criteria` from the selected plan and `criteriaScores` from the active review; writes via `repo.evaluations.save`.

### Tasks

- [x] T013: Build `CriteriaEditor` with every element listed in the UI Spec above.
- [x] T014: Build `ScorecardForm` with every element listed in the UI Spec above.
- [x] T015: Wire `CriteriaEditor` into the plan form in `src/pages/program/Evaluation.tsx`; include `criteria` in the `savePlan` call.
- [x] T016: Wire `ScorecardForm` into the reviewer queue in `src/pages/program/Evaluation.tsx`; add `criteriaScores` draft state beside the existing `scoreDraft` / `commentsDraft`; include it in the `save` call. Handle loading, error and empty states.
- [x] T017: Show the weighted total in the organizer's submission grid; sort by it.
- [x] T018 (partial): Verified end to end via the unit/integration test suite (`evaluation-scorecards.test.tsx` covers savePlan validation, save validation, the CriteriaEditor and ScorecardForm rendering/prefill/total, and the adapter contract) and by reading the wired-up component code. No authenticated Clerk browser session was available in this sandbox to also click through the live UI — signing in was out of scope for this agent. Someone with a signed-in session should still click through once before merge. **Done 2026-08-17 — see the production verification section at the bottom of this file.**

### Design System Check

- [x] T019: Confirm no `border` on any card/button/input, no `box-shadow`, no gradient, no `<hr>` or `divide-`, no fixed-position panel, `border-radius` ≤ 14px, no blue interactive elements. Page header holds only the title; filters left and actions right in the toolbar row below it.

## Phase 5: Regression

- [x] T020: Regression test — a plan with no criteria still shows and saves the single score input unchanged (FR-008).
- [x] T021: Regression test — a legacy evaluation row with `score` and no `criteriaScores` renders without error and shows the legacy label.
- [x] T022: Extend the data-adapter contract test to cover the widened plan and evaluation shapes.

## Task Dependencies

- T001 blocks everything else.
- T002–T006 must all complete before T008; a missed adapter file fails at runtime.
- T011 blocks T014 and T017.
- T008–T009 block T015–T016.
- T018 requires T013–T017.

## Verification Checklist

- [x] All acceptance criteria in requirements.md met
- [x] Feature is accessible and usable in the UI, not just implemented in the backend (CriteriaEditor and ScorecardForm are wired into Evaluation.tsx; verified by reading the wiring and the component tests — see T018 note)
- [x] `npm run typecheck`, `npm run lint` (0 errors; 16 pre-existing warnings, add none), `npm test`, `npm run build` all pass
- [x] Plan with no criteria behaves exactly as before — no regressions (T020/T021)
- [x] Weighted total verified by hand against a weighted example (`evaluation-score.test.ts`)
- [x] Docs updated if the shape changed during implementation — merged cleanly with #57's `anonymized` field on rebase; both fields coexist on `evaluation_plans`

---

## Production verification — 2026-08-17 (closes the T018 gap)

Clicked through as the signed-in owner on `app.your-project.example`, event *AI.Engineer Sandbox
Event — NYC*, plan *Program committee review* — the gap T018 recorded honestly and left open.

Observed in the reviewer queue:

- **Per-criterion inputs, not a single score box.** `Technical depth (0–5 · weight 2) Required`
  rendered as a star row, and `Reviewer notes Required` as a textarea.
- **Prefill works.** Reopening an already-scored review restored 3/5 and the saved note text.
- **Weighted total renders and recomputes live.** Shown as `Total 3.00 / 5`; clicking 5 stars moved
  it to `Total 5.00 / 5` immediately, and clicking back to 3 returned it to `Total 3.00 / 5`.
- **Hand-check of the formula** (FR-006): `(3 × 2) / (2 × 5) × 5 = 3.00`, and `(5 × 2) / (2 × 5) × 5
  = 5.00`. The `text` criterion carries no weight and stays out of the total, as specified.
- **Legacy path renders.** `Legacy score: 3/5` appeared above the scorecard on a review predating
  the feature.

Nothing was saved — the star changes were left as unsaved draft state, so no production row was
written by this verification.
