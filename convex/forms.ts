import { v } from "convex/values";
import { validateRoutingRules } from "./categoryRouting";
import { FORM_TEMPLATES, planTemplateFields } from "./formTemplates";
import {
  mutation,
  query,
  assertEventAccess,
  assertOrganizer,
} from "./functions";

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db
      .query("submission_forms")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});
export const get = query({
  args: { id: v.id("submission_forms") },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.id);
    if (form) await assertEventAccess(ctx, form.eventId);
    return form;
  },
});
// status, reminderEmailEnabled, adminUserIds, notifyAdminsOnNew, and
// notifyAdminsOnUpdate are never accepted from the client here on purpose.
// The form builder has no UI to change any of them, and a client-supplied
// value is necessarily a load-time snapshot: two organizer tabs, or a
// closeDate auto-close between load and save, would let a stale save
// silently revert a real, concurrent server-side change (see #107 — the
// original bug had the client hardcode these; a client-held snapshot has
// the same failure mode under a race, just less often). Reading `existing`
// inside this mutation is always the true current value, not a cached one.
export const save = mutation({
  args: { id: v.optional(v.id("submission_forms")), form: v.any() },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.form.eventId);
    const now = Date.now();
    if (!args.form?.eventId)
      throw new Error("A submission form must belong to an event.");
    if (args.form.pageHeading.length > 15)
      throw new Error("Page heading must be 15 characters or fewer.");
    const routingRules = await validateRoutingRules(
      ctx,
      args.form.eventId,
      args.form.sections ?? [],
      args.form.routingRules,
    );
    const {
      status: _clientStatus,
      reminderEmailEnabled: _clientReminderEmailEnabled,
      adminUserIds: _clientAdminUserIds,
      notifyAdminsOnNew: _clientNotifyAdminsOnNew,
      notifyAdminsOnUpdate: _clientNotifyAdminsOnUpdate,
      ...clientForm
    } = args.form;
    const values = { ...clientForm, routingRules, updatedAt: now };
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.eventId !== args.form.eventId)
        throw new Error("Form not found for this event.");
      await ctx.db.patch(args.id, values);
      return args.id;
    }
    return ctx.db.insert("submission_forms", {
      ...values,
      status: "draft",
      reminderEmailEnabled: false,
      adminUserIds: [],
      notifyAdminsOnNew: [],
      notifyAdminsOnUpdate: [],
      createdAt: now,
    });
  },
});
export const duplicate = mutation({
  args: { id: v.id("submission_forms"), eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const form = await ctx.db.get(args.id);
    if (!form || form.eventId !== args.eventId)
      throw new Error("Form not found for this event.");
    const { _id, _creationTime, ...copy } = form;
    const now = Date.now();
    return ctx.db.insert("submission_forms", {
      ...copy,
      routingRules: form.routingRules ?? [],
      internalName: `${form.internalName} copy`,
      version: form.version + 1,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});
export const createFromTemplate = mutation({
  args: { eventId: v.id("events"), templateId: v.string() },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const template = FORM_TEMPLATES.find((item) => item.id === args.templateId);
    if (!template) throw new Error("Form template not found.");

    const existingFields = await ctx.db.query("field_definitions").collect();
    const plan = planTemplateFields(
      template,
      existingFields.map((field) => field.label),
    );
    const now = Date.now();

    const fieldIdByNormalizedLabel = new Map(
      existingFields.map((field) => [
        field.label.trim().toLowerCase(),
        field._id,
      ]),
    );
    for (const entry of plan.fieldsToCreate) {
      const fieldId = await ctx.db.insert("field_definitions", {
        label: entry.label,
        type: entry.type,
        maxChars: entry.maxChars,
        options: entry.options,
        locked: entry.locked,
        required: entry.required,
        createdAt: now,
        updatedAt: now,
      });
      fieldIdByNormalizedLabel.set(entry.normalizedLabel, fieldId);
    }

    const sections = plan.sections.map((section, sectionIndex) => ({
      id: `${template.id}-${sectionIndex + 1}`,
      key: section.key,
      title: section.title,
      pageHeading: section.pageHeading,
      description: section.description,
      fieldIds: section.fieldRefs.map((ref) =>
        fieldIdByNormalizedLabel.get(ref)!,
      ),
    }));

    const isCfp = template.appliesTo === "cfp";
    return ctx.db.insert("submission_forms", {
      eventId: args.eventId,
      internalName: template.internalName,
      externalTitle: template.externalTitle,
      pageHeading: template.pageHeading,
      version: 1,
      kind: template.kind,
      collectParticipants: template.collectParticipants,
      showWelcomeMessage: false,
      sections,
      participantRoles: template.participantRoles,
      crossFieldLimits: [],
      routingRules: [],
      allowMultipleDrafts: isCfp,
      autoRedirectToPortal: isCfp,
      successPageMessage: isCfp
        ? "Thanks — your submission has been received. You can continue in your speaker portal."
        : undefined,
      reminderEmailEnabled: false,
      adminUserIds: [],
      notifyAdminsOnNew: [],
      notifyAdminsOnUpdate: [],
      sendSubmitterConfirmation: false,
      portalFormSettings: template.portalFormSettings,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});
export const remove = mutation({
  args: { id: v.id("submission_forms"), eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const form = await ctx.db.get(args.id);
    if (!form || form.eventId !== args.eventId)
      throw new Error("Form not found for this event.");
    await ctx.db.delete(args.id);
  },
});
export const listFields = query({
  args: { eventId: v.optional(v.id("events")) },
  handler: async (ctx, args) => {
    if (args.eventId) await assertEventAccess(ctx, args.eventId);
    else await assertOrganizer(ctx);
    return ctx.db.query("field_definitions").collect();
  },
});
// Field definitions are currently reusable across forms. Keep formId in the public contract so
// form-owned fields can be introduced later without changing callers.
export const fields = query({
  args: { formId: v.id("submission_forms") },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found.");
    await assertEventAccess(ctx, form.eventId);
    return ctx.db.query("field_definitions").collect();
  },
});
export const saveField = mutation({
  args: { id: v.optional(v.id("field_definitions")), eventId: v.optional(v.id("events")), field: v.any() },
  handler: async (ctx, args) => {
    if (args.eventId) await assertEventAccess(ctx, args.eventId);
    else await assertOrganizer(ctx);
    const now = Date.now();
    if (args.id) {
      await ctx.db.patch(args.id, { ...args.field, updatedAt: now });
      return args.id;
    }
    return ctx.db.insert("field_definitions", {
      ...args.field,
      createdAt: now,
      updatedAt: now,
    });
  },
});
