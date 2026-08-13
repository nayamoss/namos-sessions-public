import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query, assertEventAccess } from "./functions";

function normalizeName(name: string) {
  const normalized = name.trim();
  if (!normalized) throw new Error("A tag name is required.");
  if (normalized.length > 80) throw new Error("Tag names must be 80 characters or fewer.");
  return normalized;
}

function normalizeColor(color: string | undefined) {
  const normalized = color?.trim();
  if (normalized && normalized.length > 40) throw new Error("Tag colors must be 40 characters or fewer.");
  return normalized || undefined;
}

async function requireEvent(ctx: MutationCtx, eventId: Id<"events">) {
  if (!await ctx.db.get(eventId)) throw new Error("Event not found.");
}

async function requireUniqueName(ctx: MutationCtx, eventId: Id<"events">, name: string, exceptId?: Id<"tags">) {
  const tags = await ctx.db.query("tags").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
  if (tags.some((tag) => tag._id !== exceptId && tag.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
    throw new Error("A tag with this name already exists.");
  }
}

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db.query("tags").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
  },
});

export const create = mutation({
  args: { eventId: v.id("events"), name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const name = normalizeName(args.name);
    await requireEvent(ctx, args.eventId);
    await requireUniqueName(ctx, args.eventId, name);
    const now = Date.now();
    return ctx.db.insert("tags", {
      eventId: args.eventId,
      name,
      color: normalizeColor(args.color),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const rename = mutation({
  args: { eventId: v.id("events"), id: v.id("tags"), name: v.string() },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const tag = await ctx.db.get(args.id);
    if (!tag || tag.eventId !== args.eventId) throw new Error("Tag not found for this event.");
    const name = normalizeName(args.name);
    await requireUniqueName(ctx, args.eventId, name, args.id);
    await ctx.db.patch(args.id, { name, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), id: v.id("tags") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const tag = await ctx.db.get(args.id);
    if (!tag || tag.eventId !== args.eventId) throw new Error("Tag not found for this event.");
    const submissions = await ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    const affected = submissions.filter((submission) => submission.tagIds?.includes(args.id));
    const now = Date.now();
    await Promise.all(affected.map((submission) => ctx.db.patch(submission._id, {
      tagIds: submission.tagIds?.filter((tagId) => tagId !== args.id),
      updatedAt: now,
    })));
    await ctx.db.delete(args.id);
  },
});
