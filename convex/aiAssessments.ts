import { v } from "convex/values";
import { action, internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertEventOrganizerAccess, isEventOrganizer, requireIdentity } from "./functions";
import type { Id } from "./_generated/dataModel";
import { releaseManagedAllowance, reserveManagedAllowance, settleManagedAllowance } from "./agentBilling";
import { isManagedAiDisabled, MANAGED_AI_DISABLED_MESSAGE } from "./managedAi";

const PROMPT_VERSION = "review-assessment-v1";
const MODEL = process.env.OPENAI_REVIEW_MODEL ?? "gpt-5.4";

const requestArgs = { eventId: v.id("events"), submissionId: v.id("submissions"), evaluationPlanId: v.id("evaluation_plans") };

async function validatedRequestContext(ctx: QueryCtx | MutationCtx, args: { eventId: Id<"events">; submissionId: Id<"submissions">; evaluationPlanId: Id<"evaluation_plans"> }) {
  const identity = await assertEventOrganizerAccess(ctx, args.eventId);
  const [event, submission, plan, providerSetting] = await Promise.all([
    ctx.db.get(args.eventId),
    ctx.db.get(args.submissionId),
    ctx.db.get(args.evaluationPlanId),
    ctx.db.query("agent_provider_settings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique(),
  ]);
  if (!event) throw new Error("Event not found.");
  if (!submission || submission.eventId !== args.eventId) throw new Error("Submission not found.");
  if (!plan || plan.eventId !== args.eventId) throw new Error("Evaluation plan not found.");
  if (!plan.aiAssistEnabled) throw new Error("Enable AI assistance on this evaluation plan before requesting an assessment.");
  const providerMode = providerSetting?.mode ?? "managed";
  if (providerMode === "bring_your_own" && (!providerSetting?.credentialEnvelope || providerSetting.status !== "ready")) {
    throw new Error("Reconnect this event's OpenAI key in Settings before requesting an assessment.");
  }
  return { requestedByUserId: identity.subject, billingOwnerUserId: event.billingOwnerUserId, providerMode };
}

export const get = query({
  args: { eventId: v.id("events"), submissionId: v.id("submissions"), evaluationPlanId: v.id("evaluation_plans") },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const organizer = await isEventOrganizer(ctx, args.eventId, identity);
    if (!organizer) {
      const candidates = [identity.subject, ...(identity.email && identity.emailVerified === true ? [identity.email.toLowerCase()] : [])];
      const assignments = await Promise.all(candidates.map((reviewerUserId) => ctx.db.query("evaluation_assignments").withIndex("by_reviewer", (q) => q.eq("reviewerUserId", reviewerUserId)).collect()));
      const assigned = assignments.flat().some((assignment) => assignment.eventId === args.eventId && assignment.submissionId === args.submissionId && assignment.evaluationPlanId === args.evaluationPlanId);
      if (!assigned) throw new Error("Forbidden: assigned reviewer access required.");
    }
    return ctx.db.query("ai_assessments").withIndex("by_submission_plan", (q) => q.eq("submissionId", args.submissionId).eq("evaluationPlanId", args.evaluationPlanId)).order("desc").first();
  },
});

export const requestContext = internalQuery({
  args: requestArgs,
  handler: async (ctx, args) => {
    const requestContext = await validatedRequestContext(ctx, args);
    const now = Date.now();
    const prior = await ctx.db.query("ai_assessments").withIndex("by_submission_plan", (q) => q.eq("submissionId", args.submissionId).eq("evaluationPlanId", args.evaluationPlanId)).order("desc").first();
    if (prior?.status === "queued") return { ...requestContext, priorAssessmentId: prior._id };
    if (prior && now - prior.requestedAt < 10_000) throw new Error("Please wait a few seconds before retrying this assessment.");
    return requestContext;
  },
});

