# Speakers

**Route:** `/events/:eventSlug/program/speakers`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Speakers and sees loading, empty, error, and populated views for the active event.
2. They search, filter, sort, change visible columns, and open a speaker detail pane from the result list.
3. They add a disposable speaker or edit allowed profile/readiness fields, validate required values, and save.
4. They update confirmation/task/readiness information and follow a linked submission without losing context.
5. They refresh, switch events, and confirm saved values persist only in the intended event.
6. If removal is available, they cancel then confirm the destructive action and verify linked data is handled visibly.

## Success and recovery

Failed saves restore the previous row/detail state and preserve correctable input. A speaker from another
event is never selectable through an altered ID or URL.
