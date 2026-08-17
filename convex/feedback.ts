import { v } from "convex/values";
import { mutation, requireIdentity } from "./functions";

export const submit = mutation({
  args: {
    rating: v.union(
      v.literal("excellent"),
      v.literal("good"),
      v.literal("okay"),
      v.literal("poor"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const note = args.note?.trim();
    await ctx.db.insert("feedback", {
      userId: identity.subject,
      rating: args.rating,
      ...(note ? { note } : {}),
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});
