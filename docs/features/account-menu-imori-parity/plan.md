# Account Menu — Imori Parity — Implementation Plan

## Phase 1: Schema (confirm with Naya before deploying)
- [x] T001: Propose `changelogEntries` and `feedback` tables in `convex/schema.ts` per design.md — get explicit confirmation before deploy (Database Caution rule).
- [x] T002: Write `convex/changelog.ts` — `list` (query, published only, newest first) and `create` (mutation, organizer-role gated, reuse existing role-guard helper).
- [x] T003: Write `convex/feedback.ts` — `submit` mutation, `userId` from `ctx.auth.getUserIdentity()`.

## Phase 2: Tour infrastructure
- [x] T004: Add `zustand` dependency; write `src/lib/onboardingTourStore.ts` per design.md.
- [x] T005: Write `src/lib/tourSteps.ts` with content rewritten for this app's actual dashboard (event list, program tabs, settings entry point, portal switch) — not a literal copy of Imori's writing-tool step content.
- [x] T006: Add `data-tour="tour-*"` attributes to the sidebar nav items / dashboard sections referenced by the steps above.
- [x] T007: Build `src/components/tour/TourOverlay.tsx` (spotlight underlay + tooltip card, ported from Imori's `TourOverlay.tsx`) and mount it once in `AppLayout.tsx`.

## Phase 3: Feedback
- [x] T008: Build `src/components/FeedbackDialog.tsx` (rating radio group + optional note, wired to `feedback.submit`).

## Phase 4: Updates / changelog page
- [x] T009: Build `src/pages/Updates.tsx` reading `changelog.list`.
- [x] T010: Wire `/updates` route into `src/App.tsx`, outside the event-scoped route tree.

## Phase 5: Shortcuts wiring
- [x] T011: Add a `namos:open-shortcuts` custom-event listener to `src/components/GlobalKeyboardShortcuts.tsx` (mirrors the existing `VOICE_TOGGLE_EVENT` pattern in the same file) that opens the existing help dialog.

## Phase 6: Frontend — Account Menu (REQUIRED)

### UI Spec

**`src/components/AccountMenu.tsx`** — both the collapsed (`w-8 h-8` avatar trigger) and expanded (full-row trigger) `DropdownMenuContent` branches get the same 4 new items, inserted directly above the existing `<ThemeToggleMenuItem />`:

- **What's new** — icon `Megaphone` (lucide-react, `h-4 w-4 shrink-0`), label "What's new", `<Link to="/updates">`, closes the dropdown on click (existing `setAccountOpen(false)` pattern already used by other items in this file).
- **Take a tour** — icon `Route`, label "Take a tour", `onSelect={() => { setAccountOpen(false); startTour(); }}` where `startTour` comes from `useOnboardingTourStore()`.
- **Feedback** — icon `MessageSquare`, label "Feedback", `onSelect={() => { setAccountOpen(false); setFeedbackOpen(true); }}`, local `useState` exactly like the existing `profileSettingsOpen` pattern in this file.
- **Shortcuts** — icon `Keyboard`, label "Shortcuts", `onSelect={() => { setAccountOpen(false); window.dispatchEvent(new Event("namos:open-shortcuts")); }}`.

All 4 use the same `itemClass` styling constant already defined at the top of `AccountMenu.tsx` (no new visual pattern — reuse what's there).

Existing items (Event settings / Speaker portal / Back to admin mode / Profile settings, and the Sign out item) are untouched, keep their current position below the theme toggle.

- **Loading/empty/error states:** `FeedbackDialog` — submitting state disables the button and shows "Submitting…"; error state shows inline red text below the form; success shows "Thanks — got it." and auto-closes. `UpdatesPage` — skeleton rows while loading, empty-state card with icon + "Nothing published yet" when the list is empty.

### Tasks
- [x] T012: Add the 4 `DropdownMenuItem`s to both render branches of `AccountMenu.tsx` per the UI Spec above.
- [x] T013: Wire `FeedbackDialog` open state and render it from `AccountMenu.tsx`, same pattern as the existing `ProfileSettingsDialog`.
- [ ] T014: Verify full flow in browser: click each of the 4 new items in both collapsed and expanded sidebar states, confirm each does what its acceptance criteria says.

## Task Dependencies
T001 → T002, T003. T004 → T005 → T006 → T007. T002 → T009. T003 → T008. T011 has no dependencies. T012 depends on T007, T008, T009 (or their stubs) existing so the menu items have something real to call.

## Verification Checklist
- [x] Schema changes were confirmed with Naya before deploy, not assumed
- [x] Docs updated if needed
