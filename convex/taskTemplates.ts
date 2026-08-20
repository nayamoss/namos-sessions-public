import { v } from "convex/values";
import { assertEventOrganizerAccess, mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const speakerStarterTemplates = [
  [
    "Standard Speaker Onboarding",
    [
      "Upload headshot",
      "Confirm bio",
      "Upload slides",
      "Sign speaker agreement",
    ],
  ],
  [
    "Keynote Speaker",
    [
      "Confirm keynote title",
      "Upload headshot",
      "Share AV requirements",
      "Upload slides",
    ],
  ],
  [
    "Workshop Facilitator",
    [
      "Confirm workshop materials",
      "Share room setup",
      "Upload slides",
      "Sign speaker agreement",
    ],
  ],
  [
    "Panelist",
    ["Confirm panel topic", "Confirm bio", "Share discussion prompts"],
  ],
  [
    "Virtual/Remote Speaker",
    [
      "Run technical check",
      "Confirm time zone",
      "Upload slides",
      "Share backup connection",
    ],
  ],
  [
    "Sponsor-Nominated Speaker",
    [
      "Confirm sponsor details",
      "Confirm bio",
      "Upload headshot",
      "Sign speaker agreement",
    ],
  ],
] as const;

export async function ensureSpeakerStarterTemplates(
  ctx: MutationCtx,
  eventId: Id<"events">,
  now = Date.now(),
) {
  const existing = await ctx.db
    .query("task_templates")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const ids = new Map(
    existing.map((template) => [template.name, template._id]),
  );
  let created = 0;
  for (const [name, titles] of speakerStarterTemplates) {
    if (ids.has(name)) continue;
    const id = await ctx.db.insert("task_templates", {
      eventId,
      name,
      items: titles.map((title) => ({
        title,
        targetType: "submission" as const,
      })),
      isSeeded: true,
      createdAt: now,
      updatedAt: now,
    });
    ids.set(name, id);
    created += 1;
  }
  const event = await ctx.db.get(eventId);
  const defaultId = ids.get("Standard Speaker Onboarding");
  if (event && !event.defaultOnboardingTemplateId && defaultId)
    await ctx.db.patch(eventId, {
      defaultOnboardingTemplateId: defaultId,
      updatedAt: now,
    });
  return { created };
}

const item = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  targetType: v.union(
    v.literal("contact"),
    v.literal("group"),
    v.literal("submission"),
    v.literal("sponsor"),
  ),
  linkedFormId: v.optional(v.id("submission_forms")),
  dueDateOffsetDays: v.optional(v.number()),
});
const items = v.array(item);

function validate(
  name: string,
  templateItems: Array<{ title: string; dueDateOffsetDays?: number }>,
) {
  if (!name.trim()) throw new Error("A template needs a name.");
  if (!templateItems.length) throw new Error("Add at least one task.");
  if (templateItems.some((entry) => !entry.title.trim()))
    throw new Error("Every task needs a title.");
  if (
    templateItems.some(
      (entry) =>
        entry.dueDateOffsetDays !== undefined &&
        (!Number.isFinite(entry.dueDateOffsetDays) ||
          entry.dueDateOffsetDays < 0),
    )
  )
    throw new Error("Due date offsets must be non-negative numbers.");
}
const cleanItems = (
  templateItems: Array<{
    title: string;
    description?: string;
    targetType: "contact" | "group" | "submission" | "sponsor";
    linkedFormId?: unknown;
    dueDateOffsetDays?: number;
  }>,
) =>
  templateItems.map((entry) => ({
    ...entry,
    title: entry.title.trim(),
    ...(entry.description?.trim()
      ? { description: entry.description.trim() }
      : {}),
  })) as never;

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return ctx.db
      .query("task_templates")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});
export const get = query({
  args: { templateId: v.id("task_templates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (template) await assertEventOrganizerAccess(ctx, template.eventId);
    return template;
  },
});
export const create = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    description: v.optional(v.string()),
    items,
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    validate(args.name, args.items);
    const now = Date.now();
    return ctx.db.insert("task_templates", {
      eventId: args.eventId,
      name: args.name.trim(),
      ...(args.description?.trim()
        ? { description: args.description.trim() }
        : {}),
      items: cleanItems(args.items),
      isSeeded: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});
export const update = mutation({
  args: {
    templateId: v.id("task_templates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    items: v.optional(items),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found.");
    await assertEventOrganizerAccess(ctx, template.eventId);
    const name = args.name ?? template.name;
    const nextItems = args.items ?? template.items;
    validate(name, nextItems);
    await ctx.db.patch(args.templateId, {
      name: name.trim(),
      description:
        args.description === undefined
          ? template.description
          : args.description.trim() || undefined,
      items: cleanItems(nextItems),
      updatedAt: Date.now(),
    });
  },
});
export const remove = mutation({
  args: { templateId: v.id("task_templates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found.");
    await assertEventOrganizerAccess(ctx, template.eventId);
    const event = await ctx.db.get(template.eventId);
    if (event?.defaultOnboardingTemplateId === args.templateId)
      throw new Error("Unset this template as the default before deleting it.");
    await ctx.db.delete(args.templateId);
  },
});
export const setDefault = mutation({
  args: {
    eventId: v.id("events"),
    templateId: v.optional(v.id("task_templates")),
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (!template || template.eventId !== args.eventId)
        throw new Error("Template not found for this event.");
    }
    await ctx.db.patch(args.eventId, {
      defaultOnboardingTemplateId: args.templateId,
      updatedAt: Date.now(),
    });
  },
});

