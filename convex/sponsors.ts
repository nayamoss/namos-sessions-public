import { v } from "convex/values";
import { assertEventAccess, mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { removeSponsorRoutingTarget } from "./categoryRouting";

const status = v.union(
  v.literal("prospect"),
  v.literal("confirmed"),
  v.literal("declined"),
);

async function validateTier(
  ctx: MutationCtx,
  eventId: Id<"events">,
  tierId?: Id<"sponsor_tiers">,
) {
  if (!tierId) return;
  const tier = await ctx.db.get(tierId);
  if (!tier || tier.eventId !== eventId)
    throw new Error("The selected tier does not belong to this event.");
}

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const [sponsors, tiers, contacts, tasks] = await Promise.all([
      ctx.db
        .query("sponsors")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("sponsor_tiers")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("sponsor_contacts")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("onboarding_tasks")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
    ]);
    const tiersById = new Map(tiers.map((tier) => [tier._id, tier]));
    return sponsors.map((sponsor) => ({
      ...sponsor,
      tier: sponsor.tierId ? tiersById.get(sponsor.tierId) : undefined,
      primaryContact: contacts.find(
        (contact) => contact.sponsorId === sponsor._id && contact.isPrimary,
      ),
      openTaskCount: tasks.filter(
        (task) => task.sponsorId === sponsor._id && task.status !== "completed",
      ).length,
    }));
  },
});

export const get = query({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, args) => {
    const sponsor = await ctx.db.get(args.sponsorId);
    if (!sponsor) return null;
    await assertEventAccess(ctx, sponsor.eventId);
    const [tier, contacts, tasks, submissions] = await Promise.all([
      sponsor.tierId ? ctx.db.get(sponsor.tierId) : null,
      ctx.db
        .query("sponsor_contacts")
        .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
        .collect(),
      ctx.db
        .query("onboarding_tasks")
        .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
        .collect(),
      ctx.db
        .query("submissions")
        .withIndex("by_event", (q) => q.eq("eventId", sponsor.eventId))
        .collect(),
    ]);
    return {
      ...sponsor,
      tier,
      contacts,
      tasks,
      submissions: submissions.filter(
        (submission) => submission.sponsorId === sponsor._id,
      ),
      openTaskCount: tasks.filter((task) => task.status !== "completed").length,
    };
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    tierId: v.optional(v.id("sponsor_tiers")),
    status,
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await validateTier(ctx, args.eventId, args.tierId);
    const name = args.name.trim();
    if (!name) throw new Error("A sponsor needs a name.");
    const now = Date.now();
    return ctx.db.insert("sponsors", {
      eventId: args.eventId,
      name,
      status: args.status,
      ...(args.tierId ? { tierId: args.tierId } : {}),
      ...(args.website?.trim() ? { website: args.website.trim() } : {}),
      ...(args.notes?.trim() ? { notes: args.notes.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sponsorId: v.id("sponsors"),
    name: v.optional(v.string()),
    tierId: v.optional(v.union(v.id("sponsor_tiers"), v.null())),
    status: v.optional(status),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sponsor = await ctx.db.get(args.sponsorId);
    if (!sponsor) throw new Error("Sponsor not found.");
    await assertEventAccess(ctx, sponsor.eventId);
    if (args.tierId) await validateTier(ctx, sponsor.eventId, args.tierId);
    const name = args.name === undefined ? sponsor.name : args.name.trim();
    if (!name) throw new Error("A sponsor needs a name.");
    await ctx.db.patch(args.sponsorId, {
      name,
      ...(args.tierId !== undefined
        ? { tierId: args.tierId ?? undefined }
        : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.website !== undefined
        ? { website: args.website.trim() || undefined }
        : {}),
      ...(args.notes !== undefined
        ? { notes: args.notes.trim() || undefined }
        : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, args) => {
    const sponsor = await ctx.db.get(args.sponsorId);
    if (!sponsor) throw new Error("Sponsor not found.");
    await assertEventAccess(ctx, sponsor.eventId);
    const [contacts, tasks, submissions, forms] = await Promise.all([
      ctx.db
        .query("sponsor_contacts")
        .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
        .collect(),
      ctx.db
        .query("onboarding_tasks")
        .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
        .collect(),
      ctx.db
        .query("submissions")
        .withIndex("by_event", (q) => q.eq("eventId", sponsor.eventId))
        .collect(),
      ctx.db
        .query("submission_forms")
        .withIndex("by_event", (q) => q.eq("eventId", sponsor.eventId))
        .collect(),
    ]);
    const now = Date.now();
    await Promise.all([
      ...contacts.map((contact) => ctx.db.delete(contact._id)),
      ...tasks.map((task) =>
        ctx.db.patch(task._id, { sponsorId: undefined, updatedAt: now }),
      ),
      ...submissions
        .filter((submission) => submission.sponsorId === sponsor._id)
        .map((submission) =>
          ctx.db.patch(submission._id, {
            sponsorId: undefined,
            updatedAt: now,
          }),
        ),
      ...forms
        .filter((form) => form.routingRules?.some((rule) => rule.assignSponsorId === sponsor._id))
        .map((form) =>
          ctx.db.patch(form._id, {
            routingRules: removeSponsorRoutingTarget(form.routingRules, sponsor._id),
            updatedAt: now,
          }),
        ),
    ]);
    await ctx.db.delete(args.sponsorId);
  },
});
