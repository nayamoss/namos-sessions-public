# Admin role tiers and invitations: design

## Existing implementation audit

| Concern | Existing implementation | Decision / change |
| --- | --- | --- |
| SaaS-wide admins | `organizers` schema; `organizers.claimOwner`, `add`, `remove`; `isOrganizer` / `assertOrganizer` | Correct scope. Keep `owner` and `admin`; reserve `assertOrganizer` for global functions such as site-admin management, global event listing, shared field definitions without event scope, and API keys. |
| Event membership | `event_members(eventId, userId, email, role, invitedByUserId)` with event/user/email indexes | Correct base model. Keep `organizer | reviewer`; add optional invitation delivery metadata, not a second competing membership table. |
| Pending identities | Existing `eventMembers.add` uses `pending:<email>`; `getEventMembership`, `events.listMine`, and `organizers.hasAdminAccess` already match by exact normalized email | Reuse this pattern. Add an authenticated `claimPending` mutation to persist the real Clerk subject after sign-in. |
| Event creation | `events.save` required `assertOrganizer` for a new event and did not insert the creator into `event_members` | Incorrect. Use `requireIdentity`, require an email, insert event + creator organizer row atomically. |
| Event duplication/team copy | `events.duplicate` required a global organizer; team copy blindly copied membership rows | Require organizer access to the source, make the duplicator organizer of the new event, skip their duplicate source row, and enforce the shared cap. |
| Event authorization | `assertEventAccess` allowed both organizer and reviewer rows, and many management writes used it | Split read/basic membership from management. `assertEventOrganizerAccess` and `isEventOrganizer` authorize site admins or event organizers; management writes/actions use this narrower check. Assignment- and speaker-owned paths retain their dedicated checks. |
| Team UI | `src/pages/settings/EventTeam.tsx` already listed rows, used the `pending:` marker, added/removed members, copied teams, and used the app `Select` | Extend rather than replace. Send, resend, and revoke real Clerk invitations; show capacity/delivery state; and keep team-copy behavior. |
| Email | `convex/emailDelivery.ts` resolves an encrypted per-event Resend/SES integration, then `RESEND_*`; `commsEmailRender.ts` renders React Email templates | Reuse exactly. Add `TeamInvitationEmail`; do not add a new provider or direct Resend path. |

## Reused sibling implementation

The original branch used Qiro's simpler pending-email pattern. The full lifecycle is replaced by
the battle-tested application-invitation mechanics from Beeconomy's `convex/clerkInvite.ts`,
`convex/workspaceInviteAction.ts`, `convex/workspaceInvitations.ts`, and invite UI:

- save pending state before external calls;
- normalize and upsert by scoped email;
- look up an existing Clerk user and activate directly;
- create a Clerk application invitation for a new identity using `CLERK_SECRET_KEY`;
- revoke the stored Clerk invitation before removing a pending invite;
- implement resend as revoke-then-create so the previous ticket is invalidated;
- preserve pending state and report a warning if Clerk fails;
- show accepted and pending identities together in the team UI with in-app resend/remove actions.

The existing Qiro-derived row model remains useful for event scoping, while Beeconomy supplies the
Clerk-backed lifecycle behavior that the original branch lacked.

Namos differs intentionally in two places: it retains the established event-scoped
`pending:<email>` member row instead of importing Beeconomy's workspace/invitation tables, and it
sends the user-facing email through Namos's existing per-event email integration rather than
Beeconomy's direct Resend transport. Clerk is called with `notify: false`, and its returned
invitation URL is embedded in the Namos React Email message.

## Data model

`event_members` remains the source of truth:

```text
eventId             events id
userId              Clerk subject or pending:<normalized email>
email               normalized lowercase address
role                organizer | reviewer
invitedByUserId     Clerk subject
clerkInvitationId?  Clerk application invitation id
inviteEmailStatus?  pending | sent | failed
inviteError?        safe, truncated provider warning
invitedAt?          latest invite/re-send timestamp
createdAt           original membership timestamp
```

The existing `by_event`, `by_userId`, `by_email`, `by_event_userId`, and `by_event_email` indexes
cover capacity, exact-email claiming, and scoped membership lookup. No global user-role column is
added to Clerk metadata or an application `users` table.

## Authorization

