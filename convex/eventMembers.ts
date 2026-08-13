import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertEventAccess, assertEventOrganizerAccess, getEventMembership, isOrganizer, requireIdentity } from "./functions";

const role = v.union(v.literal("organizer"), v.literal("reviewer"));

// Action-callable equivalent of `assertEventAccess`: Convex actions have no `ctx.db`, so
// `assertEventAccessAction` (convex/emailDelivery.ts) has to reach this through `ctx.runQuery`
// instead of calling the query-context helper directly. Same fail-closed rule: org-wide
// organizers pass, everyone else needs an explicit `event_members` row for this event.
export const hasAccess = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (await isOrganizer(ctx, identity)) return true;
    return Boolean(await getEventMembership(ctx, args.eventId, identity));
  },
});

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db.query("event_members").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), email: v.string(), role, userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("An email is required.");
    const existing = await ctx.db.query("event_members").withIndex("by_event_email", (q) => q.eq("eventId", args.eventId).eq("email", email)).unique();
    const userId = args.userId?.trim() || existing?.userId || `pending:${email}`;
    if (existing) {
      await ctx.db.patch(existing._id, { userId, role: args.role });
      return existing._id;
    }
    return ctx.db.insert("event_members", { eventId: args.eventId, userId, email, role: args.role, invitedByUserId: identity.subject, createdAt: Date.now() });
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), userId: v.string() },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const existing = await ctx.db.query("event_members").withIndex("by_event_userId", (q) => q.eq("eventId", args.eventId).eq("userId", args.userId)).unique();
    if (!existing) return;
    if (existing.role === "organizer") {
      const organizers = (await ctx.db.query("event_members").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect()).filter((member) => member.role === "organizer");
      if (organizers.length === 1) throw new Error("You cannot remove the event's last organizer.");
    }
    await ctx.db.delete(existing._id);
  },
});
