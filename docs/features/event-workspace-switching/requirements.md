# Event Workspace Switching — Requirements

**Type:** Feature
**Status:** Implemented — authenticated browser verification pending
**Priority:** High
**Last Updated:** 2026-08-12

## Problem Statement

The schema already supports multiple events (`events` table, everything scoped by `eventId`),
but the app was never wired to let a person actually use more than one. Every one of the 17
program/settings pages resolves "the event" by calling `repo.events.list()` and taking
`events[0]` — whichever event happens to sort first. There is no picker, no per-event URL, and
no way to tell which event you're looking at.

This breaks the moment an organizer runs more than one conference — e.g. AI Engineer running
six events a year across different cities. Creating a second event doesn't give access to it;
it silently competes with the first for the `events[0]` slot, and which one "wins" depends on
insertion order, not user intent. This is also why admin access can appear to break: the page
may be rendering against an event the person didn't mean to open.

Separately, `organizers` (owner/admin) is a single org-wide table — anyone in it can manage
every event. There's no way to grant someone access to just one conference (e.g. a local
co-organizer for AI Engineer NYC who shouldn't see AI Engineer London's submissions), and no UI
exists to manage that org-wide team at all today (`organizers.add`/`remove` are Convex
functions with no page that calls them).

## User Stories

**As an** organizer running multiple events, **I want to** switch between them from a picker
**so that** I always know which event's data I'm looking at and can manage each independently.

**Acceptance Criteria:**
- GIVEN I organize 2+ events WHEN I open the app THEN I land on an event list, not a guessed default
- GIVEN an event is selected WHEN I navigate between program/settings pages THEN the same event stays selected and its slug is visible in the URL
- GIVEN I switch events from the picker WHEN the page reloads THEN the newly selected event's data loads, not the previous one
- GIVEN I share a URL with a teammate WHEN they open it (and have access) THEN they land on the same event, not their own default

**As an** org owner, **I want to** invite someone as a member of a single event **so that** they can manage that conference without seeing my other conferences.

**Acceptance Criteria:**
- GIVEN I'm an org owner/admin WHEN I add someone as a member of Event A only THEN they can access Event A's program/settings pages but not Event B's
- GIVEN someone has no org-level role and no membership on an event WHEN they try to open that event's admin pages THEN they're denied

**As an** org owner, **I want to** manage my org-wide team from a settings page **so that** I don't need CLI access to grant admin/owner roles.

**Acceptance Criteria:**
- GIVEN I'm an owner WHEN I open Organization Settings → Team THEN I see everyone with org-wide access and can add/remove them
- GIVEN I'm an admin (not owner) WHEN I view that page THEN I can see the team but cannot add/remove people (matches existing `organizers.add`/`remove` owner-only rule)

**As an** organizer setting up a new conference in a series, **I want to** duplicate a past event **so that** I don't rebuild the CFP form, tracks, and email templates from scratch.

**Acceptance Criteria:**
- GIVEN an existing event WHEN I duplicate it THEN the new event gets its own name/slug/dates plus copies of its submission forms, tracks, and comms templates
- GIVEN a duplicated event WHEN I check its submissions/speakers/schedule THEN they are empty — only configuration is copied, not instance data

## Functional Requirements

- FR-001: Every organizer-facing route (`/program/*`, `/settings/*` except org-level, `/portals/*`) moves under `/events/:eventSlug/...` and resolves its event from the slug, not from list order
- FR-002: An `EventProvider` context resolves the active event once per route tree and exposes it via `useCurrentEvent()`; no page calls `events.list()` and indexes `[0]` directly again
- FR-003: A switcher in the sidebar shows the current event's name and opens a list of every event the signed-in user has access to (org-wide organizers see all; event members see only their events), plus "New event" and "Manage events"
- FR-004: A new `/events` landing page lists all accessible events as cards (name, dates, status badge) with "New event" and per-card "Duplicate"; this is where a signed-in organizer lands after auth/onboarding instead of an assumed event
- FR-005: A new `event_members` table grants event-scoped `organizer` or `reviewer` access; org-wide `organizers` (owner/admin) continue to have implicit access to every event
- FR-006: A shared `assertEventAccess(ctx, eventId)` Convex helper replaces ad hoc `assertOrganizer()` calls on every event-scoped query/mutation — passes for org owner/admin OR a matching `event_members` row
- FR-007: A new `/settings/organization` page (reached via a dropdown under the org name at the top of the sidebar, above the event switcher) manages the org-wide team: list, invite by email + role, remove — wired to the existing `organizers.list`/`add`/`remove` functions
- FR-008: An `events.duplicate` mutation copies event fields (new name/slug required from the user), `submission_forms`, `tracks`, and `comms_templates` from a source event; does not copy `submissions`, `speakers`, `agenda_items`, or `evaluations`
- FR-009: When creating or duplicating an event, the creator may optionally pull team members from an existing event into the new event's `event_members`

## Non-Functional Requirements

- NFR-001: Event resolution by slug must be a single indexed lookup (`events.by_slug`), not a full collect + filter — this runs on every page load
- NFR-002: Switching events must not require a full page reload for shared chrome (sidebar, account menu) — only the routed content re-fetches
- NFR-003: `assertEventAccess` must fail closed — an error resolving membership denies access, it never falls through to "allow"

## Out of Scope

- Org-level billing, multi-organization tenancy (multiple *organizations*, not just multiple events) — this pass assumes one org running many events, matching the current `organizers` design
- Org branding/white-label theming — no fields for this exist yet
- Subdomain-per-event routing — path-based `/events/:slug/...` is sufficient at this scale
- Migrating existing event-scoped data — there's no production data yet worth migrating; new schema ships clean

## Success Metrics

- Zero remaining `events.list()` + `[0]` patterns in `src/pages/**`
- An org owner can create a second event, switch to it, and see it as empty/independent from the first without any cross-contamination
- A non-org-wide event member can access exactly the events they're a member of and nothing else
