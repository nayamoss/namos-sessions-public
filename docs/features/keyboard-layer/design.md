# Keyboard Layer — Technical Design

## Database / Schema Changes

**N/A — this feature stores nothing.** Every binding is a compile-time constant in
`src/lib/shortcuts.ts`. User-remappable shortcuts would need a `shortcuts` field on the user
record; that is explicitly out of scope (see requirements.md → Out of Scope).

No Convex schema change. No migration.

---

## Backend / API

**N/A — no server work.** This is a pure client-side navigation layer. It calls React Router's
`navigate()` and nothing else. No Convex query, mutation, or action is added or modified.

Note for the implementer: the palette does **not** search abstracts or speakers in this phase.
That would require a Convex query and is deferred. The palette filters a static in-memory list of
routes and quick actions using `cmdk`'s built-in fuzzy filter.

### Validation & Business Logic

N/A — nothing is written.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/components/AppLayout.tsx` | Preserve the inline `⌘/` handler in `DesktopSidebar`, which the speaker portal shares. Mount `<CommandPalette />` and `<GlobalKeyboardShortcuts />` as children of admin-only `AppLayout`; use `headerEnd` for the palette discovery hint. |
| `src/components/ui/command.tsx` | Remove `shadow-lg` from `CommandDialog` (line 29). Remove `border-b` from the `CommandInput` wrapper (line 42). Change `CommandSeparator` from `h-px bg-border` to `h-2 bg-transparent` (line 97) — spacing, not a line. Add a `className` passthrough on `CommandDialog` so the palette can override the inherited `border`/`shadow-lg` from `dialog.tsx` locally. |

**Do not modify `src/components/ui/dialog.tsx`.** It carries `border` and `shadow-lg` (line 39) and
both violate the design rules, but it backs every dialog in the app. Overriding locally from
`CommandDialog` is the safe move hours before a judged deadline. Logged as follow-up debt below.

### New Components

---

**`shortcuts.ts`** (module, not a component)

- File: `src/lib/shortcuts.ts`
- Exports:
  - `type ShortcutBinding = { code: string; meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean }`
  - `matchesShortcut(event: KeyboardEvent, binding: ShortcutBinding): boolean` — strict equality on
    all four modifier flags plus `event.code`, ported from
    `imori-webapp/lib/shortcuts.ts:103-109`. Uses `event.code` (physical key) not `event.key`, so
    it survives non-US layouts.
  - `formatShortcut(binding: ShortcutBinding): string[]` — returns display tokens, e.g.
    `{ code: 'KeyK', meta: true }` → `['⌘', 'K']`. Ported from
    `imori-webapp/lib/shortcuts.ts:125-136` including the `CODE_LABELS` map for `Slash` → `/`,
    `Backslash` → `\`, `Escape` → `Esc`.
  - `SHORTCUTS: Record<ShortcutId, ShortcutBinding>` — the three modifier bindings.
  - `GO_TO_SEQUENCES: { key: string; to: string; label: string }[]` — the `g`-sequence table.
  - `SHORTCUT_HELP: { group: string; items: { keys: string[]; label: string }[] }[]` — the single
    source the help dialog renders from, derived from the two tables above.

Deliberately **not** ported from Imori: `validateShortcutBinding`, `RESERVED_BROWSER_CODES`,
`normalizeShortcutBindings`, `bindingFromKeyboardEvent`. All four exist only to support a
user-facing remapping UI, which is out of scope.

Binding table:

| ID | Binding | Action |
|----|---------|--------|
| `palette` | `⌘K` / `Ctrl+K` | Toggle command palette |
| `sidebar` | `⌘/` | Toggle sidebar (existing shared behavior) |
| `help` | `?` (`⇧/`) | Open shortcuts help dialog |

`g`-sequence table (leader `g`, 1000 ms expiry):

| Sequence | Route | Label |
|----------|-------|-------|
| `g` `d` | `/dashboard` | Dashboard |
| `g` `s` | `/dashboard/speakers` | Speaker Tracking |
| `g` `f` | `/program/forms` | Forms |
| `g` `a` | `/program/abstracts` | Abstracts |
| `g` `e` | `/program/evaluation` | Evaluation |
| `g` `g` | `/program/agenda` | Agenda |
| `g` `c` | `/program/communications` | Communications |
| `g` `v` | `/program/availability` | Availability |
| `g` `t` | `/portals/tasks` | Portal tasks |
| `g` `,` | `/settings/event` | Event settings |

`h` is deliberately unused — both NVDA and JAWS bind `h` to heading navigation.

---

**`CommandPalette`**

- File: `src/components/CommandPalette.tsx`
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void }`. `AppLayout` owns the
  shared open state so the keyboard layer and the visible sidebar trigger use the same palette.
