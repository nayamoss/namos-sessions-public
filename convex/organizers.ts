import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mutation, query, requireIdentity, assertOrganizer, isOrganizer } from "./functions";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { UserIdentity } from "convex/server";

async function organizerForIdentity(ctx: QueryCtx | MutationCtx, identity: UserIdentity) {
  const byUser = await ctx.db.query("organizers").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).unique();
  if (byUser) return byUser;
  const email = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : undefined;
  return email ? ctx.db.query("organizers").withIndex("by_email", (q) => q.eq("email", email)).unique() : null;
}

// Role lives on this table, never in an env var or hardcoded list. Two ways a row gets
// created:
//
// 1. `claimOwner` — a signed-in Clerk account can claim the first (and only the first)
//    owner row while this table is empty. This is a one-time, self-limiting bootstrap for
//    the chicken-and-egg problem of having zero admins to grant admin — it cannot be used
//    again once any row exists.
// 2. `add` — an existing owner explicitly grants access to someone else. This is the normal,
//    ongoing path; it is never self-service.
//
// `seed` (internalMutation) exists for CLI-based seeding/recovery — e.g. `npx convex run
// organizers:seed '{"userId":"user_xxx","email":"you@example.com","role":"owner"}'` — for
// when you already know the Clerk user id and don't want to rely on the app UI.

export const claimOwner = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db.query("organizers").first();
    if (existing) throw new Error("Forbidden: an owner already exists. Ask an existing owner to add you.");
    if (!identity.email) throw new Error("Your account has no email on file.");
    return ctx.db.insert("organizers", { userId: identity.subject, email: identity.email, role: "owner", createdAt: Date.now() });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await assertOrganizer(ctx);
    return ctx.db.query("organizers").collect();
  },
});

export const isCurrentUserOrganizer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return isOrganizer(ctx, identity);
  },
});

export const canClaimOwner = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return !(await ctx.db.query("organizers").first());
  },
});

// Speakers and reviewers should not be offered an admin link that strands them in onboarding.
export const hasAdminAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    if (await isOrganizer(ctx, identity)) return true;
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

// Unlike list(), this intentionally works before an organizer row exists so the onboarding
// guard can distinguish a first visit from a completed setup.
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return organizerForIdentity(ctx, identity);
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await assertOrganizer(ctx);
    const organizer = await organizerForIdentity(ctx, identity);
    if (!organizer) throw new Error("Forbidden: organizer access required.");
    await ctx.db.patch(organizer._id, { userId: identity.subject, onboardingCompletedAt: Date.now() });
  },
});

export const add = mutation({
  args: { userId: v.optional(v.string()), email: v.string(), role: v.union(v.literal("owner"), v.literal("admin")) },
  handler: async (ctx, args) => {
    const identity = await assertOrganizer(ctx);
    const caller = await organizerForIdentity(ctx, identity);
    if (caller?.role !== "owner") throw new Error("Forbidden: only an owner can add organizers.");
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("An email is required.");
    const existing = await ctx.db.query("organizers").withIndex("by_email", (q) => q.eq("email", email)).unique();
    const userId = args.userId?.trim() || existing?.userId || `pending:${email}`;
    if (existing) { await ctx.db.patch(existing._id, { userId, email, role: args.role }); return existing._id; }
    return ctx.db.insert("organizers", { userId, email, role: args.role, createdAt: Date.now() });
  },
});

export const remove = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertOrganizer(ctx);
    const caller = await organizerForIdentity(ctx, identity);
    if (caller?.role !== "owner") throw new Error("Forbidden: only an owner can remove organizers.");
    if (args.userId === identity.subject) throw new Error("You cannot remove your own access.");
    const existing = await ctx.db.query("organizers").withIndex("by_userId", (q) => q.eq("userId", args.userId)).unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const seed = internalMutation({
  args: { userId: v.string(), email: v.string(), role: v.union(v.literal("owner"), v.literal("admin")) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db.query("organizers").withIndex("by_userId", (q) => q.eq("userId", args.userId)).unique();
    if (existing) { await ctx.db.patch(existing._id, { email, role: args.role }); return existing._id; }
    return ctx.db.insert("organizers", { userId: args.userId, email, role: args.role, createdAt: Date.now() });
  },
});
