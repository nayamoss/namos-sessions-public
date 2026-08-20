import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { approveTaskProposalForUser, createRunForUser, rejectProposalForUser, respondToRunForUser } from "./agentRuns";

export const createRunFromSlack = internalMutation({
  args: { eventId: v.id("events"), requestedByUserId: v.string(), objective: v.string(), idempotencyKey: v.string() },
  handler: (ctx, args) => createRunForUser(ctx, args),
});

export const mapThread = internalMutation({
  args: { eventId: v.id("events"), agentRunId: v.id("agent_runs"), slackWorkspaceId: v.id("slack_workspaces"), slackChannelId: v.string(), slackThreadTs: v.string(), slackUserId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId);
    const workspace = await ctx.db.get(args.slackWorkspaceId);
    const binding = await ctx.db.query("slack_channel_bindings").withIndex("by_workspace_channel", (q) => q.eq("slackWorkspaceId", args.slackWorkspaceId).eq("slackChannelId", args.slackChannelId)).unique();
    if (!run || run.eventId !== args.eventId || !workspace || !binding || binding.eventId !== args.eventId) throw new Error("Slack thread context is no longer valid.");
    const existing = await ctx.db.query("slack_agent_threads").withIndex("by_workspace_channel_thread", (q) => q.eq("slackWorkspaceId", args.slackWorkspaceId).eq("slackChannelId", args.slackChannelId).eq("slackThreadTs", args.slackThreadTs)).unique();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { agentRunId: args.agentRunId, slackUserId: args.slackUserId, eventId: args.eventId, lastProjectionKey: undefined, updatedAt: now });
    else await ctx.db.insert("slack_agent_threads", { ...args, createdAt: now, updatedAt: now });
  },
});

export const respondFromSlack = internalMutation({
  args: { eventId: v.id("events"), runId: v.id("agent_runs"), requestedByUserId: v.string(), message: v.string(), idempotencyKey: v.string() },
  handler: (ctx, args) => respondToRunForUser(ctx, args),
});

export const approveFromSlack = internalMutation({
  args: { eventId: v.id("events"), proposalId: v.id("agent_action_proposals"), expectedPayloadHash: v.string(), requestedByUserId: v.string() },
  handler: (ctx, args) => approveTaskProposalForUser(ctx, args),
});

export const rejectFromSlack = internalMutation({
  args: { eventId: v.id("events"), proposalId: v.id("agent_action_proposals"), requestedByUserId: v.string(), reason: v.optional(v.string()) },
  handler: (ctx, args) => rejectProposalForUser(ctx, args),
});

export const projectionContext = internalQuery({
  args: { runId: v.id("agent_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const thread = await ctx.db.query("slack_agent_threads").withIndex("by_run", (q) => q.eq("agentRunId", args.runId)).first();
    if (!thread) return null;
    const [workspace, binding, event, events, proposals] = await Promise.all([
      ctx.db.get(thread.slackWorkspaceId),
      ctx.db.query("slack_channel_bindings").withIndex("by_workspace_channel", (q) => q.eq("slackWorkspaceId", thread.slackWorkspaceId).eq("slackChannelId", thread.slackChannelId)).unique(),
      ctx.db.get(run.eventId),
      ctx.db.query("agent_run_events").withIndex("by_run_sequence", (q) => q.eq("runId", run._id)).collect(),
      ctx.db.query("agent_action_proposals").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
    ]);
    if (!workspace || workspace.status !== "connected" || !binding || binding.eventId !== run.eventId || !event) return null;
    return { run, thread, workspace, binding, event, events, proposals };
  },
});

export const proposalContext = internalQuery({
  args: { proposalId: v.id("agent_action_proposals"), eventId: v.id("events") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    const run = proposal ? await ctx.db.get(proposal.runId) : null;
    return proposal && run && proposal.eventId === args.eventId && run.eventId === args.eventId
      ? { runId: run._id, status: proposal.status, payloadHash: proposal.payloadHash }
      : null;
  },
});

export const markProjected = internalMutation({
  args: { threadId: v.id("slack_agent_threads"), projectionKey: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.lastProjectionKey === args.projectionKey) return false;
    await ctx.db.patch(thread._id, { lastProjectionKey: args.projectionKey, updatedAt: Date.now() });
    return true;
  },
});
