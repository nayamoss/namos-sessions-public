# Review & Scoring — Implementation Plan

**Issue:** #195
**Branch:** `improvement/195-review-scoring-star-ratings-decisions`
**Worktree:** `.worktrees/improvement/195-review-scoring-star-ratings-decisions`

> Read `requirements.md` and `design.md` before starting. The evaluation pipeline underneath is
> verified working — do not rebuild it. This is a UI and status-model change.

---

## Phase 1: The `maybe` status (backend first)

- [x] T001: Add `v.literal("maybe")` to the `submissions.status` union in `convex/schema.ts:237`
- [x] T002: Widen the status validator on the status mutation in `convex/submissions.ts`. Keep it a
      closed union — do not loosen to `v.string()`
- [x] T003: Handle `maybe` in `convex/publicApi.ts` (validator + any status mapping)
- [x] T004: Offer `maybe` as a routing target in `convex/categoryRouting.ts`
- [x] T005: Decide and implement speaker-edit behaviour for `maybe` in `convex/submissionEditing.ts`
      — treat it exactly as `pending` unless there is a reason not to
- [x] T006: Confirm the server-side decision-email gate excludes `maybe`. Verify by reading the
      guard, not by assuming the client-side check covers it
- [x] T007: Seed at least one `maybe` submission in `convex/seed.ts` so the state appears in demo data
- [x] T008: Add `maybe` to `packages/sdk/src/types.ts`
- [x] T009: Add `maybe` to the tool schema status enum in `packages/mcp/src/server.ts`
- [x] T010: Add `maybe` to `SubmissionStatus` in `src/data/types.ts`
- [x] T011: Run `npm run typecheck` (covers app, convex, worker, sdk, cli, mcp) and fix every
      non-exhaustive switch it surfaces. Do not silence one with a `default:` branch — handle `maybe`

## Phase 2: Status consumers across the app

- [x] T012: Add the `maybe` variant to `src/components/shared/SubmissionStatusBadge.tsx`, visually
      distinct from `pending`
- [x] T013: Offer `maybe` in `src/components/forms/RoutingRulesEditor.tsx`
- [x] T014: Count `maybe` as undecided in `src/lib/readiness.ts`
- [x] T015: Handle `maybe` in `src/lib/submission-editing.ts`
- [x] T016: Include `maybe` in the awaiting-decision count in `src/pages/dashboard/DashboardHome.tsx`
- [x] T017: Map `maybe` → "Under review" in `src/pages/portal/portal-data.ts`. A speaker must never
      see the word "maybe"
- [x] T018: Update the affected tests — `assignment-filter`, `category-routing`,
      `data-adapter.contract`, `portal-submission-row`, `submission-editing`
- [x] T019: Add a test asserting the literal string `maybe` never appears in speaker-facing portal output

## Phase 3: Frontend UI (REQUIRED — never skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### Corrections to this spec (added 2026-08-16 after the first implementation pass)

The original UI Spec below contained four defects. **These corrections override the spec text
wherever they conflict.**

**C1 — Never `bg-neutral-*` or `text-neutral-*` in this repo.** The spec quoted the house style
guide's raw palette, but this codebase enforces semantic tokens via
`src/test/component-canon.test.ts` → *"keeps hardcoded neutral palettes out of product UI"*, which
greps for `/(?:bg|text)-neutral-/` across all of `src/`. Use `bg-muted`, `text-muted-foreground`,
`bg-primary`, `text-primary-foreground`, `bg-destructive` instead. The intent of the house rule
(soft neutral surfaces, no borders) is unchanged — only the token names.

**C2 — No raw `<button>` in `src/components/shared/`.** Same test file, *"keeps raw buttons outside
reusable UI components explicitly classified"*, greps for `/<button\b/` outside `components/ui/`
and a fixed legacy allowlist. `StarRating` and `DecisionButtons` must compose the shared
`Button` from `@/components/ui/button`. **Do not add the new files to that allowlist** — the
allowlist exists to grandfather legacy pages, and extending it to brand-new components defeats the
guard.

**C3 — Criterion scores start at 0, not 1.** The spec said stars run `1..max`, which is right for
the single overall score but wrong for scorecard criteria: `ScorecardForm` previously rendered
`0..max` and a reviewer could legitimately score a criterion 0. Rendering `1..max` silently removes
that. `StarRating` needs an explicit `min?: 0 | 1` prop (default `1`). `ScorecardForm` passes
`min={0}`, and a 0 score renders as all stars empty with a reachable "clear to 0" affordance —
either an extra leading control or clicking the currently-selected first star. Do not change the
legend from `0–{max}` to `1–{max}`; that was a symptom of this defect, not a fix.

