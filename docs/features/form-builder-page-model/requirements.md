# Organizer-Owned Form Page Model — Requirements

**Type:** Improvement (architectural)
**Status:** In Review
**Priority:** High
**Last Updated:** 2026-08-19

## Owner-approved UX amendment (2026-08-19)

The interactive HTML prototype was reviewed in the browser and supersedes the early rail and
preview details below where they conflict. The approved production interaction is deliberately
quieter: the rail lists organizer-owned custom pages only; required Account, Participant, and
Review stages remain enforced by the data model and public renderer but are not repeated as an
"always included" block. Preview is a dedicated mode opened from the content toolbar, not a
persistent third pane. These changes remove the cramped four-column layout and the extra helper
copy the owner rejected while preserving every migration and public-flow requirement.

## Problem Statement

Naya (the owner) reported the CFP submission form builder is confusing to use: the header is
crowded, it's unclear how to advance to the next step, the preview and the wizard both show
what look like navigation controls, and there are too many configuration questions overall.

A prior deep review (`docs/features/form-builder-review/FINDINGS.md`) diagnosed the actual root
cause: this is a category error in the product, not a polish problem. The organizer's 7-step
rail in `SubmissionFormBuilder.tsx` is a list of **fixed settings categories**
(Submission setup, Welcome screen, Appearance, Abstract information, Participant information,
Routing, Form settings, Notifications) — not the pages a speaker actually moves through. The
public speaker flow (`SubmissionPage.tsx`) has its own, entirely separate, hard-coded 5-stage
sequence (Welcome → Account → Submission → Participant → Review) that the organizer cannot add
to, rename, reorder, or split. `CfpPreviewPanel.tsx` then re-simulates that public flow inside
the builder with its own step tabs and its own (decorative, `disabled`) Back/Continue buttons,
styled with the exact same `variant`/`size` as the builder's real Back/Next buttons
(`outline`/`accent`, both `size="sm"`) — so two visually identical control pairs sit on screen
at once, one live and one fake, with nothing distinguishing them. That is the literal source of
"it's not even clear how to go to the next item."

Portal Forms (`PortalForms.tsx`) has the identical defect at smaller scale: a 3-step
`WizardShell` wizard that always writes exactly one hard-coded `portal` section, with no preview
at all.

Owner decision (confirmed via clarifying question): fix this properly — organizer-owned,
reorderable pages, on one shared model, covering **both** the CFP builder and Portal Forms —
rather than a visual-only polish pass on the current fixed-category model.

## User Stories

**As an event organizer building a CFP form**, I want to see and control the actual pages a
speaker will move through (not just settings categories), so that the builder matches what I'm
actually building.

**Acceptance Criteria:**
- GIVEN I open either builder WHEN I look at the left rail THEN I see the ordered custom pages I
  can edit, not fixed settings categories or a redundant summary of locked system stages.
- GIVEN I'm editing a custom page WHEN I add, remove, rename, or reorder it THEN the public form
  reflects that exact page order — no separate hard-coded stage list exists anymore.
- GIVEN I'm editing any page WHEN I look at the preview THEN it renders using the same component
  that renders the real public form (not a hand-maintained duplicate), so preview and reality
  cannot drift apart.
- GIVEN I'm looking at the preview panel WHEN I compare it to the builder's own Back/Next
  controls THEN they are visually distinct — the preview's internal navigation cannot be
  mistaken for the real wizard controls.
- GIVEN I open an existing, already-saved CFP or Portal form WHEN the rebuilt builder loads it
  THEN it auto-derives the correct pages from the old fixed sections with no visible change or
  data loss.
- GIVEN I'm in the Portal Forms builder WHEN I use it THEN it follows the same page model, field
  palette, and preview pattern as the CFP builder — not a separate, smaller, unpreviewed flow.
- GIVEN I set an event's accent color WHEN I open either builder's preview THEN the preview
  reflects the same single event-level accent color (no duplicate per-form color picker).

## Functional Requirements

