# Public event feed

**Route:** `/e/:eventSlug/:feed`  
**User:** Anonymous attendee.

## Journey

1. The attendee opens a documented event feed link and sees a loading state followed by public agenda, session, or speaker content.
2. They use available search/filter controls and confirm updates stay within the already-public feed.
3. They verify times use the event timezone and that unpublished/internal fields are absent.
4. They open invalid event/feed combinations and empty events, receiving a clear safe state without organizer metadata.
5. The organizer changes a permitted public record; a refresh reflects the public update without exposing administration.

## Success and recovery

The page is intentionally read-only and account-free. Network failures show an appropriate retry/unavailable state; no private fallback data is rendered.
