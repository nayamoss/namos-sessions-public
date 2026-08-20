import { v } from "convex/values";
import { mutation, query, assertOrganizerOf, assertEventOrganizerAccess } from "./functions";
import type { Id } from "./_generated/dataModel";

const stage = v.union(
  v.literal("prospect"), v.literal("contacted"), v.literal("qualified"), v.literal("invited"),
  v.literal("negotiating"), v.literal("confirmed"), v.literal("declined"), v.literal("archived"),
);
const confirmation = v.union(v.literal("awaiting"), v.literal("confirmed"), v.literal("declined"));

function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error("Enter a valid email address.");
  return email;
}

function text(value: string, name: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) throw new Error(`${name} is required and must be 200 characters or fewer.`);
  return trimmed;
}

function score(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("Score must be an integer from 0 to 100.");
  return value;
}

export const list = query({
  args: { organizationId: v.id("organizations"), stage: v.optional(stage), minScore: v.optional(v.number()), maxScore: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    const contacts = await ctx.db.query("crm_contacts").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).collect();
    return contacts.filter((contact) =>
      (!args.stage || contact.stage === args.stage)
      && (args.minScore === undefined || contact.score >= args.minScore)
      && (args.maxScore === undefined || contact.score <= args.maxScore),
    );
  },
});

/** Event-scoped CRM projection for the organizer UI; never returns contacts from another event. */
export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await assertEventOrganizerAccess(ctx, eventId);
    const memberships = await ctx.db.query("crm_event_contacts").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const contacts = await Promise.all(memberships.map((membership) => ctx.db.get(membership.contactId)));
    return contacts.flatMap((contact, index) => contact ? [{ ...contact, eventId, speakerId: memberships[index]?.speakerId }] : []);
  },
});

export const listSegmentsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await assertEventOrganizerAccess(ctx, eventId);
    const event = await ctx.db.get(eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const segments = await ctx.db.query("crm_segments").withIndex("by_organization", (q) => q.eq("organizationId", event.organizationId!)).collect();
    return segments.filter((segment) => segment.eventId === eventId);
  },
});

export const saveSegmentForEvent = mutation({
  args: { eventId: v.id("events"), id: v.optional(v.id("crm_segments")), name: v.string(), stage: v.optional(stage), minScore: v.optional(v.number()), maxScore: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const name = text(args.name, "Segment name");
    if (args.minScore !== undefined) score(args.minScore);
    if (args.maxScore !== undefined) score(args.maxScore);
    if (args.minScore !== undefined && args.maxScore !== undefined && args.minScore > args.maxScore) throw new Error("Minimum score must not exceed maximum score.");
    const now = Date.now(); const values = { organizationId: event.organizationId, name, stage: args.stage, minScore: args.minScore, maxScore: args.maxScore, eventId: args.eventId, updatedAt: now };
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.organizationId !== event.organizationId || existing.eventId !== args.eventId) throw new Error("Segment not found.");
      await ctx.db.patch(args.id, values);
      return args.id;
    }
    return ctx.db.insert("crm_segments", { ...values, createdAt: now });
  },
});

export const save = mutation({
  args: { id: v.optional(v.id("crm_contacts")), organizationId: v.id("organizations"), firstName: v.string(), lastName: v.string(), email: v.string(), stage, score: v.number() },
  handler: async (ctx, args) => {
    const identity = await assertOrganizerOf(ctx, args.organizationId);
    const email = normalizedEmail(args.email);
    const firstName = text(args.firstName, "First name");
    const lastName = text(args.lastName, "Last name");
    const nextScore = score(args.score);
    const now = Date.now();
    const duplicate = await ctx.db.query("crm_contacts").withIndex("by_org_email", (q) => q.eq("organizationId", args.organizationId).eq("email", email)).unique();
    if (duplicate && duplicate._id !== args.id) throw new Error("A contact with this email already exists in this organization.");
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.organizationId !== args.organizationId) throw new Error("Contact not found.");
      await ctx.db.patch(args.id, { email, firstName, lastName, stage: args.stage, score: nextScore, updatedAt: now });
      if (existing.stage !== args.stage || existing.score !== nextScore) await ctx.db.insert("crm_stage_history", { organizationId: args.organizationId, contactId: args.id, stage: args.stage, score: nextScore, changedByUserId: identity.subject, createdAt: now });
      return args.id;
    }
    const id = await ctx.db.insert("crm_contacts", { organizationId: args.organizationId, email, firstName, lastName, stage: args.stage, score: nextScore, createdAt: now, updatedAt: now });
    await ctx.db.insert("crm_stage_history", { organizationId: args.organizationId, contactId: id, stage: args.stage, score: nextScore, changedByUserId: identity.subject, createdAt: now });
    return id;
  },
});

