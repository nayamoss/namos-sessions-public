# Kill My SaaS Brief — Coverage Requirements

**Type:** Program (umbrella over nine feature packages)
**Status:** Planned — nothing in this package is implemented
**Priority:** High
**Last Updated:** 2026-08-17
**Branch at time of planning:** `main`, clean (`git status --short --branch` → `## main...origin/main`, no changes)

## Problem Statement

Namos Sessions has most of the machinery the "Kill My SaaS" brief asks for, built over roughly
seventy feature packages. What it does not have is a **seeded event that proves it**. A judge
opening the product today lands on an agent composer with a collapsible 288px rail, then has to
discover the CFP builder, the reviewer queue, the conflict detector, and the embed editor on their
own. The competing entry (Greenroom) has less machinery and a better demo; it wins on legibility,
not capability.

Two things are therefore in scope, and they are different kinds of work:

1. **Real gaps.** Portal resource/wiki pages and the Accelevents export do not exist in source at
   all. Organizer visibility into speaker-uploaded documents does not exist. Automatic reminders do
   not exist. These need building.
2. **Demonstration gaps.** Conditional CFP logic, category routing, weighted rubrics, multi-round
   review, and blind review are all implemented and tested, but the seeded demo event exercises
   none of them. These need seeding and surfacing, not rebuilding.

Conflating the two is the main risk in this program. Rebuilding `convex/categoryRouting.ts` because
the demo does not show routing would be waste. The traceability matrix in `design.md` exists to
keep that distinction enforced.

## Scope: the nine brief requirements

| # | Brief requirement | Owning feature package |
|---|---|---|
| 1 | Custom CFP forms with conditional logic and category-based routing | `cfp-conditional-routing/` |
| 2 | Speaker self-service portal — bio, headshot, slides, supporting documents | `speaker-portal-readiness/` |
| 3 | Automated templated communications, reminders, per-speaker calendar invites | `speaker-communications-delivery/` |
| 4 | Submission evaluation and scoring, multiple review rounds, optional AI assist | `review-rounds-scoring/` |
| 5 | Drag-and-drop agenda with conflict detection; list/day/week/track/room views | `agenda-scheduling/` (addendum) |
| 6 | Real-time organizer dashboard for outstanding onboarding tasks | `demo-first-organizer-experience/` |
| 7 | Native one-way Accelevents export of accepted speakers and published sessions | `accelevents-integration/` (reconciliation) |
| 8 | Speaker-portal resource/wiki pages with safe HTML embed support | `portal-resource-pages/` |
| 9 | Mobile-friendly, embeddable public speaker gallery and schedule itinerary | `public-embeds/` (addendum) |

## User Stories

**As a competition judge** I want the organizer landing page to state the program's actual
condition in numbers **so that** I can see every required workflow without being told where to look.

**As a competition judge** I want every number on that page to link to the record that produces it
**so that** I can verify a claim in one click instead of trusting a dashboard.

**As an event organizer** I want the demo event to behave like a real event mid-cycle — some
submissions routed, some reviewed, some scheduled, some speakers behind on tasks — **so that** the
product's operating surfaces have something to operate on.

**As an event organizer** I want to push accepted speakers and published sessions to Accelevents
once, safely, without re-keying them **so that** program data lives in one place.

**As a speaker** I want a resources page in my portal with the event's travel, AV, and deadline
information **so that** I stop emailing the organizer for it.

### Acceptance Criteria

- GIVEN a freshly seeded demo event WHEN a judge opens the organizer landing page THEN the first
  screenful states submission counts by status, review completion, scheduled-vs-accepted counts, and
  outstanding speaker tasks, with each figure linking to its owning record list.
- GIVEN the seeded CFP WHEN a submitter selects a session format of `Workshop` THEN at least one
  additional field appears that was not previously rendered, and the submitted record shows the
  routing outcome that rule produced.
- GIVEN the seeded evaluation plan WHEN an organizer opens the evaluation surface THEN two rounds
  exist, weighted criteria are configured, reviewer assignments exist for both rounds, and reviewer
  progress shows at least one reviewer who is behind.
- GIVEN a seeded speaker WHEN an organizer opens that speaker's record THEN the organizer can see
  which documents that speaker has uploaded, without impersonating them.
