# Code Reuse Audit — Sessionboard Clone

**Target:** `/Users/nierda/GitHub/sites/01-active-projects/killmysaas-main/sessionboard-clone`
(React 18 + Vite + shadcn/ui + Convex + Clerk + Tailwind 3, detached Kanrei fork)

**Scanned:** ~90 project folders under `01-active-projects/`. Every file cited below was read, not
inferred from its filename.

**Headline:** the single best source is **Clockwork** (`clockwork-main/clockwork`) — it is the
*same stack* as the target (React + Vite + Convex + Clerk + shadcn + date-fns), and it already
contains a working form builder, a dynamic form renderer, a weekly scheduling grid with real
overlap-conflict detection, and an availability editor. Second best is **Takumi webapp** for the
three-pane layout and the TanStack DataTable. **ServiceHQ** has the closest thing to the
slots × rooms agenda grid.

Counter-finding worth stating up front: a large family of components in `takumi-webapp`,
`namos-nextkit-*`, `namos-feed-reader-*` and `nayamoss/naya-pw-20-active`
(`components/ui/enhanced-*`, `components/saas/*`) is a shared template kit that is **mostly
unexercised demo-ware**. `MultiStepForm` and `FileUpload` from that kit are only ever rendered
inside `enhanced-form-examples.tsx`. `multi-step-form.tsx` even has a duplicate export
(`export const MultiStepForm` at line 68 and `export { MultiStepForm }` at line 538) that would
not typecheck. Do not treat that directory as a component library — `DataTable.tsx` is the one
member of it that is used on real pages.

---

## Current state of the target (read before using this doc)

As of this audit, `src/components/shared/` already exists with 13 files — but every one is a
**1–9 line placeholder**. `DataGrid.tsx` is a plain `<table>` with a URL-param row selection and
no sorting, no column visibility, no selection checkboxes, no pagination, no inline edit.
`ExportMenu.tsx` is a single button with an `onExport` prop and no CSV logic. `DetailPane.tsx` is
just a title + close button — the *layout* that makes it push content does not exist;
`src/components/AppLayout.tsx` (15 lines) is still sidebar + `md:ml-60` main, no third pane.

So the reuse question is not "do we have these" — it is "what do we upgrade the stubs with."

Also already present and **complete** in the target, so do not go looking for replacements:

| Thing | Path | Status |
|---|---|---|
| Rich text editor | `src/components/editor/RichTextEditor.tsx` (106 lines) | Complete TipTap wrapper, survived the prune, toolbar + link + undo/redo. **Nothing to import.** |
| Convex file upload backend | `convex/files.ts` (13 lines) | `generateUploadUrl` + `getUrl` already wired. Only the client UI is missing. |
| Transactional email delivery | `convex/emailDelivery.ts` | Shared Resend/SES delivery with organizer-gated Convex actions. Reuse it instead of adding a new send path. |
| Loading / error / empty states | `src/components/data-state.tsx` (134 lines) | `LoadingState`, `ErrorState`, `EmptyState` with actions. Wire `shared/EmptyState.tsx` to this instead of writing a new one. |
| Charts | `src/components/ui/chart.tsx` (303 lines) + recharts | Fine as-is. |

---

## 1. Top findings — ranked by hours saved

### #1 — Form builder + dynamic form renderer (Clockwork) · saves ~6–8h

Two files, same stack, real production pages, exercised by users.

**`/Users/nierda/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/FormBuilder.tsx`** — 423 lines

Contains, as three separate inner components you can lift wholesale:
- `SortableFieldCard` — dnd-kit sortable row with grip handle, type badge, delete, selected ring.
  This is literally `FieldListEditor`.
- `FieldPalette` — 10 field types (`text`, `multiline`, `checkbox`, `multi_checkbox`, `photo`,
  `signature`, `rating`, `dropdown`, `number`, `datetime`) each with a lucide icon. This is
  `FieldTypePicker` / `AddFieldPopover`.
- `FieldConfigPanel` — label input, **Required switch**, conditional placeholder input, and an
  add/remove options editor for dropdown + multi-checkbox.

