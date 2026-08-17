# Admin role tiers and event-team invitations

## Problem

The application previously used “organizer” for two different scopes. A row in `organizers`
granted application-wide administration, while an `event_members.role === "organizer"` row granted
access to one event. Event creation nevertheless required the global row, so a normal customer
could not create and own a conference. Event reviewers also inherited several event-management
write paths through the broad `assertEventAccess` helper.

The product needs three additive tiers. A Clerk identity may hold any combination of them at the
same time; none is a single exclusive user role.

## Role model

### Tier 1: site admin

- Scope: the whole Namos Sessions SaaS and every event.
- Storage: `organizers`, with role `owner` or `admin`.
- `owner` is the one-time bootstrap and can manage other site-admin rows. `admin` has the same
  application/event data access but cannot grant or revoke site-admin access.
- Site admins retain implicit access to every event through `isOrganizer`, even when they do not
  have an `event_members` row.
- A site admin may also create an event or be explicitly invited to one. The resulting
  `event_members` row is additive and does not replace the global role.

### Tier 2: conference organizer

- Scope: only events the person owns or manages.
- Storage: `event_members` with role `organizer`.
- Any authenticated Clerk user with an email may create an event. Event creation MUST insert the
  creator into `event_members` as an organizer in the same Convex transaction.
- Event duplication and event-team copying require organizer access to the source event. The
  duplicating identity becomes an organizer on the new event.
- A conference organizer MUST NOT need a row in the global `organizers` table.
- Conference organizers can manage event configuration, program data, speakers, submissions,
  schedules, communications, sponsors, tasks, email integration, and event teammates for their
  own event only.

### Tier 3: event team member

- Scope: one event per `event_members` row.
- Storage: `event_members` with role `organizer` for a managing teammate or `reviewer` for the
  existing narrower review role.
- An organizer teammate has the same event-management capabilities as the event creator, but no
  access to other events unless separately added there.
- A reviewer can use assignment-scoped review functions. A reviewer MUST NOT gain general event
  management merely because an event-membership row exists.
- One identity may be a reviewer on one event, an organizer on another, and a site admin globally.

## Functional requirements

- **FR-001:** `organizers.claimOwner` succeeds only when `organizers` is empty and creates one
  global owner row for the authenticated Clerk identity.
- **FR-002:** Global owner/admin checks use `organizers`; event organizer checks use
  `event_members`. No environment variable or email allowlist represents a role.
- **FR-003:** Any authenticated Clerk identity with an email can create an event and becomes that
  event's explicit organizer atomically.
- **FR-004:** Event-management writes require site-admin access or an `event_members` organizer
  row for that event. Exact assignment/identity-scoped reviewer and speaker operations remain
  available without a global role.
- **FR-005:** An event organizer can invite a teammate by normalized email and choose organizer
  or reviewer access.
- **FR-006:** Each event supports at most `EVENT_TEAM_MEMBER_LIMIT` explicit member rows. The
  configurable default is 8 and includes the event creator; implicit site admins do not consume
  a seat unless explicitly added.
- **FR-007:** The cap is enforced inside the Convex mutation transaction so concurrent invites
  cannot exceed it. Re-sending an existing pending invite does not consume another seat.
- **FR-008:** A new invite creates `event_members.userId = "pending:<normalized email>"` before
  any external API call. A provider outage must not lose the pending access grant.
- **FR-009:** If the email already belongs to a Clerk user, the row is activated immediately with
  that Clerk user ID. Otherwise the backend creates a Clerk application invitation with event ID
  and role metadata.
- **FR-010:** The application sends one branded invitation email through `deliverEventEmail`,
  using the event integration or the existing `RESEND_*` fallback. Clerk's own email notification
  is disabled to prevent duplicate emails; its invitation URL is placed in the branded email.
- **FR-011:** Email or Clerk failures leave the row pending and return a visible warning. The UI
  distinguishes active, pending/sent, and pending/email-failed states.
- **FR-012:** On authenticated app startup, exact normalized-email matches replace each
  `pending:` marker with the real Clerk subject. Email matching continues to grant only the exact
  event scope while that best-effort upgrade runs.
- **FR-013:** The Event Team UI displays seats used and the limit, disables new invitations at
  capacity, preserves the existing styled app dropdown, and keeps actions in the toolbar/body
  rather than the page title row.
- **FR-014:** A pending or active event member can be removed. The final explicit organizer for an
  event cannot be removed.
- **FR-015:** Removing a pending invitation MUST revoke its stored Clerk application invitation
  before deleting the `event_members` row, so the previously issued Clerk ticket stops working.
- **FR-016:** An organizer can resend a pending invitation entirely in-app. Resend revokes the
  prior Clerk invitation, creates a fresh Clerk invitation and URL, sends the branded message via
  `deliverEventEmail`, and updates the same event-scoped member row without consuming another seat.
- **FR-017:** The Event Team UI exposes pending/accepted status plus resend and revoke/remove
  controls. No invitation lifecycle operation requires the Clerk Dashboard.

## Acceptance scenarios

1. Given no site owner exists, the first signed-in user can claim site owner. A second user cannot.
2. Given a site owner already exists, a new customer can complete onboarding, create a conference,
   and manage it without a global `organizers` row.
3. Given an event organizer with fewer than 8 explicit members, inviting a new email creates a
   pending row, a Clerk invitation, and one branded email.
4. Given an invited email that already has a Clerk account, inviting it creates/updates an active
   member row with the existing Clerk subject and sends a sign-in link.
5. Given a pending invitation, signing in with that exact email upgrades the pending row and shows
   the event in `events.listMine`.
6. Given 8 explicit members, another new invite is rejected server-side and the UI shows the team
   as full.
7. Given a reviewer membership, event-management mutations are forbidden while the reviewer's own
   assigned evaluation queue and score submission continue to work.
8. Given a pending invitation, resending it revokes the old Clerk ticket, stores a new Clerk
   invitation ID, and sends the fresh link without adding an event-team row.
9. Given a pending invitation, deleting it revokes the Clerk invitation before removing the row;
   the old link is unusable and the email can no longer claim event access.
