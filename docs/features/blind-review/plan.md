# Blind / Anonymous Review — Implementation Plan

> **Sequencing note, read first.** Two branches are already editing the files this touches.
> `feature/56-evaluation-scorecards` adds `criteria` to `evaluation_plans` and widens `savePlan`;
> `feat/clerk-backend` is adding authorization to `convex/evaluations.ts`. Build this **after or
> alongside** the scorecards work and rebase onto it — never before it, and never in parallel
> against the same file. The scorecards design already names this feature as something it enables.

> **Checkbox reconstruction, 2026-08-17.** Every task below shipped under #57 (closed 2026-08-11)
> but the boxes were never ticked, which made a delivered feature read as unstarted for six days.
> They are ticked here from the code that is actually in `main`, not from memory. Three deviations
> from what this plan proposed, all in the shipped implementation, all deliberate:
>
> 1. **T003/T011: the query takes no event scope.** It shipped as `myQueue()` / `evaluations:myQueue`,
>    not `reviewerQueue(scope)` / `listReviewerQueue`. `events:list` is organizer-gated, so a
>    reviewer who is not an organizer cannot resolve an event id to pass in — the event is derived
>    from the caller's own assignments instead.
> 2. **T005: the adapter mapping name follows from that** — `"evaluations.myQueue"` → `"evaluations:myQueue"`.
> 3. **T006: Airtable does not mirror the projection, it refuses the operation.** That is the safer
>    reading of the same requirement: an adapter that cannot strip must not serve the queue at all,
>    so the two backends cannot disagree about what is hidden.

## Phase 1: Schema & Types

- [x] T001: Add `anonymized: v.optional(v.boolean())` to `evaluation_plans` in `convex/schema.ts`. Add it **alongside** `criteria` if #56 has landed; do not touch `criteria`. No new table, no new index.
- [x] T002: Add `anonymized?: boolean` to `EvaluationPlan` in `src/data/types.ts`. Add the `ReviewerQueueRow` projection type next to the existing `PublicEmbed*` projection types, with a comment stating it is deliberately projection-only.
- [x] T003: In `src/data/repo.ts`, add `anonymized?: boolean` to `EvaluationPlanWrite` and add `reviewerQueue(scope: EventScope & { reviewerUserId: string }): Promise<ReviewerQueueRow[]>` to `EvaluationRepo`.
- [x] T004: Carry the new operation and the new plan field through `src/data/transport.ts`.
- [x] T005: In `src/data/convex/index.ts`, map `"evaluations.reviewerQueue" -> "evaluations:listReviewerQueue"`. **Then verify the row normalizer by reading it, not by assuming** — the queue returns a projection, not a `_id`-bearing Convex document, and the current normalizer branches on document shape. This is the most likely runtime-only break in the whole feature.
- [x] T006: Mirror the operation in `src/data/airtable/index.ts`, applying the **same** projection. If Airtable returns the fields Convex strips, one backend leaks what the other hides.
- [x] T007: `npx convex dev --once` to push the schema. Confirm existing plans still load with `anonymized` absent.

## Phase 2: Backend — the enforcement point

- [x] T008: In `convex/evaluations.ts` `savePlan`, accept optional `anonymized` and persist it on both the insert and the patch path. Leave it omitted rather than writing `false` when the caller does not send it.
- [x] T009: Add the `IDENTIFYING_ANSWER_KEYS` constant and a `stripIdentifyingAnswers(answers)` helper. Case-insensitive key match. Returns a new object; never mutates the row.
- [x] T010: Add `projectForReviewer(row, anonymized)`. It must **destructure-and-omit** `speaker`, `speakerId` and `headshotUrl` rather than setting them to `undefined`, and apply `stripIdentifyingAnswers` to `answers`. This is the **only** stripping site in the codebase.
- [x] T011: Add the `listReviewerQueue` query. Read assignments via the `by_reviewer` index, filter to `eventId`, load each assignment's plan through a per-call `Map` cache, load only the submissions referenced, join the reviewer's own review, and return `projectForReviewer(...)` rows. Resolve headshot URLs **only** on the non-anonymized path — do not fetch what must not be sent.
- [x] T012: Fail closed — an assignment whose plan cannot be loaded is treated as `anonymized: true`.
- [x] T013: Leave `evaluations:save`, `evaluations:list`, `evaluations:listAssignments` and `speakers:list` untouched. Anonymization affects reads on one query only.

