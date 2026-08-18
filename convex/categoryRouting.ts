import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export type RoutingStatus = "pending" | "accept_queue" | "accepted" | "maybe";

export type SubmissionRoutingRule = {
  id: string;
  fieldId: string;
  equals: string;
  assignTagIds?: Id<"tags">[];
  assignTrackId?: Id<"tracks">;
  assignSponsorId?: Id<"sponsors">;
  setStatus?: RoutingStatus;
  reviewerUserIds?: string[];
};

export type RoutingResult = {
  assignTagIds?: Id<"tags">[];
  assignTrackId?: Id<"tracks">;
  assignSponsorId?: Id<"sponsors">;
  setStatus?: RoutingStatus;
  reviewerUserIds?: string[];
};

type FormSection = { fieldIds: string[] };

function unique<Value>(values: Value[]) {
  return [...new Set(values)];
}

export function normalizeRoutingRules(rules: SubmissionRoutingRule[] | undefined): SubmissionRoutingRule[] {
  return (rules ?? []).map((rule) => ({
    id: rule.id.trim(),
    fieldId: rule.fieldId,
    equals: rule.equals,
    ...(rule.assignTagIds?.length ? { assignTagIds: unique(rule.assignTagIds) } : {}),
    ...(rule.assignTrackId ? { assignTrackId: rule.assignTrackId } : {}),
    ...(rule.assignSponsorId ? { assignSponsorId: rule.assignSponsorId } : {}),
    ...(rule.setStatus ? { setStatus: rule.setStatus } : {}),
    ...(rule.reviewerUserIds?.length
      ? { reviewerUserIds: unique(rule.reviewerUserIds.map((reviewer) => reviewer.trim()).filter(Boolean)) }
      : {}),
  }));
}

export function removeSponsorRoutingTarget(
  rules: SubmissionRoutingRule[] | undefined,
  sponsorId: Id<"sponsors">,
): SubmissionRoutingRule[] {
  return (rules ?? []).map((rule) => {
    if (rule.assignSponsorId !== sponsorId) return rule;
    const { assignSponsorId: _removedSponsorId, ...remainingRule } = rule;
    return remainingRule;
  });
}

function matchesRoutingValue(value: string | undefined, expected: string) {
  if (value === expected) return true;
  if (!value) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed.includes(expected);
  } catch {
    // Current public multiselect values are scalar. Comma-separated values keep this helper
    // compatible with a future multi-value renderer without exposing routing config publicly.
  }
  return value.split(",").map((item) => item.trim()).includes(expected);
}

export function evaluateRoutingRules(rules: SubmissionRoutingRule[], answersByFieldId: Record<string, string>): RoutingResult {
  const result: RoutingResult = {};
  for (const rule of rules) {
    if (!matchesRoutingValue(answersByFieldId[rule.fieldId], rule.equals)) continue;
    if (rule.assignTagIds?.length) result.assignTagIds = unique([...(result.assignTagIds ?? []), ...rule.assignTagIds]);
    if (rule.assignTrackId) result.assignTrackId = rule.assignTrackId;
    if (rule.assignSponsorId) result.assignSponsorId = rule.assignSponsorId;
    if (rule.setStatus) result.setStatus = rule.setStatus;
    if (rule.reviewerUserIds?.length) result.reviewerUserIds = unique([...(result.reviewerUserIds ?? []), ...rule.reviewerUserIds]);
  }
  return result;
}

