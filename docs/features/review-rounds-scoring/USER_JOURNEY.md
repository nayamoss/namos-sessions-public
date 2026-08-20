# Reviewer Rounds, Scoring, and AI Boundaries — User Journey

**Status:** Planned. Must be driven in a browser; not self-attested.

---

## Journey A — Chair sets up a two-round weighted review

**Entry point:** organizer landing page → "60 / 84 reviews complete" → `/events/:slug/program/evaluation`.

| Step | Action | Expected |
|---|---|---|
| A1 | Land on the evaluation page | The seeded `Program committee review` plan is selected; it shows 2 rounds, a 5-point scale, and three weighted criteria |
| A2 | Open the plan editor | Rounds select offers 1–5, not 1–2 |
| A3 | Create a new plan with 3 rounds and two criteria | Saves; reload confirms persistence |
| A4 | Open criteria editing | Weights are editable; a `text` criterion is clearly marked as excluded from the total |
| A5 | Reorder two criteria and save | Previously recorded scores are unchanged — they are keyed by criterion id, not position |

**Success state:** a chair can configure the review shape without leaving the UI.
**Failure state:** the rounds select still caps at 2, meaning the UI silently contradicts the server.

## Journey B — Chair assigns round 1

| Step | Action | Expected |
|---|---|---|
| B1 | Open the assignment table | Existing seeded assignments visible, grouped by round |
| B2 | Use assign-by-filter (e.g. track = Engineering) to assign 3 reviewers | Preview count shown before applying |
| B3 | Apply | Assignments created; re-applying the same filter creates none (idempotent per `by_plan_submission_reviewer_round`) |
| B4 | Open reviewer progress | Each reviewer shows assigned vs completed; the seeded behind-reviewer is visible; a reviewer with no email has a disabled nudge with a stated reason |
| B5 | Nudge a reachable reviewer | A `comms_log` row is written even if the provider fails |

## Journey C — Reviewer scores against the rubric

**Entry point:** signed in as a reviewer → evaluation → my queue.

| Step | Action | Expected |
|---|---|---|
| C1 | Open the queue | Only this reviewer's assignments; no other reviewer's rows are reachable even by editing the request |
| C2 | Open a submission | Title, abstract, track. Scorecard with the plan's criteria and their maxima |
| C3 | Enter values | Weighted total updates live and is shown separately from the per-criterion inputs |
| C4 | Leave a required criterion blank and save | Blocked with a per-criterion message |
| C5 | Complete and save | Saved indicator; reload shows the stored values; progress panel increments |
| C6 | Reopen and change one value | Update, not a second row (`by_submission_reviewer` uniqueness) |

## Journey D — Blind review

**Entry point:** reviewer → my queue → the seeded `Blind shortlist review` plan.

| Step | Action | Expected |
|---|---|---|
| D1 | Open an assigned submission | No speaker name, email, company, or links anywhere on screen |
| D2 | Inspect the network payload | No `speakerNames` **key**; identifying answer keys absent, not blanked |
| D3 | Read the explanatory copy | States that identity is hidden for this plan, and states the known limitation honestly — an abstract that names its own author is not redacted |
| D4 | Score and save | Works identically to the unblinded flow |

**Failure state:** a name appearing anywhere, or a blanked-but-present key. Either is a defect.

## Journey E — Chair advances a shortlist to round 2

| Step | Action | Expected |
|---|---|---|
| E1 | Filter to submissions with completed round-1 reviews | Count matches reviewer progress |
| E2 | Select 12 and choose `Advance to round 2` | Dialog opens with a reviewer multi-select and a preflight: "12 selected · 10 eligible · 2 have no round-1 score" |
| E3 | Confirm | Result reports created / already existed / skipped, with the skipped titles inspectable |
| E4 | Repeat the identical advance | "0 created · 20 already existed" — no duplicates |
| E5 | Check round-1 scores | Unchanged, including timestamps |
| E6 | Switch the assignment table to round 2 | The new assignments appear against the chosen reviewers |
| E7 | Sign in as a round-2 reviewer | Only round-2 items in the queue |

**Recovery:** if the advance fails partway, already-created assignments persist and the retry is a
no-op for them — the mutation only inserts and is keyed on the uniqueness index.

## Journey F — AI assist (only if decision D-2 selects Branch B)

| Step | Action | Expected |
|---|---|---|
| F1 | Chair enables AI assist on one plan | An explicit per-plan control; off by default |
| F2 | Reviewer opens a submission on that plan | A **collapsed** panel labelled `Suggested — not a score` |
| F3 | Reviewer ignores it and scores normally | Fully possible; no field is prefilled |
| F4 | Reviewer expands it | Per-criterion suggested values plus a rationale, visibly separated from the real inputs |
| F5 | Reviewer clicks `Use these values` | Values copied into the form, still unsaved; the reviewer can change any of them |
| F6 | Reviewer saves | The stored `evaluations` row is attributed to the human; the suggestion is marked `accepted` with the actor recorded |
| F7 | Reviewer dismisses instead | Suggestion marked `dismissed`; nothing written to `evaluations` |
| F8 | Open a plan with AI assist off | No panel, no request made |
| F9 | Open a blinded plan with AI assist on | The rationale contains no speaker identity — it was generated from the redacted projection |
| F10 | Check reviewer progress | Suggestions never count as completed reviews |

**Non-negotiable failure states:** a suggestion that writes a score without an explicit human
action; a suggestion that changes a submission's status; a suggestion counted as review progress.

## Persistence and authorization checks

- Plans, criteria, assignments, and scores all survive reload and sign-out/sign-in.
- A reviewer requesting another reviewer's `reviewerUserId` receives an error
  (`convex/evaluations.ts:147-155`), not a filtered list.
- `advanceRound` called by a reviewer is rejected.
- No evaluation surface is reachable for an event the signed-in user has no `event_members` row on.
</content>
