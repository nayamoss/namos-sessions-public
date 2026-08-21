import { v } from "convex/values";
import { mutation, query, requireIdentity, assertEventAccess, assertEventOrganizerAccess, isEventOrganizer } from "./functions";
import { evaluationCriterion, evaluationCriterionScore } from "./schema";
import type { UserIdentity } from "convex/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { computeReviewerProgress, type ReviewerProgressRow } from "../src/lib/reviewer-progress";
import type { Infer } from "convex/values";
import { eventOrganizers, notifyEvent } from "./notifications";

type Criterion = Infer<typeof evaluationCriterion>;
type CriterionScore = Infer<typeof evaluationCriterionScore>;

// Issue #56. Criteria are organizer-authored configuration, so they are validated on the way in
// rather than defensively re-checked on every read. Rejecting loudly is deliberate: silently
// coercing a bad weight would quietly change what every reviewer's total means.
function validateCriteria(criteria: Criterion[]): Criterion[] {
  if (criteria.length > 20) throw new Error("An evaluation plan supports at most 20 scoring criteria.");
  const seen = new Set<string>();
  return criteria.map((criterion) => {
    const label = criterion.label.trim();
    if (!label) throw new Error("Every scoring criterion needs a label.");
    if (label.length > 120) throw new Error("Criterion labels must be 120 characters or fewer.");
    if (!criterion.id.trim()) throw new Error("Every scoring criterion needs an id.");
    if (seen.has(criterion.id)) throw new Error(`Scoring criteria must have unique ids — "${label}" repeats one.`);
    seen.add(criterion.id);
    if (criterion.type === "text") return { id: criterion.id, label, type: "text" as const, required: criterion.required };
    if (typeof criterion.max !== "number" || !Number.isInteger(criterion.max) || criterion.max < 1 || criterion.max > 100) throw new Error(`"${label}" needs a whole-number maximum between 1 and 100.`);
    const weight = criterion.weight ?? 1;
    if (!(weight > 0) || weight > 100) throw new Error(`"${label}" needs a weight greater than 0 and no more than 100.`);
    return { id: criterion.id, label, type: "number" as const, max: criterion.max, weight, required: criterion.required };
  });
}

// Values for criteria the plan no longer has are dropped on write; FR-009 handles the read side
// by ignoring any that predate a deletion. Returns the sanitized array to persist.
function validateCriteriaScores(criteria: Criterion[], scores: CriterionScore[]): CriterionScore[] {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const kept: CriterionScore[] = [];
  for (const score of scores) {
    const criterion = byId.get(score.criterionId);
    if (!criterion) continue;
    if (criterion.type === "number") {
      if (score.value === undefined) continue;
      if (!Number.isInteger(score.value) || score.value < 0 || score.value > (criterion.max ?? 0)) throw new Error(`"${criterion.label}" must be a whole number between 0 and ${criterion.max}.`);
      kept.push({ criterionId: criterion.id, value: score.value });
      continue;
    }
    const text = score.text?.trim();
    if (!text) continue;
    if (text.length > 5_000) throw new Error(`"${criterion.label}" must be 5,000 characters or fewer.`);
    kept.push({ criterionId: criterion.id, text });
  }
  const answered = new Set(kept.map((score) => score.criterionId));
  const missing = criteria.find((criterion) => criterion.required && !answered.has(criterion.id));
  if (missing) throw new Error(`"${missing.label}" is required.`);
  return kept;
}

// The identifiers an assignment's reviewerUserId may legitimately match for this caller, in
// precedence order: the Clerk subject first, then the provider-verified email.
//
// reviewerUserId is assigned by email (an organizer knows a reviewer's email before that
// reviewer has ever signed in — their Clerk subject isn't knowable ahead of time). Email must
// be provider-verified (emailVerified === true, from the "convex" JWT template's
// email_verified claim) — an unverified claim is user-controlled and would let anyone type a
// target reviewer's address and hijack their queue.
//
// This is the single identity-resolution path shared by listAssignments, save, and myQueue.
function reviewerIdentifiers(identity: UserIdentity): { subject: string; verifiedEmail?: string } {
  const verifiedEmail = identity.email && identity.emailVerified === true ? identity.email.toLowerCase() : undefined;
  return { subject: identity.subject, verifiedEmail };
}

