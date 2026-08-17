# Task templates

**Route:** `/events/:eventSlug/settings/task-templates`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Task templates and sees loading, empty, error, and list states.
2. They create a disposable template with valid title, description, target type, and default status/due behavior.
3. They edit it, mark/unmark it as default if supported, and refresh to prove persistence.
4. They apply it to a disposable submission or sponsor and see added/skipped counts; reapplying is idempotent.
5. They duplicate then delete the disposable copy through confirmation without removing created tasks unintentionally.

## Success and recovery

Invalid target data and failed writes preserve the draft. Templates and applied tasks remain scoped to their selected event.
