# Multi-Tenant Organizations — Requirements

## Problem

Sessionboard has no tenant boundary. There is no `organizations` table. A single global
`organizers` table acts as a deployment-wide ACL, and holding a row in it grants implicit
access to **every event in the database**.

This was deliberate and is documented as such (`README.md:187`,
`docs/features/public-events-api/design.md:284`, `convex/functions.ts:1-2`). It is no longer
acceptable now that unrelated people sign up on the same deployment.

### Observed symptoms

- The first account ever to complete onboarding wins the one-time `organizers.claimOwner`
  bootstrap (`convex/organizers.ts:28-37`) and becomes permanent site-wide owner.
- That owner can read, edit, and delete every subsequent signup's event and all of its data,
  via the `isOrganizer` short-circuits in `assertEventAccess` (`convex/functions.ts:54`),
  `events.list` (`convex/events.ts:53-54`), and `events.listMine` (`convex/events.ts:62-63`).
- Any valid API key reads **all** events globally. Keys are issued per-event
  (`convex/apiKeys.ts:9`) but `http.ts:21` calls `events.listForApi`, an unfiltered
  `.collect()` (`convex/events.ts:115-117`), and never scopes by the key's own `eventId`.
- `events.listForPortal` (`convex/events.ts:89-95`) returns every published event to any
  authenticated user, gated only by `requireIdentity`.
- Notification fan-out (`convex/notifications.ts:36-56`) does `query("organizers").collect()`,
  so every global organizer is notified about every event.
- The "invite" on `/settings/organization` sends nothing. `organizers.add`
  (`convex/organizers.ts:100-113`) writes a `userId: "pending:<email>"` row and the UI shows a
  "Pending invite" badge (`src/pages/settings/OrganizationSettings.tsx:27`), but no email and
  no Clerk invitation is created. The person is silently granted access if they ever sign up
  with that email, because `isOrganizer` also matches on email.

## Decisions

**Every new signup gets their own organization, owned by them.** They never join an existing
organization unless explicitly invited into it. Confirmed with Naya on 2026-08-15.

Deliberately **out of scope** for this change:

- Verified email domains / domain-based auto-join. A coworker who signs up on their own rather
  than waiting for an invite will land in their own empty organization. That is the correct
  failure mode — annoying, not a leak. Domain auto-join is itself a way to leak into the wrong
  tenant (`gmail.com`), so it needs its own design and must be opt-in per organization.
- Organization switching UI for users who belong to more than one organization. The data model
  below supports it; the UI is a follow-on.
- Billing or per-organization plan limits.

## Requirements

1. An `organizations` table exists. Every `event` and every `organizers` row belongs to exactly
   one organization.
2. Completing onboarding creates a **new** organization owned by that user. `claimOwner` — the
   "first signup owns everything" bootstrap — is removed entirely.
3. Every authorization check is organization-scoped. Holding an `organizers` row grants access
   only to events within that same organization.
4. All guards **fail closed**: a missing or unresolvable `organizationId` denies access rather
   than falling back to global access.
5. An API key grants access only to its own event, never to the whole database.
6. The portal lists only events the caller has a legitimate relationship to.
7. Notification fan-out reaches only organizers of that event's own organization.
8. Existing production data is preserved: every current event and organizer is backfilled into
   one organization owned by the current owner, so nothing is orphaned and nothing changes
   hands.

## Success Criteria

- A second account that signs up sees zero events belonging to the first account, in the app
  and in the portal.
- An API key issued for event A returns only event A.
- The existing owner's access to their own events is unchanged after backfill.
- No code path grants access on the basis of an `organizers` row alone, without an
  organization comparison.
