# Multi-Tenant Organizations — Design

## Shape of the change

Everything below `events` is already `eventId`-scoped (`rooms`, `tracks`, `speakers`,
`submissions`, `evaluations`, `sponsors`, `agenda_items`, …). That means the tenant boundary
only has to be introduced in two places — `events` and `organizers` — and every descendant
table inherits it through its event. No per-table `organizationId` sprawl is needed.

## Schema

New table:

```ts
organizations: defineTable({
  name: v.string(),
  createdByUserId: v.string(),
  createdAt: v.number(),
}).index("by_createdByUserId", ["createdByUserId"]),
```

Modified:

- `organizers` gains `organizationId: v.optional(v.id("organizations"))` plus indexes
  `by_organization`, `by_org_userId`, `by_org_email`.
- `events` gains `organizationId: v.optional(v.id("organizations"))` plus index
  `by_organization`.

### Why the field is optional

Convex validates the schema against existing rows on deploy. Rows written before this change
have no `organizationId`, so a required field would reject the deploy outright. The field is
therefore optional in the validator, and the **guards treat `undefined` as "deny"** rather
than "allow" (requirement 4). After the backfill has run in an environment, no row is left
without one.

This is the deliberate trade: the type system permits a null tenant, the runtime never honors
one. Every read path is written so an unbackfilled row is invisible rather than public.

## Authorization

`convex/functions.ts` is the single place these live. The global `isOrganizer(ctx, identity)`
is **deleted**, not deprecated — leaving it importable is how this regresses.

Replacements:

- `organizationIdsForUser(ctx, identity)` → the set of organization ids where the caller has an
  `organizers` row, matched by `userId` or by normalized `email`.
- `isOrganizerOf(ctx, identity, organizationId)` → false when `organizationId` is undefined.
- `assertOrganizerOf(ctx, organizationId)` → throws unless the above passes.

Rewritten guards:

- `assertEventAccess(eventId)` — load the event; allow if `isOrganizerOf(event.organizationId)`
  **or** an `event_members` row exists for the caller on that event; otherwise throw.
- `isEventOrganizer(eventId, identity)` — same, restricted to `role: "organizer"` memberships.
- `assertEventOrganizerAccess(eventId)` — unchanged semantics, new implementation.

The `event_members` layer is untouched. It already scopes correctly and it remains the way
someone gets into a single event without being an organization-wide organizer.

## Query changes

| Location | Today | After |
|---|---|---|
| `events.list` | all events | events of the caller's organizations |
| `events.listMine` | all events if organizer | union of org events + `event_members` events |
| `events.listForPortal` | every published event | published events the caller has a membership or organization tie to |
| `events.listForApi` | all events | takes `eventId`, returns that one event |
| `http.ts` `/api/v1/events` | ignores key scope | passes `key.eventId` through |
| `notifications.eventOrganizers` | all organizers globally | organizers of that event's organization |
| `notifications.eventMembers` | all organizers globally | same, org-scoped |

## Onboarding

`organizers.claimOwner` is removed. `organizations.createForCurrentUser` replaces it:

1. Insert an `organizations` row with `createdByUserId = identity.subject`.
2. Insert an `organizers` row for the caller with `role: "owner"` and that `organizationId`.

It is safe to call more than once only in the sense that it is idempotent per user: if the
caller already owns an organization it returns the existing one rather than creating a second.
`OnboardingWizard.tsx` calls it unconditionally at step 0 instead of gating on `canClaimOwner`,
and the "an owner already exists" error-swallowing branch is deleted along with the mutation
it was compensating for.

`events.save` stamps the new event with the creator's organization on insert.

## Backfill

`convex/migrations.ts` → `backfillOrganizations`, an `internalMutation` so it can only be run
deliberately from the CLI, never from the app:

```
npx convex run migrations:backfillOrganizations '{"name":"Namos Sessions"}'
```

1. If any `organizations` row exists, abort — the migration has already run.
2. Create one organization, `createdByUserId` = the earliest `organizers` row with
   `role: "owner"` (falling back to the earliest row of any role).
3. Patch every `organizers` row and every `events` row with that `organizationId`.
4. Return counts for verification.

It is idempotent by the step-1 guard and it never deletes or reassigns anything. Existing
access is preserved exactly: today's organizers all currently see all events, and after the
backfill they are all in the one organization that owns all those events, so their effective
access is unchanged. The boundary only starts to bite for accounts created *after* the
migration, which is the intent.

**This must be run against each deployment (dev, then prod) immediately after the code
deploy.** Between deploy and backfill, guards fail closed, so existing organizers lose event
access until it runs. Deploy and backfill are one operation, not two.

## Known gap left open

`organizers.add` still writes a `pending:<email>` row and still sends no email — now scoped to
the caller's organization, so it is no longer a whole-database grant, but the "Pending invite"
badge remains misleading. Wiring it to the real Clerk invitation flow that
`convex/eventInviteActions.ts:64-140` already implements for events is tracked separately; it
is a correctness fix on top of this one, not part of the tenant boundary.
