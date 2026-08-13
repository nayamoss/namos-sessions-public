# UI consistency pass

**Status:** done

## Universal table follow-up (2026-08-12)

A repository-wide audit found two table implementations outside the canonical `DataGrid`: the
onboarding CSV preview and the speaker availability timetable. An unused shadcn-style
`components/ui/table.tsx` also left a second API available for future feature work.

This follow-up shipped:

- extend `DataGrid` to support static rows, semantic row headers, rich column labels, centered
  cells, and the timetable presentation without weakening its standard list defaults;
- migrate the CSV preview and availability timetable to `DataGrid`;
- remove the unused alternate table primitives; and
- add a source audit test that permits native table markup only inside `DataGrid`.

## Audit (2026-08-11, before implementation)

The organizer and program routes had four concrete sources of visual drift:

- Abstracts, Agenda, Communications, and Speaker Tracking used the shared `DataGrid`, while Evaluation rendered two bespoke HTML tables with tighter `p-2` cells, native checkboxes, divider classes, and no standard row hover/selection treatment.
- Page-local primary actions used `variant="default"` in Evaluation, Communications, Tasks, Library, Abstracts, and Embeds instead of the fixed accent/outline/ghost vocabulary.
- The shared shadcn `Card` still used deprecated `--surface`, `--text`, and `--r-lg` aliases while feature cards used current `bg-card` and `rounded-lg` tokens.
- Public submission participant groups and the Abstracts column popover carried explicit divider classes, contrary to the fill-only separation rule.

## Standard selected

Use the existing Abstracts/Agenda `DataGrid` pattern everywhere: `bg-card`, `rounded-lg`, muted `text-xs` headers, `px-4 py-3` cells, `hover:bg-muted/60` rows, `bg-muted` selection, and the shared Radix `Checkbox`. Cards use the existing `rounded-lg bg-card` feature pattern with `p-4` to `p-6`. Buttons use only the design-system intent vocabulary (`accent`, `outline`, `ghost`, `destructive`).

The current color contract is electric blue for `accent`/primary workflow actions and red only
for `destructive`/error states. Canvas, muted, secondary, sidebar, and dark-mode surfaces use
soft blue-tinted neutrals instead of harsh zero-hue grays.

## Scope and verification

- Extend `DataGrid` with optional controlled row selection and apply it to Evaluation assignments.
- Move reviewer progress to `DataGrid` so no feature owns a private table pattern.
- Normalize the shared Card tokens and page button variants; remove explicit page divider classes.
- Verify with `npm run check`, a repository audit, and browser screenshots of at least Abstracts, Agenda, and Evaluation.
- Verify the universal-table follow-up with focused tests, typecheck, the source audit, and the
  production build. Preserve the availability timetable interaction and accessibility contract.

Completion evidence: the source audit finds native `<table>` markup only in `DataGrid`; the
focused table, availability, pagination, sorting, static-row, and onboarding tests pass, as do
app and Convex typechecks and the production build. The full parallel suite reaches 57/58 files;
an unrelated 5-second UI-test timeout moves between existing test files under current workspace
contention, while each affected file passes when run directly.

## Component-canon follow-up (2026-08-12)

The broader audit is recorded in [`../../COMPONENT-AUDIT.md`](../../COMPONENT-AUDIT.md).
`FormField`, `SectionCard`, `EmptyState`, `SubmissionStatusBadge`, and `SegmentedControl` now own
jobs that feature pages had copied locally. Visible raw inputs and checkboxes were migrated to
the shared UI primitives, hardcoded neutral product surfaces were replaced with semantic tokens,
and `component-canon.test.ts` now enforces these boundaries.
