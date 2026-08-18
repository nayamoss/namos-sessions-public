import { v } from "convex/values";
import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertEventOrganizerAccess, isEventOrganizer, requireIdentity } from "./functions";

const PROMPT_VERSION = "review-assessment-v1";
const MODEL = process.env.OPENAI_REVIEW_MODEL ?? "gpt-5.4";

function compactAnswers(value: unknown) {
  const serialized = JSON.stringify(value);
  return serialized.length > 12_000 ? `${serialized.slice(0, 12_000)}…` : serialized;
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

export const request = mutation({
  args: { eventId: v.id("events"), submissionId: v.id("submissions"), evaluationPlanId: v.id("evaluation_plans") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const [submission, plan] = await Promise.all([ctx.db.get(args.submissionId), ctx.db.get(args.evaluationPlanId)]);
    if (!submission || submission.eventId !== args.eventId) throw new Error("Submission not found.");
    if (!plan || plan.eventId !== args.eventId) throw new Error("Evaluation plan not found.");
    if (!plan.aiAssistEnabled) throw new Error("Enable AI assistance on this evaluation plan before requesting an assessment.");
    const now = Date.now();
    // Versioned source identity is sufficient for cache/audit correlation; hashing the raw
    // proposal here would require a Node-only crypto import in a transactional mutation.
    const inputHash = `${submission._id}:${submission.updatedAt}:${plan._id}:${plan.updatedAt}:${PROMPT_VERSION}`;
    const prior = await ctx.db.query("ai_assessments").withIndex("by_submission_plan", (q) => q.eq("submissionId", args.submissionId).eq("evaluationPlanId", args.evaluationPlanId)).order("desc").first();
    if (prior?.status === "queued") return prior._id;
    if (prior && now - prior.requestedAt < 10_000) throw new Error("Please wait a few seconds before retrying this assessment.");
    const id = await ctx.db.insert("ai_assessments", { eventId: args.eventId, submissionId: args.submissionId, evaluationPlanId: args.evaluationPlanId, status: "queued", model: MODEL, promptVersion: PROMPT_VERSION, inputHash, requestedByUserId: identity.subject, requestedAt: now });
    await ctx.scheduler.runAfter(0, internal.aiAssessmentActions.run, { assessmentId: id });
    return id;
  },
});

export const complete = internalMutation({
  args: { assessmentId: v.id("ai_assessments"), score: v.number(), rationale: v.string(), criteria: v.array(v.object({ criterionId: v.string(), score: v.optional(v.number()), rationale: v.string() })) },
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment) return;
    await ctx.db.patch(args.assessmentId, { status: "completed", score: args.score, rationale: args.rationale.slice(0, 1_200), criteria: args.criteria.map((criterion) => ({ ...criterion, rationale: criterion.rationale.slice(0, 800) })), completedAt: Date.now(), error: undefined });
  },
});

export const fail = internalMutation({
  args: { assessmentId: v.id("ai_assessments"), error: v.string() },
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (assessment) await ctx.db.patch(args.assessmentId, { status: "failed", error: args.error.slice(0, 500), completedAt: Date.now() });
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