Plus: `DndContext` + `SortableContext` + `verticalListSortingStrategy` reorder wired to state, a
**2-second debounced autosave** to Convex, and a preview toggle. The `FormField` shape
(`{id, type, label, required, options?, placeholder?}`) is exactly the field-config JSON the target's
`submission-form-builder` and `portal-forms` plans need.

*Missing vs. the spec:* conditional `showIf` logic, section elements, cross-field limits, a shared
field library, and the lock icon. All additive.

**`/Users/nierda/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/FormComplete.tsx`** — 466 lines

The matching renderer. A `FieldRenderer` switch covering all 10 types, including a hand-rolled
`SignatureCanvas` (~120 lines, mouse + touch, retina-correct scaling), a star `rating` widget, a
photo field that does the **full Convex upload round-trip** (`generateUploadUrl` → `fetch` POST →
`storageId`), required-field validation with per-field error state, and a completion progress bar.
This is `DynamicFormRenderer`, minus `showIf`.

- **Deps:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — **not in the target**,
  must install (3 small packages, no peer conflicts with React 18).
- **Verdict: light adaptation.** Swap `AppLayout` import, swap `api.forms.*` for the target's data
  adapter, delete the `isDemoMode()` guards or port them (see §4 note on demo mode).
- **Known defects to fix on import:** in `FormComplete.tsx`, `handleFileChange` is declared with one
  parameter but called as `handleFileChange(e, "image/*")` (harmless, but sloppy);
  `SignatureCanvas`'s mount `useEffect` reads `value` with an empty dep array so it won't re-hydrate
  on prop change.

---

### #2 — Three-pane layout with an inline flex detail panel (Takumi) · saves ~2–3h

**`/Users/nierda/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/layout/DashboardLayout3Col.tsx`** — 197 lines

This is the thing the brief called the single most valuable find, and it is exactly right:

```tsx
<main className="flex flex-1 min-w-0 min-h-0 flex-col overflow-y-auto ...">{children}</main>
<aside className={cn("shrink-0 h-full ... transition-all duration-300",
                     isOpen ? "opacity-100" : "w-0 opacity-0 border-0 ml-0")}
       style={isOpen ? { width: rightPanelWidth } : undefined}>
  {isOpen && rightPanel}
</aside>
```

A real flex sibling that pushes content, `flex-1 min-w-0` on main, `shrink-0` fixed-width aside,
animated width collapse to zero. Not `position: fixed`, no overlay, no focus trap. Also ships a
`Cmd+\` toggle and an `F` focus mode with `Esc` to exit, both correctly guarded against firing while
typing in an input.

**`/Users/nierda/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/context/RightPanelContext.tsx`** — 71 lines

The richer provider (the one inlined in `DashboardLayout3Col` is a stripped-down duplicate). Has
`item`, `openProperties(item)`, `patchItem(updates)`, `setTab`, `close`, `toggle`. Import **this**
one and delete the inline provider from the layout file.

- **Deps:** none beyond `cn`. Next.js only via `"use client"` (delete the line).
- **Verdict: drop-in after two edits** — remove `"use client"`, remove
  `border border-border` from the `<aside>` (violates the no-border rule; the target's global
  `border-style: none !important` would kill it anyway, so it's dead weight).
- **Adaptation the target needs on top:** the design system says panel state lives in the URL
  (`?selected=<id>`). Swap the context's `useState` for `useSearchParams` — the target's stub
  `DetailPane.tsx` already does this, so merge the two.
- **What it does not give you:** the below-`lg` stacked-instead-of-side behaviour. ~20 min of extra
  responsive work.

---

### #3 — Time-slot × resource scheduling grid (ServiceHQ) · saves ~4–5h

**`/Users/nierda/GitHub/sites/01-active-projects/servicehq-main/servicehq/src/components/appointments/AppointmentCalendar.tsx`** — 278 lines

React + Vite + Convex + date-fns — same stack. Its **day view is hours (rows) × staff (columns)**,
which is structurally identical to the target's required `RoomGridView` (slots × rooms). Swap
`staffId` for `roomId` and you are most of the way there.

The load-bearing part is the geometry, which is done correctly:

```ts
const HOUR_HEIGHT = 64, DAY_START_HOUR = 8, DAY_END_HOUR = 20;
function getApptStyle(startTime: number, endTime: number) {
  const startHour = new Date(startTime).getHours() + new Date(startTime).getMinutes() / 60;
  const endHour   = new Date(endTime).getHours()   + new Date(endTime).getMinutes()   / 60;
  return { top: Math.max(0, (startHour - DAY_START_HOUR) * HOUR_HEIGHT),
           height: Math.max(32, (endHour - startHour) * HOUR_HEIGHT) };
}
```

Blocks are absolutely positioned and proportional to duration, with a `Math.max(32, …)` floor so
short sessions stay clickable. Also includes prev/next/today navigation, a week view, a skeleton
loading state, and an empty state.

- **Verdict: light adaptation.**
- **Two things to fix on import:** it draws grid lines with `border-l` / `border-b border-neutral-100`,
  which the target's global `border-style: none !important` will silently erase, leaving an
  unreadable grid — re-do the lines as thin `bg-*` divs or alternating row fills. It also hardcodes
  `#F58E63` in three places; route those through the accent token.
