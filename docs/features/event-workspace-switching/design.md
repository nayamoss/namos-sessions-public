# Event Workspace Switching — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

```ts
organizers: defineTable({
  userId: v.string(), email: v.string(),
  role: v.union(v.literal("owner"), v.literal("admin")),
  onboardingCompletedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_userId", ["userId"]),

events: defineTable({
  name: v.string(), slug: v.string(), /* ...fields... */
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]),
```

`organizers` is org-wide today — any row grants access to every event. That's kept as-is for
owner/admin. What's missing is a *narrower* grant: access to one event only.

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| `event_members` | ADD TABLE | — | — | New table, event-scoped access |
| `event_members` | — | `eventId` | `v.id("events")` | — |
| `event_members` | — | `userId` | `v.string()` | Clerk `identity.subject` |
| `event_members` | — | `email` | `v.string()` | Denormalized for the invite list UI |
| `event_members` | — | `role` | `v.union(v.literal("organizer"), v.literal("reviewer"))` | Event-scoped role |
| `event_members` | — | `invitedByUserId` | `v.string()` | Audit trail — who granted this |
| `event_members` | — | `createdAt` | `v.number()` | — |
| `event_members` | INDEX | `by_event` | `["eventId"]` | List members of an event |
| `event_members` | INDEX | `by_userId` | `["userId"]` | "Which events can this person see" |
| `event_members` | INDEX | `by_event_userId` | `["eventId", "userId"]` | Point lookup in `assertEventAccess` |

```ts
event_members: defineTable({
  eventId: v.id("events"),
  userId: v.string(),
  email: v.string(),
  role: v.union(v.literal("organizer"), v.literal("reviewer")),
  invitedByUserId: v.string(),
  createdAt: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_userId", ["userId"])
  .index("by_event_userId", ["eventId", "userId"]),
```

No changes to `organizers` or `events`. `evaluation_assignments` (existing, per-submission
reviewer assignment) is unaffected — it already governs *which submissions* a reviewer sees;
`event_members` governs whether they can open the event's admin surface at all.

### Migration

No data migration needed — no production data exists yet. This ships as new schema; Convex
creates the table on next deploy. Existing `organizers` rows are untouched and continue to
grant all-events access exactly as before.

---

## Backend / API

### Affected Existing Endpoints

Every query/mutation in `convex/events.ts`, `convex/submissions.ts`, `convex/speakers.ts`,
`convex/evaluations.ts`, `convex/agenda.ts`, `convex/forms.ts`, `convex/tags.ts`,
`convex/tasks.ts`, `convex/comms.ts`, `convex/availability.ts`, `convex/emailIntegrations.ts`
currently calls `assertOrganizer(ctx)` and ignores `eventId` for the permission check. Each of
these swaps to `assertEventAccess(ctx, args.eventId)`.

