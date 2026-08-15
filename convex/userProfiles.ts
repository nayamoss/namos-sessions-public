import { v } from "convex/values";
import { mutation, query, requireIdentity } from "./functions";

// Onboarding-captured personalization for any signed-in user — see schema.ts's comment on
// `userProfiles` for why this is deliberately not on the `organizers` table.

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return ctx.db.query("userProfiles").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).unique();
  },
});

export const save = mutation({
  args: {
    displayName: v.optional(v.string()),
    signupRole: v.optional(v.union(v.literal("solo"), v.literal("team"))),
    referralSource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const patch: { displayName?: string; signupRole?: "solo" | "team"; referralSource?: string } = {};
    if (args.displayName !== undefined) patch.displayName = args.displayName.trim().slice(0, 100);
    if (args.signupRole !== undefined) patch.signupRole = args.signupRole;
    if (args.referralSource !== undefined) patch.referralSource = args.referralSource.trim().slice(0, 200);
    if (Object.keys(patch).length === 0) return;

    const existing = await ctx.db.query("userProfiles").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("userProfiles", { userId: identity.subject, ...patch, updatedAt: Date.now() });
    }
  },
});
