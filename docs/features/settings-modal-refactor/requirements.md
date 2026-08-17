# Settings Modal Refactor — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-17

## Problem Statement
Settings today are 9 separate routed pages (`EventDetails`, `EventTeam`, `Library`,
`TaskTemplates`, `Integrations`, `ApiKeys`, `ActivityLog`, `ComponentShowcase`,
`OrganizationSettings`), each a full page navigation away from whatever the organizer was doing.
Naya wants the visual layout modeled on Imori's settings page (grouped sidebar nav, card-based
content, consistent with this app's existing design system) but the interaction model changed to
match Anthropic/Claude.ai: settings open as a modal overlay reachable from any page, not a
separate route the user navigates away to. Deep links must keep working — visiting
`/events/:slug/settings/event` should still land the user on the right tab, just inside the
overlay instead of as a standalone page.

## User Stories
**As an** organizer **I want to** open settings without losing my place **so that** I can check
or change something and get straight back to what I was doing.

**Acceptance Criteria:**
- GIVEN I'm on any page inside an event workspace WHEN I click "Event settings" in the account menu THEN a modal opens over the current page (not a page navigation) showing the Event Details tab by default.
- GIVEN the settings modal is open WHEN I click a different tab in its sidebar nav THEN the content pane swaps and the URL updates to match, without a full page reload or losing my scroll position on the page behind the modal.
- GIVEN I have a direct link to `/events/:slug/settings/api` WHEN I open it fresh THEN the underlying page loads first and the settings modal opens automatically to the API tab.
- GIVEN the settings modal is open WHEN I press Escape or click outside it THEN it closes and the URL returns to the page I was on before opening it.

**As an** organizer **I want to** reach my organization-wide settings from the same modal **so that** I don't have to learn two different settings surfaces.

**Acceptance Criteria:**
- GIVEN the settings modal is open WHEN I look at the sidebar nav THEN I see two groups — "Event" (the 8 per-event tabs) and "Organization" (the 1 org-wide tab) — and clicking into the Organization group switches context without closing the modal.

## Functional Requirements
- FR-001: A single `SettingsModal` component (Dialog-based) renders all 9 existing settings pages' content as tab panels, replacing individual page routes as the primary access path.
- FR-002: Sidebar nav inside the modal is grouped exactly like Imori's `settings-nav.tsx` pattern — labeled groups, not one flat list — with "Event" (Event Details, Team, Library, Task Templates, Integrations, API Keys, Activity Log) and "Organization" (Organization Settings) as the two groups. `ComponentShowcase` is a dev/design tool, not a real settings page — it moves out of the settings nav entirely (see Out of Scope).
- FR-003: Existing routes (`/events/:slug/settings/event`, `/settings/team`, etc., and `/settings/organization`) continue to resolve — on load they open the underlying event/dashboard page with the modal pre-opened to the matching tab, rather than 404ing or rendering a bare page.
- FR-004: Switching tabs inside the open modal updates the URL via `history.replaceState`-equivalent (React Router's `navigate(..., { replace: true })`) without unmounting the page behind the modal.
- FR-005: Closing the modal (Escape, click-outside, explicit close button) navigates back to the page the user was on when they opened it — not to a settings "index" page.
- FR-006: All existing settings page logic (data fetching, forms, mutations) is preserved as-is — this is a shell/navigation refactor, not a rewrite of what each tab does.

## Non-Functional Requirements
- NFR-001: Modal must not trap focus incorrectly or break the existing `Dialog` accessibility behavior already provided by the shared `Dialog` primitive (`@radix-ui/react-dialog`) — reuse that primitive, don't hand-roll a new overlay.
- NFR-002: Tab switching must feel instant — no network waterfall introduced by the refactor itself; each tab's existing data-fetching (Convex `useQuery`) still only fires for the active tab, not all 8 eagerly.

## Out of Scope
- Changing what any individual settings page/tab actually does (form fields, mutations, business logic) — content is ported as-is into tab panels.
- `ComponentShowcase` — it's a component gallery for design QA, not a user-facing setting. It gets its own non-settings route (e.g. `/dev/components`) rather than a slot in the settings modal, so it doesn't confuse the "Settings" grouping the account menu points to.
- Wiring the account menu's new items from `account-menu-imori-parity` — that work happens independently; this plan only needs the account menu's *existing* "Event settings"/"Organization settings" links repointed to open the modal instead of navigating.
- Mobile/narrow-viewport layout beyond what the existing `Dialog` primitive already handles responsively.

## Success Metrics
- All 9 former settings pages' functionality is reachable and working inside the modal.
- Every pre-existing settings URL still resolves to the correct tab, verified by visiting each one directly (not just via in-app navigation).
