# Speaker portal submissions

**Route:** `/portal/submissions`  
**User:** Authenticated speaker with one or more owned submissions.

## Journey

1. The speaker enters Submissions from portal navigation and sees loading, empty, error, and populated states.
2. They inspect title, status, and last-update information and open an editable item.
3. They verify locked decision/review/closed-form submissions explain why Edit is unavailable.
4. They select New submission, return, and see a successfully submitted owned proposal in the list after refresh.
5. A different speaker's record never appears, even after a direct altered URL attempt.

## Success and recovery

This list has no destructive mutation; create/edit lives in its linked pages. Failed loads remain recoverable and do not show stale records.
