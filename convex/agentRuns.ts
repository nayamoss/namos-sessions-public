import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertEventOrganizerAccess, assertEventOrganizerByUserId, identityEmail, isEventOrganizer, mutation } from "./functions";
import { validateAndCreateTask } from "./tasks";
import { internal } from "./_generated/api";
import { workflow } from "./agentWorkflow";
import { isManagedAiDisabled, MANAGED_AI_DISABLED_MESSAGE } from "./managedAi";
import { releaseManagedAllowance } from "./agentBilling";

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

async function releaseManagedReservation(ctx: MutationCtx, run: Doc<"agent_runs">) {
  if (!run.managedAllowanceId) return;
  const usage = await ctx.db.query("agent_usage_records").withIndex("by_run", (q) => q.eq("runId", run._id)).first();
  if (usage?.settledAt) return;
  const now = Date.now();
  await releaseManagedAllowance(ctx, run.managedAllowanceId, run.managedReservedTokens ?? 0);
  await ctx.db.patch(run._id, { managedAllowanceId: undefined, managedReservedTokens: undefined, updatedAt: now });
  if (usage) await ctx.db.patch(usage._id, { settledAt: now });
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

export const suggestions = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const [event, submissions, speakers, tasks, assignments, evaluations, communications] = await Promise.all([
      ctx.db.get(args.eventId),
      ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("onboarding_tasks").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("evaluation_assignments").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("evaluations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("comms_log").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    const completedAssignmentIds = new Set(evaluations.filter((row) => row.assignmentId && (row.score !== undefined || row.criteriaScores?.some((criterion) => criterion.value !== undefined || Boolean(criterion.text?.trim())))).map((row) => row.assignmentId));
    const incompleteReviews = assignments.filter((row) => !completedAssignmentIds.has(row._id));
    const notifiedSubmissionIds = new Set(communications.filter((row) => row.status === "sent" && row.submissionId).map((row) => row.submissionId));
    const acceptedUnnotified = submissions.filter((row) => row.status === "accepted" && row.speakerId && !notifiedSubmissionIds.has(row._id));
    const overdueTasks = tasks.filter((row) => row.status !== "completed" && row.dueDate !== undefined && row.dueDate < Date.now());
    const unconfirmedSpeakers = speakers.filter((row) => row.confirmationStatus !== "confirmed");
    const slug = event?.slug ?? "";
    const base = `/events/${slug}`;
    return [
      ...(acceptedUnnotified.length ? [{ id: "accepted-unnotified", label: `${acceptedUnnotified.length} accepted speaker${acceptedUnnotified.length === 1 ? " has" : "s have"} not been notified`, objective: `Inspect the ${acceptedUnnotified.length} accepted submission${acceptedUnnotified.length === 1 ? "" : "s"} whose speakers have not been notified, then prepare exact acceptance message drafts for approval.`, evidenceCount: acceptedUnnotified.length, sourcePath: `${base}/program/communications` }] : []),
      ...(incompleteReviews.length ? [{ id: "incomplete-reviews", label: `${incompleteReviews.length} review${incompleteReviews.length === 1 ? " is" : "s are"} incomplete`, objective: `Inspect the ${incompleteReviews.length} incomplete review assignment${incompleteReviews.length === 1 ? "" : "s"} and summarize the concrete coverage gaps.`, evidenceCount: incompleteReviews.length, sourcePath: `${base}/program/evaluation` }] : []),
      ...(overdueTasks.length ? [{ id: "overdue-tasks", label: `${overdueTasks.length} speaker task${overdueTasks.length === 1 ? " is" : "s are"} overdue`, objective: `Inspect the ${overdueTasks.length} overdue speaker task${overdueTasks.length === 1 ? "" : "s"} and prepare targeted follow-up work for approval.`, evidenceCount: overdueTasks.length, sourcePath: `${base}/portals/tasks` }] : []),
      ...(unconfirmedSpeakers.length ? [{ id: "unconfirmed-speakers", label: `${unconfirmedSpeakers.length} speaker${unconfirmedSpeakers.length === 1 ? " needs" : "s need"} confirmation`, objective: `Inspect the ${unconfirmedSpeakers.length} speakers awaiting confirmation and report the exact records that need organizer attention.`, evidenceCount: unconfirmedSpeakers.length, sourcePath: `${base}/program/speakers` }] : []),
    ].slice(0, 4);
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

export async function createRunForUser(ctx: MutationCtx, args: { eventId: Id<"events">; requestedByUserId: string; requestedByEmail?: string; objective: string; idempotencyKey: string }) {
  await assertEventOrganizerByUserId(ctx, args.eventId, args.requestedByUserId, args.requestedByEmail);
  const objective = args.objective.trim();
  if (!objective) throw new Error("Enter an objective for this run.");
  if (objective.length > 4000) throw new Error("An objective cannot exceed 4,000 characters.");
  const idempotencyKey = validateIdempotencyKey(args.idempotencyKey);
  const existing = await ctx.db.query("agent_runs").withIndex("by_requester_idempotency", (q) => q.eq("requestedByUserId", args.requestedByUserId).eq("idempotencyKey", idempotencyKey)).unique();
  if (existing) {
    if (existing.eventId !== args.eventId) throw new Error("This request key is already bound to another event.");
    return { runId: existing._id };
  }
  const now = Date.now();
  const providerSetting = await ctx.db.query("agent_provider_settings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
  const providerMode = providerSetting?.mode ?? "managed";
  if (providerMode === "bring_your_own" && (!providerSetting?.credentialEnvelope || providerSetting.status !== "ready")) throw new Error("Reconnect this event's OpenAI key in Settings before starting a run.");
  if (providerMode === "managed") {
    if (isManagedAiDisabled()) throw new Error(MANAGED_AI_DISABLED_MESSAGE);
    if (!process.env.OPENAI_API_KEY) throw new Error("Namos-managed AI is temporarily unavailable. Choose Bring your own key in Settings, or contact support.");
    const event = await ctx.db.get(args.eventId);
    if (!event?.billingOwnerUserId) throw new Error("This event needs a billing owner before Namos-managed AI can run.");
  }
  const runId = await ctx.db.insert("agent_runs", { eventId: args.eventId, requestedByUserId: args.requestedByUserId, objective, status: "queued", model: process.env.OPENAI_AGENT_MODEL ?? "gpt-5.6-terra", providerMode, idempotencyKey, stepCount: 0, maxSteps: 12, createdAt: now, updatedAt: now });
  await ctx.db.insert("agent_run_events", { eventId: args.eventId, runId, sequence: 1, type: "user_message", message: objective, createdAt: now });
  await workflow.start(ctx, internal.agentWorkflow.execute, { runId }, { startAsync: true });
  return { runId };
}

export async function respondToRunForUser(ctx: MutationCtx, args: { eventId: Id<"events">; runId: Id<"agent_runs">; requestedByUserId: string; requestedByEmail?: string; message: string; idempotencyKey: string }) {
  await assertEventOrganizerByUserId(ctx, args.eventId, args.requestedByUserId, args.requestedByEmail);
  const run = await ctx.db.get(args.runId);
  if (!run || run.eventId !== args.eventId) throw new Error("Agent run not found for this event.");
  const message = args.message.trim();
  if (!message) throw new Error("Enter a reply to continue.");
  if (message.length > 4000) throw new Error("A reply cannot exceed 4,000 characters.");
  const idempotencyKey = validateIdempotencyKey(args.idempotencyKey);
  const events = await ctx.db.query("agent_run_events").withIndex("by_run_sequence", (q) => q.eq("runId", run._id)).collect();
  if (events.some((event) => event.detailsJson === JSON.stringify({ idempotencyKey }))) return { runId: run._id };
  if (run.status !== "needs_input") throw new Error("This run is not waiting for input.");
  const now = Date.now();
  await ctx.db.insert("agent_run_events", { eventId: run.eventId, runId: run._id, sequence: (events.at(-1)?.sequence ?? 0) + 1, type: "user_message", message, detailsJson: JSON.stringify({ idempotencyKey }), createdAt: now });
  await ctx.db.patch(run._id, { status: "queued", error: undefined, completedAt: undefined, updatedAt: now });
  await workflow.start(ctx, internal.agentWorkflow.execute, { runId: run._id }, { startAsync: true });
  return { runId: run._id };
}

export async function approveTaskProposalForUser(ctx: MutationCtx, args: { eventId: Id<"events">; proposalId: Id<"agent_action_proposals">; expectedPayloadHash: string; requestedByUserId: string; requestedByEmail?: string }) {
  await assertEventOrganizerByUserId(ctx, args.eventId, args.requestedByUserId, args.requestedByEmail);
  const proposal = await ctx.db.get(args.proposalId);
  if (!proposal || proposal.eventId !== args.eventId) throw new Error("Agent proposal not found for this event.");
  const run = await ctx.db.get(proposal.runId);
  if (!run || run.eventId !== args.eventId) throw new Error("Agent run not found for this event.");
  if (args.expectedPayloadHash !== proposal.payloadHash) throw new Error("This proposal changed. Reload before approving.");
  if (proposal.status === "applied") return { createdTaskIds: proposal.createdTaskIds ?? [] };
  if (proposal.status !== "pending" || run.status !== "needs_approval") throw new Error("This proposal is no longer pending approval.");
  if (proposal.kind !== "create_tasks" || !proposal.tasks) throw new Error("This is not a task proposal.");
  const createdTaskIds: Id<"onboarding_tasks">[] = [];
  for (const task of proposal.tasks) createdTaskIds.push(await validateAndCreateTask(ctx, { eventId: proposal.eventId, title: task.title, targetType: task.targetType, speakerId: task.speakerId, submissionId: task.submissionId, sponsorId: task.sponsorId, linkedFormId: task.linkedFormId, dueDate: task.dueDate, description: task.reason }, "agent"));
  const now = Date.now();
  await ctx.db.patch(proposal._id, { status: "applied", decidedByUserId: args.requestedByUserId, decidedAt: now, appliedAt: now, createdTaskIds, updatedAt: now });
  await ctx.db.patch(run._id, { status: "completed", completedAt: now, updatedAt: now });
  await appendEvent(ctx, run, "approval", `Approved and created ${createdTaskIds.length} task${createdTaskIds.length === 1 ? "" : "s"}.`);
  return { createdTaskIds };
}

export async function rejectProposalForUser(ctx: MutationCtx, args: { eventId: Id<"events">; proposalId: Id<"agent_action_proposals">; requestedByUserId: string; requestedByEmail?: string; reason?: string }) {
  await assertEventOrganizerByUserId(ctx, args.eventId, args.requestedByUserId, args.requestedByEmail);
  const proposal = await ctx.db.get(args.proposalId);
  if (!proposal || proposal.eventId !== args.eventId) throw new Error("Task proposal not found for this event.");
  const run = await ctx.db.get(proposal.runId);
  if (!run || run.eventId !== args.eventId) throw new Error("Agent run not found for this event.");
  if (proposal.status === "rejected") return { rejected: true as const };
  if (proposal.status !== "pending") throw new Error("This proposal is no longer pending approval.");
  const now = Date.now();
  const decisionReason = args.reason?.trim().slice(0, 500) || undefined;
  await ctx.db.patch(proposal._id, { status: "rejected", decidedByUserId: args.requestedByUserId, decisionReason, decidedAt: now, updatedAt: now });
  await ctx.db.patch(run._id, { status: "completed", completedAt: now, updatedAt: now });
  await appendEvent(ctx, run, "approval", decisionReason ? `Proposal rejected: ${decisionReason}` : "Proposal rejected by organizer.");
  return { rejected: true as const };
}

export const create = mutation({
  args: { eventId: v.id("events"), objective: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    return createRunForUser(ctx, { ...args, requestedByUserId: identity.subject, requestedByEmail: identityEmail(identity) });
  },
});

export const respond = mutation({
  args: { eventId: v.id("events"), runId: v.id("agent_runs"), message: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    await respondToRunForUser(ctx, { ...args, requestedByUserId: identity.subject, requestedByEmail: identityEmail(identity) });
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
    await releaseManagedReservation(ctx, run);
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
    return approveTaskProposalForUser(ctx, { ...args, requestedByUserId: identity.subject, requestedByEmail: identityEmail(identity) });
  },
});

export const approveMessageProposal = mutation({
  args: { eventId: v.id("events"), proposalId: v.id("agent_action_proposals"), expectedPayloadHash: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.eventId !== args.eventId || proposal.kind !== "prepare_message_drafts" || !proposal.messages) throw new Error("Message proposal not found for this event.");
    const run = await ctx.db.get(proposal.runId);
    if (!run || run.eventId !== args.eventId) throw new Error("Agent run not found for this event.");
    if (args.expectedPayloadHash !== proposal.payloadHash) throw new Error("This proposal changed. Reload before approving.");
    if (proposal.status === "applied") return { createdDraftIds: proposal.createdDraftIds ?? [] };
    if (proposal.status !== "pending" || run.status !== "needs_approval") throw new Error("This proposal is no longer pending approval.");
    const now = Date.now();
    const createdDraftIds: Id<"communication_drafts">[] = [];
    for (const message of proposal.messages) {
      const speaker = await ctx.db.get(message.speakerId);
      if (!speaker || speaker.eventId !== args.eventId) throw new Error("A proposed recipient no longer belongs to this event.");
      let submission: Doc<"submissions"> | null = null;
      if (message.submissionId) {
        submission = await ctx.db.get(message.submissionId);
        if (!submission || submission.eventId !== args.eventId) throw new Error("A proposed submission no longer belongs to this event.");
        const agenda = await ctx.db.query("agenda_items").withIndex("by_submission", (q) => q.eq("submissionId", submission!._id)).first();
        if (submission.speakerId !== speaker._id && !agenda?.speakerIds.includes(speaker._id)) throw new Error("A proposed recipient is not attached to this submission.");
      }
      if ((message.kind === "acceptance" || message.kind === "rejection") && !submission) throw new Error("A decision draft must reference its submission.");
      if (message.kind === "acceptance" && submission?.status !== "accepted") throw new Error("An acceptance draft requires an accepted submission.");
      if (message.kind === "rejection" && submission?.status !== "declined") throw new Error("A rejection draft requires a declined submission.");
      if (message.calendarAttached) {
        if (!submission) throw new Error("A calendar attachment needs a scheduled submission.");
        const agenda = await ctx.db.query("agenda_items").withIndex("by_submission", (q) => q.eq("submissionId", submission!._id)).first();
        if (!agenda) throw new Error("A calendar attachment needs a scheduled submission.");
      }
      if (message.templateId) {
        const template = await ctx.db.get(message.templateId);
        if (!template || template.eventId !== args.eventId) throw new Error("A proposed template no longer belongs to this event.");
      }
      createdDraftIds.push(await ctx.db.insert("communication_drafts", { eventId: args.eventId, proposalId: proposal._id, runId: run._id, speakerId: speaker._id, submissionId: message.submissionId, templateId: message.templateId, kind: message.kind, toEmail: speaker.email, subject: message.subject, body: message.body, calendarAttached: message.calendarAttached, status: "draft", source: "agent", createdByUserId: identity.subject, createdAt: now, updatedAt: now }));
    }
    await ctx.db.patch(proposal._id, { status: "applied", decidedByUserId: identity.subject, decidedAt: now, appliedAt: now, createdDraftIds, updatedAt: now });
    await ctx.db.patch(run._id, { status: "completed", completedAt: now, updatedAt: now });
    await appendEvent(ctx, run, "approval", `Approved and prepared ${createdDraftIds.length} message draft${createdDraftIds.length === 1 ? "" : "s"}. Nothing was sent.`);
    return { createdDraftIds };
  },
});

export const rejectProposal = mutation({
  args: { eventId: v.id("events"), proposalId: v.id("agent_action_proposals"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    await rejectProposalForUser(ctx, { ...args, requestedByUserId: identity.subject, requestedByEmail: identityEmail(identity) });
  },
});