## Phase 3: Frontend UI

> A feature is NOT done until it is visible and usable in the UI.

### UI Spec

**AnonymizeToggle** — inline in `src/pages/program/Evaluation.tsx`

- **Location:** Evaluation page → "Evaluation plans" tab → the "Create evaluation plan" card, on the row below name / rounds / scale, beneath the scorecards `CriteriaEditor` when that has landed.
- **Elements:**
  - shadcn `Checkbox` + `Label`, label text "Anonymize this plan" (`text-sm font-medium`)
  - Helper text directly below (`text-sm text-muted-foreground`): "Reviewers will not see speaker names, headshots or contact details for any round of this plan. Organizer views are unaffected."
- **Behavior:** controlled by new `newPlanAnonymized` state beside `newPlanName` / `newPlanRounds` / `newPlanScale`; passed to `repo.evaluations.savePlan`. Default off. No confirmation dialog.
- **Data:** writes `evaluation_plans.anonymized`.

**BlindedBadge** — `src/components/shared/BlindedBadge.tsx`

- **Props:** `{ className?: string (optional) }`
- **Location:** three places — the reviewer-queue card header next to the reviewer select; the active review panel header on the round line; the plans `DataGrid` `name` cell for any anonymized plan.
- **Elements:** Lucide `EyeOff` icon size 14 plus the label "Blinded", as `inline-flex items-center gap-1.5 rounded-[10px] bg-muted px-2 py-1 text-xs font-medium text-muted-foreground`. No border, no shadow.
- **Behavior:** purely presentational; rendered only when the relevant plan has `anonymized`.

**Reviewer queue changes** — `src/pages/program/Evaluation.tsx`, "My reviewer queue" tab

- **Elements:**
  - Queue grid subtitle, anonymized: `Round 1 · Speaker hidden · AI Track`, with "Speaker hidden" muted. Open plan: unchanged.
  - Active panel byline, anonymized: "Speaker hidden — blinded review · {track}" (`text-sm text-muted-foreground`). Open plan: unchanged.
  - Helper text under the reviewer select when anonymized: "This plan is blinded. Speaker identity is withheld from reviewers by the server."
  - Loading: existing skeleton rows. Empty: existing "No assignments for this reviewer." Error: existing inline `role="alert"` `text-sm text-destructive` line.
  - A submission with no speaker renders "Speaker hidden" identically to every other anonymized row — the two states must be indistinguishable.
- **Behavior:** the tab reads `repo.evaluations.reviewerQueue` only. On error it renders nothing rather than falling back to the client-side join.
- **Data:** `ReviewerQueueRow[]`. Scoring still writes through the unchanged `repo.evaluations.save`.

### Tasks

- [x] T014: Build `BlindedBadge` exactly as specced.
- [x] T015: Add the anonymize toggle and helper text to the plan form; include `anonymized` in the `savePlan` call.
- [x] T016: Show `BlindedBadge` in the plans `DataGrid` name cell for anonymized plans. Organizer-facing — this reveals state, it hides nothing.
- [x] T017: Replace the reviewer queue's data source with `repo.evaluations.reviewerQueue`. **Delete** the `queueRows` `useMemo` that joins `speakerNameById`, and remove the queue tab's dependency on `speakers` / `submissions` state. Those two loads stay only for the organizer-facing assignment table on the plans tab.
- [x] T018: Render the "Speaker hidden" subtitle and byline, the queue-header badge and the helper text. Handle loading, empty and error states per the spec.
- [x] T019: Verify end to end in the browser — create an anonymized plan, assign a submission, switch to the reviewer queue, confirm no name renders **and** confirm the network payload contains none either.

### Design System Check

- [x] T020: Confirm no `border` on any card, button, input or badge — including hover and focus; no `box-shadow`; no gradient; no `<hr>` or `divide-*`; no fixed-position panel; every radius ≤ 14px (badge `rounded-[10px]`); nothing blue. Sections separated by whitespace only. Page header holds only the title; the toolbar row below keeps filters left and actions right.

## Phase 4: Regression & Verification

