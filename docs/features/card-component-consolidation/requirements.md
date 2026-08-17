# Card Component Consolidation — Requirements

**Type:** Improvement
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-14

## Problem Statement

`src/components/ui/card.tsx` is the app's only real `Card` primitive, but it is imported in
exactly one file (`IntegrationCard.tsx`). Everywhere else — 4 shared wrapper components
(`SectionCard`, `StatCard`, `ReadinessCategoryCard`, `ChoiceCardGroup`) and 31 page files —
"card" surfaces are hand-rolled inline as `<section className="rounded-lg bg-card p-X">` (or a
variant of it). This is not single-source: editing `components/ui/card.tsx` today changes
nothing visible in the app.

Drift has already happened because of this: `rounded-lg` vs `rounded-xl` are used
interchangeably for the same conceptual card, and `ReadinessCategoryCard` uses `bg-muted/60`
instead of `bg-card` with no documented reason it's different. This is the same failure mode
`ui-consistency` and `component-canon.test.ts` were built to catch for tables, form controls, and
named component redeclarations — but the existing canon test only flags page-local
`function Card(` redeclarations, not inline `<section className="rounded-lg bg-card">` markup,
so this specific drift has been invisible to it.

Tables (`DataGrid`), Button, Input, and Dialog are already correctly single-source and are out of
scope here — see `docs/features/ui-consistency/plan.md` and `docs/COMPONENT-AUDIT.md`.

## Functional Requirements

- FR-001: `components/ui/card.tsx` supports a `variant` prop (`default` = `bg-card`, `muted` =
  `bg-muted/60`) so the existing muted-background pattern used by `ReadinessCategoryCard` becomes
  a supported design choice instead of a one-off.
- FR-002: `SectionCard`, `StatCard`, `ReadinessCategoryCard`, and `ChoiceCardGroup` are
  rewritten to compose `Card`/`CardContent` (and `CardHeader`/`CardTitle`/`CardDescription`
  where applicable) from `components/ui/card.tsx` instead of re-declaring their own
  `rounded-* bg-*` wrapper markup.
- FR-003: All 31 page files currently hand-rolling `rounded-lg|rounded-xl bg-card|bg-muted`
  surfaces are migrated to use `Card`/`CardContent` directly, or to use one of the 4 shared
  wrapper components where their layout already matches (section header + content, stat tile,
  choice button).
- FR-004: A new automated test (extending `component-canon.test.ts` or a new file) fails the
  build if `rounded-lg`/`rounded-xl` co-occurs with `bg-card`/`bg-muted` in any file under `src/`
  outside `components/ui/card.tsx` and its approved wrapper components.
- FR-005: No visual regression — every migrated card keeps its current radius, padding, and
  background (mapped to the new `variant` prop where it was previously `bg-muted`), except where
  this migration deliberately corrects an already-drifted `rounded-xl` back to the canonical
  `rounded-lg`.

## Out of Scope

- Table (`DataGrid`), Button, Input, Dialog — already single-source, no changes needed (confirmed
  by prior audit).
- `IntegrationCard.tsx` — already correctly imports `Card`, no change needed.
- `src/pages/program/Agenda.tsx`'s schedule-grid cells covered by
  `docs/features/design-system-reuse/plan.md` (a separate, already-scoped visual pass) —
  Agenda's *card* surfaces (not the schedule grid cells) are in scope here; the two efforts touch
  the same file but different sections of it.
- Any change to `card`'s color tokens (`--card`, `--muted`) themselves.

## Success Metrics

- `components/ui/card.tsx` import count goes from 1 file to 35+ (4 wrappers + 31 pages, directly
  or via the wrappers).
- Zero occurrences of hand-rolled `rounded-lg|rounded-xl` + `bg-card|bg-muted` markup outside
  `components/ui/card.tsx` and its 4 approved wrappers.
- New audit test passes and stays green (regression guard against future drift).
- No visual diff on the pages touched, verified by clicking through each page listed in
  `plan.md`.