export const ensureStarters = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return ensureSpeakerStarterTemplates(ctx, args.eventId);
  },
});
export const applyToSubmission = mutation({
  args: {
    templateId: v.id("task_templates"),
    submissionId: v.id("submissions"),
  },
  handler: async (ctx, args) => {
    const [template, submission] = await Promise.all([
      ctx.db.get(args.templateId),
      ctx.db.get(args.submissionId),
    ]);
    if (!template || !submission || template.eventId !== submission.eventId)
      throw new Error("Template and submission must belong to the same event.");
    await assertEventOrganizerAccess(ctx, template.eventId);
    const existing = await ctx.db
      .query("onboarding_tasks")
      .withIndex("by_submission", (q) =>
        q.eq("submissionId", args.submissionId),
      )
      .collect();
    const titles = new Set(
      existing
        .filter((task) => task.source === "auto")
        .map((task) => task.title),
    );
    const todo = template.items.filter(
      (entry) => entry.targetType !== "sponsor" && !titles.has(entry.title),
    );
    const now = Date.now();
    await Promise.all(
      todo.map((entry) =>
        ctx.db.insert("onboarding_tasks", {
          eventId: submission.eventId,
          targetType: entry.targetType,
          submissionId: submission._id,
          ...(submission.speakerId ? { speakerId: submission.speakerId } : {}),
          title: entry.title,
          ...(entry.description ? { description: entry.description } : {}),
          ...(entry.linkedFormId ? { linkedFormId: entry.linkedFormId } : {}),
          ...(entry.dueDateOffsetDays !== undefined
            ? { dueDate: now + entry.dueDateOffsetDays * 86_400_000 }
            : {}),
          source: "auto",
          status: "pending",
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );
    return {
      created: todo.length,
      skipped: template.items.length - todo.length,
    };
  },
});

export const applyToSpeaker = mutation({
  args: {
    templateId: v.id("task_templates"),
    speakerId: v.id("speakers"),
  },
  handler: async (ctx, args) => {
    const [template, speaker] = await Promise.all([
      ctx.db.get(args.templateId),
      ctx.db.get(args.speakerId),
    ]);
    if (!template || !speaker || template.eventId !== speaker.eventId)
      throw new Error("Template and speaker must belong to the same event.");
    await assertEventOrganizerAccess(ctx, template.eventId);
    const existing = await ctx.db
      .query("onboarding_tasks")
      .withIndex("by_speaker", (q) => q.eq("speakerId", args.speakerId))
      .collect();
    const titles = new Set(
      existing
        .filter((task) => task.source === "auto")
        .map((task) => task.title),
    );
    const applicable = template.items.filter(
      (entry) => entry.targetType !== "sponsor",
    );
    const todo = applicable.filter((entry) => !titles.has(entry.title));
    const now = Date.now();
    await Promise.all(
      todo.map((entry) =>
        ctx.db.insert("onboarding_tasks", {
          eventId: speaker.eventId,
          targetType: entry.targetType,
          speakerId: speaker._id,
          title: entry.title,
          ...(entry.description ? { description: entry.description } : {}),
          ...(entry.linkedFormId ? { linkedFormId: entry.linkedFormId } : {}),
          ...(entry.dueDateOffsetDays !== undefined
            ? { dueDate: now + entry.dueDateOffsetDays * 86_400_000 }
            : {}),
          source: "auto",
          status: "pending",
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );
    return {
      created: todo.length,
      skipped: applicable.length - todo.length,
    };
  },
});

export const applyToSponsor = mutation({
  args: { templateId: v.id("task_templates"), sponsorId: v.id("sponsors") },
  handler: async (ctx, args) => {
    const [template, sponsor] = await Promise.all([
      ctx.db.get(args.templateId),
      ctx.db.get(args.sponsorId),
    ]);
    if (!template || !sponsor || template.eventId !== sponsor.eventId)
      throw new Error("Template and sponsor must belong to the same event.");
    await assertEventOrganizerAccess(ctx, template.eventId);
    const existing = await ctx.db
      .query("onboarding_tasks")
      .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
      .collect();
    const titles = new Set(
      existing
        .filter((task) => task.source === "auto")
        .map((task) => task.title),
    );
    const todo = template.items.filter((entry) => !titles.has(entry.title));
    const now = Date.now();
    await Promise.all(
      todo.map((entry) =>
        ctx.db.insert("onboarding_tasks", {
          eventId: sponsor.eventId,
          targetType: "sponsor",
          sponsorId: sponsor._id,
          title: entry.title,
          ...(entry.description ? { description: entry.description } : {}),
          ...(entry.linkedFormId ? { linkedFormId: entry.linkedFormId } : {}),
          ...(entry.dueDateOffsetDays !== undefined
            ? { dueDate: now + entry.dueDateOffsetDays * 86_400_000 }
            : {}),
          source: "auto",
          status: "pending",
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );
    return {
      created: todo.length,
      skipped: template.items.length - todo.length,
    };
  },
});