// A reviewer is "themselves" if the assignment matches either of their resolved identifiers.
function isSelfReviewer(identity: UserIdentity, reviewerUserId: string): boolean {
  const { subject, verifiedEmail } = reviewerIdentifiers(identity);
  if (reviewerUserId === subject) return true;
  return verifiedEmail !== undefined && reviewerUserId.toLowerCase() === verifiedEmail;
}

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const evaluations = await ctx.db.query("evaluations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    // Each row carries the criteria it was scored against (issue #56), so the organizer's
    // Abstracts grid can compute the weighted total with the same pure function the reviewer
    // sees — rather than a second copy of the formula living on the server.
    const planCache = new Map<string, { criteria?: Criterion[]; scoringScaleMax: number } | null>();
    const planFor = async (assignmentId: Id<"evaluation_assignments">) => {
      const assignment = await ctx.db.get(assignmentId);
      if (!assignment) return null;
      const key = assignment.evaluationPlanId;
      if (!planCache.has(key)) {
        const plan = await ctx.db.get(key);
        planCache.set(key, plan ? { criteria: plan.criteria, scoringScaleMax: plan.scoringScaleMax } : null);
      }
      return planCache.get(key) ?? null;
    };
    return Promise.all(evaluations.map(async (evaluation) => {
      if (!evaluation.assignmentId) return evaluation;
      const plan = await planFor(evaluation.assignmentId);
      return plan ? { ...evaluation, criteria: plan.criteria, scoringScaleMax: plan.scoringScaleMax } : evaluation;
    }));
  },
});

export const listPlans = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return ctx.db.query("evaluation_plans").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
  },
});

export const savePlan = mutation({
  args: { id: v.optional(v.id("evaluation_plans")), eventId: v.id("events"), name: v.string(), rounds: v.number(), scoringScaleMax: v.union(v.literal(5), v.literal(10)), aiAssistEnabled: v.boolean(), anonymized: v.optional(v.boolean()), criteria: v.optional(v.array(evaluationCriterion)) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const name = args.name.trim();
    if (!name) throw new Error("An evaluation plan needs a name.");
    if (name.length > 160) throw new Error("Evaluation plan names must be 160 characters or fewer.");
    if (!Number.isInteger(args.rounds) || args.rounds < 1 || args.rounds > 5) throw new Error("Evaluation plans need between one and five rounds.");
    // Undefined means "this caller isn't editing criteria" and leaves whatever is stored alone;
    // an empty array is an explicit "remove them all" and returns the plan to single-score.
    const criteria = args.criteria === undefined ? undefined : validateCriteria(args.criteria);
    const now = Date.now();
    // Only ever written when the caller actually sent it, so a plan a chair never touched keeps
    // the field absent rather than gaining an explicit `false`.
    const anonymized = args.anonymized === undefined ? {} : { anonymized: args.anonymized };
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.eventId !== args.eventId) throw new Error("Evaluation plan not found for this event.");
      await ctx.db.patch(args.id, { name, rounds: args.rounds, scoringScaleMax: args.scoringScaleMax, aiAssistEnabled: args.aiAssistEnabled, ...anonymized, updatedAt: now, ...(criteria === undefined ? {} : { criteria }) });
      return args.id;
    }
    return ctx.db.insert("evaluation_plans", { eventId: args.eventId, name, rounds: args.rounds, scoringScaleMax: args.scoringScaleMax, aiAssistEnabled: args.aiAssistEnabled, ...anonymized, criteria, createdAt: now, updatedAt: now });
  },
});

