# Agenda

**Route:** `/events/:eventSlug/program/agenda`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Agenda, sees the active event timezone, and switches List, Day, Week, Track, Rooms, and Conflicts views.
2. They create a session from an accepted submission and a standalone disposable session, correct invalid date/time/room input, and save.
3. They edit a session, move it via the accessible move control and grid interaction, and verify conflict feedback updates.
4. They create and resolve a room/speaker conflict, distinguish informational track overlap, and open the exact affected session.
5. They search/filter/sort, export/print, duplicate a day, and publish only when blocking rules permit.
6. They reload, navigate away/back, and switch events to prove creation, edits, movement, duplication, and publish state persist correctly.

## Success and recovery

Failed create/edit/move actions roll back optimistic state and retain a retryable error. See the full [Agenda Scheduling journey](../../features/agenda-scheduling/USER_JOURNEY.md).
