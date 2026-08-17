# Settings Modal Refactor — Implementation Plan

## Phase 1: Shell infrastructure
- [x] T001: Build `src/components/settings/SettingsModalContext.tsx` (`SettingsModalProvider`, `useSettingsModal()`) per design.md.
- [x] T002: Build `src/components/settings/SettingsSidebarNav.tsx` with the two-group `SETTINGS_NAV_GROUPS` config (Event: 7 items, Organization: 1 item).
- [x] T003: Build `src/components/settings/SettingsModal.tsx` — wide `Dialog` (no border, per design system), left nav + right content pane, wired to the context from T001.
- [x] T004: Mount `SettingsModalProvider` in `AppLayout.tsx`, and `SettingsModal` alongside `CommandPalette`/`GlobalKeyboardShortcuts`.

## Phase 2: Move `ComponentShowcase` out of settings
- [x] T005: Add a new `/dev/components` route rendering the existing `ComponentShowcase` component; remove its settings-nav entry and its `settings/components` route.

## Phase 3: Port each settings page into a tab panel
For each of the 8 remaining pages (`EventDetails`, `EventTeam`, `Library`, `TaskTemplates`,
`Integrations`, `ApiKeys`, `ActivityLog`, `OrganizationSettings`):
- [x] T006: Strip each page's own outer page-chrome (its own `PageHeader`/wrapper, if any) so it renders cleanly as a tab panel inside the modal's content pane — same internal form/data logic, thinner wrapper.
- [x] T007: Render each stripped page as the content for its matching `SettingsSidebarNav` item.

## Phase 4: Routing — deep links open the modal, not a bare page
- [x] T008: Update `src/App.tsx`: each former settings route (`settings/event`, `settings/team`, `settings/library`, `settings/task-templates`, `settings/integrations`, `settings/api`, `settings/activity`, `/settings/organization`) renders the underlying page (e.g. `DashboardHome` for event-scoped routes) and, on mount, calls `openSettings(tab)` with the tab implied by the URL.
- [x] T009: Implement URL sync on tab change (`navigate(path, { replace: true })`) and URL restore on close (return to pre-open location), per design.md's State/Data Flow section.

## Phase 5: Frontend — Account Menu wiring (REQUIRED)

### UI Spec

**`src/components/AccountMenu.tsx`**
- "Event settings" item: change from `<Link to={.../settings/event}>` to a `DropdownMenuItem` with `onSelect={() => { setAccountOpen(false); openSettings("event"); }}` using `useSettingsModal()`.
- "Organization settings" entry point (wherever it currently lives — confirm during implementation whether it's already in this menu or needs adding): same pattern, `openSettings("organization")`.
- No visual change to the menu items themselves beyond the click behavior — same icon, same label, same position.

- **Loading/empty/error states:** unchanged per-tab, inherited from each existing settings page (see design.md — this refactor doesn't touch that layer).
- **Modal-level states:** none new — the modal itself has no independent loading/empty/error state, it's a pure shell.

### Tasks
- [x] T010: Update `AccountMenu.tsx`'s settings-related items to call `openSettings(tab)` instead of navigating.
- [ ] T011: Verify full flow in browser: open settings from the account menu, confirm it's an overlay (page behind it stays mounted/scrolled where it was); switch every one of the 8 tabs and confirm each renders correctly; visit each of the 8 settings URLs as a fresh/cold load and confirm the modal opens to the right tab; close via Escape, click-outside, and the X button and confirm the URL returns to the pre-open page each time.

## Task Dependencies
T001 → T002 → T003 → T004. T005 is independent. T006/T007 depend on T003. T008/T009 depend on T004 and T007. T010 depends on T001 and T009. T011 depends on everything above.

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [ ] Feature is accessible and usable in the UI (not just implemented in the backend)
- [ ] Every one of the 8 former settings pages works identically inside the modal (no logic regressions)
- [ ] Every former settings URL still resolves to the correct tab on a cold load, not just in-app navigation
- [ ] `ComponentShowcase` is reachable at its new route and no longer appears in the settings nav
- [ ] No regressions introduced
- [ ] Docs updated if needed