**C4 — Decide the ARIA contract deliberately, then update the tests to match.** The spec's
`role="radiogroup"` + `aria-checked` + `aria-label={"${label}: ${n} of ${max}"}` conflicts with
`src/test/evaluation-scorecards.test.tsx`, which asserts the old contract
(`[aria-label="Originality: 4"]` with `aria-pressed="true"`). A radiogroup **is** the correct
pattern for a single-select rating, so keep it and update those assertions to the new contract.
Update the test because the control genuinely changed — not to make red go green. The behaviour
the test protects (the recorded score is reflected in the control) must still be asserted.

### UI Spec

#### StarRating — `src/components/shared/StarRating.tsx` (new)

- **Location:** reviewer scorecard in the Judging page right detail pane; each numeric criterion row
  in `ScorecardForm`; read-only in the Submissions grid Rating column
- **Props:** `value: number | undefined` (req), `max: number` (req), `onChange?: (v: number) => void`
  (omit ⇒ read-only), `disabled?: boolean` (default false), `label: string` (req),
  `size?: "sm" | "md"` (default `"md"`)
- **Elements:**
  - `role="radiogroup"` containing `max` star buttons, Lucide `Star`
  - Filled: `fill-current` in the accent colour. Unfilled: `text-muted-foreground`, no fill
  - Hover preview: stars up to the hovered index render filled
  - Trailing text: `"{value} / {max}"`, or `"Not scored"` when `value` is `undefined`
  - Read-only mode: no hover preview, no focus ring, `aria-readonly`
  - Disabled: 40% opacity, no pointer events
  - **No border, no shadow, no gradient on any part of this control**
- **Behavior:**
  - Click star *n* → `onChange(n)`
  - Clicking the already-selected star re-sets the same value — it does **not** clear
  - Keyboard: ← / → adjust by one within `1..max`; Home → 1; End → `max`
  - `aria-label={label}` on the group; each star `role="radio"`, `aria-checked`,
    `aria-label={"${label}: ${n} of ${max}"}`
  - `max: 10` renders ten `size="sm"` stars on a single row without wrapping
- **Data:** pure controlled component. Reads `value` from props, writes via `onChange`. No fetching.

#### DecisionButtons — `src/components/shared/DecisionButtons.tsx` (new)

- **Location:** Submissions grid Status column (primary, left of the demoted `<Select>`); and at the
  top of the submission detail pane
- **Props:** `status: SubmissionStatus` (req), `onDecide: (next: SubmissionStatus) => void` (req),
  `pending?: boolean`, `size?: "sm" | "md"` (default `"sm"`)
- **Elements:**
  - Three buttons: **Approve** (Lucide `Check`), **Maybe** (Lucide `CircleDashed`), **Decline**
    (Lucide `X`)
  - Active: accent background — Approve `#40745C` Sage, Maybe `#F58E63` Coral, Decline dark red —
    dark text, `rounded-[6px]`, **no border, no shadow**
  - Inactive: `bg-neutral-100`, muted text, no border
  - `pending`: all three disabled at 40% opacity
  - `size="sm"`: icon only, label in a tooltip. `size="md"`: icon + text label
  - **Never blue**
- **Behavior:**
  - Approve → `onDecide("accept_queue")`; Maybe → `onDecide("maybe")`; Decline →
    `onDecide("decline_queue")`
  - Clicking the active decision → `onDecide("pending")` (toggles off)
  - `accepted` / `declined` / `withdrawn` / `draft` → render read-only; a shipped decision is not
    undone by a stray click
  - `aria-pressed` reflects the active decision
- **Data:** calls the existing status mutation through `repo.submissions`. No new endpoint.

#### ReviewViewSwitcher — inline in `src/pages/program/Evaluation.tsx`

- **Location:** Judging page toolbar row, **left** side (filters left, actions right)
- **Elements:**
  - Segmented control: `Evaluation plans` | `My reviewer queue`
  - Queue segment carries a count badge of assigned-and-unscored rows
  - Active segment `bg-neutral-200`; inactive transparent. No border, no shadow
  - Not rendered at all when the user has zero assignments
- **Behavior:** click switches view; choice held in component state for the session (not
  localStorage — the default should follow actual workload each visit)
- **Data:** derives `hasUnscoredAssignments` from the already-loaded `evaluations.myQueue`. **Do not
  add a second query.**

#### Submissions page changes — `src/pages/program/Abstracts.tsx`

- **Location:** Submissions page
- **Elements:**
  - New "Maybe" filter tab with a count, between "Accept Queue" and "Decline Queue"
  - `DecisionButtons` in the Status column, primary position
  - Existing status `<Select>` demoted to the right of the buttons, unchanged in function
  - Detail pane gains `DecisionButtons` at `size="md"` at the top
  - Inline `text-destructive` error below the toolbar when a decision fails — **not a modal**
  - Add-submission pane heading and confirm button read "Add submission", not "Add abstract"