export const listAssignments = query({
  args: { eventId: v.id("events"), reviewerUserId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    // "My queue" (Program > Evaluation > queue) must never be able to page through another
    // reviewer's assignments by passing an arbitrary reviewerUserId — the caller's own
    // identity.subject is the only reviewer scope the client is allowed to ask for. Omitting
    // reviewerUserId keeps the existing admin assignment-table view (all reviewers, this event).
    if (args.reviewerUserId !== undefined && !isSelfReviewer(identity, args.reviewerUserId)) {
      throw new Error("Forbidden: you can only view your own review assignments.");
    }
    if (args.reviewerUserId === undefined && !(await isEventOrganizer(ctx, args.eventId, identity))) {
      throw new Error("Forbidden: organizer access required.");
    }
    const assignments = args.reviewerUserId
      ? await ctx.db.query("evaluation_assignments").withIndex("by_reviewer", (q) => q.eq("reviewerUserId", args.reviewerUserId!)).collect()
      : await ctx.db.query("evaluation_assignments").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return assignments.filter((assignment) => assignment.eventId === args.eventId);
  },
});

// One row of a reviewer's own queue: everything the reviewer surface renders, joined
// server-side. Deliberately narrow — no other reviewer's name, no submission or speaker the
// caller wasn't assigned, no other event's evaluation plans.
export type ReviewerQueueRow = {
  assignmentId: Id<"evaluation_assignments">;
  eventId: Id<"events">;
  submissionId: Id<"submissions">;
  evaluationPlanId: Id<"evaluation_plans">;
  submissionTitle: string;
  submissionAnswers: { abstract?: string; track?: string };
  // Absent — the key itself, not an undefined value — on a blinded plan. See projectForReviewer.
  speakerNames?: string[];
  round: number;
  planName: string;
  scoringScaleMax: number;
  // Echoed from the plan so the reviewer surface can explain the missing identity.
  anonymized: boolean;
  // The plan's scorecard criteria, so a reviewer who is not an organizer can render the
  // scorecard without calling the organizer-gated listPlans. Absent means single-score.
  criteria?: Criterion[];
  review?: { id: Id<"evaluations">; score?: number; comments?: string; criteriaScores?: CriterionScore[] };
};

function answerText(answers: unknown, key: "abstract" | "track"): string | undefined {
  if (!answers || typeof answers !== "object") return undefined;
  const value = (answers as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

// Best-effort, NOT a boundary: a CFP answer under a custom key ("q_employer") or an abstract that
// names its own author survives this untouched. Documented as a limitation in
// docs/features/blind-review/requirements.md rather than sold as a guarantee.
export const IDENTIFYING_ANSWER_KEYS = [
  "name", "firstname", "lastname", "fullname", "speakername",
  "email", "emailaddress", "company", "organization", "affiliation",
  "linkedin", "twitter", "x", "website", "headshot", "bio",
];

// Drops every identifying key, case-insensitively. Returns a new object; never mutates the input.
export function stripIdentifyingAnswers<T extends Record<string, unknown>>(answers: T): Partial<T> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (IDENTIFYING_ANSWER_KEYS.includes(key.toLowerCase())) continue;
    kept[key] = value;
  }
  return kept as Partial<T>;
}

// The one and only stripping site in this codebase. Called before a row is returned, never after.
// Destructure-and-omit rather than `speakerNames: undefined`, because an explicit undefined key
// still serializes as present in some transports and invites a "just read it from the payload"
// regression later.
export function projectForReviewer(row: ReviewerQueueRow, anonymized: boolean): ReviewerQueueRow {
  if (!anonymized) return row;
  const { speakerNames: _hidden, ...rest } = row;
  return { ...rest, anonymized: true, submissionAnswers: stripIdentifyingAnswers(row.submissionAnswers) };
}

