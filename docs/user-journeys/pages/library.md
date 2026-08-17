# Library

**Route:** `/events/:eventSlug/settings/library`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Library and sees loading, empty, error, and existing reusable tags.
2. They create a disposable tag, verify required/duplicate validation, and see it available in a dependent form or Abstracts filter.
3. They rename/edit the tag and verify references display the new label without losing their association.
4. They attempt deletion while it is assigned, read the impact, cancel once, then confirm a permitted delete/unassign flow.
5. They refresh and switch events to confirm tags and assignments stay event-scoped.

## Success and recovery

Failures leave the existing tag list intact and input correctable. Tags cannot be assigned or removed across event boundaries.
