import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  mutation,
  query,
  requireIdentity,
  assertOrganizerOf,
  isOrganizerOf,
  organizationIdsForUser,
  organizerRowsForUser,
} from "./functions";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { UserIdentity } from "convex/server";

// Role lives on this table, never in an env var or hardcoded list. Every row is scoped to one
// organization — holding a row grants access to that organization's events and nothing else.
//
// Two ways a row gets created:
//
// 1. `organizations:createForCurrentUser` — a signup completing onboarding gets a brand new
//    organization plus the owner row for it. Each account owns its own tenant.
// 2. `add` — an existing owner explicitly grants someone access to THAT owner's organization.
//    Never self-service.
//
// `seed` (internalMutation) exists for CLI-based seeding/recovery — e.g. `npx convex run
// organizers:seed '{"organizationId":"...","userId":"user_xxx","email":"you@example.com",
// "role":"owner"}'` — for when you already know the Clerk user id.
//
// The old `claimOwner` bootstrap is gone. It made the first account to ever finish onboarding
// the permanent site-wide owner of every event in the database.

async function organizerForIdentity(
  ctx: QueryCtx | MutationCtx,
  identity: UserIdentity,
  organizationId: Id<"organizations">,
) {
  const rows = await organizerRowsForUser(ctx, identity);
  return rows.find((row) => row.organizationId === organizationId) ?? null;
}

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    return ctx.db
      .query("organizers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

// Whether the caller organizes ANY organization. Drives UI affordances only — never use it as
// an authorization decision, because it says nothing about which tenant.
export const isCurrentUserOrganizer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return (await organizationIdsForUser(ctx, identity)).length > 0;
  },
});

// Speakers and reviewers should not be offered an admin link that strands them in onboarding.
export const hasAdminAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    if ((await organizationIdsForUser(ctx, identity)).length > 0) return true;
    const email = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : undefined;
    const [byUser, byEmail] = await Promise.all([
      ctx.db.query("event_members").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).collect(),
      email
        ? ctx.db.query("event_members").withIndex("by_email", (q) => q.eq("email", email)).collect()
        : Promise.resolve([]),
    ]);
    return [...byUser, ...byEmail].some((member) => member.role === "organizer");
  },
});

// Unlike list(), this intentionally works before any organization exists so the onboarding
// guard can distinguish a first visit from a completed setup.
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const rows = await organizerRowsForUser(ctx, identity);
    return rows.find((row) => row.organizationId) ?? null;
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const rows = await organizerRowsForUser(ctx, identity);
    const organizer = rows.find((row) => row.organizationId);
    if (!organizer) throw new Error("Forbidden: organizer access required.");
    await ctx.db.patch(organizer._id, { userId: identity.subject, onboardingCompletedAt: Date.now() });
  },
});

export const add = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.optional(v.string()),
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const identity = await assertOrganizerOf(ctx, args.organizationId);
    const caller = await organizerForIdentity(ctx, identity, args.organizationId);
    if (caller?.role !== "owner") throw new Error("Forbidden: only an owner can add organizers.");
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("An email is required.");
    const existing = await ctx.db
      .query("organizers")
      .withIndex("by_org_email", (q) => q.eq("organizationId", args.organizationId).eq("email", email))
      .unique();
    const userId = args.userId?.trim() || existing?.userId || `pending:${email}`;
    if (existing) {
      await ctx.db.patch(existing._id, { userId, email, role: args.role });
      return existing._id;
    }
    return ctx.db.insert("organizers", {
      organizationId: args.organizationId,
      userId,
      email,
      role: args.role,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { organizationId: v.id("organizations"), userId: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertOrganizerOf(ctx, args.organizationId);
    const caller = await organizerForIdentity(ctx, identity, args.organizationId);
    if (caller?.role !== "owner") throw new Error("Forbidden: only an owner can remove organizers.");
    if (args.userId === identity.subject) throw new Error("You cannot remove your own access.");
    const existing = await ctx.db
      .query("organizers")
      .withIndex("by_org_userId", (q) => q.eq("organizationId", args.organizationId).eq("userId", args.userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const seed = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("organizers")
      .withIndex("by_org_userId", (q) => q.eq("organizationId", args.organizationId).eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { email, role: args.role });
      return existing._id;
    }
    return ctx.db.insert("organizers", {
      organizationId: args.organizationId,
      userId: args.userId,
      email,
      role: args.role,
      createdAt: Date.now(),
    });
  },
});

// Exported for callers that need the caller's own row in a specific organization.
export async function organizerRowFor(
  ctx: QueryCtx | MutationCtx,
  identity: UserIdentity,
  organizationId: Id<"organizations">,
) {
  return organizerForIdentity(ctx, identity, organizationId);
}

export { isOrganizerOf };