export const createAndSchedule = internalMutation({
  args: {
    ...requestArgs,
    requestedByUserId: v.string(),
    providerMode: v.union(v.literal("managed"), v.literal("bring_your_own")),
    allowance: v.optional(v.object({ planSlug: v.string(), runLimit: v.number(), tokenLimit: v.number(), reserveTokens: v.number() })),
  },
  handler: async (ctx, args) => {
    const current = await validatedRequestContext(ctx, args);
    if (current.requestedByUserId !== args.requestedByUserId || current.providerMode !== args.providerMode) {
      throw new Error("AI provider settings changed while the assessment was starting. Retry the request.");
    }
    const now = Date.now();
    const prior = await ctx.db.query("ai_assessments").withIndex("by_submission_plan", (q) => q.eq("submissionId", args.submissionId).eq("evaluationPlanId", args.evaluationPlanId)).order("desc").first();
    if (prior?.status === "queued") return prior._id;
    if (prior && now - prior.requestedAt < 10_000) throw new Error("Please wait a few seconds before retrying this assessment.");
    if (args.providerMode === "managed") {
      if (isManagedAiDisabled()) throw new Error(MANAGED_AI_DISABLED_MESSAGE);
      if (!current.billingOwnerUserId) throw new Error("This event needs a billing owner before Namos-managed AI can run.");
      if (!args.allowance) throw new Error("Namos-managed AI billing is not configured.");
    }
    const [submission, plan] = await Promise.all([ctx.db.get(args.submissionId), ctx.db.get(args.evaluationPlanId)]);
    if (!submission || !plan) throw new Error("Assessment inputs no longer exist.");
    // Versioned source identity is sufficient for cache/audit correlation; hashing the raw
    // proposal here would require a Node-only crypto import in a transactional mutation.
    const inputHash = `${submission._id}:${submission.updatedAt}:${plan._id}:${plan.updatedAt}:${PROMPT_VERSION}`;
    const id = await ctx.db.insert("ai_assessments", { eventId: args.eventId, submissionId: args.submissionId, evaluationPlanId: args.evaluationPlanId, status: "queued", model: MODEL, promptVersion: PROMPT_VERSION, inputHash, requestedByUserId: args.requestedByUserId, providerMode: args.providerMode, requestedAt: now });
    if (args.providerMode === "managed") {
      const reservation = await reserveManagedAllowance(ctx, { billingOwnerUserId: current.billingOwnerUserId!, ...args.allowance! });
      await ctx.db.patch(id, { billingOwnerUserId: current.billingOwnerUserId, managedAllowanceId: reservation.allowanceId, managedReservedTokens: reservation.reserveTokens });
    }
    await ctx.scheduler.runAfter(0, internal.aiAssessmentActions.run, { assessmentId: id });
    return id;
  },
});

// Allowance resolution calls Clerk and therefore runs outside the transactional mutation. The
// final mutation revalidates auth/provider state and atomically reserves quota with row creation.
export const request = action({
  args: requestArgs,
  handler: async (ctx, args): Promise<Id<"ai_assessments">> => {
    const requestContext = await ctx.runQuery(internal.aiAssessments.requestContext, args);
    if (requestContext.priorAssessmentId) return requestContext.priorAssessmentId;
    if (requestContext.providerMode === "managed") {
      if (isManagedAiDisabled()) throw new Error(MANAGED_AI_DISABLED_MESSAGE);
      if (!requestContext.billingOwnerUserId) throw new Error("This event needs a billing owner before Namos-managed AI can run.");
      const allowance = await ctx.runAction(internal.agentBillingResolver.resolve, { billingOwnerUserId: requestContext.billingOwnerUserId });
      return ctx.runMutation(internal.aiAssessments.createAndSchedule, { ...args, requestedByUserId: requestContext.requestedByUserId, providerMode: requestContext.providerMode, allowance });
    }
    return ctx.runMutation(internal.aiAssessments.createAndSchedule, { ...args, requestedByUserId: requestContext.requestedByUserId, providerMode: requestContext.providerMode });
  },
});

export const complete = internalMutation({
  args: { assessmentId: v.id("ai_assessments"), score: v.number(), rationale: v.string(), criteria: v.array(v.object({ criterionId: v.string(), score: v.optional(v.number()), rationale: v.string() })), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.status !== "queued") return;
    if (assessment.managedAllowanceId) await settleManagedAllowance(ctx, assessment.managedAllowanceId, assessment.managedReservedTokens ?? 0, args.inputTokens, args.outputTokens);
    await ctx.db.patch(args.assessmentId, { status: "completed", score: args.score, rationale: args.rationale.slice(0, 1_200), criteria: args.criteria.map((criterion) => ({ ...criterion, rationale: criterion.rationale.slice(0, 800) })), completedAt: Date.now(), error: undefined });
  },
});

export const fail = internalMutation({
  args: { assessmentId: v.id("ai_assessments"), error: v.string() },
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.status !== "queued") return;
    if (assessment.managedAllowanceId) await releaseManagedAllowance(ctx, assessment.managedAllowanceId, assessment.managedReservedTokens ?? 0);
    await ctx.db.patch(args.assessmentId, { status: "failed", error: args.error.slice(0, 500), completedAt: Date.now() });
  },
});

// Narrow server-only query keeps the action from ever receiving speaker PII or unrelated event data.
export const getForRun = internalQuery({
  args: { assessmentId: v.id("ai_assessments") },
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment) return null;
    const [submission, plan] = await Promise.all([ctx.db.get(assessment.submissionId), ctx.db.get(assessment.evaluationPlanId)]);
    if (!submission || !plan || submission.eventId !== assessment.eventId || plan.eventId !== assessment.eventId) return null;
    return { ...assessment, submission: { title: submission.title, answers: submission.answers }, plan: { name: plan.name, scoringScaleMax: plan.scoringScaleMax, criteria: plan.criteria }, eventId: assessment.eventId };
  },
});
