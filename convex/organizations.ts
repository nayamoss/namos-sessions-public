import { v } from "convex/values";
import { mutation, query, requireIdentity, organizationIdsForUser, assertOrganizerOf } from "./functions";

// The tenant boundary. Every signup gets their OWN organization and never joins an existing
// one uninvited — the only way into someone else's organization is organizers.add (an existing
// owner grants it) or an event_members invitation scoped to a single event.
//
// This replaces the old organizers.claimOwner bootstrap, under which the first account to ever
// complete onboarding became permanent site-wide owner of every event in the database.

const DEFAULT_ORGANIZATION_NAME = "My organization";

export const createForCurrentUser = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (!identity.email) throw new Error("Your account has no email on file.");

    // Idempotent per user: onboarding can be resumed or replayed, and neither should mint a
    // second organization.
    const existing = await organizationIdsForUser(ctx, identity);
    if (existing.length > 0) return existing[0];

    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: args.name?.trim() || DEFAULT_ORGANIZATION_NAME,
      createdByUserId: identity.subject,
      createdAt: now,
    });
    await ctx.db.insert("organizers", {
      organizationId,
      userId: identity.subject,
      email: identity.email.trim().toLowerCase(),
      role: "owner",
      createdAt: now,
    });
    return organizationId;
  },
});

// The organizations this caller organizes. Drives the org settings page and, later, an
// organization switcher for people who belong to more than one.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const ids = await organizationIdsForUser(ctx, identity);
    return (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter((org) => org !== null);
  },
});

// The caller's primary organization, or null when they organize nothing. Null is a normal
// state — speakers and reviewers reach the app through event_members without ever having an
// organizers row — so this must not throw.
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const [id] = await organizationIdsForUser(ctx, identity);
    return id ? ctx.db.get(id) : null;
  },
});

export const rename = mutation({
  args: { organizationId: v.id("organizations"), name: v.string() },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    const name = args.name.trim();
    if (!name) throw new Error("An organization name is required.");
    await ctx.db.patch(args.organizationId, { name });
  },
});
