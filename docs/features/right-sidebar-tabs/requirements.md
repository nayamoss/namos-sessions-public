# Right sidebar: move rail + voice panel into AppLayout's `detail` slot, as tabs

## Problem

On the dashboard (`src/pages/dashboard/DashboardHome.tsx`), the "Needs attention / Quick
access / Action items" rail and the `VoiceSessionPanel` are currently built as inline flex
children stuffed inside the page's own `children` content — a `<div className="w-72 shrink-0 ...">`
sibling sitting next to the chat `<Card>`, inside the *main content area*. See screenshot: the
rail visually reads as part of main content, not as a real sidebar.

`AppLayout` (`src/components/AppLayout.tsx`) already has a proper right-sidebar mechanism for
this: a `detail?: ReactNode` prop that `DashboardLayout` renders as a genuine inline flex
sibling `<aside>` (line ~419-423), matching this codebase's design-system ban on
`position: fixed` overlay panels (soft-borders / design system rules — no fixed panels sliding
over content, inline flex sibling that pushes layout instead). DashboardHome just never uses it.

Reference: Imori's webapp (`imori-webapp`) solves the identical problem with the identical
constraint (see `components/DraftView.tsx`'s right `<aside>` with `rightSidebarTab` state, and
`components/voice/VoiceCompanionProvider.tsx`'s comment block explaining why the panel must be
an inline flex sibling, never fixed, per the design system). We are not copying Imori's file
structure (it uses a separate top-level provider for voice); we're copying the *principle*:
one real sidebar slot, tab state owned locally, cooperating keyboard shortcuts.

## What "done" looks like

The right-hand panel (rail sections + voice chat) renders through `AppLayout`'s `detail` prop
— a true sidebar, not a column inside main content — and toggles between two tabs:

1. **Action items tab** — today's rail content: "Needs attention", "Quick access", "Action
   items" sections (and "Start here" when `cfpCount === 0`), unchanged in content/behavior.
2. **Voice agent tab** — today's `VoiceSessionPanel` (Operations Agent voice chat), unchanged
   in content/behavior.

Keyboard behavior (cooperating toggle, matching how Imori's Cmd+\ / Alt+V already cooperate
with tablet-breakpoint sidebar collapse):

- **Cmd/Ctrl+\ (`SHORTCUTS.rightPanel`)**: sidebar closed → open on Action items tab. Sidebar
  open on Action items tab → close. Sidebar open on Voice agent tab → switch to Action items
  tab (stay open, don't close).
- **Option/Alt+V (`VOICE_TOGGLE_EVENT` / `SHORTCUTS.voice`)**: sidebar closed → open on Voice
  agent tab (and starts the voice session, same as today). Sidebar open on Voice agent tab →
  close (and ends the voice session, same as today). Sidebar open on Action items tab → switch
  to Voice agent tab (stay open, start the voice session).

Only one tab's content is visible/mounted at a time. Switching tabs must not lose in-progress
state unnecessarily — in particular, don't tear down and restart the voice session just because
the user glanced at the Action items tab and back; keep `VoiceSessionPanel` mounted while the
sidebar is open regardless of active tab (cheapest way: keep `voiceOpen` state as-is and only
gate visibility on the active tab, same pattern Imori's `VoiceCompanionProvider` comment
describes for not remounting on toggle).

## Explicit non-goals

- No change to `AppLayout`'s `detail` prop mechanism itself — it's already correct (inline flex
  sibling, `lg:w-[400px]`, no `position: fixed`). Reuse it as-is.
- No change to rail *content* (sections, links, storage keys) or to `VoiceSessionPanel`'s
  internals — this is a placement/plumbing fix, not a redesign.
- No change needed on `AgentOperations` page or any other `VOICE_TOGGLE_EVENT` listener unless
  it turns out to share this same rail-in-main-content bug — check, but don't touch pages this
  screenshot isn't about unless the same bug is confirmed there.
- Don't touch DesktopSidebar (the *left* nav sidebar) or `SidebarContext` — unrelated.

## Acceptance criteria

- [ ] On `/events/:slug/dashboard`, the rail + voice panel are no longer part of the flex row
      that contains the chat composer — they render via `<AppLayout detail={...}>`.
- [ ] Cmd/Ctrl+\ opens/closes/switches per the cooperating-toggle rules above.
- [ ] Option/Alt+V opens/closes/switches per the cooperating-toggle rules above, and voice
      session start/stop behavior is unchanged from today (still gated by `busy`, still calls
      `onClose`/session teardown correctly).
- [ ] `railCollapsed`'s existing localStorage persistence (`namos-dashboard-right-collapsed`)
      keeps working for the sidebar's open/closed state (rename key only if genuinely
      necessary — prefer keeping it to avoid an unwanted reset for existing users).
- [ ] No `position: fixed` anywhere in the new sidebar/tab code — must render as a layout
      sibling (`AppLayout`'s `detail` slot already guarantees this at the layout level; just
      don't add a fixed wrapper inside the tab content).
- [ ] Existing rail section collapse/expand (`RailSection`, its own `storageKey`s) still works
      per-section inside the Action items tab.
- [ ] `npm run typecheck` / `npm run lint` (whatever this repo's package.json defines) pass.
- [ ] Browser-verified: open the dashboard, confirm the rail no longer sits inside the chat's
      content column, press Cmd+\ and Option+V repeatedly in both orders, confirm tab
      switching and open/close behave per the rules above, confirm voice session still
      connects.