- Location: mounted once in admin-only `AppLayout` (`src/components/AppLayout.tsx`). Renders nothing
  until opened. Never mounted on the public submission form, the embed routes, or the speaker
  portal — those use `PublicLayout` / `PortalLayout`.
- Third-party: `cmdk` ^1.1.1 via the existing `@/components/ui/command` wrapper. `cmdk` supplies
  fuzzy filtering, roving focus, `↑`/`↓`/`Enter` handling, and ARIA roles. Radix Dialog (already a
  dependency of `command.tsx`) supplies the focus trap and `Escape`.
- Elements:
  - `CommandDialog` — max width 32rem, `rounded-[12px]`, `bg-popover`, no border, no shadow
  - `CommandInput` — placeholder `"Jump to a page or run a command…"`, `aria-label="Command palette"`,
    autofocused by `cmdk`. No `border-b` under it; separated by padding only.
  - `CommandEmpty` — text `"No matches."`, `py-6 text-center text-sm text-muted-foreground`
  - `CommandGroup heading="Quick actions"`:
    - `New abstract` → `/program/abstracts?new=true`
    - `Email speakers` → `/program/communications?new=true`
  - `CommandGroup heading="Go to"` — one `CommandItem` per row of `GO_TO_SEQUENCES`, each rendering
    its sidebar `lucide-react` icon (`h-4 w-4 mr-2`, reuse the icons already in
    `AppLayout.navSections`), the label, then a right-aligned `<kbd>` pair showing the sequence
  - `<kbd>` styling: `ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground`
    — **no border**, unlike the takumi-webapp reference implementation which uses `border bg-muted`
  - Loading state: N/A — the list is static and in-memory, nothing to load
  - Error state: N/A — no I/O, nothing can fail
- Behavior:
  - `⌘K` / `Ctrl+K` opens the palette through the single listener in
    `GlobalKeyboardShortcuts`. `CommandPalette` does not register a document listener.
  - Typing filters via `cmdk`'s built-in matcher. No custom filter function.
  - `↑`/`↓` move the highlight, `Enter` activates, `Escape` closes — all `cmdk`/Radix defaults,
    do not intercept them.
  - Selecting an item: close the palette first, then `setTimeout(() => navigate(to), 0)`. The
    deferral matters — navigating synchronously inside `onSelect` while Radix is unmounting the
    dialog causes a focus-restore race.
  - The `AI Agent` mode from the takumi-webapp reference is **not** ported.

---

**`GlobalKeyboardShortcuts`**

- File: `src/components/GlobalKeyboardShortcuts.tsx`
- Props: `{ onToggleSidebar: () => void; onOpenCommandPalette: () => void }`
- Location: mounted once in admin-only `AppLayout`, alongside `CommandPalette`. Renders only the help
  dialog, and only when open.
- Elements (the help dialog):
  - `Dialog` / `DialogContent`, max width 30rem, `rounded-[12px]`, `bg-card`, `p-6`, no border,
    no shadow (override the inherited `dialog.tsx` classes locally)
  - `DialogTitle` — `"Keyboard shortcuts"`, `text-xl font-semibold`
  - `DialogDescription` — `"Press ? any time to bring this back."`, `text-sm text-muted-foreground`
  - Three groups rendered from `SHORTCUT_HELP`: **Navigation**, **Go to**, **General**
  - Group heading — `text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground`,
    matching the sidebar section headings in `AppLayout.tsx:67`
  - Each row — label left (`text-sm`), `<kbd>` tokens right, `flex items-center justify-between py-1.5`
  - Groups separated by `space-y-6`. **No `<hr>`, no `divide-y`, no `border-t`.**
  - Close button — `DialogClose`, top-right, ghost icon button, `aria-label="Close"`
  - Empty state: N/A — the list is a compile-time constant and is never empty
  - Loading state: N/A
  - Error state: N/A
