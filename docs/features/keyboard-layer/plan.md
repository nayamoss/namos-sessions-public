# Keyboard Layer — Implementation Plan

**Estimate:** 2–3 hours
**Constraint:** must be testable by others before Wed Aug 12, 10:00 AM PT.
**Rule for this build:** no page component is modified. If a task starts pulling in a page file,
stop — it has drifted out of scope.

---

## Phase 1: Foundation — the binding module

- [x] **T001:** Create `src/lib/shortcuts.ts`. Port `matchesShortcut` and `formatShortcut` (plus
  its `CODE_LABELS` map) from `imori-webapp/lib/shortcuts.ts:103-136`. Do **not** port
  `validateShortcutBinding`, `RESERVED_BROWSER_CODES`, `normalizeShortcutBindings`, or
  `bindingFromKeyboardEvent` — they exist only for a remapping UI that is out of scope.
- [x] **T002:** In the same file, define `SHORTCUTS` (`palette` = `⌘K`, `sidebar` = `⌘/`,
  `help` = `⇧/`) and `GO_TO_SEQUENCES` — the ten-row table in design.md. Import the same
  `lucide-react` icons `AppLayout.navSections` already uses so the palette and sidebar match.
- [x] **T003:** Derive and export `SHORTCUT_HELP` from `SHORTCUTS` + `GO_TO_SEQUENCES`, grouped
  Navigation / Go to / General. The help dialog and the palette hints both read from this — no
  second hand-written list anywhere (FR-009).
- [x] **T004:** Add `src/test/shortcuts.test.ts` (vitest, matching the existing `src/test/`
  convention). Cover: `matchesShortcut` returns false when an extra modifier is held;
  `formatShortcut({code:'KeyK',meta:true})` → `['⌘','K']`; `Slash` renders as `/`; every
  `GO_TO_SEQUENCES` route string appears in `src/App.tsx`.

## Phase 2: Design-system fixes to the vendored cmdk wrapper

- [x] **T005:** In `src/components/ui/command.tsx` — drop `shadow-lg` from `CommandDialog`
  (line 29); drop `border-b` from the `CommandInput` wrapper (line 42); change `CommandSeparator`
  from `h-px bg-border` to `h-2 bg-transparent` (line 97) so it spaces instead of drawing a line.
- [x] **T006:** Add a `className` prop passthrough to `CommandDialog` so the palette can locally
  override the `border` and `shadow-lg` it inherits from `dialog.tsx:39`. **Do not edit
  `dialog.tsx`** — it backs every dialog in the app.

## Phase 3: Frontend UI (required — the feature is invisible without this)

### UI Spec

---

**Component 1 — `CommandPalette`** (`src/components/CommandPalette.tsx`)

- **Props:** `{ open: boolean; onOpenChange: (open: boolean) => void }`. The shared state is
  controlled by admin-only `AppLayout` so the header discovery hint and keyboard handler cannot drift.

- **Location:** mounted once inside admin-only `AppLayout` in `src/components/AppLayout.tsx`. Renders
  nothing until opened. Appears over the page as a centered dialog, max width 32rem,
  `rounded-[12px]`, `bg-popover`, **no border, no shadow**.
- **Elements:**
  - Search input — placeholder `"Jump to a page or run a command…"`, `aria-label="Command palette"`,
    autofocused. No underline or border beneath it; separated from the list by padding only.
  - Empty state — text `"No matches."`, `py-6 text-center text-sm text-muted-foreground`.
    (No icon or CTA: this is a transient filter miss, not a page-level empty state.)
  - Group heading `"Quick actions"` — `text-xs font-medium text-muted-foreground`
    - Item: `New abstract` → `/program/abstracts?new=true`
    - Item: `Email speakers` → `/program/communications?new=true`
  - Group heading `"Go to"` — one item per row of `GO_TO_SEQUENCES`, in that order:
    Dashboard, Speaker Tracking, Forms, Abstracts, Evaluation, Agenda, Communications,
    Availability, Portal tasks, Event settings
  - Each "Go to" item: `lucide-react` icon (`mr-2 h-4 w-4`, same icon as the sidebar) + label +
    right-aligned `<kbd>` pair showing its `g`-sequence
  - `<kbd>` — `ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground`.
    **No border** (the takumi-webapp reference uses `border bg-muted` — strip it).
  - Loading state: none — the list is static and in-memory
  - Error state: none — no I/O
