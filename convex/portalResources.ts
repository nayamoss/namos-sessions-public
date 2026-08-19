import { v } from "convex/values";
import { mutation, query, assertEventOrganizerAccess, isEventOrganizer, requireIdentity } from "./functions";
import { assertOwnsSpeaker } from "./speakers";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const status = v.union(v.literal("draft"), v.literal("published"));

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "resource";
}

function validated(input: { title: string; bodyHtml: string }) {
  const title = input.title.trim();
  const bodyHtml = input.bodyHtml.trim();
  if (!title) throw new Error("A resource page needs a title.");
  if (title.length > 120) throw new Error("Resource titles cannot exceed 120 characters.");
  if (bodyHtml.length > 50_000) throw new Error("Resource content cannot exceed 50,000 characters.");
  // Rendering still goes through DOMPurify. Rejecting active URL schemes here keeps unsafe
  // links out of storage as well, including when a caller bypasses the rich-text editor.
  if (/\b(?:href|src)\s*=\s*(?:["']\s*)?(?:javascript|data|vbscript):/i.test(bodyHtml)) {
    throw new Error("Resource links must use a safe web URL.");
  }
  return { title, bodyHtml };
}

async function uniqueSlug(ctx: MutationCtx, eventId: Id<"events">, title: string, currentId?: Id<"portal_resource_pages">) {
  const base = slugify(title);
  for (let suffix = 1; suffix < 1_000; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const existing = await ctx.db
      .query("portal_resource_pages")
      .withIndex("by_event_slug", (q) => q.eq("eventId", eventId).eq("slug", candidate))
      .unique();
    if (!existing || existing._id === currentId) return candidate;
  }
  throw new Error("Could not create a unique resource URL.");
}

export const listAdmin = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return (await ctx.db.query("portal_resource_pages").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect())
      .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));
  },
});

export const listPublished = query({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (!(await isEventOrganizer(ctx, args.eventId, identity))) {
      const speaker = await ctx.db.get(args.speakerId);
      if (!speaker || speaker.eventId !== args.eventId) throw new Error("Speaker not found for this event.");
      assertOwnsSpeaker(identity, speaker);
    }
    return (await ctx.db.query("portal_resource_pages").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect())
      .filter((page) => page.status === "published")
      .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));
  },
});

export const save = mutation({
  args: {
    eventId: v.id("events"),
    id: v.optional(v.id("portal_resource_pages")),
    title: v.string(),
    bodyHtml: v.string(),
    status,
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const content = validated(args);
    const now = Date.now();
    if (args.id) {
      const current = await ctx.db.get(args.id);
      if (!current || current.eventId !== args.eventId) throw new Error("Resource page not found for this event.");
      const slug = await uniqueSlug(ctx, args.eventId, content.title, current._id);
      await ctx.db.patch(current._id, { ...content, slug, status: args.status, updatedAt: now });
      return current._id;
    }
    const existing = await ctx.db.query("portal_resource_pages").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    const slug = await uniqueSlug(ctx, args.eventId, content.title);
    return ctx.db.insert("portal_resource_pages", { eventId: args.eventId, ...content, slug, status: args.status, sortOrder: existing.length, createdAt: now, updatedAt: now });
  },
});

export const reorder = mutation({
  args: { eventId: v.id("events"), ids: v.array(v.id("portal_resource_pages")) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const pages = await ctx.db.query("portal_resource_pages").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    if (args.ids.length !== pages.length || new Set(args.ids).size !== pages.length) throw new Error("Reorder every resource page exactly once.");
    const allowed = new Set(pages.map((page) => page._id));
    if (args.ids.some((id) => !allowed.has(id))) throw new Error("A resource page does not belong to this event.");
    const now = Date.now();
    await Promise.all(args.ids.map((id, sortOrder) => ctx.db.patch(id, { sortOrder, updatedAt: now })));
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), id: v.id("portal_resource_pages") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const page = await ctx.db.get(args.id);
    if (!page || page.eventId !== args.eventId) throw new Error("Resource page not found for this event.");
    await ctx.db.delete(page._id);
  },
});