- **Not included:** conflict detection — see #4.

Rejected alternative: `fieldvoice-webapp/components/schedule/WeekCalendar.tsx` (200 lines) computes
`top`/`height` in `getJobOffset` and then **never uses them** — jobs are just stacked in day
columns. Half-built, and Next.js. Skip it.

---

### #4 — Scheduling grid with conflict detection + drag-to-reschedule (Clockwork) · saves ~3–4h

**`/Users/nierda/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/Schedule.tsx`** — 737 lines

Different axis from ServiceHQ (rows = people, columns = 7 days, CSS
`grid-cols-[180px_repeat(7,minmax(110px,1fr))]`), so take the *logic* from here and the *geometry*
from #3.

The reusable logic:

```ts
function shiftsOverlap(a: {start_time: string; end_time: string},
                       b: {start_time: string; end_time: string}) {
  return new Date(a.start_time) < new Date(b.end_time)
      && new Date(a.end_time)   > new Date(b.start_time);
}
```

…plus the `inlineConflict` memo that runs it live as the user edits the time fields, disables Save
while a conflict exists (`disabled={Boolean(inlineConflict)}`), and renders an inline warning naming
the colliding person. There is a second `weeklyCapWarning` memo implementing a soft cap with an
explicit "Allow over cap" override checkbox — that's a good pattern for the target's room/speaker
double-booking warnings. Also: HTML5 drag-and-drop reschedule (`dropShift` preserves duration and
reassigns the row), and a "copy week" bulk clone.

