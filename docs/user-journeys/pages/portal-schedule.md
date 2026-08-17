# Speaker schedule

**Route:** `/portal/schedule`  
**User:** Authenticated speaker with a published or unpublished event schedule.

## Journey

1. The speaker opens Schedule and sees loading, no-published-sessions, error, or their published agenda items.
2. They confirm time, room, track, and timezone values against the event's published agenda.
3. The organizer changes a disposable session's publish/time state; the speaker refreshes and sees only the permitted published result.
4. A second speaker confirms only sessions linked to them appear.

## Success and recovery

Schedule is intentionally read-only. Failed loads offer retry and never reveal unpublished or another speaker's sessions.
