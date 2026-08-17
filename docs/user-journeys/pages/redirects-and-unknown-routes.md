# Redirects and unknown routes

**Routes:** legacy `/dashboard*`, `/program*`, `/portals*`, unscoped `/settings/*`, event-scoped
`/events/:eventSlug/settings/email`, and `*`  
**User:** Anonymous, onboarding-incomplete, authorized, and forbidden users.

## Journey

1. Each user opens a legacy URL from a bookmark and observes the intended event-aware or Events destination;
   the event-scoped legacy email URL reaches that event's Integrations page.
2. An anonymous user is sent through sign-in; after authentication, only a safe destination is restored.
3. An onboarding-incomplete organizer is routed to onboarding instead of an organizer workspace.
4. A forbidden/missing event slug shows an unavailable state or Events, never prior event content.
5. An unknown route lands on Events and does not strand the browser or emit a console-visible crash.
6. The user uses back/forward and refresh to confirm redirects do not create loops or cross-event leakage.

## Success and recovery

Redirects are intentionally read-only: CRUD is N/A. The essential success condition is safe navigation with no private data exposure.
