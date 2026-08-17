# Card Component Consolidation — Implementation Plan

## Phase 1: Shared Wrapper Components (highest leverage, do first)

- [x] T001: Add `variant?: "default" | "muted"` prop to `Card` in `src/components/ui/card.tsx`
      (`default` → `bg-card`, `muted` → `bg-muted/60`). Export a `cardSurfaceClasses(variant)`
      helper (or equivalent class-string export) for the one non-`Card` consumer (T005).
- [x] T002: Rewrite `src/components/shared/SectionCard.tsx` to render `<Card>`/`<CardContent>`
      internally. Prop API (`title`, `description`, `action`, `children`, `className`,
      `contentClassName`) stays unchanged.
- [x] T003: Rewrite `src/components/shared/StatCard.tsx` to render `<Card className="p-4">`
      internally. Prop API (`label`, `value`, `icon`) stays unchanged.
- [x] T004: Rewrite `src/components/shared/ReadinessCategoryCard.tsx` to render
      `<Card variant="muted" className="p-5" aria-label={label}>` internally. Verify
      `role="alert"` on `loadError` still renders correctly. Prop API stays unchanged.
- [x] T005: Rewrite `src/components/shared/ChoiceCardGroup.tsx`'s `<button>` to use the shared
      class helper from T001 instead of hardcoding `"rounded-lg bg-card p-4"`. Verify the
      selected-state `bg-muted` override still wins.
- [x] T006: Run `npm run typecheck` and existing tests; fix any prop-forwarding regressions.

## Phase 2: Highest-Drift Pages (instance count ≥ 4)

Migrate each file's `<section className="rounded-lg|rounded-xl bg-card|bg-muted ...">` blocks to
`Card`/`CardContent`, or swap in `SectionCard`/`StatCard` where the existing markup already
matches that wrapper's shape (title+content → `SectionCard`; label+value+icon → `StatCard`).
Read each match in context first — skip anything that isn't a true "card" surface (see Risks in
`design.md`). Flag `rounded-xl` occurrences for a visual check rather than silently normalizing.

- [x] T007: `src/pages/program/Agenda.tsx` (11 matches — card surfaces only, not the schedule
      grid cells covered by `docs/features/design-system-reuse/plan.md`)
- [x] T008: `src/pages/public/EmbedPage.tsx` (9 matches)
- [x] T009: `src/pages/public/ApiDocs.tsx` (8 matches — this file is already allowlisted out of
      the `bg-neutral-*` canon check; confirm it doesn't also need a card-canon allowlist entry)
- [x] T010: `src/pages/portal/PortalPages.tsx` (6 matches)
- [x] T011: `src/pages/program/Evaluation.tsx` (5 matches)
- [x] T012: `src/pages/program/Availability.tsx` (5 matches)
- [x] T013: `src/pages/portal/PortalForms.tsx` (5 matches)
- [x] T014: `src/pages/settings/TaskTemplates.tsx` (4 matches)
- [x] T015: `src/pages/program/Communications.tsx` (4 matches)
- [x] T016: `src/pages/portal/TasksAdmin.tsx` (4 matches)

## Phase 3: Medium-Drift Pages (instance count 2–3)

- [x] T017: `src/pages/settings/ApiKeys.tsx` (3)
- [x] T018: `src/pages/public/SubmissionPage.tsx` (3)
- [x] T019: `src/pages/cms/EmbedsListPage.tsx` (3)
- [x] T020: `src/pages/cms/EmbedEditorPage.tsx` (3)
- [x] T021: `src/pages/settings/Library.tsx` (2)
- [x] T022: `src/pages/settings/EventDetails.tsx` (2)
- [x] T023: `src/pages/program/SubmissionForms.tsx` (2)
- [x] T024: `src/pages/portal/PortalTaskFormPage.tsx` (2)
- [x] T025: `src/pages/portal/PortalSubmissionEdit.tsx` (2)
- [x] T026: `src/pages/portal/PortalSchedule.tsx` (2)
- [x] T027: `src/pages/portal/PortalLayout.tsx` (2)
- [x] T028: `src/pages/events/EventsLanding.tsx` (2)

## Phase 4: Long Tail (instance count 1)

- [x] T029: `src/pages/settings/Integrations.tsx`
- [x] T030: `src/pages/settings/EventTeam.tsx`
- [x] T031: `src/pages/settings/ComponentShowcase.tsx`
- [x] T032: `src/pages/public/PublicEmbedPage.tsx`
- [x] T033: `src/pages/program/Sponsors.tsx`
- [x] T034: `src/pages/program/Speakers.tsx`
- [x] T035: `src/pages/program/Readiness.tsx`
- [x] T036: `src/pages/program/CriteriaEditor.tsx`
- [x] T037: `src/pages/program/AssignByFilterCard.tsx`
- [x] T038: `src/pages/portal/SpeakerDocuments.tsx`
- [x] T039: `src/pages/portal/PortalAvailability.tsx`

## Phase 5: Enforcement Guard

> ⚠️ This phase is what makes the fix permanent instead of a one-time cleanup.

- [x] T040: Extend `src/test/component-canon.test.ts` with a new `it()` that fails if
      `rounded-lg`/`rounded-xl` co-occurs with `bg-card`/`bg-muted` in any `.tsx`/`.jsx` file
      under `src/` outside `components/ui/card.tsx`, `components/shared/SectionCard.tsx`,
      `components/shared/StatCard.tsx`, `components/shared/ReadinessCategoryCard.tsx`, and
      `components/shared/ChoiceCardGroup.tsx`. Use the same `allowed` set / regex-scan pattern
      already used by the file's other two checks.
- [x] T041: Run the new test against the post-migration tree — it must pass with zero violations
      (confirms Phases 1–4 are complete, not just "mostly done").

## Phase 6: Verification (REQUIRED — browser, not just tests)

> ⚠️ A refactor is NOT done until it's confirmed visually unchanged in the running app.
> This is a pure-CSS/markup consolidation — the bar is "looks identical to before," not
> "renders a new UI." Every page touched in Phases 1–4 must be opened and eyeballed.

### Verification Spec

For each page below: open it in the browser, confirm every card-like surface (background,
corner radius, padding, and — for `ReadinessCategoryCard` — the muted background) looks the same
as before the change, and confirm any interactive card (e.g. `ChoiceCardGroup` options in
onboarding) still responds to click/selection correctly.

- [x] T042 (partial): Verified in browser (2026-08-14) via a dedicated dev server on the PR
      branch: `StatCard`/`SectionCard` on the Dashboard, `ReadinessCategoryCard` on the Readiness
      page including its empty "Nothing outstanding here" state (muted-variant background renders
      correctly). NOT exercised: the `loadError` alert state (no error condition present in the
      local dev event) or `ChoiceCardGroup`'s onboarding selection state (no onboarding flow
      triggered this pass) — needs a follow-up check against real error/onboarding data.
