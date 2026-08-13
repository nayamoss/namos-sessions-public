import { v } from "convex/values";
import { mutation, query, requireIdentity, assertEventAccess, isOrganizer } from "./functions";
import { assertOwnsSpeaker } from "./speakers";

// Organizers see the whole event's tasks (Portal > Tasks admin). The portal only ever needs
// its own speaker's tasks — pass speakerId to get that instead of the full event list;
// omitting it requires organizer access.
export const list = query({
  args: { eventId: v.id("events"), speakerId: v.optional(v.id("speakers")) },
  handler: async (ctx, args) => {
    if (args.speakerId) {
      const identity = await requireIdentity(ctx);
      if (!(await isOrganizer(ctx, identity))) {
        const speaker = await ctx.db.get(args.speakerId);
        if (!speaker || speaker.eventId !== args.eventId) throw new Error("Speaker not found for this event.");
        assertOwnsSpeaker(identity, speaker);
      }
      const tasks = await ctx.db.query("onboarding_tasks").withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId!)).collect();
      return tasks.filter((task) => task.eventId === args.eventId);
    }
    await assertEventAccess(ctx, args.eventId);
    return ctx.db.query("onboarding_tasks").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission"), v.literal("sponsor")),
    speakerId: v.optional(v.id("speakers")),
    submissionId: v.optional(v.id("submissions")),
    sponsorId: v.optional(v.id("sponsors")),
    linkedFormId: v.optional(v.id("submission_forms")),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const title = args.title.trim();
    if (!title) throw new Error("A task needs a title.");
    if (args.dueDate !== undefined && !Number.isFinite(args.dueDate)) throw new Error("A task due date must be a valid timestamp.");
    if (args.speakerId) {
      const speaker = await ctx.db.get(args.speakerId);
      if (!speaker || speaker.eventId !== args.eventId) throw new Error("The selected speaker does not belong to this event.");
    }
    if (args.submissionId) {
      const submission = await ctx.db.get(args.submissionId);
      if (!submission || submission.eventId !== args.eventId) throw new Error("The selected submission does not belong to this event.");
    }
    if (args.sponsorId) {
      const sponsor = await ctx.db.get(args.sponsorId);
      if (!sponsor || sponsor.eventId !== args.eventId) throw new Error("The selected sponsor does not belong to this event.");
      if (args.targetType !== "sponsor") throw new Error("Sponsor tasks must use the sponsor target type.");
    } else if (args.targetType === "sponsor") throw new Error("Select a sponsor for sponsor tasks.");
    if (args.linkedFormId) {
      const form = await ctx.db.get(args.linkedFormId);
      if (!form || form.eventId !== args.eventId) throw new Error("The selected portal form does not belong to this event.");
      if (form.kind !== "contact" && form.kind !== "group" && form.kind !== "submission_task") throw new Error("Tasks can only link to portal forms.");
    }
    const now = Date.now();
    return ctx.db.insert("onboarding_tasks", {
      ...args,
      title,
      source: "manual",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// An organizer may update any task; a speaker may only update their own — a task with no
// speakerId (e.g. a group/contact task) is organizer-only.
export const setStatus = mutation({
  args: { id: v.id("onboarding_tasks"), status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found.");
    if (!(await isOrganizer(ctx, identity))) {
      if (!task.speakerId) throw new Error("Forbidden: organizer access required.");
      const speaker = await ctx.db.get(task.speakerId);
      if (!speaker) throw new Error("Forbidden: organizer access required.");
      assertOwnsSpeaker(identity, speaker);
    }
    const now = Date.now();
    await ctx.db.patch(args.id, { status: args.status, completedAt: args.status === "completed" ? now : undefined, updatedAt: now });
  },
});
