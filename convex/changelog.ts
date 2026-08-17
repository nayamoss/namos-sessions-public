import { v } from "convex/values";
import { assertAnyOrganizer, mutation, query } from "./functions";

const status = v.union(v.literal("draft"), v.literal("published"));

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    return ctx.db
      .query("changelogEntries")
      .withIndex("by_status_publishedAt", (q) => q.eq("status", "published"))
      .order("desc")
      .take(limit);
  },
});

export const create = mutation({
  args: { title: v.string(), body: v.string(), status },
  handler: async (ctx, args) => {
    await assertAnyOrganizer(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("A changelog title is required.");
    const now = Date.now();
    return ctx.db.insert("changelogEntries", {
      title,
      body: args.body.trim(),
      status: args.status,
      ...(args.status === "published" ? { publishedAt: now } : {}),
      createdAt: now,
    });
  },
});
