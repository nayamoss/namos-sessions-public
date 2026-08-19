import { v, type Infer } from "convex/values";
import { mutation, query, assertEventAccess, assertEventOrganizerAccess } from "./functions";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { resolveCommTemplate } from "../src/lib/comms-template-tokens";
import { eventOrganizers, notifyEvent } from "./notifications";

const templateKind = v.union(
  v.literal("submission_confirmation"),
  v.literal("acceptance"),
  v.literal("rejection"),
  v.literal("consolidated_decision"),
  v.literal("reminder"),
  v.literal("calendar_invite"),
  v.literal("custom"),
);

const deliveryStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
);

export const listTemplates = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return ctx.db
      .query("comms_templates")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const saveTemplate = mutation({
  args: {
    id: v.optional(v.id("comms_templates")),
    eventId: v.id("events"),
    name: v.string(),
    kind: templateKind,
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    if (!args.name.trim() || !args.subject.trim() || !args.body.trim())
      throw new Error("A template needs a name, subject, and body.");
    const now = Date.now();
    const { id, ...fields } = args;
    const values = {
      ...fields,
      name: fields.name.trim(),
      subject: fields.subject.trim(),
      body: fields.body.trim(),
    };
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing || existing.eventId !== args.eventId)
        throw new Error("Template not found for this event.");
      await ctx.db.patch(id, { ...values, updatedAt: now });
      return id;
    }
    return ctx.db.insert("comms_templates", {
      ...values,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listLog = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db
      .query("comms_log")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const list = listLog;

export const listDrafts = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return ctx.db.query("communication_drafts").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).order("desc").collect();
  },
});

const nameOf = (speaker: { firstName: string; lastName: string }) => `${speaker.firstName} ${speaker.lastName}`.trim();
const scheduleOf = (time: number | undefined, timeZone: string | undefined) => time ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: timeZone || "UTC" }).format(time) : undefined;

export const previewDecision = query({
  args: { eventId: v.id("events"), submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.eventId !== args.eventId) throw new Error("Submission not found for this event.");
    if (submission.status !== "accepted" && submission.status !== "declined") throw new Error("Decide this submission before preparing its email.");
    const [event, agenda, templates] = await Promise.all([
      ctx.db.get(args.eventId),
      ctx.db.query("agenda_items").withIndex("by_submission", (q) => q.eq("submissionId", args.submissionId)).first(),
      ctx.db.query("comms_templates").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    const room = agenda ? await ctx.db.get(agenda.roomId) : null;
    const speakerIds = [...new Set([...(submission.speakerId ? [submission.speakerId] : []), ...(agenda?.speakerIds ?? [])])];
    const speakers = (await Promise.all(speakerIds.map((id) => ctx.db.get(id)))).filter((speaker) => speaker?.eventId === args.eventId);
    const kind = submission.status === "accepted" ? "acceptance" : "rejection";
    const template = templates.filter((entry) => entry.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const baseTokens = { eventName: event?.name ?? "your event", sessionTitle: submission.title, portalUrl: "/portal", scheduleTime: scheduleOf(agenda?.startTime, event?.timezone), location: [room?.name, agenda?.locationDetails, event?.location].filter(Boolean).join(" · "), videoUrl: agenda?.videoUrl };
    const sampleTokens = { ...baseTokens, speakerName: speakers[0] ? nameOf(speakers[0]!) : "Speaker" };
    return {
      kind, templateId: template?._id, templateName: template?.name,
      subject: template ? resolveCommTemplate(template.subject, sampleTokens) : kind === "acceptance" ? `Your submission has been accepted for ${baseTokens.eventName}` : `Update on your submission to ${baseTokens.eventName}`,
      body: template ? resolveCommTemplate(template.body, sampleTokens) : kind === "acceptance" ? `Great news — “${submission.title}” has been accepted.` : `Thank you for submitting “${submission.title}”. We are not able to include it in this program.`,
      recipients: speakers.map((speaker) => ({ speakerId: speaker!._id, name: nameOf(speaker!), email: speaker!.email })),
      calendarAttached: kind === "acceptance" && Boolean(agenda), scheduleTime: baseTokens.scheduleTime, location: baseTokens.location || undefined,
    };
  },
});

export const previewReminder = query({
  args: { eventId: v.id("events"), speakerId: v.id("speakers"), taskId: v.optional(v.id("onboarding_tasks")) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const [speaker, event, tasks, agendaItems, templates] = await Promise.all([
      ctx.db.get(args.speakerId), ctx.db.get(args.eventId),
      ctx.db.query("onboarding_tasks").withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId)).collect(),
      ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("comms_templates").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    if (!speaker || speaker.eventId !== args.eventId) throw new Error("Speaker not found for this event.");
    const task = args.taskId ? tasks.find((entry) => entry._id === args.taskId) : tasks.find((entry) => entry.status !== "completed");
    const agenda = agendaItems.find((entry) => entry.speakerIds.includes(args.speakerId));
    const submission = agenda?.submissionId ? await ctx.db.get(agenda.submissionId) : null;
    const room = agenda ? await ctx.db.get(agenda.roomId) : null;
    const template = templates.filter((entry) => entry.kind === "reminder").sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const tokens = { speakerName: nameOf(speaker), eventName: event?.name ?? "your event", sessionTitle: submission?.title ?? "your session", portalUrl: "/portal", taskTitle: task?.title, dueDate: task?.dueDate ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: event?.timezone ?? "UTC" }).format(task.dueDate) : undefined, scheduleTime: scheduleOf(agenda?.startTime, event?.timezone), location: [room?.name, agenda?.locationDetails, event?.location].filter(Boolean).join(" · "), videoUrl: agenda?.videoUrl };
    return {
      kind: "reminder" as const, templateId: template?._id, templateName: template?.name,
      subject: template ? resolveCommTemplate(template.subject, tokens) : `Reminder: action needed for ${tokens.eventName}`,
      body: template ? resolveCommTemplate(template.body, tokens) : task?.title ? `${task.title}${tokens.dueDate ? ` is due ${tokens.dueDate}.` : "."}` : "A speaker task is ready for your attention.",
      recipients: [{ speakerId: speaker._id, name: nameOf(speaker), email: speaker.email }], calendarAttached: Boolean(agenda), scheduleTime: tokens.scheduleTime, location: tokens.location || undefined,
    };
  },
});

