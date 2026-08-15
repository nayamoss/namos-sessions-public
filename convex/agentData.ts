import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { conflictRows } from "./agenda";
import type { Id } from "./_generated/dataModel";

const boundedLimit = (value: number | undefined, maximum: number) => Math.max(1, Math.min(maximum, Math.floor(value ?? maximum)));

export const eventOverview = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const [submissions, speakers, tasks, agenda, assignments, comms] = await Promise.all([
      ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("onboarding_tasks").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("evaluation_assignments").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("comms_log").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    return {
      event: { id: event._id, name: event.name, slug: event.slug, timezone: event.timezone, startDate: event.startDate, endDate: event.endDate, status: event.status, programPublishedAt: event.programPublishedAt },
      counts: { submissions: submissions.length, acceptedSubmissions: submissions.filter((row) => row.status === "accepted").length, speakers: speakers.length, unconfirmedSpeakers: speakers.filter((row) => row.confirmationStatus !== "confirmed").length, openTasks: tasks.filter((row) => row.status !== "completed").length, overdueTasks: tasks.filter((row) => row.status !== "completed" && row.dueDate !== undefined && row.dueDate < Date.now()).length, agendaItems: agenda.length, unpublishedAgendaItems: agenda.filter((row) => !row.isPublished).length, reviewAssignments: assignments.length, failedCommunications: comms.filter((row) => row.status === "failed").length },
    };
  },
});

export const submissions = internalQuery({
  args: { eventId: v.id("events"), statuses: v.optional(v.array(v.string())), tagId: v.optional(v.string()), trackId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return rows.filter((row) => !args.statuses?.length || args.statuses.includes(row.status)).filter((row) => !args.tagId || row.tagIds?.includes(args.tagId as Id<"tags">)).filter((row) => !args.trackId || row.trackId === args.trackId).slice(0, boundedLimit(args.limit, 200)).map((row) => ({ id: row._id, title: row.title, status: row.status, speakerId: row.speakerId, tagIds: row.tagIds ?? [], trackId: row.trackId, updatedAt: row.updatedAt }));
  },
});

export const submission = internalQuery({
  args: { eventId: v.id("events"), submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.submissionId);
    if (!row || row.eventId !== args.eventId) throw new Error("Submission not found for this event.");
    const speaker = row.speakerId ? await ctx.db.get(row.speakerId) : null;
    const answers = row.answers && typeof row.answers === "object" ? Object.fromEntries(Object.entries(row.answers as Record<string, unknown>).slice(0, 30).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 1000) : value])) : {};
    return { id: row._id, title: row.title, status: row.status, answers, speaker: speaker ? { id: speaker._id, name: `${speaker.firstName} ${speaker.lastName}`.trim(), confirmationStatus: speaker.confirmationStatus } : undefined, tagIds: row.tagIds ?? [], trackId: row.trackId };
  },
});

export const speakers = internalQuery({
  args: { eventId: v.id("events"), confirmationStatus: v.optional(v.string()), needsAttentionOnly: v.optional(v.boolean()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return rows.filter((row) => !args.confirmationStatus || (row.confirmationStatus ?? "awaiting") === args.confirmationStatus).filter((row) => !args.needsAttentionOnly || row.confirmationStatus !== "confirmed" || !row.bio || !row.headshotStorageKey).slice(0, boundedLimit(args.limit, 200)).map((row) => ({ id: row._id, name: `${row.firstName} ${row.lastName}`.trim(), confirmationStatus: row.confirmationStatus ?? "awaiting", status: row.status, hasBio: Boolean(row.bio), hasHeadshot: Boolean(row.headshotStorageKey), hasEmail: Boolean(row.email) }));
  },
});

export const tasks = internalQuery({
  args: { eventId: v.id("events"), statuses: v.optional(v.array(v.string())), overdueOnly: v.optional(v.boolean()), speakerId: v.optional(v.string()), submissionId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db.query("onboarding_tasks").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return rows.filter((row) => !args.statuses?.length || args.statuses.includes(row.status)).filter((row) => !args.overdueOnly || (row.status !== "completed" && row.dueDate !== undefined && row.dueDate < now)).filter((row) => !args.speakerId || row.speakerId === args.speakerId).filter((row) => !args.submissionId || row.submissionId === args.submissionId).slice(0, boundedLimit(args.limit, 200)).map((row) => ({ id: row._id, title: row.title, targetType: row.targetType, status: row.status, source: row.source, dueDate: row.dueDate, speakerId: row.speakerId, submissionId: row.submissionId, sponsorId: row.sponsorId }));
  },
});

export const agenda = internalQuery({
  args: { eventId: v.id("events"), from: v.optional(v.number()), to: v.optional(v.number()), roomId: v.optional(v.string()), trackId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const rows = await ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return { timezone: event?.timezone ?? "UTC", items: rows.filter((row) => args.from === undefined || row.endTime >= args.from).filter((row) => args.to === undefined || row.startTime <= args.to).filter((row) => !args.roomId || row.roomId === args.roomId).filter((row) => !args.trackId || row.trackId === args.trackId).sort((a, b) => a.startTime - b.startTime).slice(0, boundedLimit(args.limit, 200)).map((row) => ({ id: row._id, title: row.title, startTime: row.startTime, endTime: row.endTime, roomId: row.roomId, trackId: row.trackId, speakerIds: row.speakerIds, submissionId: row.submissionId, isPublished: row.isPublished })) };
  },
});

export const conflicts = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return conflictRows(rows).map((conflict) => ({ ...conflict, itemATitle: rows.find((row) => row._id === conflict.itemA)?.title, itemBTitle: rows.find((row) => row._id === conflict.itemB)?.title }));
  },
});

export const reviewCoverage = internalQuery({
  args: { eventId: v.id("events"), evaluationPlanId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const [submissions, assignments] = await Promise.all([ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(), ctx.db.query("evaluation_assignments").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect()]);
    const filtered = args.evaluationPlanId ? assignments.filter((row) => row.evaluationPlanId === args.evaluationPlanId) : assignments;
    const assigned = new Set(filtered.map((row) => row.submissionId));
    return { submissionCount: submissions.length, assignmentCount: filtered.length, reviewerCount: new Set(filtered.map((row) => row.reviewerUserId)).size, unassignedSubmissionIds: submissions.filter((row) => !assigned.has(row._id)).slice(0, 200).map((row) => row._id), byReviewer: [...new Map(filtered.map((row) => [row.reviewerUserId, 0])).keys()].slice(0, 200).map((reviewerUserId) => ({ reviewerUserId, count: filtered.filter((row) => row.reviewerUserId === reviewerUserId).length })) };
  },
});

export const failedCommunications = internalQuery({
  args: { eventId: v.id("events"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => (await ctx.db.query("comms_log").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect()).filter((row) => row.status === "failed").sort((a, b) => b.createdAt - a.createdAt).slice(0, boundedLimit(args.limit, 100)).map((row) => ({ id: row._id, channel: row.channel, speakerId: row.speakerId, submissionId: row.submissionId, subject: row.subject.slice(0, 200), error: row.error?.slice(0, 500), createdAt: row.createdAt })),
});
