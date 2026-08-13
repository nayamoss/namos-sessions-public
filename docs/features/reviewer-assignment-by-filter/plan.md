# Reviewer Assignment by Tag or Track — Implementation Plan

Companion to [`requirements.md`](./requirements.md) and [`design.md`](./design.md).
Base branch: `origin/main` at `5468c99`.

> **Sequencing note, read first.** Three sibling branches also edit `convex/evaluations.ts`:
> `feature/56-evaluation-scorecards` (widens `savePlan` / `save`), `feature/57-blind-review`
> (widens `savePlan`, adds `listReviewerQueue`), `improvement/59-reviewer-progress` (adds
> `reviewerProgress`). **None of them touches `assign`, and this one touches nothing of theirs** —
> no `evaluation_plans` field, no schema change at all. Merge order is therefore free; whoever
> lands second rebases and the conflicts are import lines and file-tail adjacency. The one hard
> rule: do not develop two of these in the same working tree at the same time.

---

## Phase 1: Types & Adapter Chain

No schema change in this feature — `convex/schema.ts` is **not** edited. Start at the types.

- [ ] **T001** `src/data/types.ts` — add:
      ```ts
      export type AssignmentFilter = { kind: "tag"; tagId: TagId } | { kind: "track"; trackId: string };
      export interface AssignByFilterResult { matchedSubmissionCount: number; reviewerCount: number; created: number; skipped: number; assignmentIds: string[]; }
      ```
- [ ] **T002** `src/data/repo.ts` — add `EvaluationAssignmentFilterWrite { eventId: EventId; evaluationPlanId: string; filter: AssignmentFilter; reviewerUserIds: string[]; round: number }` and `assignByFilter(input: EvaluationAssignmentFilterWrite): Promise<AssignByFilterResult>` to `EvaluationRepo`. Do not modify `EvaluationAssignmentWrite` or the existing `assign` signature.
- [ ] **T003** `src/data/transport.ts` — add `"evaluations.assignments.assignByFilter"` to the `WriteOperation` union and `assignByFilter: (input) => transport.write<AssignByFilterResult>("evaluations.assignments.assignByFilter", input)` to the `evaluations` block.
- [ ] **T004** `src/data/convex/index.ts` — map `"evaluations.assignments.assignByFilter": "evaluations:assignByFilter"`. It is a **write**; confirm it does **not** fall into the `documentRows(...)` read-normalizer branch (line 28) — the return is a plain object, not a document row.
- [ ] **T005** `src/data/airtable/index.ts` — add the operation to the existing explicit rejection list on line 9, next to `evaluations.assignments.assign`. It must **throw**, not no-op.
- [ ] **T006** `npm run typecheck` (app) — the adapter chain must compile before any handler exists.

## Phase 2: Backend

