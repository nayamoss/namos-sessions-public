# App Shell Consistency — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-15

## Problem Statement

A follow-up audit to [`card-component-consolidation`](../card-component-consolidation/) checked
the rest of the app shell — left nav sidebar, main content shell, right detail panel, buttons,
and other repeated primitives — for the same "edit one place, it changes everywhere" property
Card now has.

Most of the shell is already correctly single-source: the left sidebar (`AppLayout.tsx`), the
main page shell (`DashboardLayout`), `StatusBadge`, `EmptyState`, `PageHeader`, `ContentToolbar`,
`SkeletonList`, and `StatusTabs` all have exactly one implementation used everywhere. That's
confirmed and out of scope here.

Four concrete gaps remain:

1. **Dead alternate sidebar.** `components/ui/sidebar.tsx` is a complete, 639-line shadcn
   `Sidebar`/`SidebarMenu`/`SidebarProvider` primitive set with **zero imports anywhere** in
   `src/`. It isn't causing a bug today, but it's a loaded trap: a future edit that reaches for
   "the sidebar component" via autocomplete could import this one instead of `AppLayout.tsx`'s
   actual sidebar, creating a second nav system that silently diverges.
2. **A duplicate filter-toggle component.** `src/pages/events/EventsLanding.tsx` hand-rolls its
   own `all/draft/published/archived` filter toggle with a raw `<button>` loop
   (`rounded px-2.5 py-1.5 text-xs font-medium capitalize` styling), even though
   `components/shared/SegmentedControl.tsx` — the exact component for this pattern — already
   exists and is used elsewhere in the app.
3. **Three detail-panel components bypass the shared `DetailPane` wrapper.** `DetailPane.tsx`
   (title + close-X button) is the intended content wrapper for the right-hand detail panel and
   is used correctly in 5 places (Abstracts, Agenda, Speakers, Sponsors, ApiKeys). Three more
   hand-roll their own `<h2>` header instead, losing the standard close-X affordance in favor of
   an inline Cancel button: `EventEditor` (`EventsLanding.tsx:42`), `InviteEventMember`
   (`EventTeam.tsx:36`), `InviteOrganizer` (`OrganizationSettings.tsx:15`).
4. **No test guard against raw `<button>` sprawl.** The existing `component-canon.test.ts`
   already blocks native form controls, page-local `Card`/`Field`/`Toggle`/`EmptyState`
   redeclarations, and hardcoded neutral palettes — the same category of drift-prevention this
   gap needs, just not written yet. Without it, item 2's mistake (hand-rolling a pattern that
   already has a shared component) can recur silently.

## Functional Requirements

- FR-001: `components/ui/sidebar.tsx` is removed from the codebase (confirmed zero imports
  before deletion).
- FR-002: `EventsLanding.tsx`'s inline filter toggle is replaced with
  `components/shared/SegmentedControl.tsx`, preserving the same 4 filter values
  (`all`/`draft`/`published`/`archived`) and current filtering behavior exactly.
- FR-003: `EventEditor`, `InviteEventMember`, and `InviteOrganizer` are rewritten to render their
  content inside `DetailPane` (passing their existing title text and an `onClose` handler),
  gaining the standard close-X button. Any inline "Cancel" button they currently render stays as
  a secondary action inside the panel body — it does not need to be removed, just no longer the
  only way to close the panel.
- FR-004: `component-canon.test.ts` gains a new check that fails the build if a raw `<button`
  element appears in a `.tsx`/`.jsx` file under `src/` outside `components/ui/` and an explicit
  `allowed` set — built by auditing each of the ~30 current non-`components/ui/` files that use
  raw `<button>` (see design.md's file-by-file classification) and allowlisting only the ones
  that are genuinely structural (icon-only shell chrome, a reusable primitive's own internal
  markup, sortable table headers, popover/menu triggers) rather than a page hand-rolling a
  pattern that already has a shared component.
- FR-005: No visual or behavioral regression on any of the 3 pages touched by FR-002/FR-003 —
  filter behavior, invite flows, and event editing all work identically to before, just through
  the shared components.

## Out of Scope

- Left nav sidebar (`AppLayout.tsx`), main content shell (`DashboardLayout`), `StatusBadge`,
  `SubmissionStatusBadge`, `EmptyState`, `PageHeader`, `ContentToolbar`, `SkeletonList`,
  `StatusTabs` — already confirmed single-source, no changes.
- Converting every legitimate raw-`<button>` usage to the `Button` component — FR-004 only adds
  a *guard test* with an allowlist; it does not mandate migrating every icon-only shell-chrome
  button (e.g. `AppLayout.tsx`'s sidebar collapse toggle) to `Button`. That's a separate,
  larger, and lower-value effort explicitly deferred.
- Any change to Card (`components/ui/card.tsx`) or its consumers — fully covered by the prior
  `card-component-consolidation` pass.

## Success Metrics

- `components/ui/sidebar.tsx` no longer exists in the repo.
- `EventsLanding.tsx` imports and uses `SegmentedControl` instead of a hand-rolled toggle.
- `EventEditor`, `InviteEventMember`, `InviteOrganizer` all render through `DetailPane` with a
  working close-X.
- New canon test passes with zero violations and stays green (regression guard).
- No behavior change observed when clicking through Events filtering, event team invites, and
  organization member invites in the browser.
