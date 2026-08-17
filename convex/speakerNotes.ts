import { v } from "convex/values";
import { assertEventOrganizerAccess, mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const maxNoteLength = 5_000;

async function requireSpeakerForEvent(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  speakerId: Id<"speakers">,
) {
  const speaker = await ctx.db.get(speakerId);
  if (!speaker || speaker.eventId !== eventId) {
    throw new Error("Speaker not found for this event.");
  }
}

export const list = query({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    await requireSpeakerForEvent(ctx, args.eventId, args.speakerId);
    return ctx.db.query("speaker_notes").withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId)).order("desc").collect();
  },
});

export const create = mutation({
  args: { eventId: v.id("events"), speakerId: v.id("speakers"), body: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    await requireSpeakerForEvent(ctx, args.eventId, args.speakerId);
    const body = args.body.trim();
    if (!body) throw new Error("Enter a note before saving.");
    if (body.length > maxNoteLength) throw new Error("A note cannot exceed 5,000 characters.");
    const now = Date.now();
    return ctx.db.insert("speaker_notes", { eventId: args.eventId, speakerId: args.speakerId, authorId: identity.subject, body, createdAt: now, updatedAt: now });
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), noteId: v.id("speaker_notes") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const note = await ctx.db.get(args.noteId);
    if (!note || note.eventId !== args.eventId) throw new Error("Note not found for this event.");
    await ctx.db.delete(args.noteId);
  },
});
