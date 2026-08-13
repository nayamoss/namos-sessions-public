"use node";

import { v } from "convex/values";
import React from "react";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { assertOrganizerAction, deliverEventEmail } from "./emailDelivery";
import { renderEmail } from "./commsEmailRender";
import { DecisionAcceptedEmail } from "../src/emails/templates/decision-accepted";
import { DecisionDeclinedEmail } from "../src/emails/templates/decision-declined";
import { ReminderEmail } from "../src/emails/templates/reminder";
import { DecisionConsolidatedEmail } from "../src/emails/templates/decision-consolidated";
import { resolveCommTemplate, type CommTemplateTokens } from "../src/lib/comms-template-tokens";
import { calendarAttachment } from "../src/lib/calendar-invite-core.mjs";

export type SendResult = { speakerId?: string; toEmail?: string; status: "sent" | "failed" | "skipped"; error?: string; reason?: string };
export type SendBatch = { status: "sent" | "failed" | "skipped"; requested: number; sent: number; failed: number; skipped: number; results: SendResult[] };

function portalUrl(): string {
  const origin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin) throw new Error("PUBLIC_APP_ORIGIN is not configured.");
  return new URL("/portal", origin).toString();
}

function displayName(speaker: { firstName: string; lastName: string }): string {
  return `${speaker.firstName} ${speaker.lastName}`.trim();
}

function batch(results: SendResult[]): SendBatch {
  const sent = results.filter((result) => result.status === "sent").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  return { status: failed ? "failed" : sent ? "sent" : "skipped", requested: results.length, sent, failed, skipped, results };
}

function scheduleLabel(startTime: number | undefined, timeZone: string | undefined) {
  if (!startTime) return undefined;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: timeZone || "UTC" }).format(startTime);
}

function inviteFor(context: {
  agenda?: { _id: Id<"agenda_items">; title: string; startTime: number; endTime: number; calendarUid?: string; calendarSequence?: number; videoUrl?: string; locationDetails?: string } | null;
  room?: { name: string } | null;
  event?: { name: string; location?: string } | null;
  portal: string;
}) {
  if (!context.agenda) return undefined;
  const location = [context.room?.name, context.agenda.locationDetails, context.event?.location].filter(Boolean).join(" · ");
  return calendarAttachment({
    uid: context.agenda.calendarUid ?? `sessionboard-${context.agenda._id}`,
    sequence: context.agenda.calendarSequence ?? 0,
    title: context.agenda.title,
    startTime: context.agenda.startTime,
    endTime: context.agenda.endTime,
    location,
    url: context.agenda.videoUrl,
    description: [`Speaker portal: ${context.portal}`, context.agenda.videoUrl ? `Join online: ${context.agenda.videoUrl}` : undefined].filter(Boolean).join("\n"),
  });
}

