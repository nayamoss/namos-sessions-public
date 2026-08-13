import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { mutation, query, requireIdentity } from "./functions";
import { assertOwnsSpeaker } from "./speakers";

const portalKinds = new Set(["contact", "group", "submission_task"]);

type PortalFormCtx = QueryCtx | MutationCtx;

// A signed-in speaker may only read/write their own portal form responses — the
// client-supplied speakerId is never trusted on its own.
async function loadPortalForm(ctx: PortalFormCtx, eventId: Id<"events">, formId: Id<"submission_forms">, speakerId: Id<"speakers">) {
  const identity = await requireIdentity(ctx);
  const [form, speaker] = await Promise.all([ctx.db.get(formId), ctx.db.get(speakerId)]);
  if (!form || form.eventId !== eventId || !portalKinds.has(form.kind)) throw new Error("Portal form was not found for this event.");
  if (!speaker || speaker.eventId !== eventId) throw new Error("Speaker was not found for this event.");
  assertOwnsSpeaker(identity, speaker);
  return form;
}

export const get = query({
  args: { eventId: v.id("events"), formId: v.id("submission_forms"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    const form = await loadPortalForm(ctx, args.eventId, args.formId, args.speakerId);
    const section = form.sections.find((item) => item.key === "portal");
    const fieldIds = section?.fieldIds ?? [];
    const fieldsById = new Map<string, Doc<"field_definitions">>((await ctx.db.query("field_definitions").collect()).map((field) => [String(field._id), field]));
    const response = await ctx.db.query("form_responses").withIndex("by_form_speaker", (q) => q.eq("formId", args.formId).eq("speakerId", args.speakerId)).first();
    return { id: form._id, title: form.externalTitle, sectionTitle: section?.title ?? "Form", description: section?.description, fields: fieldIds.flatMap((id: string) => { const field = fieldsById.get(id); return field ? [{ id, label: field.label, type: field.type, required: field.required, maxChars: field.maxChars, options: field.options, showIf: field.showIf }] : []; }), answers: response?.answers ?? {} };
  },
});

function buildNotificationContext(form: Doc<"submission_forms">, speaker: Doc<"speakers">, event: Doc<"events">) {
  return { enabled: form.portalFormSettings?.sendConfirmationEmail ?? false, confirmationBody: form.portalFormSettings?.confirmationBody, eventName: event.name, formTitle: form.externalTitle, speakerName: `${speaker.firstName} ${speaker.lastName}`.trim() || "Speaker", toEmail: speaker.email };
}

export const notificationContext = query({
  args: { eventId: v.id("events"), formId: v.id("submission_forms"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    const [form, speaker, event] = await Promise.all([loadPortalForm(ctx, args.eventId, args.formId, args.speakerId), ctx.db.get(args.speakerId), ctx.db.get(args.eventId)]);
    if (!speaker || !event) throw new Error("Portal form notification context was not found.");
    return buildNotificationContext(form, speaker, event);
  },
});

// Internal counterpart for the confirmation-email action (convex/portalFormConfirmationActions.ts),
// which runs server-side via ctx.scheduler right after `submit` and has no signed-in caller to
// check ownership against — submit already verified eventId/formId/speakerId belong together.
export const notificationContextInternal = internalQuery({
  args: { eventId: v.id("events"), formId: v.id("submission_forms"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    const [form, speaker, event] = await Promise.all([ctx.db.get(args.formId), ctx.db.get(args.speakerId), ctx.db.get(args.eventId)]);
    if (!form || form.eventId !== args.eventId || !portalKinds.has(form.kind)) throw new Error("Portal form was not found for this event.");
    if (!speaker || speaker.eventId !== args.eventId) throw new Error("Speaker was not found for this event.");
    if (!event) throw new Error("Portal form notification context was not found.");
    return buildNotificationContext(form, speaker, event);
  },
});

export const submit = mutation({
  args: { eventId: v.id("events"), formId: v.id("submission_forms"), speakerId: v.id("speakers"), taskId: v.optional(v.id("onboarding_tasks")), answers: v.record(v.string(), v.string()) },
  handler: async (ctx, args) => {
    const form = await loadPortalForm(ctx, args.eventId, args.formId, args.speakerId);
    const section = form.sections.find((item) => item.key === "portal");
    const fieldIds: string[] = section?.fieldIds ?? [];
    const fieldsById = new Map<string, Doc<"field_definitions">>((await ctx.db.query("field_definitions").collect()).map((field) => [String(field._id), field]));
    const fields = fieldIds.flatMap((id) => {
      const field = fieldsById.get(id);
      return field ? [field] : [];
    });
    const knownFieldIds = new Set(fields.map((field) => String(field._id)));
    for (const key of Object.keys(args.answers)) if (!knownFieldIds.has(key)) throw new Error("The response contains an unknown field.");
    for (const field of fields) {
      const value = args.answers[field._id] ?? "";
      const visible = !field.showIf || args.answers[field.showIf.fieldId] === field.showIf.equals;
      // Hidden conditional fields are optional, but supplied values still retain the
      // form's character limit so stored responses cannot bypass field constraints.
      if (visible && field.required && !value.trim()) throw new Error(`${field.label} is required.`);
      if (field.maxChars !== undefined && value.length > field.maxChars) throw new Error(`${field.label} exceeds its character limit.`);
    }
    if (args.taskId) { const task = await ctx.db.get(args.taskId); if (!task || task.eventId !== args.eventId || task.speakerId !== args.speakerId || task.linkedFormId !== args.formId) throw new Error("Task does not belong to this speaker and portal form."); await ctx.db.patch(args.taskId, { status: "completed", completedAt: Date.now(), updatedAt: Date.now() }); }
    const now = Date.now(); const existing = await ctx.db.query("form_responses").withIndex("by_form_speaker", (q) => q.eq("formId", args.formId).eq("speakerId", args.speakerId)).first();
    const responseId = existing
      ? (await ctx.db.patch(existing._id, { answers: args.answers, updatedAt: now }), existing._id)
      : await ctx.db.insert("form_responses", { eventId: args.eventId, formId: args.formId, speakerId: args.speakerId, answers: args.answers, createdAt: now, updatedAt: now });
    // Fire-and-forget confirmation email — never blocks or fails a valid submission. Ported off
    // the Netlify function that used to be triggered by a browser-side fetch after this mutation.
    await ctx.scheduler.runAfter(0, internal.portalFormConfirmationActions.deliver, {
      eventId: args.eventId,
      formId: args.formId,
      speakerId: args.speakerId,
    });
    return responseId;
  },
});
