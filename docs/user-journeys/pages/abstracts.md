# Abstracts

**Route:** `/events/:eventSlug/program/abstracts`  
**User:** Authorized organizer or reviewer with the applicable decision permission.

## Starting state

The event has submissions across draft, pending, accepted, declined, and withdrawn states, including
one with a custom-labelled abstract field.

## Journey

1. The user opens Abstracts and sees loading, empty, error, and populated states.
2. They use search, status tabs, filters, sort, columns, and pagination from the toolbar; the result
   set and selection are visible and keyboard reachable.
3. They open a submission detail pane, verify title/participant/abstract data, and follow a linked
   speaker or evaluation record.
4. An authorized organizer applies a status/decision and tag using the visible controls; any action
   with irreversible consequences requires the provided confirmation.
5. They reload and confirm the decision, tags, and any saved grid preference persist as designed.
6. A reviewer/member without authority sees no unauthorized decision control; another event's ID or
   URL never reveals a submission.

## Success and recovery

Failed status/tag writes roll the row/detail back and show a retryable error. The custom abstract
label is rendered as the stored answer, not discarded because its label differs. See [CFP redirect and Abstracts](../../features/portal-redirect-fixes/USER_JOURNEY.md).