- **Behavior:** decisions are optimistic; on failure the row reverts to its prior status and the
  inline error shows
- **Data:** `repo.submissions.setStatus`; rating column continues to read the aggregate from `createRows`

#### Empty state — reviewer queue with nothing left

- Inside a card: `bg-neutral-100 rounded-[12px] p-8`
- Lucide icon size 40, muted + heading "You're all caught up" + subtext + CTA back to Evaluation plans

### Tasks

- [x] T020: Build `StarRating` exactly as specified above, including keyboard operation and ARIA
- [x] T021: Swap the numbered-circle fieldset at `Evaluation.tsx:1109-1132` for `StarRating`
- [x] T022: Swap the per-criterion numbered buttons at `ScorecardForm.tsx:36-49` for `StarRating`.
      Text criteria are unchanged
- [x] T023: Use `StarRating` read-only in the Submissions grid Rating column
- [x] T024: Build `DecisionButtons` exactly as specified above
- [x] T025: Wire `DecisionButtons` into the Submissions grid Status column with optimistic update +
      revert-on-error; demote the `<Select>`
- [x] T026: Add `DecisionButtons` at `size="md"` to the submission detail pane
- [x] T027: Add the "Maybe" filter tab with a count
- [x] T028: Replace the `View` dropdown with `ReviewViewSwitcher`; default to the reviewer queue when
      the user has unscored assignments; hide the control entirely when they have none
- [x] T029: Add the "You're all caught up" empty state to the reviewer queue
- [x] T030: Rename "Add abstract" → "Add submission" in the detail pane heading and confirm button
- [ ] T031: Verify the full flow in a browser end to end (see Verification Checklist)

## Phase 4: Verification

- [x] T032: `npm run typecheck` clean (note: `src/lib/analytics.ts` has a pre-existing
      `posthog-js` missing-dependency error unrelated to this work — everything else must be clean)
- [x] T033: `npm run test` — 503 tests passed before this work; `src/test/analytics.test.ts` fails
      for the same pre-existing `posthog-js` reason. No other failures are acceptable
- [x] T034: `npm run lint` clean for every file touched

---

## Task Dependencies

```
T001 ──► T002..T010 ──► T011 ──► T012..T019
                                      │
                          T020 ───────┼──► T021, T022, T023
                          T024 ───────┼──► T025, T026
                                      ├──► T027
                                      ├──► T028 ──► T029
                                      └──► T030
                                              │
                                              ▼
                                   T031 ──► T032..T034
```

T001 gates everything — nothing can write or render `maybe` until the schema accepts it.
T011 is a hard gate: do not start Phase 2 with a failing typecheck.
T020 and T024 are independent of each other and of Phase 1/2; they can be built in parallel with
Phase 2 if useful.

---

## Verification Checklist

Browser verification, not a self-report. Run the app, open it, click through:

**Decisions**
- [ ] Approve on a pending row → status becomes Accept Queue, one click, no dropdown
- [ ] Maybe → status becomes Maybe, persists across a full page reload
- [ ] Decline → status becomes Decline Queue
- [ ] Clicking the active decision again → returns to Pending
- [ ] A row already `accepted` shows read-only buttons that do not respond to clicks
- [ ] "Maybe" filter tab shows the right count and filters correctly
- [ ] A `maybe` row's Decision-email cell reads "Decide first" and offers no send action

**Stars**
- [ ] Reviewer queue shows stars, not numbered circles
- [ ] Setting stars and pressing Submit review records the score
- [ ] Reopening the row shows the stars filled to the recorded value
- [ ] The aggregate rating still lands on the Submissions grid Rating column
- [ ] A 1–10 plan renders ten stars on one row without wrapping
- [ ] Tab to the star control, set a rating with arrow keys only, confirm it saves
- [ ] A multi-criterion plan shows stars per numeric criterion; text criteria still render as textareas

**Reviewer queue discoverability**
- [ ] With unscored assignments: the labelled switcher is visible and the queue is the default view
- [ ] With no assignments: the switcher is absent and the plans view loads
- [ ] After scoring everything: count reads 0 and the "You're all caught up" empty state renders

**Regressions**
- [ ] Speaker portal shows a `maybe` submission as "Under review", never "maybe"
- [ ] Existing evaluations recorded before this change still display their score correctly
- [ ] All acceptance criteria in `requirements.md` met
- [ ] Docs updated if behaviour diverged from this plan

---

## Open Question — flag before starting

`design.md` assumes stars replace the numbered buttons in **both** scoring paths (single overall
score and per-criterion scorecard). That specific sub-question was not answered when this was
scoped. If per-criterion stars turn out to read badly against weighted criteria with a max of 10,
raise it rather than silently shipping two different scoring UIs.
