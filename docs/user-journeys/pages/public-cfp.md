# Public CFP submission

**Route:** `/submit/:eventSlug/:formId`  
**User:** Anonymous or signed-in prospective speaker.

## Journey

1. The submitter opens a published public link and sees welcome, unavailable/closed, loading, and form states as appropriate.
2. They complete account/email verification when required, then enter valid and invalid required, conditional, and participant fields.
3. They move between steps without losing answers, inspect the review step, and submit once.
4. They see the submission-received state, confirmation/portal information, and optional redirect countdown.
5. They follow the portal handoff or sign in, see only their submission, and refresh to confirm it persists.
6. They repeat with a closed, duplicate, and altered route fixture to confirm safe failure and no organizer routing/configuration leakage.

## Success and recovery

Submission failure retains correctable answers and prevents duplicate records. See the detailed [CFP redirect journey](../../features/portal-redirect-fixes/USER_JOURNEY.md).