// Joins a reviewer's own assignments against submissions, plans, speakers, and their own
// reviews using ctx.db.get by id. A query may read any document internally; the authorization
// boundary is what it *returns* to this caller. Never calls assertOrganizer — being a reviewer
// does not require an organizers row.
export async function reviewerQueueFor(ctx: QueryCtx, identity: UserIdentity): Promise<ReviewerQueueRow[]> {
  const { subject, verifiedEmail } = reviewerIdentifiers(identity);
  const byReviewer = (reviewerUserId: string) => ctx.db.query("evaluation_assignments").withIndex("by_reviewer", (q) => q.eq("reviewerUserId", reviewerUserId)).collect();
  let assignments = await byReviewer(subject);
  if (!assignments.length && verifiedEmail) assignments = await byReviewer(verifiedEmail);

  const rows: ReviewerQueueRow[] = [];
  for (const assignment of assignments) {
    // Defence in depth: the index lookup is already scoped to this caller's own identifier.
    if (!isSelfReviewer(identity, assignment.reviewerUserId)) continue;
    const submission = await ctx.db.get(assignment.submissionId);
    if (!submission || submission.eventId !== assignment.eventId) continue;
    const plan = await ctx.db.get(assignment.evaluationPlanId);
    // Fail closed: an assignment whose plan cannot be read is treated as blinded. Over-hiding is
    // a cosmetic bug; a leaked name cannot be un-leaked.
    const anonymized = plan ? plan.anonymized === true : true;
    // Do not fetch what must not be sent — on a blinded plan the speaker record is never read.
    const speaker = !anonymized && submission.speakerId ? await ctx.db.get(submission.speakerId) : null;
    const review = await ctx.db.query("evaluations").withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id)).unique();
    rows.push(projectForReviewer({
      assignmentId: assignment._id,
      eventId: assignment.eventId,
      submissionId: assignment.submissionId,
      evaluationPlanId: assignment.evaluationPlanId,
      submissionTitle: submission.title || "Untitled submission",
      submissionAnswers: { abstract: answerText(submission.answers, "abstract"), track: answerText(submission.answers, "track") },
      speakerNames: speaker ? [`${speaker.firstName ?? ""} ${speaker.lastName ?? ""}`.trim()].filter(Boolean) : [],
      round: assignment.round,
      planName: plan?.name ?? "Evaluation plan",
      scoringScaleMax: plan?.scoringScaleMax ?? 5,
      anonymized,
      ...(plan?.criteria ? { criteria: plan.criteria } : {}),
      review: review ? { id: review._id, score: review.score, comments: review.comments, ...(review.criteriaScores ? { criteriaScores: review.criteriaScores } : {}) } : undefined,
    }, anonymized));
  }
  return rows.sort((left, right) => left.round - right.round || left.submissionTitle.localeCompare(right.submissionTitle));
}

// A reviewer who is not an organizer loads their whole surface from this one query. It takes no
// eventId: events:list is organizer-gated, so the event is resolved from the caller's own
// assignments instead (no assignments means an empty queue, not an error).
export const myQueue = query({
  args: {},
  handler: async (ctx) => reviewerQueueFor(ctx, await requireIdentity(ctx)),
});

// The one place assignment rows are written, shared by the manual (`assign`) and bulk
// (`assignByFilter`) entry points so both carry identical idempotency semantics: one row per
// (plan, submission, reviewer, round), looked up on by_plan_submission_reviewer_round. An
// already-existing pair is returned in assignmentIds and counted as skipped, never duplicated.
// Callers own their own validation; this helper writes what it is handed.
async function createAssignments(
  ctx: MutationCtx,
  input: { eventId: Id<"events">; evaluationPlanId: Id<"evaluation_plans">; submissionIds: Id<"submissions">[]; reviewerUserIds: string[]; round: number },
): Promise<{ assignmentIds: string[]; created: number; skipped: number }> {
  const now = Date.now();
  const assignmentIds: string[] = [];
  let created = 0;
  let skipped = 0;
  for (const submissionId of input.submissionIds) for (const reviewerUserId of input.reviewerUserIds) {
    const existing = await ctx.db.query("evaluation_assignments")
      .withIndex("by_plan_submission_reviewer_round", (q) => q.eq("evaluationPlanId", input.evaluationPlanId).eq("submissionId", submissionId).eq("reviewerUserId", reviewerUserId).eq("round", input.round))
      .unique();
    if (existing) { assignmentIds.push(existing._id); skipped += 1; continue; }
    const assignmentId = await ctx.db.insert("evaluation_assignments", { eventId: input.eventId, evaluationPlanId: input.evaluationPlanId, submissionId, reviewerUserId, round: input.round, createdAt: now });
    const submission = await ctx.db.get(submissionId);
    const event = await ctx.db.get(input.eventId);
    await notifyEvent(ctx, {
      eventId: input.eventId,
      kind: "reviewer_assigned",
      title: "Review assigned",
      body: submission?.title ?? "A submission was assigned for review.",
      linkPath: event ? `/events/${event.slug}/program/evaluation` : undefined,
      relatedId: assignmentId,
      recipientUserIds: [reviewerUserId],
    });
    assignmentIds.push(assignmentId);
    created += 1;
  }
  return { assignmentIds, created, skipped };
}

