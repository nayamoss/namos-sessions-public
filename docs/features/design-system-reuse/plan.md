# Design-system reuse pass

## Source patterns to reuse

- `clockwork-main/clockwork/src/pages/Schedule.tsx`
  - Preserve the schedule hierarchy of a compact identity column/header followed by repeated work columns: `grid-cols-[180px_repeat(...)]`, `p-3` headers, `min-h-32` work cells, and `p-2 text-xs` scheduled blocks.
  - Keep the native drag vocabulary already shared by both apps: `draggable`, `cursor-grab active:cursor-grabbing`, `onDragOver`, and `onDrop` on the whole target cell.
  - Adapt the compact time-first block hierarchy (`font-semibold` time, muted secondary metadata) without copying Clockwork's `shadow-sm` or 4px side stripe, which would be heavier than Namos's current borderless system.
- `clockwork-main/clockwork/src/components/schedule/{ApplyTemplateModal,SaveTemplateModal,ShiftSwapInbox,OpenShiftClaimInbox,ShiftSwapRequestModal}.tsx`
  - Reuse the supporting surface rhythm (`space-y-3`, `p-3`, `text-sm`/`text-xs`, muted secondary fills) as confirmation that schedule UI should stay compact and operational. No modal behavior is needed in this pass.
- `servicehq-main/servicehq/src/pages/Schedule.tsx`
  - Closely adapt its borderless grid construction: `grid ... gap-px`, day/room headers with `p-3`, target cells with `rounded-lg bg-muted/30 p-1`, `hover:bg-muted/50 transition-colors`, and compact colored event blocks.
- `servicehq-main/servicehq/src/pages/MySchedule.tsx` and `BookingPage.tsx`
  - Reuse the restraint shown by `rounded-lg bg-card p-4` content surfaces and muted secondary information. Do not port BookingPage's older shadowed cards.
- `takumi-webapp/components/views/CalendarView.tsx`
  - Reuse explicit droppable feedback (`isOver ? 'bg-accent/50'`) and low-chroma event treatment (project/accent color at roughly 13% opacity), plus compact item spacing (`px-1.5 py-0.5`, `text-xs`, truncation).
  - `components/scheduling/ScheduleCalendar.js` and `components/content/ContentScheduler.tsx` were reviewed but are intentionally not sources for this pass: their visible borders, gray panels, and conventional card stack are less minimal than the newer CalendarView and the stated target.

## Namos changes

- `src/pages/program/Agenda.tsx`
  - Replace the Rooms view's continuous 15-minute gray banding with ServiceHQ-style softly filled droppable cells and a quieter white header/time rail.
  - Give room columns a clearer minimum width, keep the time rail compact, and retain horizontal scrolling rather than compressing schedule content.
  - Restyle session blocks as Takumi-style low-chroma primary-tinted items with stronger title/time hierarchy, truncation, and explicit hover/drag/drop feedback.
  - Keep the existing accessible `AgendaMoveControl` as the keyboard/non-drag alternative.
- `src/index.css`
  - Move the light page background and legacy `--bg` closer to neutral white while retaining the recently lightened `--muted: 220 24% 96%` token. This reduces the blue-gray page wash without changing the product accent or dark theme.
- `src/test/color-system.test.ts`
  - Update the design-token contract to assert the new near-white background value.
- `src/components/ui/tabs.tsx`
  - Remove the active tab's `shadow-sm`; selection already has a background fill, so the shadow adds unnecessary surface weight app-wide.

## Explicitly out of scope

- No changes to queries, Convex writes, agenda item mapping, conflict detection, export/publish behavior, or drag/drop persistence.
- No changes to `AgendaSessionForm.tsx`, `OrgMenu`, or agenda-item data handling; these overlap named in-flight fixes.
- No full app-shell, navigation, form, modal, or page-by-page redesign. Existing card primitives are already borderless and shadowless, so this pass only adjusts the shared tab treatment and the background token after the Agenda priority work.
- No copied sibling business logic or new scheduling dependency. The reuse target is their proven layout, spacing, color, and interaction treatment.
