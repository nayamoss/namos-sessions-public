# Agenda Scheduling — User Journey

This is the authoritative end-to-end acceptance journey for issue #112. The feature is not
complete until every step works through the organizer UI with the repository backend rather
than test-only state.

## User and starting state

The user is a signed-in event organizer who has completed onboarding. The seeded event has a
timezone, at least two event days, two rooms, two tracks, accepted submissions, speakers, and
speaker availability. Seed data includes a room overlap, a speaker double-booking, and an
informational same-track overlap so the Conflicts view is meaningful on first load.

## Journey

1. Enter the application normally, open **Program → Agenda**, and confirm the agenda loads in
   List view with event-timezone times and without a second fetch when switching views.
2. Choose **Add Session**. Confirm a detail pane pushes the main content narrower. Create a
   session from an accepted submission; its title, speakers, and track are prefilled. Save it
   and confirm the pane closes, the new row is visible, and a success message is announced.
3. Open **Add Session** again, choose a standalone session, fill title, speakers, track, room,
   date, start, end, and published state. Confirm invalid or incomplete values cannot save and
   receive useful inline errors. Save a valid session.
4. Select a session from List view. Confirm its editable detail pane opens. Change its room or
   time, save, close the pane, and confirm the updated values remain visible.
5. Open Rooms view. Confirm every event day uses a continuous 15-minute time axis, including
   empty slots. Drag a session into an empty room/time slot. Confirm it snaps to the grid,
   retains its duration, persists, reports success, and updates conflicts without a full reload.
6. Complete the same move without drag: activate a session's **Move** control, choose a room and
   start time, save, and confirm an assistive-technology announcement describes the result.
7. Create a room or speaker collision. Confirm the Conflicts count updates. Open Conflicts,
   select one of the involved sessions, and confirm that exact session opens in the detail pane.
8. Confirm a same-track overlap appears as an informational conflict and does not prevent
   **Publish schedule**. Resolve the blocking room/speaker conflict and confirm the count changes.
9. Exercise List, Day, Week, Track, Rooms, and Conflicts views. Search sessions and apply working
   sort and filter controls; clear them and confirm the original dataset returns without refetch.
10. From **More**, export CSV and PDF, print the schedule, and duplicate one event day to another.
    Confirm duplicated sessions are drafts and do not overwrite sessions already on the target day.
11. Publish the schedule and confirm all scheduled sessions are published even when only the
    informational track overlap remains.
12. Refresh and confirm saved creation, edits, moves, duplication, and published state persist.
    Navigate away and back, then sign out and sign in again; the same persisted agenda returns.

## Failure and recovery checks

- Force a save or move failure. The optimistic card returns to its prior room/time, an error
  message is shown and announced, and no stale success message appears.
- Try to save an end time at or before its start time, a time outside the event date range, or
  without a room. The pane remains open and explains how to correct the input.
- Confirm keyboard users can reach every agenda control, open and close the detail pane, move a
  session, and return focus without relying on pointer drag.

## Frontend wiring contract

The page must use `useRepo()` only. Creation, editing, moving, duplication, conflict detection,
and publication must call `repo.agenda` methods with the active event id. Rooms, tracks,
submissions, speakers, agenda items, and conflicts load once for the event and all views, search,
sort, and filters derive from that fetched data client-side. Times are parsed and rendered with
`events.timezone`; browser-local time is never used.

## Known baseline gaps (before #112)

- Add Session immediately creates a hard-coded untitled 9:00 AM record.
- Conflict links write `?selected=` but nothing consumes it.
- Rooms view only exposes occupied start times as drop targets.
- Pointer drag has no keyboard or touch equivalent and moves lack success feedback.
- Track overlaps are not detected.
- Saved Views and Columns are dead controls; Sort, Filter, and More are unwired.
- Creation, movement rollback, conflict click-through, persistence, and the complete journey are
  not covered by tests.
