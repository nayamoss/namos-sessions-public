# Shared component audit

**Last audited:** 2026-08-12

## Why drift happened

The template supplied a broad `components/ui` library and the project documented a smaller
component canon, but neither was enforced. Feature work therefore copied short local wrappers or
wrote raw controls because doing so was locally faster. The problem was process, not a missing
template: reusable components existed, but imports and source boundaries were optional.

## Consolidated in this pass

| Repeated job | Canonical component |
|---|---|
| Tables, static grids, interactive matrices | `shared/DataGrid` |
| Label + control + optional hint | `shared/FormField` |
| Titled content surface with optional action | `shared/SectionCard` |
| Empty content with title/message/action/icon variants | `shared/EmptyState` |
| Submission lifecycle label | `shared/SubmissionStatusBadge` |
| Two-or-more option segmented radio control | `shared/SegmentedControl` |
| Boolean setting with label and optional hint | `shared/ToggleField` |
| Form validation summary | `shared/ErrorList` |
| Text, number, email, and other visible inputs | `ui/Input` |
| Boolean checkbox | `ui/Checkbox` |

Migrated callers include onboarding, event settings, submission-form authoring, portal-form
authoring, portal profile/dashboard/submissions, evaluation plans, reviewer reminders, bulk
assignment, public embeds, integrations, readiness, and CSV preview.

## Intentional exceptions

- Hidden file inputs use the native platform file picker.
- Hidden native radios may back styled choice cards for form submission/accessibility.
- Rich-text toolbar buttons, table cells, sidebar/navigation triggers, and schedule cells have
  specialized semantics and remain purpose-built components.
- API documentation code blocks intentionally use a fixed neutral code palette.

## Enforcement

- `src/test/table-canon.test.ts` prevents table markup outside `DataGrid`.
- `src/test/component-canon.test.ts` prevents visible raw form controls, page-local copies of
  canonical component names, and hardcoded neutral palettes in product UI.
- `src/test/color-system.test.ts` protects the electric-blue primary and soft-neutral tokens.

New reusable jobs must be added to `docs/DESIGN-SYSTEM.md` before feature pages create another
implementation.