- **Verdict: light adaptation** for the logic; **not worth it** for the markup (take ServiceHQ's).
- **Known defect:** line 546 renders `<Check className="h-3 w-3" />` but only `AlertTriangle` is
  imported from lucide at line 4. That is a live `ReferenceError` on any shift that has all tasks
  complete. Fix the import if you lift the cell renderer.

---

### #5 — TanStack DataGrid (Takumi / nextkit template) · saves ~4–6h, with caveats

**`/Users/nierda/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/saas/DataTable.tsx`** — 822 lines
(byte-identical copies also in `namos-feed-reader-webapp`, `nayamoss/naya-pw-20-active`,
`takumi-electron`; the nextkit template's is 819 lines and near-identical)

Type definitions live in the same folder: `visualization-types.ts` (569 lines) — you only need the
`DataTableProps` / `ColumnDefinition` subset, roughly 80 lines.

**What it actually has:** TanStack Table v8 wiring (core/sorted/filtered/pagination row models),
sortable headers with three-state arrow icons, a select-all + per-row checkbox column, a
column-visibility dropdown, a global debounced search, per-column filters (text / select / numeric
range), CSV + JSON export honouring row selection, a full pagination bar with page-size select and
first/prev/next/last, loading skeleton matching the column count, and an error state with retry.
Optional `react-window` virtualization.

**What it does not have**, and the target's spec requires: **column reordering** (no `columnOrder`
state, no `onColumnOrderChange`), **inline cell editing**, and **XLSX export** (`case 'excel'` is a
`console.warn`).

**Real bug:** `ColumnFilter` calls `column.getFacetedUniqueValues()` and
`getFacetedMinMaxValues()`, but `useReactTable` is never given `getFacetedRowModel()` /
`getFacetedUniqueValues()` — so select and range filters render empty. One-line fix, but it means
those code paths were never exercised.

**Design-system conflict:** wraps everything in a `<Card>`, uses `rounded-md border` on the table
container, and `className="w-24 border shadow rounded"` on the range inputs. All of that fights the
target's borderless/shadowless rules. The global `border-style: none` will neutralise the borders
but the `shadow` classes will still render.

- **Deps to install:** `@tanstack/react-table` (required), `react-window` + `@types/react-window`
  (only if you keep virtualization — with 200–500 seeded submissions you do not need it, so strip it
  and drop the dep).
- **Verdict: light-to-moderate adaptation.** Genuinely saves the TanStack plumbing, which is the
  boring half. Budget ~2h of rework on top: strip the Card/border/shadow chrome, add
  `getFacetedRowModel`, add `columnOrder` state + a dnd-kit list in the preferences pane, wire
  `onRowClick` to `?selected=<id>`.
- **Honest alternative:** the target's spec for `DataGrid` is sorting + column show/hide + reorder +
  selection + inline edit + pagination + CSV. Hand-rolling that against the existing 7-line stub is
  maybe 6–8h. Importing this is maybe 3–4h. Real but not spectacular.

---

### #6 — Correct CSV escaping + download (Kanrei) · saves ~0.5h

**`/Users/nierda/GitHub/sites/01-active-projects/kanrei-main/kanrei/src/pages/Controls.tsx`** — lines 118–138

```ts
const escapeCsv = (value) => {
  const v = String(value ?? "");
  return (v.includes(",") || v.includes('"') || v.includes("\n"))
    ? `"${v.replace(/"/g, '""')}"` : v;
};
const downloadCsv = (filename, rows: string[][]) => { /* Blob + anchor + revokeObjectURL */ };
```

Twenty lines, but **more correct than the DataTable's export**, which uses `JSON.stringify(value)`
per cell and mangles anything containing a quote or newline. Kanrei repeats this same inline pattern
in 6 pages (`AuditLogPage`, `QuestionnaireDetail`, `IncidentManagement`, `RiskRegister`,
`Questionnaires`, `Controls`) — extract it once into `src/lib/csv.ts` and back both `ExportMenu` and
`DataGrid` with it.

- **Verdict: drop-in.**

---

### #7 — Availability editor (Clockwork) · saves ~1–1.5h

**`/Users/nierda/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/Availability.tsx`** — 157 lines

7 day-rows, each with a 3-state preference toggle (available / preferred / unavailable) and a
conditional start/end `type="time"` pair. Clean state shape, batched `Promise.all` upsert, localStorage
fallback for demo mode.

The target's spec wants **day × time-part checkboxes** (morning/afternoon/evening), not
preference + time range — so this is a structural donor, not a copy. The row loop, the toggle-group
styling, and the save flow all transfer; the cell contents get swapped for a 3-column checkbox grid.

- **Verdict: light adaptation.**

Rejected alternative: `arlo-webapp/src/components/dashboard/ManageAvailabilityDialog.tsx` (249 lines)
is Next.js and modal-shaped. No advantage over the Clockwork one.

---

### #8 — StatusTabs (Kanrei) · saves ~0.5–1h

**`/Users/nierda/GitHub/sites/01-active-projects/kanrei-main/kanrei/src/pages/Tasks.tsx`** — lines 44, 86–101, 210–216

The `filters: {label, value, count}[]` array built by client-side `.filter().length`, the
`useMemo`'d `filtered` list, and the pill button row
(`bg-primary text-primary-foreground` when active, `bg-muted text-muted-foreground` otherwise) are
exactly the `StatusTabs` spec, including "client-side filter, never refetch." The same file's empty
state already branches on whether a filter is active vs. no data at all, with different CTAs — which
is the polish that usually gets skipped.

Roadmap's claim that `Tasks.tsx` is a **Direct** reuse for portal tasks holds up. It's 393 lines and
about half of it is a task-pack wizard dialog you don't need.

- **Verdict: drop-in for the tabs; light adaptation for the page.**

---

## 2. Full inventory

| # | Shopping-list item | Best candidate | Lines | Verdict | Hrs saved |
|---|---|---|---|---|---|
| 1 | **DataGrid** (sort, col show/hide + reorder, selection, inline edit, paging, CSV) | `takumi-main/takumi-webapp/components/saas/DataTable.tsx` (+ `visualization-types.ts`) | 822 (+569) | Light–moderate adaptation. No column reorder, no inline edit, no XLSX; faceted filters broken | 4–6 |
| 2 | **Three-pane layout, inline flex detail panel** | `takumi-main/takumi-webapp/components/layout/DashboardLayout3Col.tsx` + `context/RightPanelContext.tsx` | 197 + 71 | **Drop-in** (strip `"use client"` + border; add URL state) | 2–3 |
| 3 | **WizardShell** (left step rail, checkmarks, per-step save) | `namos-nextkit-.../components/ui/multi-step-form.tsx` | 537 | **Not worth it** — demo-ware, duplicate export won't compile, horizontal stepper not a rail, forces config-driven fields | 0 |
| 3b | Step-rail *visual* only | `kanrei-main/kanrei/src/pages/Onboarding.tsx` lines 168–192 | ~25 | Reference only. Derived 3-step AWS flow, horizontal, tightly coupled | 0.25 |
| 4 | **DynamicFormRenderer** (config → UI, validation) | `clockwork-main/clockwork/src/pages/FormComplete.tsx` | 466 | **Light adaptation.** 10 field types + signature canvas + Convex upload + required validation. No `showIf` | 3–4 |
| 5 | **FieldListEditor** (drag reorder, type picker, required toggle) | `clockwork-main/clockwork/src/pages/FormBuilder.tsx` | 423 | **Light adaptation.** dnd-kit sortable + palette + config panel + debounced autosave | 3–4 |
| 6 | **PageHeader** | `clockwork-main/clockwork/src/components/layout/PageHeader.tsx` | 21 | Not worth importing — target's 5-line stub already matches the spec better | 0 |
| 7a | **Scheduling grid** (slots × rooms) | `servicehq-main/servicehq/src/components/appointments/AppointmentCalendar.tsx` | 278 | **Light adaptation.** hours × staff → hours × rooms; fix borders + hardcoded hex | 4–5 |
| 7b | **Overlap / conflict detection** | `clockwork-main/clockwork/src/pages/Schedule.tsx` (`shiftsOverlap`, `inlineConflict`, `weeklyCapWarning`) | 737 (logic ≈ 60) | **Drop-in logic**, discard markup. Fix missing `Check` import if lifting cells | 3–4 |
| 8 | **Availability picker** (day × time-part) | `clockwork-main/clockwork/src/pages/Availability.tsx` | 157 | Light adaptation — donor structure, different cell contents | 1–1.5 |
| 9a | **Rich text editor** | already in target: `src/components/editor/RichTextEditor.tsx` | 106 | **Nothing to do** — complete | — |
| 9b | **File upload** (client UI) | `clockwork` `FormComplete.tsx` upload flow (~15 lines) | 15 | **Drop-in.** Pairs with target's existing `convex/files.ts` | 0.5 |
| 9b′ | File upload (fancy dropzone shell) | `takumi-main/takumi-webapp/components/ui/file-upload.tsx` | 523 | Moderate rework — good validation logic but demo-ware (only rendered in `enhanced-form-examples.tsx`) and needs framer-motion | 1 |
| 9c | **StatCard** | `takumi-.../components/saas/MetricsCard.tsx` / `StatsOverview.tsx` | 323 / 370 | **Not worth it** — over-built, Card+border chrome, template kit. Target stub + spec is 15 lines | 0 |
| 9d | **EmptyState** | already in target: `src/components/data-state.tsx` | 134 | **Nothing to do** — has empty/loading/error with primary + secondary actions | — |
| 9e | **StatusTabs** | `kanrei-main/kanrei/src/pages/Tasks.tsx` lines 86–101, 210–216 | ~30 | **Drop-in** | 0.5–1 |
| 9f | **ExportMenu** (CSV/XLSX) | `kanrei` `Controls.tsx` `escapeCsv`/`downloadCsv`; XLSX has no candidate | ~20 | CSV drop-in. **XLSX: build fresh or cut** | 0.5 |
| 10a | **`.ics` generation** | **none anywhere in the portfolio** | — | **Build fresh** (already on the roadmap cut list) | 0 |
| 10b | **Transactional email (Resend/SES)** | already in target: `convex/emailDelivery.ts` | 65 | **Nothing to import** — shared provider delivery is already implemented | — |
| 10b′ | React Email templates | `outreachos-main/qiro-webapp/components/emails/OutreachEmailTemplate.tsx` + `lib/email/renderOutreachEmail.tsx` | 30 + 25 | Not worth it — thin, and pulls in `@react-email/*` the target doesn't have. Plain-text or inline HTML is faster here | 0 |
| 11 | **Airtable client / adapter** | `namos-nuxt/utils/airtable.js`, `config/storage/airtable.js`, `adapters/BaseAdapter.js` | 49 / 6 / 483 | **Not worth it.** `BaseAdapter`'s five Airtable methods all `throw new Error('Airtable implementation pending')`. The Nuxt REST handlers are untyped, unpaginated, no `filterByFormula`, no rate limiting | 0 |
| 12 | **Seed / demo data** | `clockwork/src/lib/demoData.ts` (250), `servicehq/src/lib/demoData.ts` (399) | 250 / 399 | Pattern only. Hand-written domain fixtures, not generators. No `faker` anywhere in the portfolio | 0.5 |

**Total realistic saving: ~22–30 hours**, of which ~15–20h is concentrated in items 1, 2, 4, 5, 7a
and 7b.

---

## 3. Build fresh — say it plainly

- **`.ics` calendar file generation.** Zero candidates across 90 repos (the only `VCALENDAR` hits are
  inside a vendored Filament PHP bundle in `ynap-laravel-next-flyio`). It's ~40 lines of string
  templating; the roadmap already cuts it to acceptance-email-only, which is the right call.
- **XLSX export.** No repo has `xlsx`, `exceljs`, or any spreadsheet writer. Either add `xlsx` and
  write it, or ship CSV-only. Given the differentiator is *unconditional* export rather than *many
  formats*, CSV-only is defensible and the README can say so.
- **Airtable adapter.** There is no working Airtable code in the portfolio. `BaseAdapter.js` looks
  like an adapter and is not one — every Airtable branch throws. Write it against the REST API
  directly; the target's `src/data/airtable/index.ts` stub is the right place.
- **WizardShell with a left step rail.** No good donor. The one generic multi-step component is
  unused demo-ware with a compile error. Build it — it's a step list + `currentStep` state + Back/Next
  + a `savedSteps` set, maybe 120 lines, and the target needs arbitrary React per step (the form
  builder's steps are not just field groups), which the config-driven candidate actively prevents.
- **Conditional field logic (`showIf`) and cross-field character limits.** Nothing anywhere. These
  are the two named differentiators, so that's fine — they were always going to be original work.
- **Column reordering and inline cell editing in the grid.** Not present in any DataTable variant.
  Column reorder is ~40 lines of TanStack `columnOrder` + a dnd-kit sortable list, reusing the same
  dnd-kit setup you'll already have installed for `FieldListEditor`.
- **Seed data generator.** The two `demoData.ts` files are hand-written fixtures for a handful of
  records. The target needs 200–500 submissions with *deliberately seeded* room conflicts and speaker
  double-bookings. That's a generator, not fixtures — write it. (Do borrow the technique of deriving
  all timestamps from `date-fns` offsets off `new Date()` so the demo never goes stale.)

---

## 4. Porting notes

### Dependencies to install in the target

| Package | Needed for | Notes |
|---|---|---|
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | FieldListEditor (#1), later column reorder | Clockwork pins `^6.3.1 / ^10.0.0 / ^3.2.2`. React 18 compatible. |
| `@tanstack/react-table` | DataGrid (#5) | Only if you take the DataTable. |
| ~~`react-window`~~ | virtualization in DataTable | **Skip.** Strip the `virtualization` branch; 500 rows paginated does not need it. |
| ~~`framer-motion`~~ | Takumi `file-upload.tsx`, `multi-step-form.tsx` | **Skip.** Both are being rejected/rewritten; don't take the dep. |
| `xlsx` | XLSX export | Only if you don't cut it. |

Already present and sufficient: `date-fns@3.6.0` (Clockwork and ServiceHQ both use date-fns —
verify no v2-only APIs), `@tiptap/*`, `resend`, `recharts`, `react-hook-form` + `@hookform/resolvers`,
`zod`, `react-resizable-panels`, `react-day-picker`, `sonner`, `cmdk`.

### Framework mismatch

| Source | Framework | Port cost |
|---|---|---|
| `clockwork` | React + **Vite** + Convex + Clerk + shadcn | **None.** Identical stack. Only `AppLayout` import paths and Convex api references change. |
| `servicehq` | React + **Vite** + Convex | **None.** Same. |
| `kanrei` | React + Vite (the parent fork) | **None.** |
| `takumi-webapp` | **Next.js** App Router + Turso/Drizzle + SWR | Low for the two files taken. Delete `"use client"`; `@/lib/utils` and `@/components/ui/*` paths already match. `DashboardLayout3Col` and `DataTable` are both presentational with no `next/*` imports. |
| `namos-nuxt` | **Nuxt / Vue / JS** | Total rewrite. Reference only, and it isn't worth referencing. |
| `arlo`, `fieldvoice`, `qiro`, `imori` | Next.js | Rejected candidates; irrelevant. |

### Design-system landmines when importing

The target's `src/index.css` sets `--border: 0 0% 0% / 0` **and** a global
`*, *::before, *::after { border-style: none !important; }` at line 127. Consequences:

1. **Any imported grid that draws its structure with `border-l` / `border-b` will render as an
   undifferentiated blob.** This affects ServiceHQ's `AppointmentCalendar` (grid lines) and
   Clockwork's `Schedule` (row/column separators) — the two highest-value scheduling imports.
   Replace those borders with thin `bg-muted` divs, alternating row fills, or `outline` on the cell
   containers. Test this *first*, before porting the rest of the grid, or you'll debug it twice.
2. `box-shadow` is **not** globally suppressed. Clockwork uses `shadow-sm` liberally
   (`rounded-md bg-card p-3 shadow-sm`) and the Takumi DataTable uses `border shadow rounded` on
   filter inputs. Strip these by hand — the linter won't catch them.
3. Hardcoded hex colors to route through tokens: ServiceHQ hardcodes `#F58E63` (coral) in three
   places; Clockwork's `SHIFT_COLORS` array leads with `#3B82F6` (**blue**, banned) and the AI-draft
   banner uses `bg-purple-50` / `text-purple-700`.
4. `rounded-xl` on Takumi's `DashboardLayout3Col` panes = 12px — within the ≤14px rule, fine as-is.

### Architectural pattern worth stealing (not a component)

Both Clockwork and ServiceHQ implement a **demo mode**: `isDemoMode()` from an auth context, every
Convex `useQuery` guarded with `: 'skip'`, and a `demoData.ts` returning fixtures. This maps directly
onto the roadmap's "View as Organizer / View as Speaker" zero-friction entry requirement, and it's
the same stack.

One hard-won rule from `clockwork-main/clockwork/CLAUDE.md`, worth carrying over verbatim:

> Never leave a Convex query unconditional — in demo mode it never resolves, leaving the component
> permanently in `undefined` (loading skeleton) state.

### Suggested import order

1. `DashboardLayout3Col` + `RightPanelContext` → fix `AppLayout.tsx`, merge with the `DetailPane`
   stub's URL state. Everything else renders inside this, so do it first.
2. Extract `escapeCsv`/`downloadCsv` to `src/lib/csv.ts`, wire `ExportMenu`.
3. `StatusTabs` from Kanrei `Tasks.tsx`.
4. Install dnd-kit → port `FormBuilder.tsx` → `shared/FieldListEditor.tsx` + `AddFieldPopover.tsx`.
5. Port `FormComplete.tsx` `FieldRenderer` → `shared/DynamicFormRenderer.tsx`. Add `showIf`.
6. Install `@tanstack/react-table` → replace the `DataGrid` stub. Fix faceted models, strip Card
   chrome, add column reorder with the dnd-kit you now have.
7. ServiceHQ grid geometry + Clockwork `shiftsOverlap` → agenda Rooms + Conflicts tabs.
8. `Availability.tsx` → `AvailabilityGrid`.
