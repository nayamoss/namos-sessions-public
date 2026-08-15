import { v } from "convex/values";
import { assertEventOrganizerAccess, mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

async function getSponsor(
  ctx: MutationCtx | QueryCtx,
  sponsorId: Id<"sponsors">,
) {
  const sponsor = await ctx.db.get(sponsorId);
  if (!sponsor) throw new Error("Sponsor not found.");
  return sponsor;
}

async function makePrimary(
  ctx: MutationCtx,
  sponsorId: Id<"sponsors">,
  exceptId?: Id<"sponsor_contacts">,
) {
  const contacts = await ctx.db
    .query("sponsor_contacts")
    .withIndex("by_sponsor", (q) => q.eq("sponsorId", sponsorId))
    .collect();
  await Promise.all(
    contacts
      .filter((contact) => contact.isPrimary && contact._id !== exceptId)
      .map((contact) =>
        ctx.db.patch(contact._id, { isPrimary: false, updatedAt: Date.now() }),
      ),
  );
}

export const listBySponsor = query({
  args: { sponsorId: v.id("sponsors") },
  handler: async (ctx, args) => {
    const sponsor = await getSponsor(ctx, args.sponsorId);
    await assertEventOrganizerAccess(ctx, sponsor.eventId);
    return ctx.db
      .query("sponsor_contacts")
      .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
      .collect();
  },
});

export const create = mutation({
  args: {
    sponsorId: v.id("sponsors"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
    isPrimary: v.boolean(),
  },
  handler: async (ctx, args) => {
    const sponsor = await getSponsor(ctx, args.sponsorId);
    await assertEventOrganizerAccess(ctx, sponsor.eventId);
    const name = args.name.trim();
    if (!name) throw new Error("A contact needs a name.");
    const contacts = await ctx.db
      .query("sponsor_contacts")
      .withIndex("by_sponsor", (q) => q.eq("sponsorId", args.sponsorId))
      .collect();
    const isPrimary = args.isPrimary || contacts.length === 0;
    if (isPrimary) await makePrimary(ctx, args.sponsorId);
    const now = Date.now();
    return ctx.db.insert("sponsor_contacts", {
      eventId: sponsor.eventId,
      sponsorId: args.sponsorId,
      name,
      ...(args.email?.trim() ? { email: args.email.trim().toLowerCase() } : {}),
      ...(args.phone?.trim() ? { phone: args.phone.trim() } : {}),
      ...(args.role?.trim() ? { role: args.role.trim() } : {}),
      isPrimary,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    contactId: v.id("sponsor_contacts"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Sponsor contact not found.");
    await assertEventOrganizerAccess(ctx, contact.eventId);
    const name = args.name === undefined ? contact.name : args.name.trim();
    if (!name) throw new Error("A contact needs a name.");
    if (args.isPrimary) await makePrimary(ctx, contact.sponsorId, contact._id);
    if (args.isPrimary === false && contact.isPrimary) {
      throw new Error(
        "Choose another primary contact before unmarking this one.",
      );
    }
    await ctx.db.patch(args.contactId, {
      name,
      ...(args.email !== undefined
        ? { email: args.email.trim().toLowerCase() || undefined }
        : {}),
      ...(args.phone !== undefined
        ? { phone: args.phone.trim() || undefined }
        : {}),
      ...(args.role !== undefined
        ? { role: args.role.trim() || undefined }
        : {}),
      ...(args.isPrimary !== undefined ? { isPrimary: args.isPrimary } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { contactId: v.id("sponsor_contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Sponsor contact not found.");
    await assertEventOrganizerAccess(ctx, contact.eventId);
    await ctx.db.delete(args.contactId);
    if (contact.isPrimary) {
      const next = await ctx.db
        .query("sponsor_contacts")
        .withIndex("by_sponsor", (q) => q.eq("sponsorId", contact.sponsorId))
        .first();
      if (next)
        await ctx.db.patch(next._id, {
          isPrimary: true,
          updatedAt: Date.now(),
        });
    }
  },
});