- **Behavior:**
  - `⌘K` / `Ctrl+K` opens it from any organizer page through the single listener in
    `GlobalKeyboardShortcuts`; this component registers no document listener
  - Typing filters via `cmdk`'s built-in fuzzy matcher — do not supply a custom `filter`
  - `↑`/`↓` move the highlight, `Enter` activates, `Escape` closes — `cmdk` + Radix defaults,
    do not intercept
  - On select: close first, then `setTimeout(() => navigate(to), 0)`. Navigating synchronously
    inside `onSelect` races Radix's focus restore.
  - `⌘K` is a no-op while the help dialog or another dialog is open
- **Data:** none. Reads `GO_TO_SEQUENCES` from `@/lib/shortcuts`, calls React Router `useNavigate`.
  **Import from `react-router-dom`, not `next/navigation`** — this is a Vite SPA, not Next.js.

---

**Component 2 — `GlobalKeyboardShortcuts`** (`src/components/GlobalKeyboardShortcuts.tsx`)

- **Props:** `{ onToggleSidebar: () => void; onOpenCommandPalette: () => void }`
- **Location:** mounted once inside admin-only `AppLayout`, next to `CommandPalette`. Renders no visible
  chrome — only the help dialog, and only when open.
- **Elements** (help dialog):
  - `DialogContent` — max width 30rem, `rounded-[12px]`, `bg-card`, `p-6`, no border, no shadow
    (override the inherited `dialog.tsx` classes locally)
  - Title — `"Keyboard shortcuts"`, `text-xl font-semibold`
  - Description — `"Press ? any time to bring this back."`, `text-sm text-muted-foreground`
  - Three groups from `SHORTCUT_HELP`: **Navigation**, **Go to**, **General**
  - Group heading — `text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground`
    (matches the sidebar section headings at `AppLayout.tsx:67`)
  - Each row — label left (`text-sm`), `<kbd>` tokens right,
    `flex items-center justify-between py-1.5`
  - Groups separated by `space-y-6` whitespace. **No `<hr>`, no `divide-y`, no `border-t`.**
  - Close button — top-right ghost icon button, `aria-label="Close"`
  - Empty state: none — the list is a compile-time constant
  - Loading / error state: none
- **Behavior:**
  - One `document` `keydown` listener, added on mount, removed in the `useEffect` cleanup
  - **Typing-guard runs first on every event**, ported verbatim from
    `imori-webapp/components/global-keyboard-shortcuts.tsx:26-40`: bail if the active element is
    `input`, `textarea`, `[contenteditable="true"]`, `select`, `[role="textbox"]`,
    `[role="combobox"]`, `[role="searchbox"]`, inside `[cmdk-root]`, or if any
    `[role="dialog"]:not([aria-hidden="true"])` is open
  - `⌘K` / `Ctrl+K` → `preventDefault()`, call `onOpenCommandPalette()`
  - `⌘/` → `preventDefault()`, call `onToggleSidebar()`
  - `?` → open the help dialog
  - `g` → store `'g'` in a `useRef` (not state) and start a 1000 ms expiry timer. Next key: look up
    `GO_TO_SEQUENCES`; hit → `preventDefault()` + navigate; miss → clear silently, no toast.
    Clear the ref on both branches, on expiry, and on unmount.
