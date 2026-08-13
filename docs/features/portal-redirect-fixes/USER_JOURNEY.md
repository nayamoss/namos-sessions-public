# CFP redirect and Abstracts grid user journey

**Feature:** #108 portal redirect identity and submitted abstract display  
**Related requirements:** [`requirements.md`](./requirements.md)  
**Related plan:** [`plan.md`](./plan.md)

## 1. User

Two users complete this journey: an unauthenticated CFP submitter who becomes a speaker, and an
organizer reviewing that submission.

## 2. Starting state

- A published event has an open CFP with portal auto-redirect enabled.
- The form has a non-empty rich-text abstract field whose organizer-visible label is not one of
  `Abstract`, `Description`, or `Summary` (for example, `What will you cover?`).
- The submitter is in a clean signed-out browser session for the primary path.
- A second fixture has a different verified Clerk speaker signed in before submitting, to verify
  the mismatch state.

## 3. Entry point

The submitter opens the public CFP link and completes its visible steps. The organizer reaches
the result through **Program → Abstracts**.

## 4. User journey

1. The submitter enters their name, email, session title, and the custom-labelled abstract.
2. They submit the form and see **Submission received** plus the portal link/countdown.
3. They select **Open the speaker portal now** or wait for the redirect.
4. In the clean session, the portal loads the submitting speaker’s Home view and shows the new
   submission in **My submissions**.
5. The organizer opens **Abstracts**, finds that submission, and sees the entered abstract text
   in the Description column and the inline detail pane.
6. In the conflicting-session fixture, the portal keeps the verified Clerk speaker’s data private
   and shows an inline, dismissible notice that the recent submission belongs to a different
   speaker session. Dismissing the notice leaves the verified speaker’s portal usable.

## 5. Visible success state

- The submitting speaker’s own title is visible after redirect in a clean session.
- The Description column and detail pane show the custom-labelled abstract verbatim, not `—`.
- A conflicting Clerk identity never changes, but the mismatch notice makes the state explicit.

## 6. Failure and recovery

| Situation | Visible behavior | Recovery |
|---|---|---|
| The public CFP is unavailable or closed | The public page reports that submissions are closed/unavailable | The speaker uses an open CFP link |
| A different Clerk speaker is signed in | Inline mismatch notice; that verified speaker remains selected | Sign out, then sign in as the submitting speaker; never use the handoff to override Clerk identity |
| Old submission lacks a persisted abstract field id | The grid uses the form’s abstract section and rich-text field structure before label fallback | No user action required; organizer sees the historical abstract |
| The organizer has no matching records | Abstracts shows its normal empty state | Change the search/status filter or submit a CFP |

## 7. Persistence and safety

- The post-submit handoff is one-use session state only; it never authorizes access.
- A verified Clerk speaker always takes precedence over that handoff.
- The selected speaker and submission list remain correct after refresh.
- The submitted answer retains its opaque abstract field id, so later organizer label changes do
  not erase the relationship between the stored answer and the grid display.

## 8. Required browser QA

1. Run the clean, signed-out submit → redirect → own-submission flow at desktop and 375 px.
2. Run the custom-label submission and verify the organizer grid plus detail pane.
3. Run the conflicting Clerk-session flow; confirm the banner, dismiss it, navigate away and back,
   and confirm no cross-speaker data becomes visible.
4. Refresh both portal and Abstracts results and confirm the visible state persists.

No database inspection, direct route mutation, unit test, or API response substitutes for these
browser steps.