export async function validateRoutingRules(
  ctx: MutationCtx,
  eventId: Id<"events">,
  pages: FormSection[],
  inputRules: SubmissionRoutingRule[] | undefined,
) {
  const rules = normalizeRoutingRules(inputRules);
  if (!rules.length) return rules;

  const ruleIds = rules.map((rule) => rule.id);
  if (ruleIds.some((id) => !id) || unique(ruleIds).length !== ruleIds.length) {
    throw new Error("Routing rules need unique ids.");
  }

  const formFieldIds = new Set(pages.flatMap((page) => page.fieldIds));
  const fieldsById = new Map<string, Doc<"field_definitions">>(
    (await ctx.db.query("field_definitions").collect()).map((field) => [String(field._id), field]),
  );
  const tagIds = unique(rules.flatMap((rule) => rule.assignTagIds ?? []));
  const trackIds = unique(rules.flatMap((rule) => rule.assignTrackId ? [rule.assignTrackId] : []));
  const sponsorIds = unique(rules.flatMap((rule) => rule.assignSponsorId ? [rule.assignSponsorId] : []));
  const reviewerUserIds = unique(rules.flatMap((rule) => rule.reviewerUserIds ?? []));
  const [tags, tracks, sponsors, assignments, plans] = await Promise.all([
    Promise.all(tagIds.map((id) => ctx.db.get(id))),
    Promise.all(trackIds.map((id) => ctx.db.get(id))),
    Promise.all(sponsorIds.map((id) => ctx.db.get(id))),
    reviewerUserIds.length
      ? ctx.db.query("evaluation_assignments").withIndex("by_event", (query) => query.eq("eventId", eventId)).collect()
      : Promise.resolve([]),
    reviewerUserIds.length
      ? ctx.db.query("evaluation_plans").withIndex("by_event", (query) => query.eq("eventId", eventId)).collect()
      : Promise.resolve([]),
  ]);

  if (tags.some((tag) => !tag || tag.eventId !== eventId)) throw new Error("Every routing tag must belong to this event.");
  if (tracks.some((track) => !track || track.eventId !== eventId)) throw new Error("Every routing track must belong to this event.");
  if (sponsors.some((sponsor) => !sponsor || sponsor.eventId !== eventId)) throw new Error("Every routing sponsor must belong to this event.");
  if (reviewerUserIds.some((reviewer) => reviewer.length > 120)) throw new Error("Reviewer names must be 120 characters or fewer.");
  const eventReviewers = new Set(assignments.map((assignment) => assignment.reviewerUserId));
  if (reviewerUserIds.some((reviewer) => !eventReviewers.has(reviewer))) throw new Error("Every routing reviewer must already belong to this event's review team.");
  if (reviewerUserIds.length && !plans.length) throw new Error("Create an evaluation plan before routing submissions to reviewers.");

  for (const rule of rules) {
    const field = fieldsById.get(rule.fieldId);
    if (!formFieldIds.has(rule.fieldId) || !field || (field.type !== "dropdown" && field.type !== "multiselect")) {
      throw new Error("Routing rules can only match dropdown or multiselect fields on this form.");
    }
    if (!field.options?.includes(rule.equals)) throw new Error(`Routing value "${rule.equals}" is not configured for ${field.label}.`);
    if (!rule.assignTagIds?.length && !rule.assignTrackId && !rule.assignSponsorId && !rule.setStatus && !rule.reviewerUserIds?.length) {
      throw new Error("Every routing rule needs at least one target.");
    }
  }
  return rules;
}

export async function resolveSubmissionRouting(
  ctx: MutationCtx,
  eventId: Id<"events">,
  pages: FormSection[],
  inputRules: SubmissionRoutingRule[] | undefined,
  fieldKeyById: Map<string, string>,
  submittedAnswers: Record<string, string>,
) {
  const rules = await validateRoutingRules(ctx, eventId, pages, inputRules);
  const answersByFieldId = Object.fromEntries(
    [...fieldKeyById.entries()].map(([fieldId, fieldKey]) => [fieldId, submittedAnswers[fieldKey] ?? ""]),
  );
  return evaluateRoutingRules(rules, answersByFieldId);
}

export async function createRoutingAssignments(
  ctx: MutationCtx,
  eventId: Id<"events">,
  submissionId: Id<"submissions">,
  reviewerUserIds: string[] | undefined,
  now: number,
) {
  if (!reviewerUserIds?.length) return;
  const plans = await ctx.db.query("evaluation_plans").withIndex("by_event", (query) => query.eq("eventId", eventId)).collect();
  const plan = [...plans].sort((left, right) => left.createdAt - right.createdAt)[0];
  if (!plan) throw new Error("Create an evaluation plan before routing submissions to reviewers.");

  for (const reviewerUserId of unique(reviewerUserIds)) {
    const existing = await ctx.db.query("evaluation_assignments")
      .withIndex("by_plan_submission_reviewer_round", (query) => query
        .eq("evaluationPlanId", plan._id)
        .eq("submissionId", submissionId)
        .eq("reviewerUserId", reviewerUserId)
        .eq("round", 1))
      .unique();
    if (!existing) await ctx.db.insert("evaluation_assignments", {
      eventId,
      evaluationPlanId: plan._id,
      submissionId,
      reviewerUserId,
      round: 1,
      createdAt: now,
    });
  }
}