```text
site admin (organizers row) ───────────────► every event + global settings
event organizer (event_members row) ──────► that event's management functions
event reviewer (event_members row) ───────► assignment-scoped review functions
speaker (speaker email ownership) ─────────► own portal records
```

`isEventOrganizer(ctx, eventId, identity)` first checks the global site-admin row, then an exact
event membership with role `organizer`. `assertEventOrganizerAccess` is the mutation/query gate;
`assertEventOrganizerAction` delegates to `eventMembers.hasOrganizerAccess` because actions have no
database handle. `assertEventAccess` remains useful for membership-readable data, but is not a
management-write gate.

## Invite sequence

1. `EventTeam` calls repository operation `eventMembers.invite`.
2. The Convex transport dispatches it as the Node action `eventInviteActions.invite` with the
   authenticated Clerk token.
3. The action calls internal mutation `eventMembers.prepareInvite`.
4. The mutation rechecks event-organizer access, normalizes email, rejects self/active duplicates,
   enforces `EVENT_TEAM_MEMBER_LIMIT`, and inserts or refreshes the pending row transactionally.
5. The action uses `CLERK_SECRET_KEY` to query Clerk by email.
6. Existing Clerk user: `activateInvite` stores the subject; the email points at the event.
7. New Clerk user: `createInvitation({ notify: false, ignoreExisting: true, redirectUrl,
   publicMetadata })`; the branded email uses `invitation.url`.
8. `TeamInvitationEmail` is rendered by `renderEmail` and delivered by `deliverEventEmail`.
9. `recordInviteOutcome` stores delivery/Clerk metadata. The action returns active/pending,
   email-delivery status, and an optional warning for the UI.

## Resend and revoke sequence

- `eventInviteActions.resend` validates organizer access and that the selected row is pending,
  then runs the same invite sequence. `prepareInvite` returns the prior `clerkInvitationId`; the
  action revokes that Clerk invitation before creating and storing the replacement.
- `eventInviteActions.remove` reads the event-scoped removal target under organizer authorization.
  For a pending row with a Clerk ID, it calls Clerk's real revoke endpoint first. Only after a
  successful (or already-revoked/not-found) result does the final mutation recheck authorization,
  verify the stored Clerk invitation ID has not changed concurrently, enforce the last-organizer
  invariant, and delete the member row.
- Active rows have no usable pending ticket and proceed directly to the authorized local removal.
- These operations are actions in the repository transport because Clerk is an external service;
  the underlying data mutations remain internal so callers cannot bypass the revoke-first rule.

External calls cannot participate in the Convex transaction, so partial failure is explicit: the
pending row is authoritative, and delivery/Clerk warnings are recoverable via re-send.

## First-sign-in claiming

`ConvexRepoProvider` calls `eventMembers.claimPending` once Clerk is loaded and signed in. The
mutation reads the verified identity email, normalizes it, finds all `event_members.by_email`
matches, and patches only rows whose `userId` begins with `pending:`. This supports multiple event
invites for one identity and does not collapse roles across scopes.

The existing email fallback in `getEventMembership` and `events.listMine` prevents a redirect race:
the invited event is visible immediately, even if the claim mutation finishes milliseconds later.

The app's existing Clerk `<SignUp />` route consumes the `__clerk_ticket` appended to the
programmatic invitation redirect. The repository provider then claims exact-email pending rows on
authenticated mount, so Beeconomy's separate workspace acceptance screen and role-claim banner are
not imported; they would duplicate this app's established event-scoped claim path.

## Capacity

`src/lib/event-team.ts` owns `EVENT_TEAM_MEMBER_LIMIT = 8` and shared normalization/capacity helpers.
The server counts explicit `event_members` rows inside the insert mutation. The creator is one seat;
implicit site admins are zero seats. Team copy/duplication filters the creator's duplicate row and
rejects copies that would exceed the same limit.

## Production owner-claim incident

On 2026-08-13, deployment `your-project-prod` had the correct Clerk issuer and an empty
`organizers` table but its deployed function manifest contained zero functions. The browser's old
error was not produced by the checked-in `claimOwner` predicate. Redeploying the current `convex/`
source restored `organizers:claimOwner`, `canClaimOwner`, and `getMine`; an authenticated production
query then returned `canClaimOwner === true` while the table remained empty for the live owner.