export const previewConsolidatedDecision = query({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const [speaker, event, submissions, agendaItems, templates] = await Promise.all([
      ctx.db.get(args.speakerId), ctx.db.get(args.eventId),
      ctx.db.query("submissions").withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId)).collect(),
      ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("comms_templates").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    if (!speaker || speaker.eventId !== args.eventId) throw new Error("Speaker not found for this event.");
    const decided = submissions.filter((submission) => submission.status === "accepted" || submission.status === "declined");
    if (decided.length < 2) throw new Error("This speaker does not have two decided submissions to combine.");
    const template = templates.filter((entry) => entry.kind === "consolidated_decision").sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const tokens = { speakerName: nameOf(speaker), eventName: event?.name ?? "your event", sessionTitle: decided.map((submission) => submission.title).join(", "), portalUrl: "/portal" };
    const acceptedAgenda = agendaItems.filter((item) => item.submissionId && decided.some((submission) => submission._id === item.submissionId && submission.status === "accepted"));
    return {
      kind: "consolidated_decision" as const, templateId: template?._id, templateName: template?.name,
      subject: template ? resolveCommTemplate(template.subject, tokens) : `Your submission decisions for ${tokens.eventName}`,
      body: template ? resolveCommTemplate(template.body, tokens) : decided.map((submission) => `${submission.title}: ${submission.status === "accepted" ? "Accepted" : "Not selected"}`).join("\n"),
      recipients: [{ speakerId: speaker._id, name: nameOf(speaker), email: speaker.email }], calendarAttached: acceptedAgenda.length > 0,
      attachmentCount: acceptedAgenda.length,
    };
  },
});

// Call this for every provider outcome. It intentionally creates a new immutable entry rather
// than updating a prior attempt, which leaves organizers an auditable delivery history.
const recordDeliveryArgs = {
  eventId: v.id("events"),
  speakerId: v.optional(v.id("speakers")),
  submissionId: v.optional(v.id("submissions")),
  templateId: v.optional(v.id("comms_templates")),
  channel: v.union(v.literal("email"), v.literal("calendar_invite")),
  status: deliveryStatus,
  toEmail: v.string(),
  subject: v.string(),
  sentAt: v.optional(v.number()),
  error: v.optional(v.string()),
};
type RecordDeliveryArgs = Infer<ReturnType<typeof v.object<typeof recordDeliveryArgs>>>;

async function insertDeliveryLog(ctx: MutationCtx, args: RecordDeliveryArgs) {
  if (!args.toEmail.trim())
    throw new Error("A delivery log needs a recipient email.");
  if (!args.subject.trim())
    throw new Error("A delivery log needs a subject.");
  if (args.status === "failed" && !args.error?.trim())
    throw new Error("A failed delivery must include the provider error.");
  if (args.templateId) {
    const template = await ctx.db.get(args.templateId);
    if (!template || template.eventId !== args.eventId)
      throw new Error("Template not found for this event.");
  }
  const now = Date.now();
  const logId = await ctx.db.insert("comms_log", {
    ...args,
    toEmail: args.toEmail.trim(),
    subject: args.subject.trim(),
    error: args.error?.trim() || undefined,
    sentAt: args.status === "sent" ? (args.sentAt ?? now) : args.sentAt,
    createdAt: now,
  });
  if (args.status === "failed") {
    const event = await ctx.db.get(args.eventId);
    await notifyEvent(ctx, {
      eventId: args.eventId,
      kind: "comms_delivery_failed",
      title: "Communication delivery failed",
      body: `${args.toEmail.trim()} · ${args.subject.trim()}`,
      linkPath: event ? `/events/${event.slug}/program/communications` : undefined,
      relatedId: logId,
      recipientUserIds: await eventOrganizers(ctx, args.eventId),
      highPriority: true,
    });
  }
  return logId;
}

export const recordDelivery = mutation({
  args: recordDeliveryArgs,
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return insertDeliveryLog(ctx, args);
  },
});

// Internal-only counterpart of recordDelivery for server-triggered sends (e.g. the portal-form
// confirmation action, run via ctx.scheduler with no signed-in caller) where assertEventAccess's
// identity check would have nothing to check against.
export const recordDeliveryInternal = internalMutation({
  args: recordDeliveryArgs,
  handler: insertDeliveryLog,
});