export const sendDecision = action({
  args: { eventId: v.id("events"), submissionId: v.id("submissions"), recipientSpeakerIds: v.optional(v.array(v.id("speakers"))) },
  handler: async (ctx, args): Promise<SendBatch> => {
    await assertOrganizerAction(ctx);
    const context = await ctx.runQuery(internal.commsData.decisionContext, { eventId: args.eventId, submissionId: args.submissionId });
    if (!context) throw new Error("Submission not found for this event.");
    const { submission, event, agenda, room, template } = context;
    if (submission.status !== "accepted" && submission.status !== "declined") throw new Error("A decision can only be sent once the submission is accepted or declined.");
    const allowed = args.recipientSpeakerIds ? new Set(args.recipientSpeakerIds) : undefined;
    const speakers = context.speakers.filter((speaker) => speaker && (!allowed || allowed.has(speaker._id)));
    if (!speakers.length) return batch([{ status: "skipped", reason: "This submission has no eligible speakers." }]);

    let portal: string;
    try { portal = portalUrl(); }
    catch (cause) {
      const error = cause instanceof Error ? cause.message : "Portal link is not configured.";
      const results = speakers.map((speaker) => ({ speakerId: speaker!._id, toEmail: speaker!.email, status: "failed" as const, error }));
      for (const speaker of speakers) if (speaker?.email.trim()) await recordAttempt(ctx, { eventId: args.eventId, submissionId: args.submissionId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject: "(unavailable)", channel: "email", status: "failed", error });
      return batch(results);
    }
    const decision = submission.status;
    const eventName = event?.name ?? "your event";
    const attachment = decision === "accepted" ? inviteFor({ agenda, room, event, portal }) : undefined;
    const results: SendResult[] = [];
    for (const speaker of speakers) {
      if (!speaker?.email.trim()) { results.push({ speakerId: speaker?._id, status: "skipped", reason: "No valid email is on file." }); continue; }
      const tokens: CommTemplateTokens = {
        speakerName: displayName(speaker), eventName, sessionTitle: submission.title, portalUrl: portal,
        scheduleTime: scheduleLabel(agenda?.startTime, event?.timezone),
        location: [room?.name, agenda?.locationDetails, event?.location].filter(Boolean).join(" · "),
        videoUrl: agenda?.videoUrl,
      };
      const subject = template ? resolveCommTemplate(template.subject, tokens) : decision === "accepted" ? `Your submission has been accepted for ${eventName}` : `Update on your submission to ${eventName}`;
      const customMessage = template ? resolveCommTemplate(template.body, tokens) : undefined;
      const props = { speakerName: tokens.speakerName, eventName, sessionTitle: submission.title, portalUrl: portal, customMessage };
      const { html, text } = await renderEmail(decision === "accepted" ? React.createElement(DecisionAcceptedEmail, props) : React.createElement(DecisionDeclinedEmail, props));
      let error: string | undefined;
      try { await deliverEventEmail(ctx, args.eventId, { to: speaker.email, subject, text, html, ...(attachment ? { attachments: [attachment] } : {}) }); }
      catch (cause) { error = cause instanceof Error ? cause.message : "Email delivery failed."; }
      await recordAttempt(ctx, { eventId: args.eventId, submissionId: args.submissionId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject, channel: "email", status: error ? "failed" : "sent", error });
      if (attachment) await recordAttempt(ctx, { eventId: args.eventId, submissionId: args.submissionId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject, channel: "calendar_invite", status: error ? "failed" : "sent", error });
      results.push(error ? { speakerId: speaker._id, toEmail: speaker.email, status: "failed", error } : { speakerId: speaker._id, toEmail: speaker.email, status: "sent" });
    }
    return batch(results);
  },
});

export const sendReminder = action({
  args: { eventId: v.id("events"), speakerId: v.id("speakers"), taskId: v.optional(v.id("onboarding_tasks")) },
  handler: async (ctx, args): Promise<SendBatch> => {
    await assertOrganizerAction(ctx);
    const context = await ctx.runQuery(internal.commsData.reminderContext, args);
    if (!context) throw new Error("Speaker not found for this event.");
    const { speaker, event, task, submission, agenda, room, template } = context;
    if (!speaker.email.trim()) return batch([{ speakerId: speaker._id, status: "skipped", reason: "This speaker has no email on file." }]);
    let portal: string;
    try { portal = portalUrl(); }
    catch (cause) {
      const error = cause instanceof Error ? cause.message : "Portal link is not configured.";
      await recordAttempt(ctx, { eventId: args.eventId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject: "(unavailable)", channel: "email", status: "failed", error });
      return batch([{ speakerId: speaker._id, toEmail: speaker.email, status: "failed", error }]);
    }
    const eventName = event?.name ?? "your event";
    const dueDate = task?.dueDate ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: event?.timezone ?? "UTC" }).format(task.dueDate) : undefined;
    const tokens: CommTemplateTokens = {
      speakerName: displayName(speaker), eventName, sessionTitle: submission?.title ?? "your session", portalUrl: portal,
      taskTitle: task?.title, dueDate, scheduleTime: scheduleLabel(agenda?.startTime, event?.timezone),
      location: [room?.name, agenda?.locationDetails, event?.location].filter(Boolean).join(" · "), videoUrl: agenda?.videoUrl,
    };
    const subject = template ? resolveCommTemplate(template.subject, tokens) : `Reminder: action needed for ${eventName}`;
    const customMessage = template ? resolveCommTemplate(template.body, tokens) : undefined;
    const { html, text } = await renderEmail(React.createElement(ReminderEmail, { speakerName: tokens.speakerName, eventName, sessionTitle: tokens.sessionTitle!, portalUrl: portal, taskTitle: task?.title, dueDate, customMessage }));
    const attachment = inviteFor({ agenda, room, event, portal });
    let error: string | undefined;
    try { await deliverEventEmail(ctx, args.eventId, { to: speaker.email, subject, text, html, ...(attachment ? { attachments: [attachment] } : {}) }); }
    catch (cause) { error = cause instanceof Error ? cause.message : "Email delivery failed."; }
    await recordAttempt(ctx, { eventId: args.eventId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject, channel: "email", status: error ? "failed" : "sent", error });
    if (attachment) await recordAttempt(ctx, { eventId: args.eventId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject, channel: "calendar_invite", status: error ? "failed" : "sent", error });
    return batch([error ? { speakerId: speaker._id, toEmail: speaker.email, status: "failed", error } : { speakerId: speaker._id, toEmail: speaker.email, status: "sent" }]);
  },
});

