import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const submissions = internalQuery({ args: { eventId: v.id("events") }, handler: (ctx, args) => ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect() });
export const speakers = internalQuery({ args: { eventId: v.id("events") }, handler: (ctx, args) => ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect() });
export const agenda = internalQuery({ args: { eventId: v.id("events") }, handler: (ctx, args) => ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect() });
export const tasks = internalQuery({ args: { eventId: v.id("events") }, handler: (ctx, args) => ctx.db.query("onboarding_tasks").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect() });
// Load-then-check before any write: a submission id is a global Convex id, not scoped by
// the URL, so the caller must verify it belongs to the token's own event before mutating it.
//
// args.id is a plain string, not v.id("submissions"): the id comes from a URL path segment
// (or, for the MCP server's startup scope-probe, a deliberately made-up placeholder), and
// v.id() throws a validator error for any string that isn't a syntactically well-formed id for
// that table rather than just returning null — a malformed/unknown id must resolve to "not
// found", never crash the request. ctx.db.normalizeId is the idiomatic way to accept a
// caller-supplied id that might not be valid at all (see the #178 security review's live MCP
// verification, 2026-08-16, which caught this as a real 500 on both the real endpoint and the
// MCP server's own startup probe — never actually exercised end to end until then).
export const getSubmissionEventId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("submissions", args.id);
    if (!id) return null;
    const submission = await ctx.db.get(id);
    return submission ? { eventId: submission.eventId } : null;
  },
});
export const updateSubmissionStatus = internalMutation({
  args: { id: v.string(), status: v.union(v.literal("draft"), v.literal("pending"), v.literal("accept_queue"), v.literal("accepted"), v.literal("maybe"), v.literal("decline_queue"), v.literal("declined"), v.literal("withdrawn")) },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("submissions", args.id);
    if (!id) return null;
    const submission = await ctx.db.get(id);
    if (!submission) return null;
    await ctx.db.patch(id, { status: args.status, updatedAt: Date.now() });
    return { ...submission, status: args.status, updatedAt: Date.now() };
  },
});
