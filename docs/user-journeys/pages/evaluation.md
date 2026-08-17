# Evaluation

**Route:** `/events/:eventSlug/program/evaluation`  
**User:** Authorized organizer; reviewer queue steps require a seeded reviewer identity.

## Journey

1. The organizer opens Evaluation and sees plans, criteria, assignments, progress, and empty/error states.
2. They create a disposable plan, add/edit/reorder criteria, set allowed scoring/anonymization options, and save.
3. They assign reviewers directly and by filter, confirm duplicate assignment is handled idempotently, and inspect the assignment result.
4. A reviewer opens their permitted queue, scores a submission, validates required scores, and submits once.
5. The organizer returns to see progress and score changes reflected in Evaluation and Abstracts after reload.
6. They remove a disposable assignment/plan only through the visible confirmation path.

## Success and recovery

Invalid criteria, empty filters, failed assignments, and failed scoring retain safe input and explain retry. Reviewers cannot
read or score records outside their assignment/event.
