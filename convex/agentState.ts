import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const proposedTaskValidator = v.object({
  title: v.string(),
  targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission"), v.literal("sponsor")),
  speakerId: v.optional(v.id("speakers")),
  submissionId: v.optional(v.id("submissions")),
  sponsorId: v.optional(v.id("sponsors")),
  linkedFormId: v.optional(v.id("submission_forms")),
  dueDate: v.optional(v.number()),
  reason: v.string(),
});

export const proposedMessageValidator = v.object({
  speakerId: v.id("speakers"),
  submissionId: v.optional(v.id("submissions")),
  templateId: v.optional(v.id("comms_templates")),
  kind: v.union(v.literal("acceptance"), v.literal("rejection"), v.literal("reminder"), v.literal("custom")),
  subject: v.string(),
  body: v.string(),
  calendarAttached: v.boolean(),
  reason: v.string(),
});

async function nextSequence(ctx: MutationCtx, runId: Id<"agent_runs">) {
  const latest = await ctx.db.query("agent_run_events").withIndex("by_run_sequence", (q) => q.eq("runId", runId)).order("desc").first();
  return (latest?.sequence ?? 0) + 1;
}

export const executionContext = internalQuery({
  args: { runId: v.id("agent_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Agent run no longer exists.");
    if (run.status !== "queued" && run.status !== "running") return { runnable: false as const, run };
    const globalOrganizer = await ctx.db.query("organizers").withIndex("by_userId", (q) => q.eq("userId", run.requestedByUserId)).unique();
    const membership = globalOrganizer ? null : await ctx.db.query("event_members").withIndex("by_event_userId", (q) => q.eq("eventId", run.eventId).eq("userId", run.requestedByUserId)).unique();
    if (!globalOrganizer && membership?.role !== "organizer") throw new Error("The requesting organizer no longer has access to this event.");
    const event = await ctx.db.get(run.eventId);
    if (!event) throw new Error("The event for this run no longer exists.");
    const events = await ctx.db.query("agent_run_events").withIndex("by_run_sequence", (q) => q.eq("runId", run._id)).order("desc").take(8);
    return { runnable: true as const, run, event, events: events.reverse() };
  },
});

export const begin = internalMutation({
  args: { runId: v.id("agent_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || (run.status !== "queued" && run.status !== "running")) return false;
    const now = Date.now();
    await ctx.db.patch(run._id, { status: "running", startedAt: run.startedAt ?? now, updatedAt: now });
    await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: await nextSequence(ctx, run._id), type: "progress", message: "Operations Agent started reviewing this event.", createdAt: now });
    return true;
  },
});

export const setThread = internalMutation({
  args: { runId: v.id("agent_runs"), threadId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return false;
    await ctx.db.patch(run._id, { threadId: args.threadId, updatedAt: Date.now() });
    return true;
  },
});

export const append = internalMutation({
  args: { runId: v.id("agent_runs"), type: v.union(v.literal("assistant_message"), v.literal("progress"), v.literal("tool_call"), v.literal("tool_result"), v.literal("error")), message: v.string(), toolName: v.optional(v.string()), toolCallId: v.optional(v.string()), detailsJson: v.optional(v.string()), durationMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Agent run no longer exists.");
    if (run.status === "cancelled") return false;
    await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: await nextSequence(ctx, run._id), type: args.type, message: args.message.slice(0, 4000), toolName: args.toolName, toolCallId: args.toolCallId, detailsJson: args.detailsJson?.slice(0, 8000), durationMs: args.durationMs, createdAt: Date.now() });
    return true;
  },
});

export const requestClarification = internalMutation({
  args: { runId: v.id("agent_runs"), question: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") throw new Error("This run cannot request clarification now.");
    const question = args.question.trim().slice(0, 1000);
    if (!question) throw new Error("A clarification question is required.");
    const now = Date.now();
    await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: await nextSequence(ctx, run._id), type: "clarification", message: question, createdAt: now });
    await ctx.db.patch(run._id, { status: "needs_input", updatedAt: now });
  },
});

