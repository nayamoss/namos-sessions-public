# Organizer tasks

**Route:** `/events/:eventSlug/portals/tasks`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Tasks and sees loading, empty, error, and populated task states.
2. They search and filter by type, target, status, and source using the toolbar below the page title.
3. They create a disposable task with a valid target/due date, then edit title, details, and status.
4. They complete and reopen it, verify source labels and linked speaker/sponsor/submission references, and refresh.
5. They delete the disposable task only after confirmation and verify it disappears from both admin and the owning portal.

## Success and recovery

Invalid target/date and failed mutations preserve safe input; optimistic status changes roll back on failure. Tasks never appear in a different event or speaker portal.
