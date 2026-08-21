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
import { mutation as baseMutation, query } from "./_generated/server";

import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { UserIdentity } from "convex/server";
import type { Id } from "./_generated/dataModel";

export { query };

// All public mutations must use this export. It automatically blocks active demo identities
// before their handlers run; do not duplicate this check in individual mutation modules.
export const mutation = customMutation(baseMutation, customCtx(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (identity && await isDemoIdentity(ctx, identity)) {
    throw new ConvexError({ code: "demo_read_only", message: "This is a read-only demo." });
  }
  return {};
}));

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
