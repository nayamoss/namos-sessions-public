// Module-structure reference for future Convex feature modules. Sessionboard is multi-tenant:
// `organizations` is the tenant boundary, `events` and `organizers` each belong to exactly one
// organization, and everything below an event inherits its tenant through that event.
//
// There is deliberately NO global "is this person an organizer" predicate. Being an organizer
// is always relative to one organization — a bare organizers row grants nothing on its own.
// Reintroducing an unscoped isOrganizer() is how this regresses back into a single shared
// tenant, so don't.
import { ConvexError } from "convex/values";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { mutation as baseMutation, query as rawQuery } from "./_generated/server";

import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { UserIdentity } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";

// In a deployed (non-dev) Convex environment, a plain `throw new Error("...")` from a handler
// is treated as an unexpected server fault: the client never receives the message at all, only
// an opaque "[Request ID: ...] Server Error". Only a thrown `ConvexError`'s data is forwarded to
// the client, in every environment. Every handler in this codebase throws plain `Error`s for
// user-facing validation ("Publish the event before opening its call for proposals.", "Form not
// found for this event.", etc) — that's the readable, greppable convention we want to keep, not
// something to migrate 650+ call sites away from. So this is the single place that bridges the
// two: catch a plain Error a handler throws and re-raise it as a ConvexError carrying the exact
// same string as `.data`/`.message` (a bare string, not `{message: ...}` — a bare string is what
// `src/lib/errors.ts`'s client-side unwrapping already expects verbatim, with no envelope to
// strip), so the organizer actually sees why their action failed instead of a meaningless
// request id. A cause that is already a ConvexError (e.g. the demo-read-only guard below) passes
// through unchanged rather than getting double-wrapped.
function toConvexError(cause: unknown): ConvexError<string> {
  if (cause instanceof ConvexError) return cause;
  if (cause instanceof Error) return new ConvexError(cause.message);
  return new ConvexError("Something went wrong.");
}

// `Handler`'s params are deliberately `any`, not `unknown`: this wraps every differently-shaped
// query/mutation handler in the codebase, and a narrower constraint here would make handlers
// typed against their own specific ctx/args (the overwhelming majority) fail to satisfy it — the
// real type safety for callers comes from the `as typeof rawQuery`/`as typeof withDemoGuard`
// casts below, not from this generic constraint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
function withFriendlyErrors<Handler extends (ctx: any, args: any) => any>(handler: Handler): Handler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwards to `handler` untouched, whatever its real ctx/args type is
  return (async (ctx: any, args: any) => {
    try {
      return await handler(ctx, args);
    } catch (cause) {
      throw toConvexError(cause);
    }
  }) as Handler;
}

// `config` accepts either of Convex's own overloaded `query()` shapes (a bare handler function,
// or a config object with validators + handler) — `any` sidesteps re-deriving that union here;
// the exported type is `typeof rawQuery`, so callers still get Convex's real overloaded signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
export const query: typeof rawQuery = ((config: any) =>
  typeof config === "function"
    ? rawQuery(withFriendlyErrors(config))
    : rawQuery({ ...config, handler: withFriendlyErrors(config.handler) })) as typeof rawQuery;

