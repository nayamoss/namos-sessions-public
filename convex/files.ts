import { v } from "convex/values";
import { query, mutation, requireIdentity } from "./functions";

// Upload storage is deliberately independent of the deleted evidence module.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return ctx.storage.getUrl(args.storageId);
  },
});
