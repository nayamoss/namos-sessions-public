# Review & Scoring — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-16
**Issue:** #195

## Problem Statement

The judging pipeline works. An audit on 2026-08-16 drove the whole flow in a real browser and
confirmed it end to end: create an evaluation plan, define weighted criteria, assign a submission
to a reviewer by email, open the reviewer queue, record a score and comments, and watch the
aggregate rating land on the Submissions grid alongside per-reviewer progress and a Remind button.
None of that needs rebuilding.

What fails is the layer an organizer actually touches:

1. **Scoring reads as a form field, not a judgement.** A reviewer picks from a row of numbered
   grey circles. There is nothing to indicate that 4 is good and 2 is not, and nothing that says
   "this is you rating this talk."
2. **There is no "maybe."** `submissions.status` is a closed union of seven literals with no
   middle bucket. In a real program-committee session the most common answer is "hold that one" —
   and it has nowhere to go, so it gets left as `pending` and becomes indistinguishable from
   submissions nobody has looked at yet.
3. **Deciding costs a dropdown.** Recording accept or decline means opening a `<Select>` with
   seven options and picking the right one, per row. There is no one-click path.
4. **The reviewer queue is hidden.** It lives behind an unlabelled `View` dropdown in the page's
   top-right corner. A reviewer with assignments has no way to know it exists. This is the same
   discoverability failure that made CFP creation unfindable, fixed in `f98b85b`.
5. **Leftover copy.** The Add-submission detail pane is still headed "Add abstract" with an
   "Add abstract" confirm button, inconsistent with the page it opens from.

## User Stories

**As a** reviewer **I want to** rate a submission with stars **so that** the score I give reads as
a judgement at a glance instead of an arbitrary number.

**Acceptance Criteria:**
- GIVEN I am a reviewer with an assignment WHEN I open my queue THEN I see a star control, not
  numbered circles
- GIVEN a plan on a 1–10 scale WHEN I rate it THEN the control still covers the full range without
  becoming unusable
- GIVEN I have already reviewed a row WHEN I reopen it THEN my stars are filled to my recorded score
- GIVEN I am using a keyboard WHEN I tab to the star control THEN I can set a rating with arrow keys
  and the current value is announced

**As an** organizer **I want to** approve, hold, or decline a submission in one click **so that** I
can move through a review session at the speed of the conversation.

**Acceptance Criteria:**
- GIVEN a submission in the grid WHEN I click Approve THEN its status becomes `accept_queue` with
  no dropdown and no confirmation step
- GIVEN a submission WHEN I click Maybe THEN its status becomes `maybe` and persists across reload
- GIVEN a submission WHEN I click Decline THEN its status becomes `decline_queue`
- GIVEN I click the decision that is already set WHEN the click lands THEN the status returns to
  `pending` (the control toggles, so a misclick is one click to undo)
- GIVEN the update fails WHEN the error returns THEN the row reverts to its prior status and shows
  an inline error

**As an** organizer **I want to** filter to just the maybes **so that** I can revisit held
submissions as a group once the first pass is done.

**Acceptance Criteria:**
- GIVEN submissions in `maybe` WHEN I open the Submissions page THEN a "Maybe" filter tab shows
  with a count
- GIVEN a submission in `maybe` WHEN I look at the Decision email column THEN it reads "Decide
  first" and offers no send action

**As a** reviewer **I want to** find my queue without being told where it is **so that** I can
start reviewing as soon as I sign in.

**Acceptance Criteria:**
- GIVEN I have assignments WHEN I open the Judging page THEN a labelled control shows both views
  with my queue's outstanding count
- GIVEN I have assignments and have not scored them WHEN I open the Judging page THEN my queue is
  the view that opens by default
- GIVEN I have no assignments WHEN I open the Judging page THEN the plans view opens and the queue
  entry point is absent, not an empty tab

## Functional Requirements

- **FR-001:** Add `maybe` to the `submissions.status` union in `convex/schema.ts`, positioned
  between `accept_queue` and `decline_queue` in decision order.
- **FR-002:** Every module that enumerates submission status must handle `maybe` — Convex
  (`submissions.ts`, `publicApi.ts`, `categoryRouting.ts`, `submissionEditing.ts`, `seed.ts`), the
  published SDK (`packages/sdk/src/types.ts`), the MCP server (`packages/mcp/src/server.ts`), and
  the web app (`src/data/types.ts`, `SubmissionStatusBadge.tsx`, `RoutingRulesEditor.tsx`,
  `readiness.ts`, `submission-editing.ts`, `Abstracts.tsx`, `DashboardHome.tsx`, `portal-data.ts`).
- **FR-003:** `maybe` is not a terminal decision. The Decision-email action stays unavailable for it,
  exactly as it is for `pending`.
- **FR-004:** Build a reusable `StarRating` component and use it in both reviewer scoring paths —
  the single overall score in `Evaluation.tsx` and each numeric criterion in `ScorecardForm.tsx`.
- **FR-005:** `StarRating` must support a configurable maximum (5 and 10 both occur), a read-only
  display mode for showing recorded scores, keyboard operation, and an accessible current value.
- **FR-006:** Add a `DecisionButtons` control — Approve / Maybe / Decline — to the Submissions grid
  row and the submission detail pane. Clicking the active decision clears it back to `pending`.
- **FR-007:** The existing status `<Select>` stays available for the states the three buttons do not
  cover (`draft`, `withdrawn`, and promoting a queue state to final `accepted`/`declined`). It moves
  out of the primary position; the buttons become the primary affordance.
- **FR-008:** Replace the unlabelled `View` dropdown on the Judging page with a labelled segmented
  control showing "Evaluation plans" and "My reviewer queue", the latter carrying an outstanding count.
- **FR-009:** When the signed-in user has at least one unscored assignment, the reviewer queue is the
  default view on load. When they have no assignments, the queue control is not rendered at all.
- **FR-010:** Rename the Add-submission detail pane heading and confirm button from "Add abstract" to
  "Add submission".
- **FR-011:** Decisions are optimistic — the row updates immediately and reverts with an inline error
  if the mutation fails.

## Non-Functional Requirements

- **NFR-001:** The status union change must not break existing rows. `maybe` is additive; no
  migration or backfill is required and no existing status changes meaning.
- **NFR-002:** The public API and MCP surface must keep accepting and returning every prior status
  value unchanged. Adding `maybe` is additive to those contracts.
- **NFR-003:** `StarRating` must meet WCAG 2.1 AA — operable by keyboard alone, with the current
  rating exposed to assistive technology.
- **NFR-004:** Existing evaluations recorded as plain numbers must render correctly under the star
  control with no data change.

## Out of Scope

- Rebuilding the evaluation pipeline itself — it is verified working and is not to be touched
  beyond the scoring control.
- Half-star or fractional reviewer input. Reviewers pick whole stars; the *aggregate* stays a
  decimal average as it is today.
- Bulk decisions across a multi-row selection.
- Any change to the decision-email templates or sending logic.
- Auto-deploy on `main` — tracked separately as #196.

## Success Metrics

- An organizer records a decision without opening a dropdown.
- `maybe` survives reload and has its own filter tab with a count.
- A reviewer with assignments reaches their queue without being told where it is.
- No submission in `maybe` can be sent a decision email.
- The product line "Score every submission with star ratings and notes. Approve, maybe, or decline
  with one click." is literally true of the shipped app.