export const assign = mutation({
  args: { eventId: v.id("events"), evaluationPlanId: v.id("evaluation_plans"), submissionIds: v.array(v.id("submissions")), reviewerUserIds: v.array(v.string()), round: v.number() },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const plan = await ctx.db.get(args.evaluationPlanId);
    if (!plan || plan.eventId !== args.eventId) throw new Error("Evaluation plan not found for this event.");
    if (!Number.isInteger(args.round) || args.round < 1 || args.round > plan.rounds) throw new Error("Assignment round must exist on this evaluation plan.");
    const submissionIds = [...new Set(args.submissionIds)];
    // Lowercased so a reviewer's email always matches regardless of how it was typed — this is
    // the same identifier isSelfReviewer() compares a signed-in reviewer's identity.email against.
    const reviewerUserIds = [...new Set(args.reviewerUserIds.map((reviewer) => reviewer.trim().toLowerCase()).filter(Boolean))];
    if (!submissionIds.length) throw new Error("Select at least one submission to assign.");
    if (!reviewerUserIds.length) throw new Error("Select at least one reviewer to assign.");
    if (reviewerUserIds.some((reviewer) => reviewer.length > 120)) throw new Error("Reviewer identifiers must be 120 characters or fewer.");
    const submissions = await Promise.all(submissionIds.map((id) => ctx.db.get(id)));
    if (submissions.some((submission) => !submission || submission.eventId !== args.eventId)) throw new Error("Every assigned submission must belong to this event.");
    return (await createAssignments(ctx, { eventId: args.eventId, evaluationPlanId: args.evaluationPlanId, submissionIds, reviewerUserIds, round: args.round })).assignmentIds;
  },
});

// One tag or one track, never both and never neither — a v.union makes the invalid combinations
// unrepresentable at the validator boundary instead of relying on a hand-written check.
const assignmentFilter = v.union(
  v.object({ kind: v.literal("tag"), tagId: v.id("tags") }),
  v.object({ kind: v.literal("track"), trackId: v.id("tracks") }),
);

// A bulk run that would write more than this many rows is refused before anything is written.
// There is no bulk-unassign anywhere in this product, so an over-broad filter is not undoable.
const MAX_BULK_ASSIGNMENTS = 500;

