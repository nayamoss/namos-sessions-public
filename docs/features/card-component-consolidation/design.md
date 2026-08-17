# Card Component Consolidation — Technical Design

## Database / Schema Changes

N/A — pure frontend markup/component refactor, no data model touched.

---

## Backend / API

N/A — no endpoints touched. This is a client-side component consolidation only.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/components/ui/card.tsx` | Add `variant?: "default" \| "muted"` prop to `Card`. `default` keeps `bg-card`, `muted` applies `bg-muted/60`. No other API change — stays backward compatible for `IntegrationCard.tsx`. |
| `src/components/shared/SectionCard.tsx` | Replace `<section className={cn("rounded-lg bg-card p-6", className)}>` with `<Card className={className}><CardContent className={cn("p-6", contentClassName)}>...</CardContent></Card>` (or `Card`/plain div matching current spacing exactly — see Task list). Keep existing prop API (`title`, `description`, `action`, `children`, `className`, `contentClassName`) unchanged so all 11 current call sites need no prop changes. |
| `src/components/shared/StatCard.tsx` | Replace `<section className="rounded-lg bg-card p-4">` with `<Card className="p-4">`. Keep prop API (`label`, `value`, `icon`) unchanged. |
| `src/components/shared/ReadinessCategoryCard.tsx` | Replace `<section className="rounded-lg bg-muted/60 p-5" aria-label={label}>` with `<Card variant="muted" className="p-5" aria-label={label}>`. Keep prop API unchanged. |
| `src/components/shared/ChoiceCardGroup.tsx` | The option button is interactive (`<button onClick>`), which `Card` (a `<div>`) can't render directly. Keep it as a native `<button>` but pull its base classes from a shared constant/util exported by `card.tsx` (e.g. `cardSurfaceClasses`) instead of hardcoding `"rounded-lg bg-card p-4"` inline, so the visual contract still traces back to one source. |
| 31 page files (full list in `plan.md` Phase 2–4) | Replace inline `<section className="rounded-lg ... bg-card|bg-muted ... p-X">...</section>` (or `<div>`) with `<Card>`/`<CardContent>`, or with `SectionCard`/`StatCard` where the existing layout already matches those wrappers' shape (title+content, label+value+icon). |

### New Components

None. This pass reuses `components/ui/card.tsx`; no new primitive is created. The `variant` prop
addition in FR-001 is an extension of the existing `Card`, not a new component.

---

## State / Data Flow

N/A — no state, props, or data flow changes. Every migrated card renders the same
props/children it already receives from its parent; only the wrapping markup changes.

---

## Auth / Permissions

N/A — no access-control surface touched.

---

## Edge Cases & Error States

- **`ReadinessCategoryCard`'s `loadError` state**: currently renders `role="alert"` text inside
  the muted section. Must render identically inside `<Card variant="muted">` — verify the
  `role="alert"` and `aria-label` props still land on the outer element after the swap (use
  `React.forwardRef`/prop spreading already present on `Card`, don't drop `aria-label`).
- **`ChoiceCardGroup`'s selected state** (`value === option.value && "bg-muted"`): must still
  visually override the base card background when selected — the shared `cardSurfaceClasses`
  util must be composable with `cn()` so the selected-state override still wins (last class
  wins via `tailwind-merge`/`cn`).
- **Empty states already inside cards** (e.g. `ReadinessCategoryCard`'s "Nothing outstanding
  here" message): unaffected by this refactor — only the outer wrapper changes, inner content is
  untouched.

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| How to preserve the muted-background pattern | Add `variant` prop to `Card` rather than leaving `ReadinessCategoryCard` as a one-off | User confirmed this is a real, intentional variant, not drift — codifying it as a supported variant prevents someone re-inventing a 5th hand-rolled pattern later. |
| `ChoiceCardGroup`'s interactive button | Export a shared class-string constant from `card.tsx` rather than forcing `Card` (a `<div>`) to poly-morph into a `<button>` | Keeps `Card`'s API simple; avoids `asChild`/Radix `Slot` complexity for one call site. |
| Enforcement | Extend `component-canon.test.ts` with a new `it()` block (FR-004) rather than a separate test file | Matches the existing pattern in this repo — one canon file already guards native form controls and page-local component redeclarations; this is the same category of rule. |
| Migration order | Shared wrappers first (Phase 1), then highest-instance-count pages first (Agenda: 11, EmbedPage: 9, ApiDocs: 8, PortalPages: 6...), then the long tail | Fixing the 4 wrappers first means some page files get partially fixed "for free" wherever they already use `SectionCard`/`StatCard`; ordering by instance count maximizes drift removed per file touched. |

## Dependencies

**Requires:** none — can start immediately.
**Enables:** future card visual changes (radius, padding, background) become a single-file edit
in `components/ui/card.tsx` instead of a 35-file sweep.

## Risks & Mitigations

- **Risk:** Some of the 31 page files use `rounded-lg bg-card` for something that is *not*
  conceptually a card (e.g. a plain content wrapper, a table container). Migrating those to
  `Card` would be semantically wrong even if visually identical.
  **Mitigation:** Phase 2–4 tasks require reading each match in context before replacing, not a
  blind find/replace. Skip and note any match that isn't a true "card" surface.
- **Risk:** `rounded-xl` instances (already-drifted) get silently "fixed" to `rounded-lg`,
  changing visual appearance on those pages.
  **Mitigation:** Flag `rounded-xl` occurrences explicitly during migration (grep already
  identifies them) and call them out for a quick visual check rather than auto-normalizing
  without looking.
- **Risk:** New canon test (FR-004) produces false positives on legitimate non-card uses of
  `rounded-lg` + `bg-card`/`bg-muted` elsewhere in the codebase (e.g. inside `DataGrid` cell
  styling).
  **Mitigation:** Scope the test's regex/allowlist the same way `component-canon.test.ts`
  already does (explicit `allowed` set), and run it against current `main` before adding
  enforcement to confirm it's clean post-migration.
