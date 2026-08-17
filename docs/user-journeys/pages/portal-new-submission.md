# Speaker portal new submission

**Route:** `/portal/submissions/new`  
**User:** Authenticated speaker with an event that may have open public CFP forms.

## Journey

1. The speaker opens New submission and sees loading, error, no-open-forms, or an open-form chooser.
2. They choose an open form and are handed to its public CFP route without manually supplying IDs.
3. They abandon once and return to the chooser; then complete a disposable submission.
4. They return to portal submissions and confirm their own newly created record appears.
5. They test a closed/expired form and see it unavailable rather than being able to create against it.

## Success and recovery

This page intentionally selects a form rather than creating data itself. A failed form-list request offers recovery and exposes no organizer configuration.
