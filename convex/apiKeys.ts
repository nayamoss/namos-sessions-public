import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mutation, query, assertOrganizer } from "./functions";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await assertOrganizer(ctx);
    const keys = await ctx.db.query("api_keys").collect();
    return keys
      .filter((key) => !key.revokedAt)
      .map(({ keyHash: _keyHash, ...key }) => key)
      .sort((left, right) => right.createdAt - left.createdAt);
  },
});

export const revoke = mutation({
  args: { id: v.id("api_keys") },
  handler: async (ctx, args) => {
    await assertOrganizer(ctx);
    const key = await ctx.db.get(args.id);
    if (!key) throw new Error("API key not found.");
    if (!key.revokedAt) await ctx.db.patch(args.id, { revokedAt: Date.now() });
  },
});

export const storeInternal = internalMutation({
  args: { label: v.string(), keyHash: v.string(), keyPrefix: v.string(), createdByUserId: v.string() },
  handler: async (ctx, args) => ctx.db.insert("api_keys", { ...args, createdAt: Date.now() }),
});