export const saveForEvent = mutation({
  args: { eventId: v.id("events"), id: v.optional(v.id("crm_contacts")), firstName: v.string(), lastName: v.string(), email: v.string(), stage, score: v.number() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const email = normalizedEmail(args.email); const firstName = text(args.firstName, "First name"); const lastName = text(args.lastName, "Last name"); const nextScore = score(args.score); const now = Date.now();
    const duplicate = await ctx.db.query("crm_contacts").withIndex("by_org_email", (q) => q.eq("organizationId", event.organizationId!).eq("email", email)).unique();
    if (duplicate && duplicate._id !== args.id) throw new Error("A contact with this email already exists in this organization.");
    let id = args.id;
    if (id) {
      const current = await ctx.db.get(id);
      if (!current || current.organizationId !== event.organizationId) throw new Error("Contact not found.");
      await ctx.db.patch(id, { email, firstName, lastName, stage: args.stage, score: nextScore, updatedAt: now });
      if (current.stage !== args.stage || current.score !== nextScore) {
        await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId: id, stage: args.stage, score: nextScore, changedByUserId: identity.subject, createdAt: now });
      }
    } else {
      id = await ctx.db.insert("crm_contacts", { organizationId: event.organizationId, email, firstName, lastName, stage: args.stage, score: nextScore, createdAt: now, updatedAt: now });
      await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId: id, stage: args.stage, score: nextScore, changedByUserId: identity.subject, createdAt: now });
    }
    const membership = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", id)).unique();
    if (!membership) await ctx.db.insert("crm_event_contacts", { eventId: args.eventId, contactId: id, createdAt: now, updatedAt: now });
    return id;
  },
});

/** Archive rather than delete, keeping speaker, portal, and event-history references intact. */
export const archiveForEvent = mutation({
  args: { eventId: v.id("events"), contactIds: v.array(v.id("crm_contacts")) },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const uniqueIds = [...new Set(args.contactIds)];
    if (uniqueIds.length === 0) return { archived: 0 };
    const now = Date.now();
    let archived = 0;
    for (const contactId of uniqueIds) {
      const [contact, membership] = await Promise.all([
        ctx.db.get(contactId),
        ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", contactId)).unique(),
      ]);
      if (!contact || contact.organizationId !== event.organizationId || !membership) throw new Error("Contact not found for this event.");
      if (contact.stage === "archived") continue;
      await ctx.db.patch(contactId, { stage: "archived", updatedAt: now });
      await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId, stage: "archived", score: contact.score, changedByUserId: identity.subject, createdAt: now });
      archived += 1;
    }
    return { archived };
  },
});

export const bulkStageForEvent = mutation({
  args: { eventId: v.id("events"), contactIds: v.array(v.id("crm_contacts")), stage },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const uniqueIds = [...new Set(args.contactIds)];
    if (uniqueIds.length === 0) return { updated: 0 };
    const now = Date.now();
    let updated = 0;
    for (const contactId of uniqueIds) {
      const [contact, membership] = await Promise.all([
        ctx.db.get(contactId),
        ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", contactId)).unique(),
      ]);
      if (!contact || contact.organizationId !== event.organizationId || !membership) throw new Error("Contact not found for this event.");
      if (contact.stage === args.stage) continue;
      await ctx.db.patch(contactId, { stage: args.stage, updatedAt: now });
      await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId, stage: args.stage, score: contact.score, changedByUserId: identity.subject, createdAt: now });
      updated += 1;
    }
    return { updated };
  },
});

