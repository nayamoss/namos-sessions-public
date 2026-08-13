// Module-structure reference for future Convex feature modules. Sessionboard has
// event-scoped authorization, never organization-scoped custom context.
export { query, mutation } from "./_generated/server";

import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { UserIdentity } from "convex/server";
import type { Id } from "./_generated/dataModel";

// Every non-public query/mutation must call this first. Public CFP and embed
// surfaces (publicForms.ts, publicEmbeds.ts, http.ts public endpoints, seed.ts)
// are deliberately exempt — see the authorization plan for the full list.
export async function requireIdentity(ctx: QueryCtx | MutationCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity;
}

// Whether the caller has a row in `organizers` — role lives on that database row
// (see convex/organizers.ts), never in an env var or hardcoded list.
export async function isOrganizer(ctx: QueryCtx | MutationCtx, identity: UserIdentity): Promise<boolean> {
  const row = await ctx.db.query("organizers").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).unique();
  if (row) return true;
  const email = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : undefined;
  return email ? Boolean(await ctx.db.query("organizers").withIndex("by_email", (q) => q.eq("email", email)).unique()) : false;
}

// Gate for the organizer/admin surface: event management, forms, agenda, comms, evaluation
// plans, the full speaker/submission directory. Reviewer- and speaker-portal-scoped
// operations use identity/ownership checks instead (see evaluations.ts, speakers.ts) — being
// a reviewer or a speaker does not require an organizers row.
export async function assertOrganizer(ctx: QueryCtx | MutationCtx): Promise<UserIdentity> {
  const identity = await requireIdentity(ctx);
  if (!(await isOrganizer(ctx, identity))) throw new Error("Forbidden: organizer access required.");
  return identity;
}

function identityEmail(identity: UserIdentity): string | undefined {
  return typeof identity.email === "string" ? identity.email.trim().toLowerCase() : undefined;
}

export async function getEventMembership(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, identity: UserIdentity) {
  const byUser = await ctx.db.query("event_members").withIndex("by_event_userId", (q) => q.eq("eventId", eventId).eq("userId", identity.subject)).unique();
  if (byUser) return byUser;
  const email = identityEmail(identity);
  return email
    ? ctx.db.query("event_members").withIndex("by_event_email", (q) => q.eq("eventId", eventId).eq("email", email)).unique()
    : null;
}

// Org-wide owners/admins retain implicit access to every event. Everyone else must have an
// explicit membership on this event. Every lookup fails closed: no row means no access.
export async function assertEventAccess(ctx: QueryCtx | MutationCtx, eventId: Id<"events">): Promise<UserIdentity> {
  const identity = await requireIdentity(ctx);
  if (await isOrganizer(ctx, identity)) return identity;
  if (await getEventMembership(ctx, eventId, identity)) return identity;
  throw new Error("Forbidden: event access required.");
}

export async function assertEventOrganizerAccess(ctx: QueryCtx | MutationCtx, eventId: Id<"events">): Promise<UserIdentity> {
  const identity = await requireIdentity(ctx);
  if (await isOrganizer(ctx, identity)) return identity;
  const membership = await getEventMembership(ctx, eventId, identity);
  if (membership?.role === "organizer") return identity;
  throw new Error("Forbidden: event organizer access required.");
}
