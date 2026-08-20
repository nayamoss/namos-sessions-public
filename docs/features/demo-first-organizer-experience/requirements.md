# Demo-First Organizer Experience and Requirement Walkthrough — Requirements

**Type:** Improvement (landing surface) + seeding
**Status:** Planned — not implemented
**Priority:** Highest judge-visible value per unit of work (brief requirement 6)
**Last Updated:** 2026-08-17
**Related packages:** `dashboard/`, `dashboard-composer-voice/`, `readiness-operations/`,
`agent-native-operations/`, `speaker-operations/`, `app-shell-consistency/`

## Problem Statement

Namos derives everything a program dashboard needs and then puts it somewhere a judge will not
look. `src/pages/dashboard/DashboardHome.tsx` reactively subscribes to submissions, agenda,
speakers, tasks, comms, and forms and computes `awaitingDecision`, `unscheduledAccepted`,
`profileIncomplete`, and `needsAttention`, each with a deep link into the record that produces it.
All of that lives in a `w-72` right rail (`DashboardHome.tsx:479`) that:

- auto-collapses at ≤1024px via a `matchMedia` listener (`:170-183`),
- remembers a collapsed preference in `localStorage`,
- has four independently collapsible sections, each also remembered.

The centre column — the page's whole visual weight — is an agent composer whose empty state reads
"Good morning / What should we work on?" with three suggestion chips.

So the first thing a judge sees is a chat box, and the operating state of the event is behind a
panel that may legitimately be closed. `Readiness`, which is the single best page in the product
for this requirement, is not even in the quick-access grid (`:291-298`).

There is a second problem, and it is one of honesty rather than layout. The code itself documents a
still-unresolved reactive-transport defect (`DashboardHome.tsx:388-397`, issues #211/#217): the
socket drops roughly every 60 seconds and heavy subscription sets can stay unresolved indefinitely.
The page already handles this carefully — it distinguishes `undefined` (not yet known) from `[]`
(genuinely empty) because collapsing them once made an event with 529 submissions render "No
submissions yet". But nothing on screen tells the viewer that the numbers are provisional. Claiming
"real-time" while a subscription is silently stalled is the kind of thing this program is
specifically supposed to avoid.

## User Stories

**As a judge** I want the first screen to tell me what this product does and what state this event
is in **so that** I do not have to explore to find out.

**As a judge** I want every number to be clickable **so that** I can verify a claim rather than
trust a dashboard.

**As an event organizer** I want to open the product and immediately see what needs my attention
**so that** the dashboard is a place to work, not a place to type.

**As an event organizer** I want to know when the figures were last confirmed **so that** a stalled
connection cannot masquerade as a quiet event.

**As an existing user of the agent** I want the composer to still be there **so that** this change
takes nothing away.

### Acceptance Criteria

- GIVEN a seeded event WHEN an organizer loads the landing page at 1280px THEN the first screenful
  states submissions by status, review completion, scheduled-vs-accepted sessions, and outstanding
  speaker tasks.
- GIVEN the same page at 1024px and at 768px THEN the same figures remain visible without expanding
  a panel.
- GIVEN any figure WHEN it is activated THEN the browser lands on the owning record list, filtered
  to exactly that set.
- GIVEN a figure with a value of zero WHEN the underlying data has resolved THEN it renders as a
  settled zero, distinguishable from an unresolved value.
- GIVEN an unresolved subscription WHEN the page renders THEN the affected figures state that they
  are not yet known rather than asserting zero.
- GIVEN resolved data WHEN the page renders THEN an "as of" indicator states when the figures were
  last confirmed.
- GIVEN a task completed in a second tab WHEN the organizer returns THEN the figure updates without
  a manual reload — or, if the known transport defect prevents it, the stale indicator makes that
  visible.
- GIVEN a brand-new event with no CFP WHEN the page loads THEN the first-run path still leads with
  the three setup steps rather than a wall of zeroes.
- GIVEN the agent composer WHEN this change ships THEN it is still present, still usable, and still
  reachable by the same keyboard shortcuts.

## Functional Requirements

- FR-001: Add a program-state header above the composer in `DashboardHome`. It is not collapsible
  and does not auto-hide at any supported viewport width.
- FR-002: Every figure is a link to the filtered owning list, reusing the existing `?view=` and
  status-filter conventions.
- FR-003: Extract the derivation into `src/lib/program-state.ts` as a pure function, unit-tested
  independently of the component. `DashboardHome` currently computes it inline.
- FR-004: Preserve the existing `undefined` vs `[]` distinction. Never render an unresolved query
  as zero.
- FR-005: Add an "as of" indicator and a manual refresh affordance.
- FR-006: Add `Readiness` to quick access.
- FR-007: Keep the composer, its dictation and voice controls, the run history, and the rail. The
  rail becomes secondary, not removed.
- FR-008: Preserve the first-run path (`cfpCount === 0 && !dataPending` → setup steps).
- FR-009: Produce a requirement-by-requirement walkthrough document that maps each of the brief's
  nine requirements to the exact click path from this page.

## Non-Functional Requirements

- NFR-001 (no design-system change): No change to `AppLayout`, the sidebar, card surfaces, the
  colour system, or spacing scale. No borders, no dividers, no gradients, no shadows. The header is
  built from existing `Card` surfaces and existing spacing.
- NFR-002 (no new queries): The header consumes the six subscriptions `DashboardHome` already makes.
  It must not add a seventh.
- NFR-003 (performance): The derivation stays memoized on the same dependency arrays. The shared
  `EMPTY` constant that prevents per-render identity churn (`DashboardHome.tsx:24-26`) stays.
- NFR-004 (honesty): The word "real-time" is not used in UI copy unless Phase 0.3 measurement
  supports it.
- NFR-005 (accessibility): Figures are links or buttons with accessible names that include both the
  number and its meaning ("24 submissions awaiting decision"), not a bare numeral.
- NFR-006 (mobile): At 768px the header stacks; it does not scroll horizontally and does not
  collapse behind a control.

## Out of Scope

- Removing or relocating the agent composer.
- A new analytics or charting surface — `EventAnalytics` already exists at
  `/events/:slug/analytics`.
- Changing the sidebar, navigation structure, or event switcher.
- Fixing the reactive-transport defect (#211/#217). This package **measures and discloses** it; the
  fix is separate work.
- Any change to the marketing site or onboarding wizard.

## Success Metrics

- A judge names four true facts about the event's state within 15 seconds of load.
- Every figure reaches its owning record list in one click.
- Zero instances of an unresolved subscription rendering as a confident zero.
- The walkthrough document maps all nine brief requirements to click paths from this one page.
</content>