- Behavior:
  - One `keydown` listener on `document`, registered on mount, removed on unmount.
  - **Guard first, always.** Ported verbatim from
    `imori-webapp/components/global-keyboard-shortcuts.tsx:26-40`. Bail out if the active element
    is an `input`, `textarea`, `[contenteditable="true"]`, `select`, `[role="textbox"]`,
    `[role="combobox"]`, `[role="searchbox"]`, inside `[cmdk-root]`, or if any
    `[role="dialog"]:not([aria-hidden="true"])` is open. This guard is the single highest-risk
    piece of the feature — get it wrong and typing a `g` into the Abstracts search box navigates
    the user away mid-sentence.
  - `⌘K` / `Ctrl+K` → `event.preventDefault()`, call `onOpenCommandPalette()` when no dialog is
    already open.
  - `⌘/` → `event.preventDefault()`, call `onToggleSidebar()`. Same behavior as today.
  - `?` → open the help dialog.
  - `g` → store `'g'` in a ref and start a 1000 ms timer. Any next key: look it up in
    `GO_TO_SEQUENCES`; on a hit, `preventDefault()` and navigate; on a miss, clear silently. Clear
    the ref in both branches and on unmount.
  - The pending-`g` state lives in a `useRef`, not `useState` — it must not trigger a re-render.

---

## State / Data Flow

```
document keydown (exactly one listener)
   └─> GlobalKeyboardShortcuts guard  ──(user is typing)──> bail, do nothing
          │
          ├─ ⌘K  ─> onOpenCommandPalette() ─> cmdk renders static route list
          ├─ ⌘/  ─> existing DesktopSidebar listener ─> SidebarContext.toggleCollapsed()
          ├─ ?   ─> setHelpOpen(true)  ─> help Dialog renders from SHORTCUT_HELP
          └─ g,x ─> pendingRef  ─> GO_TO_SEQUENCES lookup ─> navigate(to) ─> React Router re-renders
```

Palette visibility is local to `AppLayout`; help and sequence state remain local to the
keyboard component. No context, no store, no server round trip. `SHORTCUTS`,
`GO_TO_SEQUENCES`, and `SHORTCUT_HELP` are module constants imported by both components, which is
what keeps the help dialog from drifting out of sync with the handlers (FR-009).

**Re-render triggers:** opening/closing the palette or the help dialog (local `useState`), and
route changes from `navigate()`. The pending-`g` ref causes none.

**Mount lifetime note:** `AppLayout` is instantiated per page, so both components unmount and
remount on every route change. That is fine — their state is transient by design, and the
`useEffect` cleanup removes the listener, so no leak. Do not try to hoist them to `App.tsx`; the
public and portal routes must stay unaffected (FR-008).

---

## Auth / Permissions

Both components mount inside `AppLayout`, which only wraps organizer pages. Routes using
`PublicLayout` (`/submit/*`, `/e/*`) and the speaker portal (`/portal/*`) never render them, so no
global key handler exists on any unauthenticated surface.

No new permission check. The palette navigates to routes that already enforce their own access —
`RequireAuth` gates `/program/*` via Clerk, and Convex throws `Forbidden: organizer access
required.` from `assertOrganizer` on the data layer. A reviewer who is not an organizer can already
navigate to `/program/abstracts` today by clicking the sidebar; the palette adds no new reachable
surface and therefore no new exposure.

Clerk + Convex auth stays exactly as configured via the official plugin. Nothing here touches
`convex/auth.config.ts`.

---

## Edge Cases & Error States

| Case | Behavior |
|------|----------|
| User types `g` in the Abstracts search box | Guard bails. Letter is typed normally. No navigation. |
| User presses `⌘K` while the help dialog is open | Guard sees an open `[role="dialog"]`; the palette's own listener is separate and would still fire — so the palette listener must run the same guard. Handle it: `⌘K` is a no-op while the help dialog is open. |
| User presses `g` then waits 2 s then presses `a` | Sequence expired. `a` does nothing. No navigation. |
| User presses `g` then an unmapped key (`z`) | Pending state clears silently. No toast, no error. |
| User presses `g` then `g` | Navigates to Agenda. Intentional — matches the `g g` convention. |
| User is already on the target route | `navigate()` is a no-op re-render. Acceptable. |
| Non-US keyboard layout | Handled by matching `event.code` (physical position) rather than `event.key`. |
| Browser reserves the combination | `⌘K` is claimed by Firefox's search bar in some configurations. `preventDefault()` runs before the browser default, which reclaims it. Verify in Firefox. |
| Screen reader in browse mode | `g` is bound to graphics navigation in NVDA/JAWS and the screen reader wins. Mitigated: every `g`-target is also in the `⌘K` palette (NFR-001). |
| Component unmounts mid-sequence | `useEffect` cleanup clears the pending timer and removes the listener. |
| Palette open during a route change | Cannot happen — the palette closes before `navigate()` is called. |

