# Sponsors

**Route:** `/events/:eventSlug/program/sponsors`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Sponsors, reads loading/empty/error/list states, then filters by tier and opens a detail pane.
2. They create, rename, reorder, and remove a disposable tier using visible validation and confirmation.
3. They create a sponsor, edit its status/website/notes, and verify it appears in the list and after refresh.
4. They add, edit, and remove contacts; designate and transfer the primary contact; verify only one primary remains.
5. They create a deliverable, apply a task template, complete/reopen the task, and verify counts update in Sponsor and Portal Tasks.
6. They link a disposable routing rule to the sponsor, verify the public CFP never reveals sponsor administration, then delete the sponsor after confirmation.

## Success and recovery

Invalid names, foreign-event tier references, duplicate work, and failed writes remain recoverable with no partial state.
See the full [Sponsor Management journey](../../features/sponsor-management/USER_JOURNEY.md).