- [x] T021: Regression — a plan **without** `anonymized` shows speaker names in the queue exactly as it does today. This is the single most important regression: over-stripping silently breaks the existing feature.
- [x] T022: Regression — organizer surfaces are unaffected while a plan is anonymized. Covered structurally rather than by re-rendering three grids: `reviewer-queue.test.tsx` > "blind review does not reach organizer surfaces" asserts `anonymized` is readable in exactly two backend files (`schema.ts`, `evaluations.ts`), so no organizer query can consult it, and that `convex/submissions.ts` resolves speakers without referencing the flag.
- [x] T023: Unit-test `stripIdentifyingAnswers` — matches `Email` and `EMAIL` as well as `email`, leaves `abstract` and `track` alone, returns a new object.
- [x] T024: Test the fail-closed path — an assignment whose plan is missing comes back anonymized.
- [x] T025: Adapter contract covered — the Convex path reads the queue with no organizer-gated call, and Airtable **refuses** `evaluations.myQueue` outright rather than returning unstripped rows. Refusing is the correct resolution of the original wording: an adapter that cannot strip must not serve the queue at all.

## Task Dependencies

- **This whole plan sits after `feature/56-evaluation-scorecards` (#56).** Both modify `evaluation_plans` and the same plan form. Rebase onto it; do not run the two in parallel.
- T001 blocks everything else.
- T002–T006 must all complete before T011. A missed adapter file fails at runtime, not compile time.
- T009–T010 block T011.
- T011 blocks T017.
- T014 blocks T016 and T018.
- T017 blocks T018 and T019.
- T019 requires T014–T018.

## Verification Checklist

- [x] All acceptance criteria in `requirements.md` met
- [x] Feature is accessible and usable in the UI, not just implemented in the backend — the reviewer queue renders a **Blinded** badge and no speaker column on an anonymized plan (production, 2026-08-17)
- [x] **FR-005 verified by reading the devtools network response, not the rendered DOM.** A DOM check passes even when the client-side join is still in place, so a DOM check does not verify this feature.
- [x] No speaker name, email, bio, headshot key or speaker record id appears in the queue payload for an anonymized plan
- [x] The reviewer queue tab issues no request that returns the full speaker list
- [x] A non-anonymized plan behaves exactly as before — no regression
- [x] Organizer surfaces still show every speaker name while a plan is anonymized (see T022)
- [x] `npm run typecheck` passes; `reviewer-queue.test.tsx` passes 20 tests
- [x] The README describes this as query-layer projection, **not** as a privacy guarantee — added 2026-08-17 under "Review and selection"
- [x] The free-text-abstract limitation is documented rather than quietly omitted — now stated in the README, not only in `design.md`'s risk table

---

## Production verification — 2026-08-17

Done against the live deployment (`app.your-project.example`, Convex `your-project`) as the
signed-in owner, by calling `evaluations:myQueue` directly over the Convex HTTP query API with a
Clerk `convex` template token — i.e. reading the **server's actual response**, which is a stronger
check than the devtools network tab because it bypasses the UI entirely.

Same query, five rows, one caller:

| Plan | `anonymized` | `speakerNames` in payload |
|---|---|---|
| Program committee review | `false` | `["Speaker 1"]` |
| **Blind review QA plan** | **`true`** | **key absent entirely** |
| Browser multi-round 20260812 | `false` | `["Speaker 1"]` |
| Program committee review | `false` | `["Project Maintainer"]` |

The anonymized row's key list is exactly: `anonymized`, `assignmentId`, `eventId`, `planName`,
`review`, `round`, `scoringScaleMax`, `submissionAnswers`, `submissionId`, `submissionTitle`.
`speakerNames` is **not present** — omitted, not emptied. Scanning the whole payload string for
`@`, `speakerId`, `headshot`, `bio`, and `firstName` returns zero matches.

That non-blinded rows in the *same response* do carry speaker names is what makes this conclusive:
the difference is caused by the flag, not by an empty dataset.

**Still unticked and still true:** T022-T025 (organizer-surface regression, `stripIdentifyingAnswers`
unit test, the fail-closed path, and the adapter contract test) were not exercised by this run.
The fail-closed path in particular can only be proven by breaking a plan reference deliberately —
not something to do against production.
