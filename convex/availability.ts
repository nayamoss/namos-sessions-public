import { v } from "convex/values";
import { mutation, query, assertEventAccess } from "./functions";
import { assertOrganizerOrOwnsSpeaker } from "./speakers";

const unavailable = v.array(v.object({ date: v.number(), hour: v.optional(v.number()), part: v.optional(v.union(v.literal("morning"), v.literal("afternoon"), v.literal("evening"))) }));

function validateSlots(slots: Array<{ date: number; hour?: number; part?: string }>) {
  for (const slot of slots) {
    if (slot.hour === undefined && slot.part === undefined)
      throw new Error("Each unavailable slot needs an hour.");
    if (slot.hour !== undefined && (!Number.isInteger(slot.hour) || slot.hour < 0 || slot.hour > 23))
      throw new Error("Availability hours must be between 0 and 23.");
  }
}

// Organizers see the whole event's availability (Program > Availability). The portal only
// ever needs its own speaker's row — pass speakerId to get that instead of the full event
// list; omitting it requires organizer access.
export const list = query({
  args: { eventId: v.id("events"), speakerId: v.optional(v.id("speakers")) },
  handler: async (ctx, args) => {
    if (args.speakerId) {
      await assertOrganizerOrOwnsSpeaker(ctx, args.eventId, args.speakerId);
      return ctx.db.query("speaker_availability").withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId!)).collect();
    }
    await assertEventAccess(ctx, args.eventId);
    return ctx.db.query("speaker_availability").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
  },
});

export const upsert = mutation({
  args: { eventId: v.id("events"), speakerId: v.id("speakers"), unavailable, notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertOrganizerOrOwnsSpeaker(ctx, args.eventId, args.speakerId);
    validateSlots(args.unavailable);
    const current = await ctx.db.query("speaker_availability").withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId)).first();
    const now = Date.now();
    if (current) { if (current.eventId !== args.eventId) throw new Error("Speaker availability belongs to a different event."); await ctx.db.patch(current._id, { unavailable: args.unavailable, notes: args.notes, updatedAt: now }); return current._id; }
    return ctx.db.insert("speaker_availability", { ...args, createdAt: now, updatedAt: now });
  },
});
