# Speaker availability

**Route:** `/portal/availability`  
**User:** Authenticated speaker who owns the resolved profile.

## Journey

1. The speaker opens Availability and sees event days and the event timezone.
2. They block/unblock a disposable time range, add a note when available, save, refresh, and confirm persistence.
3. They change the display timezone and confirm the stored availability remains the same instant/range.
4. They reset a disposable edit using the visible confirmation and verify another speaker cannot access it.

## Success and recovery

Invalid ranges and failed saves retain safe input. Reset is explicit; no organizer or cross-speaker availability data is exposed.