- GIVEN a seeded speaker portal session WHEN the speaker opens Resources THEN at least one
  published resource page renders sanitized rich content including one allowlisted embed.
- GIVEN an event with accepted speakers and published sessions and no Accelevents credentials WHEN
  an organizer opens Integrations THEN the Accelevents card is present, states `Not connected`, and
  no sync can be started.
- GIVEN a disposable Accelevents event and real credentials WHEN a sync runs THEN a speaker record
  and a session record exist remotely and the session is associated with that speaker, and this is
  recorded as evidence before the integration is called complete.
- GIVEN the public speaker gallery and schedule itinerary embeds WHEN loaded at a 390px viewport
  THEN both render without horizontal scroll and remain operable.

## Functional Requirements

- FR-001: Every claim in `design.md`'s traceability matrix carries one of four distinct statuses —
  `implemented in source`, `visible in the hosted demo`, `tested end to end`, `planned only` — and
  they are never merged. A row can be implemented and invisible; that is the normal case here.
- FR-002: No existing architecture is replaced. Convex storage for speaker files, Clerk-scoped
  authorization via `convex/functions.ts` guards, event/organization ownership boundaries, and the
  existing form/evaluation/agenda/embed data models are preserved.
- FR-003: No credential, API key, domain, admin user id, or environment-specific value is
  hardcoded. Every new secret is named in `.env.example` with a placeholder.
- FR-004: The Accelevents scope stays one-way and narrow: accepted speakers, and accepted +
  published + scheduled sessions. No ticketing, attendee import, OAuth, webhooks, remote deletion,
  or two-way sync.
- FR-005: AI assistance in evaluation remains optional, clearly labeled as a suggestion, never
  produces a final decision, and always has an explicit human-approval step. If it cannot meet that
  bar it stays an honest, disabled stub rather than being shipped for checkbox coverage.
- FR-006: Resource/wiki pages store rich HTML and render it through a sanitizer with an explicit
  allowlist. Arbitrary script execution is never permitted, in the portal or in any embed.
- FR-007: Shared layout and visual styling are not changed except where a required user-facing flow
  demands it. The organizer landing page is the one deliberate exception and is scoped in
  `demo-first-organizer-experience/`.
- FR-008: The seeded demo event is re-runnable and idempotent, consistent with the existing
  `convex/seed.ts:demo` contract, and every seeded email address remains `@seed.invalid`.

## Non-Functional Requirements

- NFR-001 (security): No new surface may widen an existing authorization boundary. Organizer
  visibility into speaker documents is added by extending the guard, not by removing it.
- NFR-002 (tenancy): Every new table is `eventId`-scoped and inherits its tenant through `events`,
  matching the note at `convex/schema.ts:154`.
- NFR-003 (honesty): A feature that is not verified in a browser is not reported as working. The
  `Live/browser evidence` column starts at `NOT VERIFIED` for every row and is only filled in by an
  actual observed run.
- NFR-004 (demo scale): The seeded event is sized to be read by a human. 500 seeded submissions is a
  pagination fixture, not a demo; the judge-facing figures must be comprehensible at a glance.
- NFR-005 (accessibility): Every new interactive surface is keyboard-reachable and announced. The
  agenda's existing `AgendaMoveControl` keyboard fallback is the precedent — drag-and-drop is never
  the only path.

## Out of Scope

- Rebuilding conditional logic, routing, scorecards, blind review, conflict detection, embeds, or
  calendar-invite generation. All of these exist and are tested; see the matrix.
- Two-way Accelevents sync, Accelevents OAuth, attendee/ticketing data, remote deletion.
- Replacing the Operations Agent. It stays; it stops being the landing page's headline.
- A redesign of the design system, sidebar, or card surfaces.
- Any change to the `-main` container folder or its git state.

## Success Metrics

- A judge can walk all nine brief requirements from the organizer landing page without being given
  a URL list.
- Every row of the final status table in `plan.md` reads `PASS` with browser evidence attached, or
  carries an explicit, owned reason for `PARTIAL`/`MISSING`/`BLOCKED`.
- One real Accelevents disposable-event run exists as evidence, with a speaker-to-session
  association confirmed remotely.
- Zero secrets in the browser bundle, Convex public queries, logs, or repository history.
</content>
</invoke>