- FR-001: Replace `submission_forms.sections` (closed 3-literal union: `abstract` | `participant`
  | `portal`) with an ordered `pages` array supporting `kind: "system" | "custom"` pages, on both
  the CFP and Portal form records (one shared table already; see design.md).
- FR-002: System pages (`account`, `review`, and — for CFP — `participant` when participant
  collection is on) remain fixed and server-validated, but are omitted from the editable Pages
  rail. The public renderer still includes them in their fixed anchor positions.
- FR-003: Custom pages can be added, renamed, duplicated, removed, and reordered via accessible
  controls (explicit Move up / Move down at minimum — no drag-only interaction).
- FR-004: Selecting a page in the rail shows only that page's fields in the center panel. Adding
  a field opens a field palette (reuse `field_definitions` + the existing `PortalForms.tsx`
  `FieldLibrary` pattern); selecting a field opens a focused inspector (label, type, required,
  options, max length, conditional visibility) instead of every field being expanded inline at
  once.
- FR-005: Field rows gain real reordering (drag + accessible Move up/Move down) — the current
  `GripVertical` icon is decorative and must become functional.
- FR-006: The live preview is rendered by the same component that renders the real public form
  (`SubmissionPage.tsx`), parameterized by a `mode: "public" | "preview"` prop, not by
  `CfpPreviewPanel.tsx`'s separately hand-maintained field-type mapping and step list. Preview
  mode disables real side effects (Turnstile, email verification, actual submission, analytics).
- FR-007: Preview is a dedicated mode opened from the toolbar below the identity-only page
  title. It replaces the editor while open, uses preview-specific framing, and has no real
  submission side effects, so its navigation cannot be confused with builder controls.
- FR-008: Add a real progress indicator (filled/segmented bar, not just numbered circles) above
  the configuration area reflecting position in the organizer's settings flow.
- FR-009: Accent color is edited once at the event level and read by both builders' previews —
  remove the redundant per-form color picker from inside the CFP wizard once this lands (or,
  minimum viable: keep the picker but make explicit it writes `events.accentColor`, and give
  Portal Forms' preview the same read).
- FR-010: Portal Forms adopts the same pages/fields/preview model as the CFP builder (Pages rail,
  field palette + inspector, real preview) — not left on the old single-section wizard.
- FR-011: Existing saved forms (CFP and Portal) auto-migrate to the `pages` shape on load with no
  visible change to the organizer and no data loss; new/never-saved forms seed sensible defaults
  directly in the new shape.
- FR-012: Cut or merge low-value steps/fields identified in design.md (e.g. non-functional
  notification toggles, Abstracts-vs-Sessions folded into page 1, locked default fields shown as
  a compact summary instead of full expanded rows) to reduce total organizer questions.

## Non-Functional Requirements

- NFR-001: No data loss or downtime for any existing published/open CFP or Portal form during
  migration — dual-write `pages` alongside legacy `sections` until every reader is migrated, per
  the phased rollout in design.md.
- NFR-002: Public submission (`publicForms.submit`) and routing (`categoryRouting.ts`) must keep
  working unchanged for forms not yet touched by an organizer in the rebuilt builder.
- NFR-003: Server-side guard against a client payload that omits/renames a system page (organizer
  UI treats them as locked; server must not trust that alone).

## Out of Scope

- Multi-page support for anything outside `submission_forms` (e.g. Judging, other unrelated
  wizards) — explicitly not touched by this effort.
- A generic drag-and-drop library adoption beyond what's needed for pages/fields reordering here.
- Changing `field_definitions` (already page-agnostic, no schema change needed).
- Redesigning the public form's own visual styling beyond what's needed to share the renderer
  with the builder preview.

## Success Metrics

- Organizer can add/reorder/remove a custom CFP page and see the public form change to match,
  with zero code changes required per event.
- Zero preview/reality drift bugs (measured by preview and public form sharing one renderer
  component, not two field-type maps).
- Owner (Naya) confirms in a live walkthrough that it's no longer unclear how to advance through
  the builder, and that the preview's simulated nav is no longer mistaken for real controls.
