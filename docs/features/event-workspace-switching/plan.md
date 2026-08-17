# Event Workspace Switching — Implementation Plan

The authoritative UI path and completion gate is
[`USER_JOURNEY.md`](./USER_JOURNEY.md). T019 must execute that journey rather than reconstructing
the feature from code or backend calls.

## Phase 1: Foundation — Schema & Access Control
- [x] T001: Add `event_members` table to `convex/schema.ts` (fields/indexes per design.md)
- [x] T002: Add `assertEventAccess(ctx, eventId)` helper to `convex/functions.ts`, alongside existing `assertOrganizer`
- [x] T003: Create `convex/eventMembers.ts` — `list`, `add`, `remove` (permission + validation per design.md)
- [x] T004: Add `events.listMine` query (org organizers → all events; else → events with a matching `event_members` row)
- [x] T005: Add `events.duplicate` mutation (copies event fields + `submission_forms` + `tracks` + `comms_templates`; optional `event_members` copy via `pullTeamFrom`)
- [x] T006: Sweep every event-scoped Convex function (`submissions.ts`, `speakers.ts`, `evaluations.ts`, `agenda.ts`, `forms.ts`, `tags.ts`, `tasks.ts`, `comms.ts`, `availability.ts`, `emailIntegrations.ts`, `events.ts` non-create paths) — replace `assertOrganizer(ctx)` with `assertEventAccess(ctx, args.eventId)`
- [x] T007: Add `EventsRepo.listMine`, `EventsRepo.duplicate`, and a new `EventMembersRepo` to `src/data/repo.ts` interface + Convex adapter (`src/data/convex/*`) + Airtable adapter (`src/data/airtable/*`, matching the existing dual-backend convention)

## Phase 2: Routing & Active-Event Context
- [x] T008: Build `EventProvider` + `useCurrentEvent()` in `src/components/EventContext.tsx` (loading/not-found/forbidden states per design.md)
- [x] T009: Restructure `src/App.tsx` — move `/program/*`, `/portals/*`, `/settings/event`, `/settings/library`, `/settings/task-templates`, `/settings/email`, `/settings/api` under `/events/:eventSlug/...`, wrapped in `EventProvider`; add `/events` and `/settings/organization` as event-independent top-level routes
- [x] T010: Update `AppLayout` nav item hrefs to build from `useCurrentEvent()`'s slug
- [x] T011: Update `RequireOnboarding` / post-auth redirect — land on `/events` instead of assuming `/dashboard` resolves; if exactly one accessible event exists, redirect straight into it (skip the picker for the common single-event case)

## Phase 3: Sweep Pages Off `events[0]`
- [x] T012: Replace `repo.events.list()` + `[0]` with `useCurrentEvent()` in all 17 affected pages: `Library.tsx`, `EmailDelivery.tsx`, `TaskTemplates.tsx`, `EventDetails.tsx`, `PortalForms.tsx`, `TasksAdmin.tsx`, `DashboardHome.tsx`, `SubmissionForms.tsx`, `Evaluation.tsx`, `Readiness.tsx`, `Communications.tsx`, `Speakers.tsx`, `Availability.tsx`, `Agenda.tsx`, `OnboardingWizard.tsx`, `SubmissionFormBuilder.tsx`, `Abstracts.tsx`
- [x] T013: Grep-verify zero remaining `events.list()` + array-index pattern in `src/pages/**`

## Phase 4: Frontend UI (REQUIRED — never skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### UI Spec — EventSwitcher
- Location: `AppLayout` sidebar, below `OrgMenu`, above nav sections
- Elements: trigger button (event name, status dot, chevron; collapsed = initial badge), dropdown list of accessible events with current one checkmarked, "New event" item, "Manage events" item, empty state ("No events yet" + CTA)
- Behavior: click an event → navigate same sub-path under new slug, fallback to that event's `/dashboard` if sub-path doesn't resolve
- Data: `repo.events.listMine`

### UI Spec — OrgMenu
- Location: `AppLayout` sidebar, very top, above `EventSwitcher`
- Elements: org label + chevron; dropdown: "Organization settings" (hidden for event-only members)
- Data: `repo.organizers.getMine`

