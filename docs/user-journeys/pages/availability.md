# Organizer availability

**Route:** `/events/:eventSlug/program/availability`  
**User:** Authorized event organizer.

## Journey

1. The organizer selects a speaker and confirms the displayed timezone/event days before editing.
2. They block and unblock individual and ranged times, add a note, and save; invalid ranges are explained inline.
3. They use timezone display controls and confirm stored availability does not change merely because display timezone changes.
4. They reset a disposable edit, cancel the confirmation once, then confirm and verify the result after reload.
5. They select another speaker and another event, confirming availability never leaks between people or events.

## Success and recovery

Failed saves retain the visible prior state and the user's correctable edit. Reset is destructive and always explicitly confirmed.
