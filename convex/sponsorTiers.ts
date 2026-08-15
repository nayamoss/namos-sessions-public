import { v } from "convex/values";
import { assertEventOrganizerAccess, mutation, query } from "./functions";

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const [tiers, sponsors] = await Promise.all([
      ctx.db
        .query("sponsor_tiers")
        .withIndex("by_event_sort", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("sponsors")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
    ]);
    return tiers.map((tier) => ({
      ...tier,
      sponsorCount: sponsors.filter((sponsor) => sponsor.tierId === tier._id)
        .length,
    }));
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    color: v.optional(v.string()),
    benefitsDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const name = args.name.trim();
    if (!name) throw new Error("A tier needs a name.");
    const tiers = await ctx.db
      .query("sponsor_tiers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (tiers.some((tier) => tier.name.toLowerCase() === name.toLowerCase()))
      throw new Error("Tier names must be unique within an event.");
    const now = Date.now();
    return ctx.db.insert("sponsor_tiers", {
      eventId: args.eventId,
      name,
      sortOrder: tiers.length
        ? Math.max(...tiers.map((tier) => tier.sortOrder)) + 1
        : 0,
      ...(args.color?.trim() ? { color: args.color.trim() } : {}),
      ...(args.benefitsDescription?.trim()
        ? { benefitsDescription: args.benefitsDescription.trim() }
        : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    tierId: v.id("sponsor_tiers"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    benefitsDescription: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tier = await ctx.db.get(args.tierId);
    if (!tier) throw new Error("Sponsor tier not found.");
    await assertEventOrganizerAccess(ctx, tier.eventId);
    const { tierId: _tierId, ...patch } = args;
    const name = patch.name === undefined ? tier.name : patch.name.trim();
    if (!name) throw new Error("A tier needs a name.");
    const peers = await ctx.db
      .query("sponsor_tiers")
      .withIndex("by_event", (q) => q.eq("eventId", tier.eventId))
      .collect();
    if (
      peers.some(
        (peer) =>
          peer._id !== tier._id &&
          peer.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error("Tier names must be unique within an event.");
    await ctx.db.patch(args.tierId, {
      name,
      ...(patch.color !== undefined
        ? { color: patch.color.trim() || undefined }
        : {}),
      ...(patch.benefitsDescription !== undefined
        ? { benefitsDescription: patch.benefitsDescription.trim() || undefined }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const reorder = mutation({
  args: { eventId: v.id("events"), tierIds: v.array(v.id("sponsor_tiers")) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const tiers = await ctx.db
      .query("sponsor_tiers")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (
      tiers.length !== args.tierIds.length ||
      new Set(args.tierIds).size !== tiers.length ||
      args.tierIds.some((id) => !tiers.some((tier) => tier._id === id))
    )
      throw new Error("Reorder every tier in this event exactly once.");
    await Promise.all(
      args.tierIds.map((tierId, sortOrder) =>
        ctx.db.patch(tierId, { sortOrder, updatedAt: Date.now() }),
      ),
    );
  },
});

export const remove = mutation({
  args: { tierId: v.id("sponsor_tiers") },
  handler: async (ctx, args) => {
    const tier = await ctx.db.get(args.tierId);
    if (!tier) throw new Error("Sponsor tier not found.");
    await assertEventOrganizerAccess(ctx, tier.eventId);
    const assigned = await ctx.db
      .query("sponsors")
      .withIndex("by_tier", (q) => q.eq("tierId", args.tierId))
      .first();
    if (assigned)
      throw new Error(
        "Reassign or remove sponsors in this tier before deleting it.",
      );
    await ctx.db.delete(args.tierId);
  },
});
