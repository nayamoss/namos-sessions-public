# Speaker tasks

**Route:** `/portal/tasks`  
**User:** Authenticated speaker with assigned tasks.

## Journey

1. The speaker opens Tasks and sees loading, empty, error, and populated task states.
2. They filter All, My tasks, and Submission tasks, then inspect source labels and due dates.
3. They complete a disposable task, refresh, and confirm the completed state; they reopen it and confirm status updates again.
4. For a linked form task, they select Complete form, complete it, and confirm the task reflects completion.
5. Another speaker cannot list or toggle the task through an altered ID.

## Success and recovery

Failed toggles roll back UI state and explain retry. Delete and reassignment are intentionally organizer-only.