// Bulk assignment by tag or track. The filter resolves to submissions *server-side* — the client
// never sends a submission id list on this path, so a stale page cannot decide who gets reviewed.
// Idempotent through the shared createAssignments helper: re-running the same filter creates
// nothing and reports the overlap as skipped.
export const assignByFilter = mutation({
  args: { eventId: v.id("events"), evaluationPlanId: v.id("evaluation_plans"), filter: assignmentFilter, reviewerUserIds: v.array(v.string()), round: v.number() },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const plan = await ctx.db.get(args.evaluationPlanId);
    if (!plan || plan.eventId !== args.eventId) throw new Error("Evaluation plan not found for this event.");
    if (!Number.isInteger(args.round) || args.round < 1 || args.round > plan.rounds) throw new Error("Assignment round must exist on this evaluation plan.");
    // Identical normalization to `assign`: lowercased so a reviewer's email always matches the
    // identifier isSelfReviewer() compares their verified Clerk email against.
    const reviewerUserIds = [...new Set(args.reviewerUserIds.map((reviewer) => reviewer.trim().toLowerCase()).filter(Boolean))];
    if (!reviewerUserIds.length) throw new Error("Select at least one reviewer to assign.");
    if (reviewerUserIds.some((reviewer) => reviewer.length > 120)) throw new Error("Reviewer identifiers must be 120 characters or fewer.");

    if (args.filter.kind === "tag") {
      const tag = await ctx.db.get(args.filter.tagId);
      if (!tag || tag.eventId !== args.eventId) throw new Error("Tag not found for this event.");
    } else {
      const track = await ctx.db.get(args.filter.trackId);
      if (!track || track.eventId !== args.eventId) throw new Error("Track not found for this event.");
    }

    const filter = args.filter;
    const candidates = await ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    // Drafts were never submitted and withdrawn proposals are no longer in the running, so
    // routing a reviewer to either is work created for nothing. The UI preview applies the
    // identical predicate, which is why the previewed and actual counts agree.
    const eligible = candidates.filter((submission) => submission.status !== "draft" && submission.status !== "withdrawn");
    const matched = filter.kind === "tag"
      ? eligible.filter((submission) => (submission.tagIds ?? []).some((tagId) => tagId === filter.tagId))
      : eligible.filter((submission) => submission.trackId === filter.trackId);

    // Zero matches is information, not a failure — throwing here would render an ordinary
    // "nothing carries this tag yet" as a red error line.
    if (!matched.length) return { matchedSubmissionCount: 0, reviewerCount: reviewerUserIds.length, created: 0, skipped: 0, assignmentIds: [] as string[] };

    const total = matched.length * reviewerUserIds.length;
    if (total > MAX_BULK_ASSIGNMENTS) throw new Error(`This would create ${total} review assignments. Narrow the filter or assign fewer reviewers at a time (limit ${MAX_BULK_ASSIGNMENTS}).`);

    const result = await createAssignments(ctx, { eventId: args.eventId, evaluationPlanId: args.evaluationPlanId, submissionIds: matched.map((submission) => submission._id), reviewerUserIds, round: args.round });
    return { matchedSubmissionCount: matched.length, reviewerCount: reviewerUserIds.length, created: result.created, skipped: result.skipped, assignmentIds: result.assignmentIds };
  },
});

// --- Reviewer progress (issue #59) --------------------------------------------------------
// Derived, never stored: a per-reviewer completion projection for one plan, computed from the
// same two tables the aggregate stat cards already read. Appended deliberately — nothing above
// this line changes.
export const reviewerProgress = query({
  args: { eventId: v.id("events"), evaluationPlanId: v.id("evaluation_plans") },
  handler: async (ctx, args): Promise<ReviewerProgressRow[]> => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const plan = await ctx.db.get(args.evaluationPlanId);
    // A stale selectedPlanId in the browser must render an empty panel, not blank the page.
    if (!plan || plan.eventId !== args.eventId) return [];
    const assignments = await ctx.db.query("evaluation_assignments").withIndex("by_plan", (q) => q.eq("evaluationPlanId", args.evaluationPlanId)).collect();
    const reviews = await ctx.db.query("evaluations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    const speakers = await ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return computeReviewerProgress(
      assignments.map((entry) => ({ id: entry._id as string, reviewerUserId: entry.reviewerUserId })),
      reviews.map((review) => ({ assignmentId: review.assignmentId as string | undefined, score: review.score })),
      speakers.map((speaker) => speaker.email).filter((email): email is string => typeof email === "string"),
    );
  },
});