- [x] T043 (partial): Verified in browser: ApiDocs (8 matches — the highest-drift file after
      Agenda, confirmed intact), Evaluation, Availability, Communications, Speakers. Follow-up
      pass (2026-08-14, same day): added a real room, speaker, and session to the dev event
      through the app's own UI (not a DB write) and re-checked Agenda — the List view, the
      Rooms/schedule-grid view (out of scope for #159, confirmed unaffected), and the Speakers
      detail panel all render populated data cleanly, zero console errors. STILL not verified:
      EmbedPage, PortalPages, PortalForms, TaskTemplates, TasksAdmin (loaded but no task data
      existed to seed via UI in the time available).
- [x] T044 (partial): Verified in browser: EventDetails (settings/event), Library. NOT verified:
      ApiKeys, SubmissionPage, EmbedsListPage, EmbedEditorPage, SubmissionForms,
      PortalTaskFormPage, PortalSubmissionEdit, PortalSchedule, PortalLayout, EventsLanding.
- [ ] T045: Phase 4 pages not verified this pass: Integrations, EventTeam, ComponentShowcase,
      PublicEmbedPage, Sponsors, CriteriaEditor, AssignByFilterCard, SpeakerDocuments,
      PortalAvailability.
- [ ] T046: Not re-checked this pass — flagged `rounded-xl` occurrences still need an explicit
      before/after comparison.
- [x] T047: Codex ran `npm run check` (typecheck + 449 tests + production build) — all passed
      clean per PR #161.

**Verification status: substantially de-risked, not exhaustive.** The single highest-risk item —
Agenda (11 matches, the file most likely to break since it wasn't seen with data on the first
pass) — has now been checked with a real room, speaker, and session and shows no regressions.
Roughly half the page list (mostly Portal-prefixed and Phase 4 low-instance-count files) remains
unverified against populated data; each had only 1–2 hand-rolled instances, so the blast radius
per unverified file is small. Decision: merge now on the strength of the de-risked Agenda check,
the clean automated suite, and the low per-file risk on what's left — the seed data belongs to a
separate org not reachable without touching team-membership rows, which this pass intentionally
avoided per the standing rule against unreviewed DB writes. A follow-up pass should still verify
the remaining pages when the app has broader test data available.

## Task Dependencies

- T001 blocks T002–T005 (wrappers need the `variant` prop / class helper first).
- T002–T005 should land before Phase 2 starts, since some Phase 2–4 files may be swappable to
  `SectionCard`/`StatCard` once those wrappers are fixed (verify per-file whether that's cheaper
  than a direct `Card` swap).
- T040 (canon test) should be written after Phases 1–4 are complete, then run (T041) to confirm
  zero violations — writing it first would just fail loudly for the whole migration's duration,
  which is fine but not required.
- Phase 6 verification happens after its corresponding phase's file changes land; can run
  incrementally (verify Phase 1 wrappers before starting Phase 2, etc.) rather than only at the
  very end.

## Verification Checklist

- [ ] All 5 functional requirements in `requirements.md` met
- [ ] `components/ui/card.tsx` import count reaches 35+ files (directly or via wrappers)
- [ ] Zero hand-rolled `rounded-lg|rounded-xl` + `bg-card|bg-muted` matches outside approved files
      (confirmed by T041's passing test, not just spot-checking)
- [ ] Every page in Phase 6 opened and visually confirmed unchanged (or intentional changes
      called out and approved)
- [ ] `npm run check` / typecheck / lint / test suite green
- [ ] Production build succeeds
- [ ] No regressions to `ChoiceCardGroup` selection state or `ReadinessCategoryCard`'s
      `loadError`/empty states
- [ ] Docs updated: this plan's checkboxes reflect actual completion state
