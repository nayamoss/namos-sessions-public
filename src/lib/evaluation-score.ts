import type { EvaluationCriterion, EvaluationCriterionScore } from "@/data/types";

export function averageScore(scores: Array<number | undefined>) { const complete = scores.filter((score): score is number => typeof score === "number"); return complete.length ? complete.reduce((total, score) => total + score, 0) / complete.length : undefined; }

/**
 * The weighted scorecard total, expressed back on the plan's own 1–N scale (issue #56).
 *
 *   sum(value × weight) / sum(weight × max) × scoringScaleMax
 *
 * Only `number` criteria participate — a `text` criterion is a free response and carries no
 * weight. Values whose `criterionId` is not on the plan are ignored, which is what makes
 * deleting a criterion non-destructive (FR-009): the recorded value survives in the database
 * and simply stops counting. Returns `undefined` rather than dividing by zero when nothing
 * scoreable was answered — the caller renders that as "—".
 */
export function weightedTotal(criteria: EvaluationCriterion[] | undefined, scores: EvaluationCriterionScore[] | undefined, scoringScaleMax: number): number | undefined {
  if (!criteria?.length) return undefined;
  const valueByCriterionId = new Map((scores ?? []).map(score => [score.criterionId, score.value]));
  let weightedSum = 0;
  let weightedMax = 0;
  for (const criterion of criteria) {
    if (criterion.type !== "number") continue;
    const value = valueByCriterionId.get(criterion.id);
    if (typeof value !== "number") continue;
    const weight = typeof criterion.weight === "number" ? criterion.weight : 1;
    const max = typeof criterion.max === "number" ? criterion.max : scoringScaleMax;
    if (weight <= 0 || max <= 0) continue;
    weightedSum += value * weight;
    weightedMax += weight * max;
  }
  if (weightedMax <= 0) return undefined;
  return (weightedSum / weightedMax) * scoringScaleMax;
}

/**
 * The label collisions, blanks, and out-of-range numbers that must block saving a plan's
 * criteria, keyed by criterion id. The editor renders these inline under the offending row and
 * the page disables its save button from the same map — one rule, so the two cannot drift. The
 * server re-validates all of it; this exists to say why before a round trip, not instead of one.
 */
export function criteriaErrors(criteria: EvaluationCriterion[]): Map<string, string> {
  const errors = new Map<string, string>();
  const seenLabels = new Map<string, string>();
  for (const criterion of criteria) {
    const label = criterion.label.trim().toLowerCase();
    if (!label) { errors.set(criterion.id, "Give this criterion a label."); continue; }
    if (seenLabels.has(label)) errors.set(criterion.id, "Another criterion already uses this label.");
    else seenLabels.set(label, criterion.id);
    if (criterion.type !== "number") continue;
    if (!criterion.max || !Number.isInteger(criterion.max) || criterion.max < 1 || criterion.max > 100) errors.set(criterion.id, "Maximum must be a whole number between 1 and 100.");
    else if (criterion.weight !== undefined && !(criterion.weight > 0 && criterion.weight <= 100)) errors.set(criterion.id, "Weight must be greater than 0 and no more than 100.");
  }
  return errors;
}

/**
 * The first required criterion the reviewer has not answered, or undefined when the scorecard
 * is complete. Used to block save and to name the offending row inline.
 */
export function firstMissingCriterion(criteria: EvaluationCriterion[] | undefined, scores: EvaluationCriterionScore[] | undefined): EvaluationCriterion | undefined {
  const byId = new Map((scores ?? []).map(score => [score.criterionId, score]));
  return criteria?.find(criterion => {
    if (!criterion.required) return false;
    const recorded = byId.get(criterion.id);
    return criterion.type === "number" ? typeof recorded?.value !== "number" : !recorded?.text?.trim();
  });
}
