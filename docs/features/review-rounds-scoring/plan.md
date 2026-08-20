# Reviewer Rounds, Assignments, Scoring, and AI Assist — Plan

**Status:** Planned — DO NOT IMPLEMENT YET
**Phase in `kill-my-saas-brief/plan.md`:** 1 (seed) and 5 (rounds UI, advancement, AI go/no-go)
**Blocked on:** decision D-2 (AI assist) before T5–T7 can start. T1–T4 are unblocked.

## Task breakdown

### T1 — Rounds control 1–5

**Files:** `src/pages/program/Evaluation.tsx`

1. `const [newPlanRounds, setNewPlanRounds] = useState<number>(1)` (was `1 | 2`).
2. Replace the two hardcoded `SelectItem`s at `:730-731` with a generated 1–5 list.
3. Clamp on change: `setNewPlanRounds(Math.min(5, Math.max(1, Number(value))))`.
4. Verify the existing round clamp at `:264` still behaves when a plan's `rounds` is reduced.

**No server change** — `savePlan` already validates 1–5 (`convex/evaluations.ts:124`).

### T2 — `advanceRound` mutation

**Files:** `convex/evaluations.ts`, `src/data/repo.ts`, `src/data/types.ts`

Signature and semantics are specified in `design.md` § Change 2. Notes for the implementer:

- Reviewer validity is checked against `event_members` via `by_event_userId`
  (`convex/schema.ts:126`), so an arbitrary string cannot be assigned.
- The "has a prior-round score" check joins `evaluation_assignments.by_plan_submission_reviewer_round`
  → `evaluations.by_assignment` (`convex/schema.ts:306`). Both indexes already exist.
- Return counts, not a boolean. The dialog reports them verbatim.

### T3 — Round advance UI

**Files:** `src/pages/program/Evaluation.tsx`, new `src/pages/program/AdvanceRoundDialog.tsx`

- Entry point: an action on the assignment table when `selectedPlan.rounds > 1`.
- Inputs: submission multi-select (defaulting to the current filter selection), reviewer
  multi-select, target round.
- Preflight summary before confirm: "12 selected · 10 eligible · 2 have no round-1 score".
- Result summary after confirm: created / already existed / skipped, each with the submission
  titles behind a disclosure.
- No `position: fixed` overlay that covers content — follow the existing dialog pattern already
  used in this page.

### T4 — Seed

**Files:** `convex/seed.ts`

Per `design.md` § Change 3. Order matters: patch the plan's `rounds` and `criteria` **before**
inserting round-2 assignments, or `advanceRound`-equivalent validation in later tests will reject
them.

### T5 — AI assist: execute the D-2 decision

**Branch A (remove):** edit `convex/evaluations.ts` `savePlan` args, `src/data/types.ts:113`,
`src/data/repo.ts:442`, and the hardcoded `false` at `Evaluation.tsx:399`; add a deprecation
comment at `convex/schema.ts:313`. Update `src/test/data-adapter.contract.test.ts` and the four
other tests that pass `aiAssistEnabled`.

**Branch B (build):** `convex/schema.ts` (new table), `convex/evaluationAiSuggestions.ts` (queries +
accept/dismiss mutations), `convex/evaluationAiActions.ts` (`"use node"` generation action wired to
`agentProviderSettings` / `agentBillingResolver`), `src/pages/program/ScorecardForm.tsx` (the
labelled suggestion panel), `.env.example` (no new secret — reuses `AI_INTEGRATION_ENCRYPTION_KEY`
and the existing managed-provider path).

### T6 — Docs

Update `docs/features/INDEX.md` and `docs/user-journeys/pages/` for the evaluation page.

## Test cases

| ID | Type | Case | Expected |
|---|---|---|---|
| TC-1 | unit | `savePlan` with `rounds: 5` | Accepted |
| TC-2 | unit | `savePlan` with `rounds: 6` or `0` or `2.5` | Rejected with the existing message |
| TC-3 | component | Plan editor rounds select | Renders exactly five options |
| TC-4 | unit | `advanceRound` to round 2, 3 submissions × 2 reviewers, all scored | `created: 6` |
| TC-5 | unit | Same call repeated | `created: 0`, `skippedExisting: 6`, no new rows |
| TC-6 | unit | `advanceRound` with an unscored submission, `allowUnscored` false | Excluded, id returned in `skippedUnscored` |
| TC-7 | unit | Same with `allowUnscored: true` | Included |
| TC-8 | unit | `advanceRound` `toRound: 1` | Rejected |
| TC-9 | unit | `advanceRound` `toRound` > `plan.rounds` | Rejected |
| TC-10 | unit | `advanceRound` with a submission from another event | Rejected |
| TC-11 | unit | `advanceRound` with a reviewer who is not an `event_members` row | Rejected |
| TC-12 | contract | Existing round-1 `evaluations` rows after advancing | Byte-identical; no `updatedAt` change |
| TC-13 | contract | `advanceRound` called by a reviewer | Organizer-access error |
| TC-14 | contract | `myQueue` on the seeded blinded plan | No `speakerNames` key present (extends `reviewer-queue.test.tsx`) |
| TC-15 | unit | Weighted total with a `text` criterion present | Text excluded from the total |
| TC-16 | unit | Criterion deleted after scoring | Existing `criteriaScores` rows retain their values; no reindexing |
| TC-17 | seed | Seed run twice | One plan named `Program committee review`, one `Blind shortlist review`, no duplicate assignments |
| TC-18 (B) | unit | Accepting a suggestion | `evaluations.reviewerName` is the human; suggestion row `accepted` with `actedByUserId` |
| TC-19 (B) | contract | Generation on an `anonymized` plan | Prompt input contains no identifying keys |
| TC-20 (B) | contract | Generation with `aiAssistEnabled: false` | Rejected |
| TC-21 (B) | unit | `reviewerProgress` with suggestions present | Suggestions do not count as completed reviews |

## Browser verification steps

1. Evaluation page → create a plan with **3 rounds** and three weighted criteria. Save. Reload;
   both persist.
2. Assign 6 submissions to 2 reviewers in round 1.
3. Sign in as one reviewer → score 3 submissions against the rubric → confirm the weighted total
   updates as values change and persists after reload.
4. Back as organizer → advance the 3 scored submissions to round 2 with a different reviewer →
   confirm the preflight excludes the 3 unscored ones with a stated reason.
5. Run the same advance again → confirm the result says 0 created, 3 already existed.
6. Confirm round-1 scores are unchanged.
7. Open the seeded blinded plan as a reviewer → confirm no speaker name appears anywhere, including
   in the abstract preview panel.
8. Open reviewer progress → confirm at least one reviewer is shown behind, with a working nudge and
   a disabled nudge for the reviewer with no email.
9. (Branch B only) Enable AI assist on one plan → generate a suggestion → confirm it renders as
   `Suggested — not a score`, that scoring works if you ignore it, and that accepting it produces a
   score attributed to you.

## Rollback

T1–T4 are additive or UI-only. `advanceRound` only inserts, so rolling back is deleting the
round-2 assignment rows. Branch B's table is standalone; dropping it does not affect `evaluations`.
</content>