export const sendConsolidatedDecision = action({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  handler: async (ctx, args): Promise<SendBatch> => {
    await assertOrganizerAction(ctx);
    const context = await ctx.runQuery(internal.commsData.consolidatedDecisionContext, args);
    if (!context) throw new Error("Speaker not found for this event.");
    const { speaker, event, submissions, agenda, rooms, template } = context;
    if (submissions.length < 2) throw new Error("A combined decision email needs at least two decided submissions for this speaker.");
    if (!speaker.email.trim()) return batch([{ speakerId: speaker._id, status: "skipped", reason: "This speaker has no email on file." }]);
    let portal: string;
    try { portal = portalUrl(); }
    catch (cause) {
      const error = cause instanceof Error ? cause.message : "Portal link is not configured.";
      await recordAttempt(ctx, { eventId: args.eventId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject: "(unavailable)", channel: "email", status: "failed", error });
      return batch([{ speakerId: speaker._id, toEmail: speaker.email, status: "failed", error }]);
    }
    const eventName = event?.name ?? "your event";
    const items = submissions.map((submission) => ({ sessionTitle: submission.title, outcome: submission.status as "accepted" | "declined" }));
    const tokens: CommTemplateTokens = { speakerName: displayName(speaker), eventName, sessionTitle: submissions.map((submission) => submission.title).join(", "), portalUrl: portal };
    const subject = template ? resolveCommTemplate(template.subject, tokens) : `Your submission decisions for ${eventName}`;
    const customMessage = template ? resolveCommTemplate(template.body, tokens) : undefined;
    const { html, text } = await renderEmail(React.createElement(DecisionConsolidatedEmail, { speakerName: tokens.speakerName, eventName, sessionTitle: tokens.sessionTitle!, portalUrl: portal, submissions: items, customMessage }));
    const attachments = agenda.map((item) => inviteFor({ agenda: item, room: rooms.find((room) => room?._id === item.roomId), event, portal })).filter(Boolean);
    let error: string | undefined;
    try { await deliverEventEmail(ctx, args.eventId, { to: speaker.email, subject, text, html, ...(attachments.length ? { attachments } : {}) }); }
    catch (cause) { error = cause instanceof Error ? cause.message : "Email delivery failed."; }
    await recordAttempt(ctx, { eventId: args.eventId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject, channel: "email", status: error ? "failed" : "sent", error });
    for (const item of agenda) await recordAttempt(ctx, { eventId: args.eventId, submissionId: item.submissionId, speakerId: speaker._id, templateId: template?._id, toEmail: speaker.email, subject, channel: "calendar_invite", status: error ? "failed" : "sent", error });
    return batch([error ? { speakerId: speaker._id, toEmail: speaker.email, status: "failed", error } : { speakerId: speaker._id, toEmail: speaker.email, status: "sent" }]);
  },
});

async function recordAttempt(ctx: ActionCtx, args: {
  eventId: Id<"events">; submissionId?: Id<"submissions">; speakerId?: Id<"speakers">; templateId?: Id<"comms_templates">;
  toEmail: string; subject: string; channel: "email" | "calendar_invite"; status: "sent" | "failed"; error?: string;
}) {
  try {
    await ctx.runMutation(api.comms.recordDelivery, {
      eventId: args.eventId, submissionId: args.submissionId, speakerId: args.speakerId, templateId: args.templateId,
      channel: args.channel, status: args.status, toEmail: args.toEmail, subject: args.subject || "(unavailable)",
      ...(args.error ? { error: args.error.slice(0, 500) } : {}),
    });
  } catch { /* delivery outcome is authoritative; audit logging is best effort */ }
}
