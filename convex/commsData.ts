import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

// Internal reads for convex/commsActions.ts. Actions have no ctx.db, and these are narrower
// than exposing submissions/speakers "get by id" as public API surface just for this.

export const decisionContext = internalQuery({
  args: { eventId: v.id("events"), submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.eventId !== args.eventId) return null;
    const [event, agenda, templates] = await Promise.all([
      ctx.db.get(args.eventId),
      ctx.db.query("agenda_items").withIndex("by_submission", (q) => q.eq("submissionId", args.submissionId)).first(),
      ctx.db.query("comms_templates").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    const speakerIds = [...new Set([...(submission.speakerId ? [submission.speakerId] : []), ...(agenda?.speakerIds ?? [])])];
    const speakers = (await Promise.all(speakerIds.map((speakerId) => ctx.db.get(speakerId))))
      .filter((speaker) => speaker?.eventId === args.eventId);
    const room = agenda ? await ctx.db.get(agenda.roomId) : null;
    const kind = submission.status === "accepted" ? "acceptance" : submission.status === "declined" ? "rejection" : undefined;
    const template = kind ? templates.filter((entry) => entry.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined;
    return { submission, speakers, event, agenda, room, template };
  },
});

export const reminderContext = internalQuery({
  args: { eventId: v.id("events"), speakerId: v.id("speakers"), taskId: v.optional(v.id("onboarding_tasks")) },
  handler: async (ctx, args) => {
    const speaker = await ctx.db.get(args.speakerId);
    if (!speaker || speaker.eventId !== args.eventId) return null;
    const event = await ctx.db.get(args.eventId);
    const requestedTask = args.taskId ? await ctx.db.get(args.taskId) : null;
    const task = requestedTask?.eventId === args.eventId && requestedTask.speakerId === args.speakerId ? requestedTask : null;
    // Fall back to the speaker's oldest open task so "Send reminder" works without the
    // organizer having to pick one when there's an obvious single candidate.
    const fallbackTask = task
      ? null
      : await ctx.db
          .query("onboarding_tasks")
          .withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId))
          .filter((q) => q.neq(q.field("status"), "completed"))
          .first();
    // Prefer a submission title on the speaker's most recent submission, so the reminder can
    // say "your session" by name even when the task itself isn't submission-scoped.
    const fallbackSubmission = await ctx.db
      .query("submissions")
      .withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId))
      .order("desc")
      .first();
    const agendaItems = await ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    const agenda = agendaItems.find((item) => item.speakerIds.includes(args.speakerId));
    const submission = agenda?.submissionId ? await ctx.db.get(agenda.submissionId) : fallbackSubmission;
    const room = agenda ? await ctx.db.get(agenda.roomId) : null;
    const templates = await ctx.db.query("comms_templates").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    const template = templates.filter((entry) => entry.kind === "reminder").sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return { speaker, event, task: task ?? fallbackTask, submission, agenda, room, template };
  },
});

export const consolidatedDecisionContext = internalQuery({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    const speaker = await ctx.db.get(args.speakerId);
    if (!speaker || speaker.eventId !== args.eventId) return null;
    const [event, submissions, agendaItems, templates] = await Promise.all([
      ctx.db.get(args.eventId),
      ctx.db.query("submissions").withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId)).collect(),
      ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("comms_templates").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    const decided = submissions.filter((submission) => submission.status === "accepted" || submission.status === "declined");
    const agenda = agendaItems.filter((item) => item.submissionId && decided.some((submission) => submission._id === item.submissionId));
    const rooms = await Promise.all([...new Set(agenda.map((item) => item.roomId))].map((roomId) => ctx.db.get(roomId)));
    const template = templates.filter((entry) => entry.kind === "consolidated_decision").sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return { speaker, event, submissions: decided, agenda, rooms, template };
  },
});
