import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertEventOrganizerAccess, isEventOrganizer } from "./functions";
import { validateAndCreateTask } from "./tasks";
import { internal } from "./_generated/api";
import { workflow } from "./agentWorkflow";

const cancellableStatuses = new Set(["queued", "running", "needs_input", "needs_approval"]);

async function appendEvent(
  ctx: MutationCtx,
  run: Doc<"agent_runs">,
  type: Doc<"agent_run_events">["type"],
  message: string,
) {
  const latest = await ctx.db
    .query("agent_run_events")
    .withIndex("by_run_sequence", (q) => q.eq("runId", run._id))
    .order("desc")
    .first();
  return ctx.db.insert("agent_run_events", {
    eventId: run.eventId,
    runId: run._id,
    sequence: (latest?.sequence ?? 0) + 1,
    type,
    message,
    createdAt: Date.now(),
  });
}

async function authorizedRun(ctx: MutationCtx, eventId: Id<"events">, runId: Id<"agent_runs">) {
  await assertEventOrganizerAccess(ctx, eventId);
  const run = await ctx.db.get(runId);
  if (!run || run.eventId !== eventId) throw new Error("Agent run not found for this event.");
  return run;
}

export const canUse = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity ? isEventOrganizer(ctx, args.eventId, identity) : false;
  },
});

export const list = query({
  args: { eventId: v.id("events"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 30)));
    return ctx.db.query("agent_runs").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).order("desc").take(limit);
  },
});

export const get = query({
  args: { eventId: v.id("events"), runId: v.id("agent_runs") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.eventId !== args.eventId) return null;
    const [events, proposals] = await Promise.all([
      ctx.db.query("agent_run_events").withIndex("by_run_sequence", (q) => q.eq("runId", run._id)).collect(),
      ctx.db.query("agent_action_proposals").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
    ]);
    return { run, events, proposals };
  },
});

function validateIdempotencyKey(value: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 200) throw new Error("A valid idempotency key is required.");
  return key;
}

export const create = mutation({
  args: { eventId: v.id("events"), objective: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const objective = args.objective.trim();
    if (!objective) throw new Error("Enter an objective for this run.");
    if (objective.length > 4000) throw new Error("An objective cannot exceed 4,000 characters.");
    const idempotencyKey = validateIdempotencyKey(args.idempotencyKey);
    const existing = await ctx.db.query("agent_runs").withIndex("by_requester_idempotency", (q) => q.eq("requestedByUserId", identity.subject).eq("idempotencyKey", idempotencyKey)).unique();
    if (existing) {
      if (existing.eventId !== args.eventId) throw new Error("This request key is already bound to another event.");
      return { runId: existing._id };
    }
    const now = Date.now();
    const providerSetting = await ctx.db.query("agent_provider_settings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    const providerMode = providerSetting?.mode ?? "managed";
    if (providerMode === "bring_your_own" && (!providerSetting?.credentialEnvelope || providerSetting.status !== "ready")) throw new Error("Reconnect this event's OpenAI key in Settings before starting a run.");
    if (providerMode === "managed" && !process.env.OPENAI_API_KEY) throw new Error("Namos-managed AI is temporarily unavailable. Choose Bring your own key in Settings, or contact support.");
    const runId = await ctx.db.insert("agent_runs", { eventId: args.eventId, requestedByUserId: identity.subject, objective, status: "queued", model: process.env.OPENAI_AGENT_MODEL ?? "gpt-5.6-terra", providerMode, idempotencyKey, stepCount: 0, maxSteps: 12, createdAt: now, updatedAt: now });
    await ctx.db.insert("agent_run_events", { eventId: args.eventId, runId, sequence: 1, type: "user_message", message: objective, createdAt: now });
    await workflow.start(ctx, internal.agentWorkflow.execute, { runId }, { startAsync: true });
    return { runId };
  },
});

export const respond = mutation({
  args: { eventId: v.id("events"), runId: v.id("agent_runs"), message: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const run = await authorizedRun(ctx, args.eventId, args.runId);
    const message = args.message.trim();
    if (!message) throw new Error("Enter a reply to continue.");
    if (message.length > 4000) throw new Error("A reply cannot exceed 4,000 characters.");
    const idempotencyKey = validateIdempotencyKey(args.idempotencyKey);
    const events = await ctx.db.query("agent_run_events").withIndex("by_run_sequence", (q) => q.eq("runId", run._id)).collect();
    if (events.some((event) => event.detailsJson === JSON.stringify({ idempotencyKey }))) return;
    if (run.status !== "needs_input") throw new Error("This run is not waiting for input.");
    const now = Date.now();
    await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: (events.at(-1)?.sequence ?? 0) + 1, type: "user_message", message, detailsJson: JSON.stringify({ idempotencyKey }), createdAt: now });
    await ctx.db.patch(run._id, { status: "queued", error: undefined, completedAt: undefined, updatedAt: now });
    await workflow.start(ctx, internal.agentWorkflow.execute, { runId: run._id }, { startAsync: true });
  },
});