// All public mutations must use this export. It automatically blocks active demo identities
// before their handlers run; do not duplicate this check in individual mutation modules.
const withDemoGuard = customMutation(baseMutation, customCtx(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (identity && await isDemoIdentity(ctx, identity)) {
    throw new ConvexError({ code: "demo_read_only", message: "This is a read-only demo." });
  }
  return {};
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
export const mutation: typeof withDemoGuard = ((config: any) =>
  withDemoGuard({
    ...config,
    handler: withFriendlyErrors(config.handler),
  })) as typeof withDemoGuard;

// Every non-public query/mutation must call this first. Deliberately public CFP, embed, and
// HTTP read surfaces are exempt. Privileged maintenance functions such as seed.ts use Convex's
// internal function boundary instead of browser-callable exports.
export async function requireIdentity(ctx: QueryCtx | MutationCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity;
}

// Demo Clerk subjects are stored in exactly one of these indexed columns. Any lookup failure is
// deliberately treated as demo traffic so a database error can never make the demo writable.
const demoSeatIndexes = ["by_organizerUserId", "by_reviewerUserId", "by_speakerUserId"] as const;
const demoSeatFields = ["organizerUserId", "reviewerUserId", "speakerUserId"] as const;

export async function isDemoIdentity(ctx: QueryCtx | MutationCtx, identity: UserIdentity): Promise<boolean> {
  try {
    const seats = await Promise.all(
      demoSeatIndexes.map((index, i) =>
        ctx.db.query("demo_workspaces").withIndex(index, (q) => q.eq(demoSeatFields[i], identity.subject)).unique(),
      ),
    );
    const workspace = seats.find(Boolean);
    return Boolean(workspace && workspace.expiresAt > Date.now() && workspace.absoluteExpiresAt > Date.now());
  } catch (error) {
    // Fail closed deliberately (an unrelated DB/index error must never make the demo
    // writable) — but log it, since this is indistinguishable from real demo traffic
    // otherwise and would silently block every mutation app-wide if it ever fires for a
    // non-demo reason.
    console.error("isDemoIdentity lookup failed; blocking mutation as a precaution.", error);
    return true;
  }
}

export function identityEmail(identity: UserIdentity): string | undefined {
  return typeof identity.email === "string" ? identity.email.trim().toLowerCase() : undefined;
}

// All `organizers` rows for this caller, matched by Clerk subject or by verified email. The
// email match is what lets `organizers.add` pre-create a row for someone who has not signed up
// yet; it is scoped to one organization, so it can only ever grant access to that tenant.
export async function organizerRowsForUser(ctx: QueryCtx | MutationCtx, identity: UserIdentity) {
  const email = identityEmail(identity);
  const [byUser, byEmail] = await Promise.all([
    ctx.db.query("organizers").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).collect(),
    email
      ? ctx.db.query("organizers").withIndex("by_email", (q) => q.eq("email", email)).collect()
      : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  return [...byUser, ...byEmail].filter((row) => {
    if (seen.has(row._id)) return false;
    seen.add(row._id);
    return true;
  });
}

// The organizations this caller is an organizer of. Rows with no organizationId are dropped:
// they predate the multi-tenancy migration and must not resolve to anything until
// migrations:backfillOrganizations has stamped them.
export async function organizationIdsForUser(ctx: QueryCtx | MutationCtx, identity: UserIdentity): Promise<Id<"organizations">[]> {
  const rows = await organizerRowsForUser(ctx, identity);
  return [...new Set(rows.map((row) => row.organizationId).filter((id): id is Id<"organizations"> => Boolean(id)))];
}

// Fails closed on an undefined organizationId — an event that has not been backfilled is
// reachable by nobody through this path, rather than by everybody.
export async function isOrganizerOf(
  ctx: QueryCtx | MutationCtx,
  identity: UserIdentity,
  organizationId: Id<"organizations"> | undefined,
): Promise<boolean> {
  if (!organizationId) return false;
  const byUser = await ctx.db
    .query("organizers")
    .withIndex("by_org_userId", (q) => q.eq("organizationId", organizationId).eq("userId", identity.subject))
    .unique();
  if (byUser) return true;
  const email = identityEmail(identity);
  if (!email) return false;
  return Boolean(
    await ctx.db
      .query("organizers")
      .withIndex("by_org_email", (q) => q.eq("organizationId", organizationId).eq("email", email))
      .unique(),
  );
}

// Gate for organization-wide surfaces: the organizer roster, org settings, anything that spans
// every event in one tenant. Event-level work should use assertEventAccess /
// assertEventOrganizerAccess instead, which also admit explicit event_members.
export async function assertOrganizerOf(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<UserIdentity> {
  const identity = await requireIdentity(ctx);
  if (!(await isOrganizerOf(ctx, identity, organizationId)))
    throw new Error("Forbidden: organizer access required.");
  return identity;
}

// For callers that legitimately act across every organization the user belongs to (their event
// list, their notification feed). Throws when the caller organizes nothing at all, so the
// "authenticated but not an organizer anywhere" case still fails closed.
export async function assertAnyOrganizer(ctx: QueryCtx | MutationCtx): Promise<{ identity: UserIdentity; organizationIds: Id<"organizations">[] }> {
  const identity = await requireIdentity(ctx);
  const organizationIds = await organizationIdsForUser(ctx, identity);
  if (organizationIds.length === 0) throw new Error("Forbidden: organizer access required.");
  return { identity, organizationIds };
}

export async function getEventMembership(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, identity: UserIdentity) {
  const byUser = await ctx.db.query("event_members").withIndex("by_event_userId", (q) => q.eq("eventId", eventId).eq("userId", identity.subject)).unique();
  if (byUser) return byUser;
  const email = identityEmail(identity);
  return email
    ? ctx.db.query("event_members").withIndex("by_event_email", (q) => q.eq("eventId", eventId).eq("email", email)).unique()
    : null;
}

// Two ways in, both scoped: organizer of the event's OWN organization, or an explicit
// event_members row on this event. Every lookup fails closed — no event, no organizationId, or
// no row all mean no access.
export async function assertEventAccess(ctx: QueryCtx | MutationCtx, eventId: Id<"events">): Promise<UserIdentity> {
  const identity = await requireIdentity(ctx);
  const event = await ctx.db.get(eventId);
  if (event && (await isOrganizerOf(ctx, identity, event.organizationId))) return identity;
  if (await getEventMembership(ctx, eventId, identity)) return identity;
  throw new Error("Forbidden: event access required.");
}

export async function assertEventOrganizerAccess(ctx: QueryCtx | MutationCtx, eventId: Id<"events">): Promise<UserIdentity> {
  const identity = await requireIdentity(ctx);
  if (await isEventOrganizer(ctx, eventId, identity)) return identity;
  throw new Error("Forbidden: event organizer access required.");
}

export async function isEventOrganizer(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, identity: UserIdentity): Promise<boolean> {
  const event = await ctx.db.get(eventId);
  if (event && (await isOrganizerOf(ctx, identity, event.organizationId))) return true;
  return (await getEventMembership(ctx, eventId, identity))?.role === "organizer";
}

// All event_members rows with organizer role for this caller, across every event -- used to
// resolve which events an "event-limited" caller (no organizers row of their own) may see in
// organization-wide surfaces such as the CRM directory. Reviewer-role rows are excluded: only
// "organizer" grants elevated event access (mirrors isEventOrganizer above).
export async function eventOrganizerMembershipsForUser(ctx: QueryCtx | MutationCtx, identity: UserIdentity): Promise<Doc<"event_members">[]> {
  const email = identityEmail(identity);
  const [byUser, byEmail] = await Promise.all([
    ctx.db.query("event_members").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).collect(),
    email
      ? ctx.db.query("event_members").withIndex("by_email", (q) => q.eq("email", email)).collect()
      : Promise.resolve([] as Doc<"event_members">[]),
  ]);
  const seen = new Set<string>();
  return [...byUser, ...byEmail].filter((row) => {
    if (row.role !== "organizer" || seen.has(row._id)) return false;
    seen.add(row._id);
    return true;
  });
}

export type OrganizationCrmAccess =
  | { identity: UserIdentity; scope: "organization" }
  | { identity: UserIdentity; scope: "events"; eventIds: Id<"events">[] };

// Gate for organization-wide CRM projections (the cross-event contact directory and detail
// pane). An organization owner/admin sees the full directory. Someone who is not an organizer
// of this organization but holds an explicit organizer-role event_members row on one or more of
// its events sees ONLY the contacts linked to those authorized events -- never the rest of the
// organization's directory, and the server does the filtering; the browser is never sent an
// unauthorized contact to hide client-side. Fails closed: authenticated but neither an
// organizer here nor an event organizer anywhere in this organization throws.
export async function assertOrganizationCrmAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<OrganizationCrmAccess> {
  const identity = await requireIdentity(ctx);
  if (await isOrganizerOf(ctx, identity, organizationId)) return { identity, scope: "organization" };
  const memberships = await eventOrganizerMembershipsForUser(ctx, identity);
  const events = await Promise.all(memberships.map((membership) => ctx.db.get(membership.eventId)));
  const eventIds = [...new Set(
    events
      .filter((event): event is NonNullable<typeof event> => Boolean(event) && event.organizationId === organizationId)
      .map((event) => event._id),
  )];
  if (eventIds.length === 0) throw new Error("Forbidden: organization CRM access required.");
  return { identity, scope: "events", eventIds };
}

// Scheduled adapters (Slack today) have no browser identity. They may act only for a stored
// Clerk subject that still has organizer access at execution time; the external identity
// mapping is never itself authority.
// `email` is optional because not every caller has one: the direct mutation path has a full
// Clerk identity and should pass it, but the Slack path (createRunFromSlack) only has a
// pre-resolved userId string. Without the email fallback this diverged from
// assertEventOrganizerAccess/isOrganizerOf (which does fall back to email) closely enough that
// someone whose organizer row was matched by email rather than an exact userId — e.g. an invited
// organizer signed in under a different auth method than the row was created under — could pass
// the outer access check on a page load and then get "Forbidden" the moment they tried to submit
// an agent run, with no way to tell why. See #incident 2026-08-21 dashboard chat.
export async function assertEventOrganizerByUserId(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  userId: string,
  email?: string,
): Promise<void> {
  const event = await ctx.db.get(eventId);
  if (!event?.organizationId) throw new Error("Forbidden: event organizer access required.");
  const normalizedEmail = email?.trim().toLowerCase();
  const [organizerByUser, organizerByEmail, member] = await Promise.all([
    ctx.db.query("organizers").withIndex("by_org_userId", (q) => q.eq("organizationId", event.organizationId).eq("userId", userId)).unique(),
    normalizedEmail
      ? ctx.db.query("organizers").withIndex("by_org_email", (q) => q.eq("organizationId", event.organizationId).eq("email", normalizedEmail)).unique()
      : Promise.resolve(null),
    ctx.db.query("event_members").withIndex("by_event_userId", (q) => q.eq("eventId", eventId).eq("userId", userId)).unique(),
  ]);
  if (!organizerByUser && !organizerByEmail && member?.role !== "organizer") throw new Error("Forbidden: event organizer access required.");
}
