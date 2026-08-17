# Event dashboard

**Route:** `/events/:eventSlug/dashboard`  
**User:** Authorized event organizer or member with dashboard access.

## Starting state

The selected event has representative submissions, speakers, tasks, and agenda data; another event
exists to test event scope.

## Journey

1. The organizer enters through Events or the sidebar and sees the dashboard loading state.
2. Counts and readiness summaries resolve for the URL event only; zero-data cards explain their next
   action instead of appearing broken.
3. The organizer opens each readiness/navigation link and confirms it lands on the selected record
   or owning page while retaining the event slug.
4. They resolve an issue on the owning page, return, and see the count/link update after reload.
5. They switch events and confirm no count, title, or linked record from the prior event remains.

## Success and recovery

The dashboard is read-only; CRUD is intentionally owned by its linked pages. A failed load exposes
a clear retry state, never stale data from another event.