export const retry = mutation({
  args: { eventId: v.id("events"), runId: v.id("agent_runs") },
  handler: async (ctx, args) => {
    const run = await authorizedRun(ctx, args.eventId, args.runId);
    if (run.status !== "failed") throw new Error("Only failed runs can be retried.");
    if (run.stepCount >= run.maxSteps) throw new Error("This run reached its step limit. Start a new run with a narrower objective.");
    await ctx.db.patch(run._id, { status: "queued", error: undefined, completedAt: undefined, updatedAt: Date.now() });
    await workflow.start(ctx, internal.agentWorkflow.execute, { runId: run._id }, { startAsync: true });
  },
});

export const cancel = mutation({
  args: { eventId: v.id("events"), runId: v.id("agent_runs") },
  handler: async (ctx, args) => {
    const run = await authorizedRun(ctx, args.eventId, args.runId);
    if (run.status === "cancelled") return;
    if (!cancellableStatuses.has(run.status)) throw new Error("This run can no longer be cancelled.");
    const now = Date.now();
    const proposals = await ctx.db.query("agent_action_proposals").withIndex("by_run", (q) => q.eq("runId", run._id)).collect();
    for (const proposal of proposals) {
      if (proposal.status === "pending") await ctx.db.patch(proposal._id, { status: "superseded", error: "Run cancelled before approval.", updatedAt: now });
    }
    await ctx.db.patch(run._id, { status: "cancelled", completedAt: now, updatedAt: now });
    await appendEvent(ctx, run, "approval", "Run cancelled by organizer.");
  },
});

export const approveTaskProposal = mutation({
  args: { eventId: v.id("events"), proposalId: v.id("agent_action_proposals"), expectedPayloadHash: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.eventId !== args.eventId) throw new Error("Task proposal not found for this event.");
    const run = await ctx.db.get(proposal.runId);
    if (!run || run.eventId !== args.eventId) throw new Error("Agent run not found for this event.");
    if (args.expectedPayloadHash !== proposal.payloadHash) throw new Error("This proposal changed. Reload before approving.");
    if (proposal.status === "applied") return { createdTaskIds: proposal.createdTaskIds ?? [] };
    if (proposal.status !== "pending" || run.status !== "needs_approval") throw new Error("This proposal is no longer pending approval.");
    const createdTaskIds: Id<"onboarding_tasks">[] = [];
    for (const task of proposal.tasks) {
      createdTaskIds.push(await validateAndCreateTask(ctx, {
        eventId: proposal.eventId,
        title: task.title,
        targetType: task.targetType,
        speakerId: task.speakerId,
        submissionId: task.submissionId,
        sponsorId: task.sponsorId,
        linkedFormId: task.linkedFormId,
        dueDate: task.dueDate,
        description: task.reason,
      }, "agent"));
    }
    const now = Date.now();
    await ctx.db.patch(proposal._id, { status: "applied", decidedByUserId: identity.subject, decidedAt: now, appliedAt: now, createdTaskIds, updatedAt: now });
    await ctx.db.patch(run._id, { status: "completed", completedAt: now, updatedAt: now });
    await appendEvent(ctx, run, "approval", `Approved and created ${createdTaskIds.length} task${createdTaskIds.length === 1 ? "" : "s"}.`);
    return { createdTaskIds };
  },
});

export const rejectProposal = mutation({
  args: { eventId: v.id("events"), proposalId: v.id("agent_action_proposals"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.eventId !== args.eventId) throw new Error("Task proposal not found for this event.");
    const run = await ctx.db.get(proposal.runId);
    if (!run || run.eventId !== args.eventId) throw new Error("Agent run not found for this event.");
    if (proposal.status === "rejected") return;
    if (proposal.status !== "pending") throw new Error("This proposal is no longer pending approval.");
    const now = Date.now();
    const decisionReason = args.reason?.trim().slice(0, 500) || undefined;
    await ctx.db.patch(proposal._id, { status: "rejected", decidedByUserId: identity.subject, decisionReason, decidedAt: now, updatedAt: now });
    await ctx.db.patch(run._id, { status: "completed", completedAt: now, updatedAt: now });
    await appendEvent(ctx, run, "approval", decisionReason ? `Proposal rejected: ${decisionReason}` : "Proposal rejected by organizer.");
  },
});
