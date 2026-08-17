import { v } from "convex/values";
import { mutation, requireIdentity } from "./functions";

export const register = mutation({
  args: {
    token: v.string(),
    platform: v.literal("ios"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db.query("device_tokens").withIndex("by_token", (q) => q.eq("token", args.token)).unique();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: identity.subject,
        platform: args.platform,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("device_tokens", {
      userId: identity.subject,
      token: args.token,
      platform: args.platform,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const unregister = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db.query("device_tokens").withIndex("by_token", (q) => q.eq("token", args.token)).unique();
    if (existing?.userId === identity.subject) await ctx.db.delete(existing._id);
  },
});