| Method | Path (Convex function) | Change |
|--------|------|--------|
| query | `events.list` | Replace with two functions: `events.listMine` (org organizers see all; event members see their events, deduped) used by the switcher, and keep `events.list` internal-only for admin tooling |
| query | `events.getBySlug` | Swap `assertOrganizer` → `assertEventAccess` once the event is resolved (need the event's `_id` first, so this checks slug lookup, then access, then returns) |
| mutation | `events.save` | Creating a *new* event still requires org-wide `assertOrganizer` (only org owner/admin can spin up new conferences) — editing an existing one uses `assertEventAccess` |
| all others | `*.ts` scoped by `eventId` | Swap `assertOrganizer(ctx)` → `assertEventAccess(ctx, args.eventId)` |

### New Endpoints

| Function | Args | Returns | Notes |
|--------|------|--------------|----------|
| `events.listMine` (query) | `{}` | `Event[]` | Org organizers → all events. Otherwise → events with an `event_members` row for `identity.subject`, deduped. Used by switcher + `/events` landing page. |
| `events.duplicate` (mutation) | `{ sourceEventId: v.id("events"), name: v.string(), slug: v.string(), startDate: v.number(), endDate: v.number(), pullTeamFrom: v.optional(v.boolean()) }` | `v.id("events")` | `assertOrganizer` (org-wide only — duplicating creates a new event). Copies event fields except name/slug/dates (from args) and `status` (always starts `"draft"`); copies all `submission_forms`, `tracks`, `comms_templates` rows for the source event with `eventId` repointed; if `pullTeamFrom`, copies `event_members` rows too. |
| `eventMembers.list` (query) | `{ eventId: v.id("events") }` | `EventMember[]` | `assertEventAccess` |
| `eventMembers.add` (mutation) | `{ eventId: v.id("events"), email: v.string(), role: ... }` | `v.id("event_members")` | Requires event-level `organizer` (or org organizer). Looks up `userId` — if no Clerk account exists yet for that email, stores a pending row keyed by email only and resolves `userId` on first sign-in (same bootstrap shape as `organizers.claimOwner`, adapted) |
| `eventMembers.remove` (mutation) | `{ eventId: v.id("events"), userId: v.string() }` | `void` | Same permission as `add`; cannot remove yourself as the last organizer-role member of an event |
| `organizers.list/add/remove` | *(existing, unchanged)* | — | Now actually called from a UI (`/settings/organization`) |

### Validation & Business Logic

- `assertEventAccess(ctx, eventId)` (new helper in `convex/functions.ts`, alongside existing
  `assertOrganizer`): resolves identity, checks `organizers.by_userId` first (fast path, org-wide
  access) — if found, pass. Otherwise checks `event_members.by_event_userId` — if a row exists,
  pass. Otherwise throw `Forbidden`. Fails closed: any lookup error throws, never silently allows.
- `events.duplicate` validates the new slug is unique (same rule as `events.save`) before writing
  anything, and validates `startDate < endDate` via the existing `assertEventSchedule`.
- `eventMembers.add` lower-cases and trims email (matches `organizers.add`'s existing pattern).

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/App.tsx` | Every organizer route under `RequireOnboarding` moves from e.g. `/program/abstracts` to `/events/:eventSlug/program/abstracts`; wrap that route group in a new `EventProvider`; add `/events` (landing) and `/settings/organization` as top-level routes (not event-scoped) |
| `src/components/AppLayout.tsx` | Nav item `to` values gain the `:eventSlug` prefix (built from `useCurrentEvent()`); add `<EventSwitcher />` above `navSections`, below a new `<OrgMenu />` at the very top |
| `src/components/AccountMenu.tsx` | Add "Organization settings" link (visible only to org-wide organizers) alongside existing "Event settings" |
| All 17 pages currently doing `repo.events.list()` + `[0]` | Replace with `const { event } = useCurrentEvent()`; delete the local `events`/`event` state and the `if (!event) return` fallback becomes a guard the provider already handles upstream |

### New Components

**`EventProvider`** (`src/components/EventContext.tsx`)
- Props: `{ children: ReactNode }` (reads `:eventSlug` from the route itself via `useParams`)
- Location: wraps the route group in `App.tsx` that covers `/events/:eventSlug/*`
- Elements: none rendered directly — on `loading` renders the existing full-page `"Loading…"`
  fallback; on `not-found`/`forbidden` renders a full-page message ("You don't have access to
  this event" / "Event not found") with a link back to `/events`
- Behavior: resolves `events.getBySlug(eventSlug)`, exposes `{ event, loading, error }` via
  `useCurrentEvent()` hook; re-resolves when `:eventSlug` changes (event switch)
- Data: `repo.events.getBySlug`

**`EventSwitcher`** (`src/components/EventSwitcher.tsx`)
- Props: `{ collapsed: boolean }` (sidebar collapse state, matches existing `Navigation` pattern)
- Location: `AppLayout` sidebar, directly below `OrgMenu`, above the nav sections
- Elements:
  - Trigger button: current event name (truncated), status dot (draft/published/archived color),
    chevron-down icon; collapsed state shows just an avatar-style initial badge
  - Dropdown (Radix `DropdownMenu`, matches `AccountMenu`'s `contentClass`/no-border styling):
    list of accessible events (name + status badge each), current one checkmarked
    then, in a separate group (whitespace-separated, no divider line): "New event" (opens
    `/events?new=1`), "Manage events" (→ `/events`)
  - Empty state (zero accessible events — shouldn't happen post-onboarding, but defensive):
    "No events yet" + "Create your first event" CTA
- Behavior: clicking an event navigates to the same sub-path under the new event's slug (e.g.
  from `/events/nyc/program/abstracts` → `/events/london/program/abstracts`), falling back to
  `/events/:slug/dashboard` if the current sub-path doesn't resolve for the target event
- Data: `repo.events.listMine`

**`OrgMenu`** (`src/components/OrgMenu.tsx`)
- Props: `{ collapsed: boolean }`
- Location: `AppLayout` sidebar, top, above `EventSwitcher`
- Elements: org name/logo placeholder (text label — no org branding fields exist), chevron;
  dropdown: "Organization settings", "Team" (both route to `/settings/organization`, Team opens
  the Team tab) — visible only when `organizers.getMine()` returns a row; hidden entirely for
  event-only members
- Behavior: standard dropdown, same styling primitives as `AccountMenu`
- Data: `repo.organizers.getMine`

**`EventsLanding`** (`src/pages/events/EventsLanding.tsx`)
- Route: `/events`
- Location: full page, replaces the old assumption of landing straight on `/dashboard`
- Elements:
  - `PageHeader`: "Events" title only (per layout rules — no buttons in the header)
  - Toolbar row below header: status filter pills (All / Draft / Published / Archived) left,
    "New event" primary button right
  - Grid of event cards (`bg-neutral-100`, `rounded-[12px]`, no border/shadow): name, date
    range, status badge, "Open" (primary action) and "Duplicate" (secondary) buttons per card
  - Empty state (zero events, first-ever visit): icon + "No events yet" + "Create your first
    event" CTA button, inside a card per layout rules
  - Loading state: 3 skeleton cards
  - Error state: inline red text + retry
- Behavior: "Open" navigates to `/events/:slug/dashboard`; "New event" opens a `Sheet` (slide
  from right, per layout rules — never a modal for this) with the event-creation form (reuses
  `EventDetails.tsx`'s field set); "Duplicate" opens a `Sheet` pre-filled from the source event
  asking only for new name/slug/dates + a "copy team from this event" checkbox
- Data: `repo.events.listMine`, `repo.events.save` (create), `repo.events.duplicate`

**`OrganizationSettings`** (`src/pages/settings/OrganizationSettings.tsx`)
- Route: `/settings/organization` (not event-scoped — outside `EventProvider`)
- Location: full page, own left sub-nav tab if a settings shell exists, otherwise single page
  with a "Team" section
- Elements:
  - `PageHeader`: "Organization settings"
  - Team section: list of organizers (email, role badge, "Remove" button per row — hidden for
    self and hidden entirely if caller is `admin` not `owner`, per existing `organizers.remove`
    rule), "Invite" button (right-aligned toolbar) opens a `Sheet`: email input, role select
    (owner/admin), submit
  - Empty/loading/error states matching the same pattern as `EventsLanding`
- Behavior: "Invite" calls `organizers.add`; "Remove" calls `organizers.remove` with a `Dialog`
  confirmation (irreversible-ish — destructive action per layout rules)
- Data: `repo.organizers.list`, `repo.organizers.add`, `repo.organizers.remove`

**`EventTeamSettings`** (`src/pages/settings/EventTeam.tsx`)
- Route: `/events/:eventSlug/settings/team` (event-scoped — inside `EventProvider`), added to
  the existing "Configure" nav section in `AppLayout`
- Elements: same list/invite/remove shape as `OrganizationSettings` but backed by
  `event_members` and roles `organizer`/`reviewer`; invite `Sheet` includes a secondary "pull
  from another event" tab (select a past event → checklist of its members → add selected)
- Behavior: mirrors `OrganizationSettings`; "pull from another event" calls `eventMembers.list`
  for the source event then `eventMembers.add` per selected row
- Data: `repo.eventMembers.list/add/remove`, `repo.events.listMine` (for the "pull from" source picker)

---

## State / Data Flow

Today: each page independently calls `repo.events.list()`, takes `[0]`, then fetches its own
scoped data. No shared source of truth for "which event."

After: `:eventSlug` in the URL is the single source of truth. `EventProvider` resolves it once
per route-tree mount (and on slug change) via `events.getBySlug`, exposing `{ event, loading,
error }` through context. Every page under the provider reads `useCurrentEvent()` instead of
resolving its own event, then fetches its own data scoped to `event.id` as it already does
today (`repo.submissions.list({ eventId })` etc. — that part is unchanged, since every table
already has `eventId`). Switching events via `EventSwitcher` is a route navigation, which
naturally re-triggers `EventProvider`'s resolution and every child page's data fetch — no manual
cache invalidation needed.

`EventSwitcher` and `OrgMenu` pull from `events.listMine` / `organizers.getMine` independently
of the current route's event — they need to know what's *available*, not just what's active.

---

## Auth / Permissions

- Org-wide `organizers` (owner/admin) — unchanged, still implicit access to every event, still
  the only ones who can create/duplicate new events (`assertOrganizer` on `events.save`/`events.duplicate`).
- Event-scoped `event_members` (organizer/reviewer) — new, grants access to exactly one event's
  admin surface. An event-role `organizer` can manage that event's team (`eventMembers.add/remove`
  for their event only); a `reviewer` gets read access + whatever `evaluation_assignments`
  already scopes them to (unchanged).
- `assertEventAccess` is the single gate every event-scoped Convex function calls — no page or
  function re-implements the check inline, matching the existing repo convention (`assertOrganizer`
  is already centralized in `convex/functions.ts`; this follows the same shape).
- `/settings/organization` and `organizers.*` stay org-wide-only — an event member never sees
  this page (nav item hidden per `OrgMenu`'s visibility rule above), and the backend still
  enforces it independent of what the UI hides.

---

## Edge Cases & Error States

- **Bad/unknown `:eventSlug` in URL** — `EventProvider` shows a full-page "Event not found, or
  you don't have access" with a link to `/events`, never a blank page or a silent fallback to
  some other event.
- **Zero accessible events** (brand-new org member, or org owner before creating anything) —
  `/events` shows the empty state; nav doesn't render event-scoped items until an event exists.
- **Switching to an event whose current sub-path doesn't apply** (e.g. deep-linked to a
  settings tab the target event doesn't have) — falls back to that event's `/dashboard`.
- **Duplicate slug on create/duplicate** — inline field error under the slug input, matches
  existing `events.save` "That event slug is already in use" message.
- **`eventMembers.add` for an email with no Clerk account yet** — stored pending, resolved on
  first sign-in; list UI shows a "pending" badge instead of a name until resolved.
- **Last organizer-role member removed from an event** (and no org-wide organizer exists) —
  blocked with an inline error, same shape as `organizers.remove`'s self-removal guard.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Route shape | Path-based `/events/:eventSlug/...` | Matches Sessionize/PaperCall's per-event scoping; shareable/refresh-safe; avoids subdomain infra this app doesn't need at its scale |
| Org-wide vs event-scoped access | Two tables (`organizers` unchanged + new `event_members`), one merged check | Additive — org owners keep working exactly as today; event-scoped is a narrower *grant*, not a replacement, so no migration risk to existing access |
| Duplicate scope | Config only (forms, tracks, comms templates) — never instance data | Matches Sessionize's and Accelevents' duplicate/template behavior (researched this session); organizers want a clean instance, not last year's submissions |
| Active-event source of truth | URL param via context, not localStorage/global state | Survives refresh, is shareable, and is the standard React Router multi-tenant pattern |

## Dependencies

**Requires:** none — builds on existing `events`/`organizers` schema, no other in-flight feature blocks this.
**Enables:** event-scoped reviewer assignment UI improvements, org-level branding (future), per-event billing (future, out of scope now).

## Risks & Mitigations

- **Risk:** Touching 17 pages' event-resolution logic in one pass is a large, error-prone diff.
  **Mitigation:** `EventProvider` centralizes the resolution so each page's change is a
  mechanical one-line swap (`repo.events.list()[0]` → `useCurrentEvent().event`); plan.md phases
  the provider/routing first, then sweeps pages as a repeatable task.
- **Risk:** Silent access regression if `assertEventAccess` has a bug that's too permissive.
  **Mitigation:** fail-closed by construction (throws on any lookup error), and existing
  `assertOrganizer` call sites are swapped one file at a time with the same test pattern already
  used for `organizers`, not rewritten from scratch.