No network I/O exists in this feature, so there is no failure state to render.

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sidebar binding | Keep `⌘/`, do not move to `⌘\` | The binding already ships and works. Changing working behavior hours before judging is pure downside risk. `⌘\` stays free for later. |
| Single-character shortcuts | Dropped `c`, `a`, `x`, and bare `/` | WCAG 2.1.4 requires bare character shortcuts be disableable, remappable, or focus-scoped. Meeting that needs a Settings page, which is out of scope. Two-key `g`-sequences sidestep the requirement entirely. |
| `?` for help | Kept, as a documented exception | `?` is technically `⇧/`, a character-key shortcut. Accepted because it is the universal help convention, no screen reader binds it in browse mode, and the typing-guard prevents it firing in any text field. Logged under Risks. |
| Palette search scope | Static route list only | Convex-backed search over abstracts and speakers is the better product, but it needs a debounced query and a new Convex function. Not tonight. Deferred, and the component is structured so a `CommandGroup heading="Results"` drops in without restructuring. |
| Key matching | `event.code` | `event.key` breaks on AZERTY and Dvorak. Imori already learned this. |
| Pending `g` storage | `useRef` | A `useState` here would re-render the whole layout on every `g` keypress. |
| Two components, not one | `CommandPalette` + `GlobalKeyboardShortcuts` | The palette is self-contained and reusable; the shortcut layer opens it through an injected callback. Splitting keeps the palette dependency-free. |
| `dialog.tsx` left alone | Local overrides only | It has `border` + `shadow-lg` and backs every dialog in the app. Fixing it globally is correct and is a separate issue. |
| Reference port source | Imori for the guard, takumi-webapp for the palette | The Imori typing-guard is the most battle-tested of the three apps. The takumi-webapp palette has the best group structure. Sentio's server-persisted shortcut model is the right long-term answer but needs an API and a Settings page. |

---

## Dependencies

**Requires:**
- `cmdk` ^1.1.1 — already installed
- `src/components/ui/command.tsx` — already vendored, currently unused
- `src/components/ui/dialog.tsx` — already present
- `SidebarContext.toggleCollapsed` — already exported
- Nothing new to install

**Enables:**
- Palette live-search over abstracts and speakers (add a Convex query + one `CommandGroup`)
- `j`/`k` row navigation in `DataGrid` — `DataGrid.tsx:126` already syncs the active row to
  `?selected=` in the URL, so the keyboard version is a small addition on top of this layer
- Bulk select + bare-key row actions on Abstracts, once a shortcut kill-switch exists
- Settings > Shortcuts remapping — port the four Imori helpers deliberately skipped here

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| The typing-guard misses a case and a keystroke navigates the user mid-form | **High** | Port the Imori guard verbatim rather than rewriting it. Manually test typing `g`, `d`, and `?` into: the Abstracts search box, the tag popover search, the form builder, and the palette input itself. This is the one thing that must be clicked through before merge. |
| Shipping the night before a judged deadline breaks something unrelated | **High** | Zero changes to any page component. The only edits outside two new files are the `AppLayout` mount and three class strings in `command.tsx`. `npm run check` must pass before the PR. |
| `?` is a WCAG 2.1.4 character-key shortcut | Low | Documented and accepted. `⌘K` provides an equivalent path to the help entry, so the shortcut is not the only route to the information. |
| `g` collides with NVDA/JAWS browse-mode graphics navigation | Low | Every `g`-target is reachable via `⌘K`. No capability is keyboard-only-via-`g`. |
| `⌘K` intercepted by the browser | Low | `preventDefault()` before the default action. Verify in Firefox specifically. |
| Two `keydown` listeners (palette + shortcut layer) fire on the same event | Low | Both run the same guard and each handles a disjoint key set. Documented in the edge-case table. |
| Help dialog inherits `border` + `shadow-lg` from `dialog.tsx` | Low | Overridden locally via `className`. Global fix filed separately. |
