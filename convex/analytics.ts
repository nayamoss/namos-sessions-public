import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertEventOrganizerAccess } from "./functions";
import { buildEventAnalyticsSummary } from "../src/lib/event-analytics";

export const summary = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await assertEventOrganizerAccess(ctx, eventId);
    const [submissions, evaluations, assignments, speakers, agenda, communications, tasks] =
      await Promise.all([
        ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("evaluations").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("evaluation_assignments").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("comms_log").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
        ctx.db.query("onboarding_tasks").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
      ]);

    return buildEventAnalyticsSummary({
      submissions: submissions.map((row) => ({ id: row._id, status: row.status })),
      evaluations: evaluations.map((row) => ({ assignmentId: row.assignmentId })),
      assignments: assignments.map((row) => ({ id: row._id })),
      speakers,
      agenda,
      communications,
      tasks,
    });
  },
});
