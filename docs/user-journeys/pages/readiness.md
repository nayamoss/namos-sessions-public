# Readiness

**Route:** `/events/:eventSlug/program/readiness`  
**User:** Authorized event organizer.

## Journey

1. The organizer opens Readiness and sees loading, no-issues, failed-load, and populated issue states.
2. They filter by event day and inspect issue counts grouped by source.
3. They open every issue link and confirm it focuses the owning Agenda, Speaker, Abstract, Task, or Communication record.
4. They resolve the issue through its owning page, return, and confirm it disappears or its count changes after refresh.
5. They switch events and verify no issue from the preceding event survives.

## Success and recovery

Readiness is read-only by design; mutations belong to source pages. A failed load offers retry rather than stale or cross-event data.
