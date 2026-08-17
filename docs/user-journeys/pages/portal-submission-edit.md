# Speaker submission editor

**Route:** `/portal/submissions/:submissionId/edit`  
**User:** Authenticated owner of an editable draft, pending, or withdrawn submission.

## Journey

1. The speaker enters via their Submissions list and the editor loads the original form answers.
2. They change valid and invalid values, including required/dynamic fields, and see inline validation.
3. They save a draft, reload, and confirm answers and the draft status persist.
4. They make another edit, invoke navigate-away, choose stay, then save/submit through the visible action.
5. They revisit after a decision, CFP closure, or review lock and see the explanatory non-editable state.
6. A second speaker and altered submission ID are denied without leaking answers.

## Success and recovery

Failed save/submit retains correctable answers and no false success status. Submission deletion is intentionally unavailable; withdrawal/status policy is explicit where offered.
