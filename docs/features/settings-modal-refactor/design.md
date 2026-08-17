# Settings Modal Refactor — Technical Design

## Database / Schema Changes
N/A — this is a navigation/shell refactor only. No settings page's data model changes.

---

## Backend / API
### Affected Existing Endpoints
None. Every existing Convex query/mutation used by `EventDetails`, `EventTeam`, `Library`,
`TaskTemplates`, `Integrations`, `ApiKeys`, `ActivityLog`, `OrganizationSettings` is called
exactly as it is today — only the component that renders around them changes.

### New Endpoints
None.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/App.tsx` | Settings routes (`settings/event`, `settings/team`, `settings/library`, `settings/task-templates`, `settings/integrations`, `settings/api`, `settings/activity`, `/settings/organization`) no longer render a dedicated page component. Instead each route renders the same underlying page the user would land on with the modal closed (e.g. `settings/event` renders `<DashboardHome />` or the event's default page) wrapped so `SettingsModal` reads the matching tab from the URL on mount and opens itself. `ComponentShowcase` moves to a new non-settings route, e.g. `/dev/components`. |
| `src/components/AccountMenu.tsx` | "Event settings" and "Organization settings" links change from `<Link to=".../settings/event">` (page nav) to a click handler that opens `SettingsModal` with the right initial tab, using `navigate(..., { replace: true })` only to keep the URL in sync — not to trigger a route-level page swap. |
| `src/pages/settings/*.tsx` (8 files, excluding `ComponentShowcase`) | Content is unchanged internally; each becomes a panel rendered inside `SettingsModal` rather than a standalone routed page. No logic changes — same components, new parent. |

### New Components

**`SettingsModal`**
- File: `src/components/settings/SettingsModal.tsx`
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void; initialTab?: SettingsTabId }`
- Location: mounted once near the root (`AppLayout.tsx`, alongside `CommandPalette`/`GlobalKeyboardShortcuts`), controlled via a context (see State/Data Flow) so any page can open it, not just the account menu.
- Elements:
  - `Dialog` / `DialogContent` overridden to a wide layout (`max-w-4xl`, no `border` class — the shared `DialogContent` default includes `border bg-background`, which violates the no-visible-border design rule; this component must override that class explicitly), fixed height with internal scroll on the content pane only.
  - Left column: `SettingsSidebarNav` (see below).
  - Right column: the active tab's existing page component, unmodified.
  - Close button: reuses the `Dialog`'s built-in `X` close control (top-right), no custom close button.
  - Loading/empty/error states: each tab keeps whatever state handling it already has today (this refactor doesn't touch that) — no new states introduced at the modal-shell level itself.
- Behavior: `Escape` and click-outside close via the underlying `Dialog`'s existing behavior (no new handling needed) → `onOpenChange(false)` → the URL is restored to what it was before the modal opened.
- Data: none directly — purely a shell around existing pages.

**`SettingsSidebarNav`**
- File: `src/components/settings/SettingsSidebarNav.tsx`
- Props: `{ activeTab: SettingsTabId; onTabChange: (tab: SettingsTabId) => void }`
- Location: left column of `SettingsModal`.
- Elements: two labeled groups exactly like Imori's `settings-nav.tsx` pattern —
  - Group "Event": Event Details, Team, Library, Task Templates, Integrations, API Keys, Activity Log (7 items, icons reused from each existing page's current icon if one exists, otherwise a sensible Lucide icon per item).
  - Group "Organization": Organization Settings (1 item).
  - Each item: icon + label, `h-8` row, active state = `bg-muted font-medium text-foreground`, matching Imori's active-row styling — no border, no divider between groups, whitespace-only separation (per this app's design system, which is already border/shadow-free).
- Behavior: clicking an item calls `onTabChange`, which both swaps the visible panel and updates the URL.
- Data: none — pure nav, `SETTINGS_NAV_GROUPS` is a static config array (mirrors Imori's `SETTINGS_NAV_GROUPS` constant), not fetched.

**`SettingsModalProvider` / `useSettingsModal()`**
- File: `src/components/settings/SettingsModalContext.tsx`
- Purpose: lets any page (not just `AccountMenu`) open the modal to a specific tab — e.g. a future "Manage integrations" button elsewhere in the app.
- Shape: `{ openSettings: (tab: SettingsTabId) => void; closeSettings: () => void }` via React Context, provider mounted in `AppLayout.tsx` around `<Outlet />`.

---

## State / Data Flow
- **Source of truth for "is the modal open, and to which tab":** a single piece of state owned by `SettingsModalProvider`, initialized from the current URL on mount (matching FR-003 — a direct link to `/events/:slug/settings/api` sets `initialTab = "api"` and `open = true` before first paint).
- **Opening from the account menu:** calls `openSettings("event")` (or whichever tab) from context — does not navigate first, just opens the modal; the modal's own effect syncs the URL afterward via `navigate(..., { replace: true })`.
- **Tab switching inside the modal:** `onTabChange` updates local modal state immediately (no network wait) and syncs the URL in the same tick — matches NFR-002, no data-fetching waterfall since each tab's own `useQuery` only mounts/fires when that tab's panel is actually rendered.
- **Closing:** restores the URL to whatever `location` was before the modal opened (captured in a ref when `openSettings` fires), not to a hardcoded "settings index" — satisfies FR-005.
- **Page behind the modal:** stays mounted throughout (the modal is an overlay via `DialogPortal`, not a route swap) — this is the core difference from today's behavior and the whole point of the refactor.

---

## Auth / Permissions
- No change — every tab's existing auth/permission checks (e.g. organizer-only guards inside `Integrations`, `ApiKeys`) run exactly as they do today, since the components themselves are unmodified.
- `SettingsModal` itself has no independent permission gate; access control lives in each tab's existing content, same as before.

---

## Edge Cases & Error States
- Direct link to a settings URL for an event the user isn't a member of: unchanged — whatever the underlying page today does for an unauthorized event (redirect/error) still happens, since the modal opens *on top of* that same page render, not instead of it.
- Navigating to a settings URL while already inside the app (not a fresh load): the modal opens without a full page reload, page behind it doesn't change.
- Opening the modal, then using browser Back: closes the modal (URL reverts), does not navigate away from the underlying page — standard behavior for `navigate(..., { replace: true })`-driven state, verify this in browser during implementation since replace-vs-push choice affects it.
- Rapid tab switching: no debounce needed: each tab panel unmounts/remounts on switch, existing Convex `useQuery` hooks handle their own loading states already.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Modal primitive | Reuse `@radix-ui/react-dialog` via existing `Dialog`/`DialogContent`, override className | Already the established pattern in this app (`ProfileSettingsDialog`) — no new dependency, no new accessibility surface to get wrong. |
| URL sync strategy | `navigate(path, { replace: true })` on tab change, capture pre-open location for close | Matches Claude.ai's own settings UX (URL reflects current tab, but opening/closing settings doesn't spam browser history with page navigations) and satisfies the "keep deep links" requirement Naya confirmed. |
| `ComponentShowcase` | Moved out of settings entirely, to `/dev/components` | It's a design QA tool, not a setting — leaving it in the settings nav would be confusing in the new grouped UI where every other item is a real, user-facing setting. |
| Org settings placement | Same modal, second nav group ("Organization") | Confirmed with Naya — one settings surface total, not two separate modals. |

## Dependencies
**Requires:** none technically, but should land after `account-menu-imori-parity`'s menu-item changes are stable if both are being worked in parallel, to avoid merge conflicts in `AccountMenu.tsx` (both plans touch that file).
**Enables:** future settings entry points from anywhere in the app via `useSettingsModal()`, not just the account menu.

## Risks & Mitigations
- **Risk:** 8 existing settings pages may have layout assumptions baked in (e.g. expecting full page width, their own `PageHeader`) that don't fit cleanly into a modal's tab panel. **Mitigation:** budget time during implementation to strip each page's own outer page-chrome (header/wrapper) since the modal now provides that context — this is real adaptation work, not a pure copy-paste, flag any page that resists cleanly.
- **Risk:** Deep-link + modal-open-on-mount interacting badly with this app's existing route guards (`RequireOnboarding`, `EventProvider`) could cause a flash of the wrong page before the modal opens. **Mitigation:** verify in browser for at least one cold-load deep link per tab, not just in-app navigation.
