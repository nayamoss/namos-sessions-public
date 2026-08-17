# App Shell Consistency — Implementation Plan

## Phase 1: Remove Dead Sidebar

- [x] T001: Re-confirm `components/ui/sidebar.tsx` has zero imports
      (`grep -rl "components/ui/sidebar" src/`) — if anything now imports it, stop and flag
      instead of deleting.
- [x] T002: Delete `src/components/ui/sidebar.tsx`.
- [x] T003: Run typecheck to confirm nothing referenced it indirectly (barrel export, re-export,
      etc.).

## Phase 2: Fix the Duplicate Filter Toggle

- [x] T004: In `src/pages/events/EventsLanding.tsx`, replace the hand-rolled
      `all/draft/published/archived` `<button>` loop with `SegmentedControl`, preserving the
      existing `filter`/`setFilter` state and all 4 values exactly (see design.md's code
      example).
- [ ] T005: Verify in browser: all 4 filter states still filter the events list correctly, and
      the toggle looks consistent with `SegmentedControl` usage elsewhere in the app (e.g.
      Evaluation's "Evaluation plans / My reviewer queue" tabs, if it uses the same component).

## Phase 3: Route 3 Detail Panels Through `DetailPane`

- [x] T006: Rewrite `EventEditor` (`EventsLanding.tsx:42`) to render inside `DetailPane`
      (`title="Event details"` or whatever its current implicit header text is — check the
      current `<h2>` text before choosing), passing its existing `onClose` prop through.
- [x] T007: Rewrite `InviteEventMember` (`EventTeam.tsx:36`) to render inside `DetailPane`
      (`title="Invite event team member"` or its current header text), passing its existing
      `onClose` prop through.
- [x] T008: Rewrite `InviteOrganizer` (`OrganizationSettings.tsx:15`) to render inside
      `DetailPane` (`title="Invite organization member"`), passing its existing `onClose` prop
      through.
- [ ] T009: Verify in browser: all 3 panels open/close correctly (both via the new close-X and
      via their existing inline Cancel button where present), no layout shift, no lost error
      states.

## Phase 4: Button Canon Test Guard

- [x] T010: Run `grep -rl "<button" src/ --include='*.tsx' | grep -v "components/ui/"` fresh
      (the file list may have shifted after Phases 1-3) and classify every result using
      design.md's first-pass table as a starting point — read each usage, don't just copy the
      table blindly.
- [x] T011: Any file in the "needs individual review" list that turns out to be genuine drift
      (hand-rolling a pattern that already has a shared component, the same shape as
      `EventsLanding`'s old filter toggle) — do NOT silently fix it as part of this task and do
      NOT silently allowlist it. Log it explicitly in this plan's notes below as a follow-up
      candidate, with the file path and what the duplicate pattern is.
- [x] T012: Add a new `it()` block to `src/test/component-canon.test.ts` — same shape as the
      existing 3 checks (`allowed` Set, `sourceFiles()` walk, regex match for `<button`,
      `expect(violations).toEqual([])`) — using the classification from T010 as the `allowed`
      set.
- [x] T013: Run the full test suite; the new test must pass with zero violations.

## Phase 5: Frontend UI Verification (REQUIRED — browser, not just tests)

Browser verification was attempted against the local app, but this checkout has no configured
`VITE_CLERK_PUBLISHABLE_KEY`; the app rendered only the notification shell and logged a Clerk
resource error, so authenticated Events and Settings flows could not be exercised here.

> ⚠️ This is a pure markup/component-swap refactor — the bar is "looks and behaves identically
> to before, plus the 3 detail panels now have a working close-X," not "renders new UI."

### UI Spec — what to check for each touched surface

**EventsLanding (`/events`) filter toggle:**
- Location: Events list page, `ContentToolbar`'s utilities slot (left of the "New event" action
  button).
- Elements: 4-option segmented control — All / Draft / Published / Archived.
- Behavior: clicking each option filters the events list to that status; the active option is
  visually distinct (background fill per `SegmentedControl`'s existing style); default is "All".
- Data: local `filter` state, no API change.

**EventEditor detail panel (`/events`, click an event to edit or "New event"):**
- Location: right-hand detail panel, opens when editing/creating an event.
- Elements: `DetailPane` header with title + close-X button, existing form fields unchanged
  below.
- Behavior: close-X closes the panel (same as however it closed before — confirm no unsaved-
  changes prompt was lost, if one existed).
- Data: unchanged — `useRepo()` event create/update calls.

**InviteEventMember detail panel (Settings → Event team → invite):**
- Location: right-hand detail panel on the Event Team settings page.
- Elements: `DetailPane` header with title + close-X, existing invite/pull-mode toggle and form
  fields below.
- Behavior: close-X and existing Cancel button (if present) both close the panel.
- Data: unchanged — `repo.eventMembers` calls.

**InviteOrganizer detail panel (Settings → Organization → invite):**
- Location: right-hand detail panel on the Organization Settings page.
- Elements: `DetailPane` header with title + close-X, email input, role select, Cancel/Invite
  buttons below.
- Behavior: close-X and the existing Cancel button both close the panel; Invite still submits
  and shows the same error/success states as before.
- Data: unchanged — `repo.organizers.add()` call.

### Tasks
- [ ] T014: Open the app in a real browser (reuse the running dev server / start one if needed
      via an isolated worktree per the delegation convention — never spin up an extra port on
      top of an already-running one on the shared checkout).
- [ ] T015: Click through all 4 EventsLanding filter states, confirm filtering still works.
- [ ] T016: Open and close EventEditor via both "New event" and editing an existing event;
      confirm close-X works and no regression in save/create behavior.
- [ ] T017: Open and close InviteEventMember on the Event Team settings page; confirm both invite
      and pull modes (if both exist) still work, and error states (e.g. seat limit reached) still
      render.
- [ ] T018: Open and close InviteOrganizer on Organization Settings; confirm the invite flow
      still works end to end (or at minimum renders/validates correctly without a real invite,
      depending on what test data is available).
- [ ] T019: Confirm zero console errors across all of the above via `read_console_messages`.
- [ ] T020: Run `npm run check` (typecheck + tests + build) and confirm all pass, including the
      new Phase 4 canon test.

## Task Dependencies

- Phase 1 (dead sidebar) is fully independent — can run first or in parallel with the others.
- Phase 2 and Phase 3 both touch `EventsLanding.tsx` (Phase 2: the filter toggle; Phase 3: the
  `EventEditor` component in the same file) — do Phase 2 before Phase 3 in that file to avoid
  re-diffing the same file twice, though they don't conflict logically.
- Phase 4 (canon test) should run last, after Phases 1-3 land, so its `allowed` set reflects the
  post-fix file list rather than needing a second pass.
- Phase 5 verification can run incrementally after each phase, or once at the end — either is
  fine given the small surface area.

## Follow-up candidates found during Phase 4 classification

`src/pages/settings/EventTeam.tsx`: the invite/pull mode switch still uses two page-local
raw `<button>` elements. It is part of the required invite-mode behavior and was left unchanged
for this issue; consider migrating it to `SegmentedControl` in a follow-up.

`src/pages/dashboard/DashboardHome.tsx`: surfaced when merging latest `main` into this branch
(2026-08-15), after a separate "chat-first dashboard redesign" landed. Hand-rolls a "New chat"
icon button, suggestion-pill buttons, and a send button instead of the shared `Button`
component — also trips the pre-existing native-form-controls canon check (raw `<textarea>`) and
the card canon check. Not fixed here (unfamiliar page, actively being redesigned by another
session, clear scope creep for #162) — allowlisted for the new button-canon test with a comment,
logged here for whoever picks up `DashboardHome.tsx` next.

**Separately, and NOT part of this issue's scope:** merging latest `main` revealed 3
pre-existing test failures already present on `origin/main` before this branch touched
anything — `color-system.test.ts`'s primary/background/muted token assertions, and 2 of the
existing `component-canon.test.ts` checks (native form controls, card canon), both tripped by
`DashboardHome.tsx` and `CommTemplateEditor.tsx`. Confirmed via a clean `origin/main` checkout
in an isolated worktree, unrelated to any change in this branch. This means `main` is currently
red on `npm run test` independent of #162 — worth a separate issue/fix from whoever owns the
dashboard redesign or color-token change that caused it.

## Verification Checklist

- [ ] All 5 functional requirements in `requirements.md` met
- [ ] `components/ui/sidebar.tsx` no longer exists
- [ ] `EventsLanding.tsx` uses `SegmentedControl`, not a hand-rolled toggle
- [ ] `EventEditor`, `InviteEventMember`, `InviteOrganizer` all render through `DetailPane`
- [ ] New button-canon test passes with zero violations
- [ ] All 3 touched detail panels and the filter toggle browser-verified per Phase 5's UI Spec
- [ ] `npm run check` (typecheck + full test suite + build) passes clean
- [ ] No regressions to existing event/team/organization invite flows
- [ ] Docs updated: this plan's checkboxes reflect actual completion state, and the follow-up
      candidates section is filled in (or explicitly left empty)
