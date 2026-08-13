# Keyboard Layer — Requirements

**Type:** Feature
**Status:** Done
**Priority:** High
**Last Updated:** 2026-08-11

## Problem Statement

The organizer surface has no keyboard affordances. There is exactly one binding in the entire
app — `⌘/` toggles the sidebar, hidden inside `src/components/AppLayout.tsx:110` — and it is
undocumented, so no user will ever find it.

Every navigation between the nine organizer pages costs a mouse trip to the sidebar. An event
organizer triaging a few hundred abstracts moves between Abstracts → Evaluation → Communications
constantly; that round trip is the single most repeated physical action in the product.

`cmdk` is already a dependency and `src/components/ui/command.tsx` is already vendored in.
Nothing imports either one. The cost of shipping a command palette is wiring, not building.

The client's stated ask is "fast and easy to use." A `⌘K` palette is the most legible possible
answer to that ask — it is the convention every reviewer already recognises from Linear, Vercel,
GitHub, and Notion, and its absence reads as an unfinished product.

## User Stories

**As an** event organizer **I want to** press `⌘K` and type a page name **so that** I can move
between Abstracts, Evaluation, and Communications without leaving the keyboard.

**Acceptance Criteria:**
- GIVEN I am on any organizer page WHEN I press `⌘K` (or `Ctrl+K`) THEN the command palette opens
  with the search field focused
- GIVEN the palette is open WHEN I type part of a page name THEN matching entries filter live
- GIVEN a palette entry is highlighted WHEN I press `Enter` THEN the palette closes and the app
  navigates to that route
- GIVEN the palette is open WHEN I press `Escape` THEN it closes and focus returns to the page

**As an** event organizer **I want to** press `g` then `a` **so that** I jump straight to Abstracts
without opening anything.

**Acceptance Criteria:**
- GIVEN I am not typing in a field WHEN I press `g` then `a` within one second THEN the app
  navigates to `/program/abstracts`
- GIVEN I press `g` and then wait longer than one second THEN the pending sequence expires and the
  next keypress is treated normally
- GIVEN my cursor is in a search box, a form input, or the palette WHEN I type `g` THEN the letter
  is typed into the field and no navigation occurs

**As a** first-time user **I want to** press `?` **so that** I can see what shortcuts exist.

**Acceptance Criteria:**
- GIVEN I am not typing in a field WHEN I press `?` THEN a dialog opens listing every shortcut,
  grouped by category, each with its key rendered as a `<kbd>`
- GIVEN the help dialog is open WHEN I press `Escape` or click Close THEN it dismisses

## Functional Requirements

- **FR-001:** `⌘K` / `Ctrl+K` toggles a command palette from any organizer page.
- **FR-002:** The palette lists every organizer route as a "Go to" entry, and surfaces two quick
  actions (New abstract, Email speakers).
- **FR-003:** Palette entries whose destination also has a `g`-sequence display that sequence as a
  right-aligned `<kbd>` hint.
- **FR-004:** `g` followed within 1000 ms by a second key navigates to the mapped route. The
  sequence expires silently after the timeout.
- **FR-005:** `?` opens a shortcuts help dialog, grouped into Navigation / Go to / General.
- **FR-006:** The existing `⌘/` sidebar toggle keeps working, unchanged, and is documented in
  the help dialog. Its handler remains in `DesktopSidebar` because the speaker portal shares it.
- **FR-007:** No shortcut fires while the user is typing. The guard must cover `input`, `textarea`,
  `contenteditable`, `select`, `[role="textbox"]`, `[role="combobox"]`, `[cmdk-root]`, and any open
  Radix dialog.
- **FR-008:** Shortcuts are scoped to authenticated organizer pages only. The public submission
  form, the embed routes, and the speaker portal must not register any global key handler.
- **FR-009:** A single module owns every binding and its display label, so the help dialog and the
  palette hints can never drift from the handlers.

## Non-Functional Requirements

- **NFR-001 (a11y):** No bare single-character shortcuts other than `?`. `g`-sequences are two-key
  and therefore outside the scope of WCAG 2.1.4 Character Key Shortcuts. Every `g`-sequence
  destination is also reachable through `⌘K`, so a screen-reader user who cannot use `g` (NVDA and
  JAWS bind `g` to graphics navigation in browse mode) loses no capability.
- **NFR-002 (a11y):** The palette traps focus while open, `↑`/`↓` move the highlight, `Enter`
  activates, `Escape` closes. This is `cmdk` + Radix Dialog default behavior and must not be
  overridden.
- **NFR-003 (design):** No visible borders, box-shadows, gradients, dividers, or blue on any new or
  modified surface. Border radius ≤ 14px.
- **NFR-004 (perf):** The keyboard layer registers one `keydown` listener per organizer page
  render and removes it on route change. The pre-existing shared sidebar listener remains intact.
- **NFR-005 (risk):** Zero behavior change to any existing page. This ships hours before a judged
  deadline; a regression anywhere else is a worse outcome than not shipping the feature.

## Out of Scope

Explicitly deferred. Do not build any of these in this issue:

- Live search inside the palette over abstracts, speakers, or sessions (Convex query + debounce)
- `j`/`k` row navigation in `DataGrid`
- Bulk select and a bulk action bar on Abstracts
- Bare-key row actions (`a` accept, `x` decline, `t` tag) — these depend on bulk select and were
  cut on accessibility grounds regardless
- Optimistic status updates with undo toasts
- Autosave in the submission form builder
- User-remappable shortcuts and a Settings > Shortcuts page
- Persisting any shortcut preference to Convex
- Changing the global `src/components/ui/dialog.tsx` styling

## Success Metrics

- All nine organizer routes reachable without touching the mouse
- `⌘K` → type three characters → `Enter` navigates in under two seconds
- Zero regressions: `npm run check` passes (typecheck + tests + build)
- A first-time tester discovers the shortcut set unprompted via `?`