- **Data:** none. Reads `SHORTCUTS`, `GO_TO_SEQUENCES`, `SHORTCUT_HELP` from `@/lib/shortcuts`.

---

### Tasks

- [x] **T007:** Build the controlled `CommandPalette` with exactly the elements listed in the UI
  Spec above and no document-level listener.
- [x] **T008:** Build `GlobalKeyboardShortcuts` with the typing-guard, `?`, and `g`-sequence
  handling, and the help dialog as specced.
- [x] **T009:** Wire into `src/components/AppLayout.tsx` — delete the inline `⌘/` `useEffect`
  (lines 108–117), own the palette state in `AppLayout`, mount both components there, and
  pass `toggleCollapsed` from `useSidebarState()` into `onToggleSidebar`. This is the entry point;
  the feature does not exist until this task is done.
- [x] **T010:** Add a discoverable affordance in the UI — a small `⌘K` hint. Put it in the
  AppLayout `headerEnd` area as a muted button with a `<kbd>`
  pair that opens the palette on click. In collapsed mode it becomes an icon button. The title row
  stays identity-only per the page-header invariant. Without this, a tester who never presses `?`
  will never learn the feature exists.

## Phase 4: Verification

- [x] **T011:** Run `npm run check` (typecheck + vitest + build). Must pass clean.
- [ ] **T012:** Typing-guard click-through — the highest-risk item. In a real browser, type the
  letters `g`, `d`, and `?` into each of: the Abstracts search box, the Abstracts tag popover
  search, the column-picker search, the submission form builder, and the palette's own input.
  Confirm every character lands as text and nothing navigates.
  - **Codex browser 2026-08-11:** passed on the actual Abstracts search, column-picker search,
    Event Settings form input, and palette input. The signed-in test identity is a speaker without
    organizer data access, so no abstract rows/tag popover or editable form-builder record was
    available for the remaining two checks.
- [x] **T013:** Shortcut click-through — `⌘K` opens and `Escape` closes; type `abs` + `Enter`
  lands on Abstracts; `g` `a`, `g` `e`, `g` `c` navigate; `g` + 2 s pause + `a` does nothing;
  `⌘/` still toggles the sidebar; `?` opens the help dialog and lists every binding.
- [ ] **T014:** Verify `⌘K` in Firefox specifically — it is claimed by the browser's search bar in
  some configurations.
- [x] **T015:** Confirm no global key handler exists on `/submit/:eventSlug/:formId`,
  `/e/:eventSlug/:feed`, or `/portal/*`. Press `g` `a` on the public submission form — nothing
  should happen.
- [x] **T016:** Design-rule pass on both new surfaces — no border, no shadow, no gradient, no
  `<hr>`/`divide-`, radius ≤ 14px, nothing blue.
- [x] **T017:** Update `docs/features/INDEX.md` — add a `keyboard-layer` row, set status, bump
  **Last updated**. Per AGENTS.md Rule 1 this goes in the same commit as the work, not after.

---

## Task Dependencies

```
T001 ─> T002 ─> T003 ─┬─> T004
                      ├─> T007 ─┐
                      └─> T008 ─┤
T005 ─> T006 ─────────────> T007│
                               T009 ─> T010 ─> T011 ─> T012 ─> T013..T016 ─> T017
```

T001–T003 gate everything. T005–T006 gate only T007. T009 is the entry point — nothing is user-visible before it.

---

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` met
- [ ] Feature is accessible and usable in the UI — `⌘K` works, and the header `<kbd>` hint makes it
      discoverable without reading docs
- [ ] `npm run check` passes
- [ ] No regressions: `⌘/` sidebar toggle behaves exactly as it did before
- [ ] No global key handler on any public or portal route
- [ ] Typing-guard verified by hand in five real input surfaces (T012)
- [ ] No file under `src/pages/` was modified
- [ ] `src/components/ui/dialog.tsx` was not modified
- [ ] `docs/features/INDEX.md` updated in the same commit