- [ ] **T007** `convex/evaluations.ts` — extract the per-pair write loop out of `assign` into a private `createAssignments(ctx, input)` helper returning `{ assignmentIds, created, skipped }`, exactly as in `design.md` §3.1. **Behaviour-preserving lift only.** No new validation, no changed error strings, no changed return type for `assign`.
- [ ] **T008** Rewrite `assign`'s body to `return (await createAssignments(ctx, {...})).assignmentIds;`, leaving every line of its validation untouched above that.
- [ ] **T009** Add the `assignmentFilter` validator as a `v.union` of the two `v.object` variants — this is what makes "both" and "neither" unrepresentable (FR-002). Do not use two optional ids.
- [ ] **T010** Add the `assignByFilter` mutation. `await requireIdentity(ctx)` is the **first statement**, matching every other function in the file. Then, in order: load/validate plan → validate round against `plan.rounds` → normalize and validate reviewers (copy `assign`'s rules verbatim) → load and event-check the tag or track.
- [ ] **T011** Filter resolution: read submissions via the `by_event` index, drop `draft` and `withdrawn`, then match on `tagIds.includes(tagId)` or `trackId === trackId`. Do **not** re-`get` the matched submissions — they came from the index read.
- [ ] **T012** Zero matches → **early return** with `created: 0` and `matchedSubmissionCount: 0`. Do not throw (FR-012).
- [ ] **T013** Cap guard: `matched.length * reviewerUserIds.length > 500` throws before any write, with the count and the remedy in the message (FR-010).
- [ ] **T014** Call `createAssignments` and return the `AssignByFilterResult` object.
- [ ] **T015** `npx convex dev --once` — Convex typecheck clean. Confirm the existing manual `assign` path still works from the current UI **before** touching the frontend.

## Phase 3: Frontend UI

> A feature is NOT done until it is visible and usable in the UI.

### UI Spec

**AssignByFilterCard** — `src/pages/program/AssignByFilterCard.tsx` (new)

- **Props:** `tags: Tag[]` (required) · `tracks: Track[]` (required) · `submissions: Submission[]` (required, preview only) · `plans: EvaluationPlan[]` (required) · `selectedPlanId?: string` (optional) · `onSelectPlan: (planId: string) => void` (required) · `reviewers: string[]` (required) · `disabled?: boolean` (optional) · `onAssign: (input: { evaluationPlanId: string; filter: AssignmentFilter; reviewerUserIds: string[]; round: number }) => Promise<AssignByFilterResult>` (required)
- **Location:** Evaluation page → "Evaluation plans" tab → new `<section className="rounded-lg bg-card p-5">` immediately **below** the existing "Assign submissions" card. The manual card is left exactly as it is.
- **Elements:**
  - Heading "Assign by tag or track" (`font-semibold`).
  - Helper text (`mt-1 text-sm text-muted-foreground`): "Assign every submission carrying one tag, or every submission in one track, to the reviewers you pick. Drafts and withdrawn submissions are skipped."
  - Toolbar row `mt-4 flex flex-wrap items-end justify-between gap-3` — **filters left, actions right**:
    - Left: segmented radio `Tag` | `Track` (`role="radiogroup"`, `aria-label="Assignment filter type"`, selected `bg-muted font-medium`, unselected `text-muted-foreground`, `rounded-[10px]`, no border) · value `Select` `w-52` (`aria-label="Tag"` / `aria-label="Track"`, placeholder "Select tag" / "Select track") · plan `Select` `w-52` (`aria-label="Evaluation plan"`) · round `Select` `w-32` (`aria-label="Evaluation assignment round"`).
    - Right: reviewer `fieldset className="rounded-md bg-background px-3 py-2"` (`aria-label="Reviewers for this assignment"`) of shadcn `Checkbox` + `Label`, wrapping — identical markup to the manual card · the primary control, `variant="accent" size="sm"`.
  - Preview line `mt-3 text-sm text-muted-foreground`, numbers in `font-medium text-foreground`: `12 submissions tagged “AI” × 3 reviewers = 36 review assignments for Round 1.`
  - Result line `mt-3 text-sm` after a run, replacing the preview until an input changes: `Created 34 assignments. 2 already existed and were skipped.` — created count in `text-[hsl(var(--success))]`, rest muted. Appends `(the filter matched N submissions when it ran)` when the server count differs from the preview.
  - Error line `mt-3 text-sm text-destructive` with `role="alert"`.
- **Behavior:**
  - Preview recomputes in a `useMemo` on every filter/reviewer/round change, over the `submissions` prop already in page state. Zero network calls. Applies the same draft/withdrawn exclusion the server applies.
  - **Two-step inline confirmation**, one button slot, three states — no overlay, no `window.confirm`:
    1. *Idle*: `Assign 36`. Disabled when no plan, no filter value, no reviewer, preview count 0, or `disabled`.
    2. *Confirming*: the slot swaps to `Confirm 36 assignments` (`variant="accent"`) + `Cancel` (`variant="ghost"`); the preview line goes `text-foreground`. **Any input change drops back to Idle.**
    3. *Working*: `Assigning…`, disabled, while in flight.
  - Success → call the page's `load()` refetch, then show the result line. Filter and reviewer selections are **kept**, not cleared.
  - Failure → error line with the server message; all inputs keep their values.
  - Zero matches → preview reads "No submissions match this filter yet." and the primary control is disabled. Not an error.
- **Loading state:** controls render disabled while the page loads; no separate skeleton.
- **Empty states:** no tags → Tag option disabled, helper text "Create tags in Settings → Library first." with a link to `/settings/library`. No tracks → equivalent, pointing at event settings. Neither → heading plus one muted line, "Add tags or tracks before assigning in bulk.", and no controls.
- **Data:** reads `tags` / `tracks` / `submissions` from page state; writes via `repo.evaluations.assignByFilter`.
- **Third-party:** none.

### Tasks

- [ ] **T016** `src/pages/program/Evaluation.tsx` — add `repo.tags.list(scope)` and `repo.events.listTracks(scope)` to the existing `Promise.all` in `load()`, into new `tags` / `tracks` state. Both operations already exist in the repository and the Convex adapter; nothing new is wired.
- [ ] **T017** Build `AssignByFilterCard` exactly as specced. Segmented control, value select, plan/round selects, reviewer fieldset — reusing the manual card's markup and `aria-label`s so the two stay consistent.
- [ ] **T018** Implement the preview `useMemo`, including the draft/withdrawn exclusion, and the empty-state branches.
- [ ] **T019** Implement the three-state confirm button. **Any input change while confirming resets to Idle** — a stale confirmation must never survive a changed filter.
- [ ] **T020** Wire `onAssign` to `repo.evaluations.assignByFilter`, then `load()`, then the result line including the count-mismatch suffix.
- [ ] **T021** Mount the card below the existing "Assign submissions" section, sharing `selectedPlanId` via `onSelectPlan` so both cards agree on plan and round.

### Design System Check

- [ ] No `border`, `box-shadow`, gradient, `<hr>` or `divide-*` on any element added — including hover and focus states
- [ ] Radii ≤ 14px (`rounded-lg` card, `rounded-[10px]` segmented control, `rounded-md` fieldset)
- [ ] No blue; primary control uses the existing accent, selection uses neutral `bg-muted`
- [ ] Page header holds only the title; filters left / actions right in the toolbar row
- [ ] Sections separated by whitespace only
- [ ] `grep -rn "window.confirm\|window.alert\|window.prompt" src/` returns no new hits
- [ ] Keyboard reachable: segmented control is a real radio group; every select and checkbox is labelled

## Phase 4: Tests

- [ ] **T022** Unit-test the filter predicate (extract it to `src/lib/` if it is duplicated between preview and any test): tag match, track match, no-tag submission, draft excluded, withdrawn excluded.
- [ ] **T023** Repository contract test covers the new operation shape and the Airtable rejection.
- [ ] **T024** Regression test that `assign` behaves identically after the helper extraction — same return type, same idempotency, same error strings.

## Phase 5: Verification

- [ ] **T025** Walk the Verification Checklist below in the browser against a live Convex deployment. Not a file listing — the running app.
- [ ] **T026** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npx convex dev --once` all clean.
- [ ] **T027** Update `docs/features/INDEX.md` in the **same commit** as the implementation (AGENTS.md Rule 1). This planning branch deliberately does not touch it.

---

## Task Dependencies

```
T001 ─▶ T002 ─▶ T003 ─▶ T004 ─▶ T005 ─▶ T006
                                          │
                        T007 ─▶ T008 ─▶ T015 (manual path still works)
                          │
                          └──▶ T009 ─▶ T010 ─▶ T011 ─▶ T012 ─▶ T013 ─▶ T014 ─▶ T015
                                                                                 │
                                              T016 ─▶ T017 ─▶ T018 ─▶ T019 ─▶ T020 ─▶ T021
                                                                                        │
                                                          T022 · T023 · T024 ───────────┤
                                                                                        ▼
                                                                    T025 ─▶ T026 ─▶ T027
```

- T007–T008 (the `assign` extraction) must be **verified green at T015 before any frontend work**. If the manual path regresses, everything after is debugging two features at once.
- T016 is independent of Phase 2 and can start early, but T020 needs T014.
- T005 (Airtable rejection) is not optional and not last — a missing rejection is a silent no-op discovered at demo time.

---

## Verification Checklist

Backend:
- [ ] `assignByFilter` calls `requireIdentity(ctx)` as its first statement
- [ ] A tag from another event is rejected with "Tag not found for this event."
- [ ] A track from another event is rejected with "Track not found for this event."
- [ ] `round: 0`, a non-integer round, and a round above `plan.rounds` are all rejected, with the same messages `assign` uses
- [ ] An empty or whitespace-only reviewer list is rejected
- [ ] Filter resolution happens server-side — no submission id list is sent from the client (check the network payload, not the code)
- [ ] Drafts and withdrawn submissions never appear in the matched set
- [ ] Zero matches returns `created: 0` and does **not** throw
- [ ] Over 500 assignments is rejected before any row is written — verify the row count is unchanged after the failure

Idempotency:
- [ ] Running the same filter twice reports `created: 0, skipped: N` on the second run
- [ ] A bulk run overlapping a prior manual assignment skips the overlap and creates the rest
- [ ] Double-clicking confirm produces no duplicate rows

Manual-path regression:
- [ ] The existing "Assign submissions" card still assigns exactly as it did before the refactor
- [ ] `assign` still returns a `string[]`, unchanged in shape and ordering

Frontend:
- [ ] Selecting Tag shows tags; switching to Track clears the value and shows tracks
- [ ] The preview line shows submissions × reviewers = total, and updates live on every input change
- [ ] The confirm control is disabled at zero matches, with the explanatory line
- [ ] The first press shows the inline confirm + cancel; **no browser dialog appears**
- [ ] Changing any input while confirming resets to Idle
- [ ] After a successful run, the assignment table, plan progress and stat cards update without a page reload
- [ ] The result line reports created and skipped counts, and flags a preview/server mismatch when one occurs
- [ ] An error from the server renders inline in `text-destructive` with the inputs preserved
- [ ] With no tags and no tracks, the card renders its empty state and no controls

Compatibility with the siblings:
- [ ] `convex/schema.ts` is unmodified by this branch (`git diff --stat` proves it)
- [ ] No `evaluation_plans` field is added, so nothing collides with #56's `criteria` or #57's `anonymized`
- [ ] Assignments created here appear in #59's `reviewerProgress` counts with no extra work
- [ ] Assignments created here render correctly in #57's blinded reviewer queue

Quality gates:
- [ ] `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npx convex dev --once` all pass
- [ ] `docs/features/INDEX.md` updated in the implementation commit
