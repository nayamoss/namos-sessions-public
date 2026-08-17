# Events

**Routes:** `/` and `/events`  
**User:** Authenticated organization owner, admin, or event member.

## Starting state

The user has completed organizer onboarding. An owner has Event A; Event B is available for
event-switching and permission checks.

## Journey

1. The user opens Events and sees loading, populated, empty, and failed-load states as applicable.
2. They filter by status and open an event card; the selected event slug appears in the URL.
3. An owner selects New event, enters a unique name, slug, and valid dates, and creates Event B.
4. The new card appears and the app opens Event B's dashboard. Refresh retains Event B by URL.
5. The owner opens Duplicate, supplies a unique name/slug, optionally copies the team, and confirms
   only configuration—not submissions, speakers, or agenda instances—was copied.
6. If archive/delete is offered, they read the impact, cancel once, then confirm the destructive
   action and see the card state update.
7. A member signs in and confirms only accessible event cards appear; a forbidden direct slug shows
   no protected data.

## Success and recovery

Invalid dates and duplicate slugs remain editable with inline errors. A failed create/duplicate does
not leave a partial event; retry is safe. See the deeper [workspace-switching journey](../../features/event-workspace-switching/USER_JOURNEY.md).