### UI Spec — EventsLanding (`/events`)
- Location: full page
- Elements: `PageHeader` ("Events" only, no buttons in header); toolbar row below — status filter pills left, "New event" button right; event card grid (name, dates, status badge, "Open"/"Duplicate" buttons); empty state (icon + heading + CTA, inside a card); loading = 3 skeleton cards; error = inline red text + retry
- Behavior: "Open" → `/events/:slug/dashboard`; "New event" → `Sheet` with event-creation form; "Duplicate" → `Sheet` pre-filled, asks new name/slug/dates + "copy team" checkbox
- Data: `repo.events.listMine`, `repo.events.save`, `repo.events.duplicate`

### UI Spec — OrganizationSettings (`/settings/organization`)
- Location: full page
- Elements: `PageHeader` ("Organization settings"); team list (email, role badge, "Remove" button — hidden for self, hidden entirely for non-owners); "Invite" button (toolbar, right) → `Sheet` (email input, role select, submit); loading/empty/error states
- Behavior: "Invite" → `organizers.add`; "Remove" → `Dialog` confirm → `organizers.remove`
- Data: `repo.organizers.list/add/remove`

### UI Spec — EventTeamSettings (`/events/:eventSlug/settings/team`)
- Location: full page, new "Configure" nav item in `AppLayout`
- Elements: same list/invite/remove shape as OrganizationSettings, roles organizer/reviewer; invite `Sheet` has a second tab "Pull from another event" — event picker + checklist of that event's members + "Add selected"
- Behavior: mirrors OrganizationSettings; pull-from-event calls `eventMembers.list` (source) then `eventMembers.add` per selected row
- Data: `repo.eventMembers.list/add/remove`, `repo.events.listMine`

### Tasks
- [x] T014: Build `EventSwitcher` component per UI Spec above
- [x] T015: Build `OrgMenu` component per UI Spec above
- [x] T016: Build `EventsLanding` page + wire routes/nav entry
- [x] T017: Build `OrganizationSettings` page + wire route
- [x] T018: Build `EventTeamSettings` page + wire route + add nav item under "Configure"
- [x] T019: Execute every step in [`USER_JOURNEY.md`](./USER_JOURNEY.md) end-to-end through the running app, including multi-account access isolation and persistence after reload

T019 passed on 2026-08-13 against the configured Clerk and development Convex deployment. The
owner created and switched events, preserved slugged subpages across reload/copy, managed both
team scopes, duplicated configuration with and without instance data, and proved event isolation
with a disposable second identity. Browser verification found and corrected the admin-onboarding
guard, an unscoped Abstracts field-library read, raw dashboard/Abstracts errors, and schema
compatibility with legacy `invitedAt` membership rows; the corrected flows were retested.

## Task Dependencies

Phase 1 (schema/access) blocks Phase 2 (routing needs `listMine`/`getBySlug` access checks in
place). Phase 2 (provider/routing) blocks Phase 3 (pages need `useCurrentEvent()` to exist
before they can be swept). Phase 3 blocks Phase 4's switcher/landing verification (need real
pages under real event-scoped routes to click through). T009 and T012 are the largest-diff
tasks — do them as their own commits, not folded into schema work.

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [x] Feature is accessible and usable in the UI (not just implemented in the backend)
- [x] Zero `events.list()` + `[0]` patterns remain (T013)
- [ ] An event-scoped member cannot access an event they're not a member of (verify by testing both a 403 on direct URL entry and absence from their switcher list)
- [x] Org owner can still access every event with no `event_members` rows needed
- [x] No regressions to existing single-event flows (onboarding, first-event creation)
- [x] Docs updated if needed

## Cut line

If time runs short, this is the order to cut from the bottom, each step still leaves a working
(if reduced) product:

1. Drop "pull team from another event" (T018's second tab) — invite-by-email still works, just
   more manual for a 6-conference org.
2. Drop `events.duplicate` (T005, T016's Duplicate button) — organizers create each event from
   scratch; everything else (switching, per-event access) still lands.
3. Drop `event_members`/per-event roles entirely (T001-T003, T006's access swap stays on
   `assertOrganizer`, T018 page dropped) — falls back to "org organizers see every event,"
   which is the current behavior, just with a working switcher/routing on top. This is the
   floor: even at this cut, the `events[0]` bug (the original complaint) is fixed.

Never cut: Phase 1's `events.listMine`/`getBySlug`, Phase 2 (routing/provider), Phase 3 (the
sweep). Those three are the actual fix; everything else is depth on top of them.
