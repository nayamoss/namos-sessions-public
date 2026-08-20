import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { assertEventOrganizerByUserId } from "./functions";

export const claimReceipt = internalMutation({
  args: { dedupeKey: v.string(), kind: v.union(v.literal("event"), v.literal("command"), v.literal("interaction")), slackTeamId: v.optional(v.string()), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("slack_request_receipts").withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey)).unique();
    if (existing) return { claimed: false as const, receiptId: existing._id };
    const receiptId = await ctx.db.insert("slack_request_receipts", { ...args, status: "accepted", receivedAt: Date.now() });
    return { claimed: true as const, receiptId };
  },
});

export const markReceipt = internalMutation({
  args: { receiptId: v.id("slack_request_receipts"), status: v.union(v.literal("processed"), v.literal("failed")), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt || receipt.status !== "accepted") return;
    await ctx.db.patch(receipt._id, { status: args.status, ...(args.error ? { error: args.error.slice(0, 300) } : {}), processedAt: Date.now() });
  },
});

async function authorized(userId: string | undefined, ctx: QueryCtx, eventId: Id<"events">) {
  if (!userId) return false;
  try { await assertEventOrganizerByUserId(ctx, eventId, userId); return true; }
  catch { return false; }
}

export const channelContext = internalQuery({
  args: { slackTeamId: v.string(), slackChannelId: v.string(), slackUserId: v.optional(v.string()), slackThreadTs: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("slack_workspaces").withIndex("by_team", (q) => q.eq("slackTeamId", args.slackTeamId)).unique();
    if (!workspace || workspace.status !== "connected") return null;
    const binding = await ctx.db.query("slack_channel_bindings").withIndex("by_workspace_channel", (q) => q.eq("slackWorkspaceId", workspace._id).eq("slackChannelId", args.slackChannelId)).unique();
    if (!binding) return { workspace, binding: null, mapping: null, event: null, authorized: false, thread: null, run: null };
    const mapping = args.slackUserId ? await ctx.db.query("slack_user_mappings").withIndex("by_workspace_user", (q) => q.eq("slackWorkspaceId", workspace._id).eq("slackUserId", args.slackUserId!)).unique() : null;
    const event = await ctx.db.get(binding.eventId);
    const thread = args.slackThreadTs ? await ctx.db.query("slack_agent_threads").withIndex("by_workspace_channel_thread", (q) => q.eq("slackWorkspaceId", workspace._id).eq("slackChannelId", args.slackChannelId).eq("slackThreadTs", args.slackThreadTs!)).unique() : null;
    const run = thread ? await ctx.db.get(thread.agentRunId) : null;
    return { workspace, binding, mapping, event, authorized: await authorized(mapping?.namosUserId, ctx, binding.eventId), thread, run };
  },
});

export const dmContext = internalQuery({
  args: { slackTeamId: v.string(), slackUserId: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.query("slack_workspaces").withIndex("by_team", (q) => q.eq("slackTeamId", args.slackTeamId)).unique();
    if (!workspace || workspace.status !== "connected") return null;
    const mapping = await ctx.db.query("slack_user_mappings").withIndex("by_workspace_user", (q) => q.eq("slackWorkspaceId", workspace._id).eq("slackUserId", args.slackUserId)).unique();
    if (!mapping) return { workspace, mapping: null, matches: [] };
    const bindings = await ctx.db.query("slack_channel_bindings").withIndex("by_workspace", (q) => q.eq("slackWorkspaceId", workspace._id)).collect();
    const matches = [];
    for (const binding of bindings) {
      if (!binding.agentEnabled || !(await authorized(mapping.namosUserId, ctx, binding.eventId))) continue;
      const event = await ctx.db.get(binding.eventId);
      if (event) matches.push({ binding, event });
    }
    return { workspace, mapping, matches };
  },
});
