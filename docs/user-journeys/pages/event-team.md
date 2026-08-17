# Event team

**Route:** `/events/:eventSlug/settings/team`  
**User:** Event owner/admin; invitee identity is required for access verification.

## Journey

1. The organizer opens Event team and sees loading, empty, error, and current-members states.
2. They invite a disposable email, correct an invalid/duplicate email, choose a role, and submit.
3. The invite row reports pending or active status; the user may also pull eligible members from another event if offered.
4. The invited user signs in and sees only this event and their allowed capabilities.
5. The organizer cancels one removal, then confirms it; refresh and the invitee's next navigation prove access was removed.

## Success and recovery

Seat-limit, duplicate, and failed-invite errors are specific and retryable. Role changes/removals never affect unrelated event memberships.