export const save = mutation({
  args: { id: v.optional(v.id("evaluations")), assignmentId: v.optional(v.id("evaluation_assignments")), eventId: v.id("events"), submissionId: v.id("submissions"), reviewerName: v.string(), score: v.optional(v.number()), comments: v.optional(v.string()), criteriaScores: v.optional(v.array(evaluationCriterionScore)) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.eventId !== args.eventId) throw new Error("Submission not found for this event.");
    const reviewerName = args.reviewerName.trim();
    if (!reviewerName) throw new Error("A reviewer name is required.");
    if (reviewerName.length > 120) throw new Error("Reviewer names must be 120 characters or fewer.");
    let scoringScaleMax = 5;
    let planCriteria: Criterion[] = [];
    if (args.assignmentId) {
      const assignment = await ctx.db.get(args.assignmentId);
      if (!assignment || assignment.eventId !== args.eventId || assignment.submissionId !== args.submissionId) throw new Error("Evaluation assignment not found for this event and submission.");
      // Authorization is anchored to the caller's Clerk identity, never the client-supplied
      // reviewerName — a reviewer may only write to an assignment that is theirs. Being a
      // reviewer does not require an organizers row.
      if (!isSelfReviewer(identity, assignment.reviewerUserId)) throw new Error("Only the assigned reviewer can submit this score.");
      const plan = await ctx.db.get(assignment.evaluationPlanId);
      if (!plan || plan.eventId !== args.eventId) throw new Error("Evaluation plan not found for this assignment.");
      scoringScaleMax = plan.scoringScaleMax;
      planCriteria = plan.criteria ?? [];
    } else if (!(await isEventOrganizer(ctx, args.eventId, identity))) {
      // No assignment link means this is an ad-hoc, unscoped write — only an organizer may do that.
      throw new Error("Forbidden: organizer access required.");
    }
    // Two mutually exclusive shapes share this mutation (issue #56). A plan with criteria takes
    // the scorecard path and never writes `score`, which stays as whatever legacy value the row
    // already held. A plan with no criteria behaves exactly as it did before scorecards existed.
    const usesScorecard = planCriteria.length > 0;
    let criteriaScores: CriterionScore[] | undefined;
    if (usesScorecard) {
      criteriaScores = validateCriteriaScores(planCriteria, args.criteriaScores ?? []);
    } else {
      if (args.score === undefined) throw new Error("A review score is required.");
      if (!Number.isInteger(args.score) || args.score < 1 || args.score > scoringScaleMax) throw new Error(`Review scores must be whole numbers between 1 and ${scoringScaleMax}.`);
    }
    const scoreFields = usesScorecard ? { criteriaScores } : { score: args.score };
    const comments = args.comments?.trim() || undefined;
    if (comments && comments.length > 5_000) throw new Error("Review comments must be 5,000 characters or fewer.");
    const now = Date.now();
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.eventId !== args.eventId || existing.submissionId !== args.submissionId) throw new Error("Review not found for this event and submission.");
      if (existing.assignmentId !== args.assignmentId) throw new Error("Review assignment cannot be changed.");
      await ctx.db.patch(args.id, { reviewerName, ...scoreFields, comments, updatedAt: now });
      const event = await ctx.db.get(args.eventId);
      await notifyEvent(ctx, { eventId: args.eventId, kind: "evaluation_completed", title: "Evaluation completed", body: submission.title, linkPath: event ? `/events/${event.slug}/program/abstracts?selected=${args.submissionId}` : undefined, relatedId: args.id, recipientUserIds: await eventOrganizers(ctx, args.eventId) });
      return args.id;
    }

    // The queue may retry after a network failure. One reviewer should have exactly one
    // current review per submission, so retries update the existing record instead of
    // inflating ratings in the Abstracts grid.
    const existing = args.assignmentId
      ? await ctx.db.query("evaluations").withIndex("by_assignment", query => query.eq("assignmentId", args.assignmentId)).unique()
      : await ctx.db.query("evaluations").withIndex("by_submission_reviewer", query => query.eq("submissionId", args.submissionId).eq("reviewerName", reviewerName)).unique();
    if (existing) {
      if (existing.eventId !== args.eventId) throw new Error("Review not found for this event.");
      await ctx.db.patch(existing._id, { ...scoreFields, comments, updatedAt: now });
      const event = await ctx.db.get(args.eventId);
      await notifyEvent(ctx, { eventId: args.eventId, kind: "evaluation_completed", title: "Evaluation completed", body: submission.title, linkPath: event ? `/events/${event.slug}/program/abstracts?selected=${args.submissionId}` : undefined, relatedId: existing._id, recipientUserIds: await eventOrganizers(ctx, args.eventId) });
      return existing._id;
    }
    const evaluationId = await ctx.db.insert("evaluations", { eventId: args.eventId, submissionId: args.submissionId, assignmentId: args.assignmentId, reviewerName, ...scoreFields, comments, createdAt: now, updatedAt: now });
    const event = await ctx.db.get(args.eventId);
    await notifyEvent(ctx, { eventId: args.eventId, kind: "evaluation_completed", title: "Evaluation completed", body: submission.title, linkPath: event ? `/events/${event.slug}/program/abstracts?selected=${args.submissionId}` : undefined, relatedId: evaluationId, recipientUserIds: await eventOrganizers(ctx, args.eventId) });
    return evaluationId;
  },
});