export const assignToEvent = mutation({
  args: { eventId: v.id("events"), contactId: v.id("crm_contacts") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const [event, contact] = await Promise.all([ctx.db.get(args.eventId), ctx.db.get(args.contactId)]);
    if (!event?.organizationId || !contact || contact.organizationId !== event.organizationId) throw new Error("Contact does not belong to this event organization.");
    const existing = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", args.contactId)).unique();
    if (existing) return existing._id;
    const now = Date.now();
    const speaker = await ctx.db.query("speakers").withIndex("by_event_email", (q) => q.eq("eventId", args.eventId).eq("email", contact.email)).unique();
    return ctx.db.insert("crm_event_contacts", { eventId: args.eventId, contactId: args.contactId, speakerId: speaker?._id, createdAt: now, updatedAt: now });
  },
});

export const unlinkFromEvent = mutation({
  args: { eventId: v.id("events"), contactId: v.id("crm_contacts") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const membership = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", args.contactId)).unique();
    if (!membership) return { unlinked: false };
    if (membership.speakerId) throw new Error("This contact is linked to a speaker and must remain attached to preserve speaker and portal history. Archive it instead.");
    await ctx.db.delete(membership._id);
    return { unlinked: true };
  },
});

export const listSegments = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    return ctx.db.query("crm_segments").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).collect();
  },
});

export const saveSegment = mutation({
  args: { id: v.optional(v.id("crm_segments")), organizationId: v.id("organizations"), name: v.string(), stage: v.optional(stage), minScore: v.optional(v.number()), maxScore: v.optional(v.number()), eventId: v.optional(v.id("events")), confirmationStatus: v.optional(confirmation), profileComplete: v.optional(v.boolean()), outstandingTasks: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    const name = text(args.name, "Segment name");
    if (args.minScore !== undefined) score(args.minScore);
    if (args.maxScore !== undefined) score(args.maxScore);
    if (args.minScore !== undefined && args.maxScore !== undefined && args.minScore > args.maxScore) throw new Error("Minimum score must not exceed maximum score.");
    if (args.eventId) { const event = await ctx.db.get(args.eventId); if (!event || event.organizationId !== args.organizationId) throw new Error("Event does not belong to this organization."); }
    const now = Date.now();
    const values = { organizationId: args.organizationId, name, stage: args.stage, minScore: args.minScore, maxScore: args.maxScore, eventId: args.eventId, confirmationStatus: args.confirmationStatus, profileComplete: args.profileComplete, outstandingTasks: args.outstandingTasks, updatedAt: now };
    if (args.id) { const existing = await ctx.db.get(args.id); if (!existing || existing.organizationId !== args.organizationId) throw new Error("Segment not found."); await ctx.db.patch(args.id, values); return args.id; }
    return ctx.db.insert("crm_segments", { ...values, createdAt: now });
  },
});

// Safe, repeatable migration entry point. It only links legacy records and never removes or
// rewrites a speaker's portal/account references.
export const backfillEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM migration.");
    const speakers = await ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    let linked = 0;
    for (const speaker of speakers) {
      const email = normalizedEmail(speaker.email);
      let contactId = speaker.contactId;
      if (!contactId) {
        const existing = await ctx.db.query("crm_contacts").withIndex("by_org_email", (q) => q.eq("organizationId", event.organizationId!).eq("email", email)).unique();
        const now = Date.now();
        contactId = existing?._id ?? await ctx.db.insert("crm_contacts", { organizationId: event.organizationId, email, firstName: speaker.firstName, lastName: speaker.lastName, stage: speaker.confirmationStatus === "confirmed" ? "confirmed" : speaker.confirmationStatus === "declined" ? "declined" : "invited", score: 0, createdAt: now, updatedAt: now });
        if (!existing) await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId, stage: speaker.confirmationStatus === "confirmed" ? "confirmed" : speaker.confirmationStatus === "declined" ? "declined" : "invited", score: 0, changedByUserId: identity.subject, createdAt: now });
        await ctx.db.patch(speaker._id, { contactId, updatedAt: now });
      }
      const membership = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", contactId!)).unique();
      if (!membership) { const now = Date.now(); await ctx.db.insert("crm_event_contacts", { eventId: args.eventId, contactId: contactId!, speakerId: speaker._id, createdAt: now, updatedAt: now }); linked += 1; }
    }
    return { linked, total: speakers.length };
  },
});

export type CrmContactId = Id<"crm_contacts">;
