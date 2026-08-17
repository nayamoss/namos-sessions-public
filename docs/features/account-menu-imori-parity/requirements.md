# Account Menu — Imori Parity — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-17

## Problem Statement
The account dropdown (`src/components/AccountMenu.tsx`) only exposes namos-specific
navigation (Event settings, Speaker portal, Back to admin mode, Profile settings) plus a theme
toggle and sign out. Imori's equivalent menu (`components/dashboard/Sidebar.tsx`) additionally
surfaces What's New, Take a tour, Feedback, and Shortcuts — all of which help a new or returning
user orient themselves and get unstuck without opening a support channel. Naya wants this app's
menu to match Imori's visually and functionally, while keeping the namos-specific items it
already has (they don't exist in Imori and must not be dropped).

## User Stories
**As an** organizer **I want to** see product updates from an account menu link **so that** I
know what changed without someone telling me.

**Acceptance Criteria:**
- GIVEN I open the account menu WHEN I click "What's new" THEN I land on a changelog page listing published updates, newest first.

**As a** new organizer **I want to** replay the product tour from the account menu **so that** I
can re-orient myself after skipping onboarding the first time.

**Acceptance Criteria:**
- GIVEN I click "Take a tour" WHEN the tour starts THEN a spotlight overlay walks me through the key areas of the dashboard with Back/Next controls, dismissible with Escape or by clicking outside.

**As an** organizer **I want to** send quick feedback without leaving the app **so that** friction is minimal enough that I actually do it.

**Acceptance Criteria:**
- GIVEN I click "Feedback" WHEN I pick a rating and optionally type a note and submit THEN it's persisted and I see a confirmation, with no dead endpoint (Imori's own `/api/feedback` 404s in production — this port must not repeat that).

**As an** organizer **I want to** open the existing shortcuts reference from the account menu **so that** I don't have to remember the `?` key works.

**Acceptance Criteria:**
- GIVEN I click "Shortcuts" WHEN the menu closes THEN the existing `GlobalKeyboardShortcuts` help dialog opens — same dialog the `?` key already opens, not a second implementation.

## Functional Requirements
- FR-001: Account menu (expanded and collapsed sidebar states) gains four new items in this order: What's new, Take a tour, Feedback, Shortcuts — positioned above the existing "System" theme toggle, matching Imori's ordering.
- FR-002: Existing namos-specific items (Event settings / Speaker settings, Speaker portal, Back to admin mode, Profile settings) are preserved, unchanged in behavior.
- FR-003: "What's new" links to a new `/updates` route (public, doesn't require an event context) rendering published changelog entries from a new Convex table.
- FR-004: "Take a tour" triggers a spotlight-overlay tour (ported from Imori's hand-rolled overlay, not a third-party library) over `data-tour`-tagged elements added to this app's existing shell (sidebar nav items, main content areas).
- FR-005: "Feedback" opens a modal with a 4-option rating (Love it / Good / Okay / Needs work) and an optional free-text field, submitting to a new Convex mutation — this app has no working feedback backend today and none should be assumed from Imori (its own is dead).
- FR-006: "Shortcuts" opens the existing `GlobalKeyboardShortcuts` dialog via the same custom-event pattern Imori uses (`window.dispatchEvent(new Event(...))`), not a rebuilt dialog — this app's shortcuts dialog is already feature-complete for its own key bindings.
- FR-007: Tour completion state persists client-side only (localStorage via Zustand `persist`, matching Imori) — no server round-trip, single browser only, matching Imori's own behavior exactly.

## Non-Functional Requirements
- NFR-001: New Zustand dependency (`zustand`) is scoped to the tour store only — it is not to be adopted as a general state pattern elsewhere in this app, matching how Imori itself treats it (installed but used in exactly one store).
- NFR-002: Feedback submissions must not be publicly readable — only admin/organizer role via existing role guard pattern (see global CLAUDE.md Admin/Role Authorization rule) if any listing UI is ever added; for this scope, write-only from the client is sufficient.

## Out of Scope
- Rebuilding the shortcuts reference dialog or making shortcuts rebindable (Imori's version is rebindable per-user via Convex; this app's existing dialog is read-only and that stays as-is).
- An authoring UI for changelog entries — entries are added directly via Convex dashboard/mutation call for now, same as Imori has no authoring UI in the account-menu-adjacent code.
- Routing feedback to Slack/email/a ticketing system (Imori's own attempt at this, via "Takumi", is unrelated infra not present in this app).
- Onboarding welcome modal (Imori's `onboarding-modal.tsx`) — this app has its own onboarding flow already; only the tour-replay mechanism is in scope, not a new first-run modal.

## Success Metrics
- All 4 new menu items are clickable and produce the described result in both expanded and collapsed sidebar states.
- Feedback submissions land in Convex and are visible via `npx convex dashboard`.