export const saveProposal = internalMutation({
  args: { runId: v.id("agent_runs"), summary: v.string(), tasks: v.array(proposedTaskValidator), payloadHash: v.string(), toolCallId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") throw new Error("This run cannot propose tasks now.");
    if (args.tasks.length < 1 || args.tasks.length > 50) throw new Error("A task proposal must contain between 1 and 50 tasks.");
    const now = Date.now();
    const proposalId = await ctx.db.insert("agent_action_proposals", { eventId: run.eventId, runId: run._id, kind: "create_tasks", tasks: args.tasks, payloadHash: args.payloadHash, summary: args.summary.trim().slice(0, 1000), status: "pending", proposedByToolCallId: args.toolCallId, createdAt: now, updatedAt: now });
    await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: await nextSequence(ctx, run._id), type: "proposal", message: `Proposed ${args.tasks.length} task${args.tasks.length === 1 ? "" : "s"} for approval.`, toolName: "propose_create_tasks", toolCallId: args.toolCallId, detailsJson: JSON.stringify({ proposalId, count: args.tasks.length, payloadHash: args.payloadHash }), createdAt: now });
    await ctx.db.patch(run._id, { status: "needs_approval", updatedAt: now });
    return proposalId;
  },
});

export const saveMessageProposal = internalMutation({
  args: { runId: v.id("agent_runs"), summary: v.string(), messages: v.array(proposedMessageValidator), payloadHash: v.string(), toolCallId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") throw new Error("This run cannot propose message drafts now.");
    if (args.messages.length < 1 || args.messages.length > 50) throw new Error("A message proposal must contain between 1 and 50 drafts.");
    const now = Date.now();
    const proposalId = await ctx.db.insert("agent_action_proposals", { eventId: run.eventId, runId: run._id, kind: "prepare_message_drafts", messages: args.messages, payloadHash: args.payloadHash, summary: args.summary.trim().slice(0, 1000), status: "pending", proposedByToolCallId: args.toolCallId, createdAt: now, updatedAt: now });
    await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: await nextSequence(ctx, run._id), type: "proposal", message: `Prepared ${args.messages.length} message draft${args.messages.length === 1 ? "" : "s"} for approval. Nothing has been sent.`, toolName: "propose_message_drafts", toolCallId: args.toolCallId, detailsJson: JSON.stringify({ proposalId, count: args.messages.length, payloadHash: args.payloadHash }), createdAt: now });
    await ctx.db.patch(run._id, { status: "needs_approval", updatedAt: now });
    return proposalId;
  },
});

export const recordSegmentSteps = internalMutation({
  args: { runId: v.id("agent_runs"), stepCount: v.number(), inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status === "cancelled" || run.status === "completed" || run.status === "failed") return false;
    const segmentSteps = Math.max(0, Math.floor(args.stepCount));
    await ctx.db.patch(run._id, {
      stepCount: Math.min(run.maxSteps, run.stepCount + segmentSteps),
      inputTokens: (run.inputTokens ?? 0) + Math.max(0, Math.floor(args.inputTokens ?? 0)),
      outputTokens: (run.outputTokens ?? 0) + Math.max(0, Math.floor(args.outputTokens ?? 0)),
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const finish = internalMutation({
  args: { runId: v.id("agent_runs"), summary: v.string(), stepCount: v.number(), inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return false;
    const now = Date.now();
    const summary = args.summary.trim();
    if (!summary) throw new Error("The model returned no final response.");
    await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: await nextSequence(ctx, run._id), type: "assistant_message", message: summary.slice(0, 4000), createdAt: now });
    await ctx.db.patch(run._id, { status: "completed", finalSummary: summary.slice(0, 4000), stepCount: Math.min(run.maxSteps, run.stepCount + Math.max(0, args.stepCount)), inputTokens: (run.inputTokens ?? 0) + Math.max(0, Math.floor(args.inputTokens ?? 0)), outputTokens: (run.outputTokens ?? 0) + Math.max(0, Math.floor(args.outputTokens ?? 0)), completedAt: now, updatedAt: now });
    return true;
  },
});

export const fail = internalMutation({
  args: { runId: v.id("agent_runs"), message: v.string(), stepCount: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status === "cancelled" || run.status === "completed") return false;
    const now = Date.now();
    const message = args.message.slice(0, 1000);
    await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: await nextSequence(ctx, run._id), type: "error", message, createdAt: now });
    await ctx.db.patch(run._id, { status: "failed", error: message, stepCount: Math.min(run.maxSteps, run.stepCount + (args.stepCount ?? 0)), completedAt: now, updatedAt: now });
    return true;
  },
});
