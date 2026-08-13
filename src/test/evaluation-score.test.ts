import { describe, expect, it } from "vitest";
import { averageScore, firstMissingCriterion, weightedTotal } from "@/lib/evaluation-score";
import type { EvaluationCriterion } from "@/data/types";

describe("evaluation scores", () => it("uses completed reviewer scores only", () => { expect(averageScore([5, undefined, 3])).toBe(4); expect(averageScore([])).toBeUndefined(); }));

const originality: EvaluationCriterion = { id: "originality", label: "Originality", type: "number", max: 5, weight: 3, required: true };
const clarity: EvaluationCriterion = { id: "clarity", label: "Clarity", type: "number", max: 5, weight: 1, required: true };
const notes: EvaluationCriterion = { id: "notes", label: "Notes", type: "text", required: false };

describe("weighted scorecard total", () => {
  it("matches the worked weighted example by hand", () => {
    // (4×3 + 5×1) / (3×5 + 1×5) × 5 = 17/20 × 5 = 4.25
    expect(weightedTotal([originality, clarity], [{ criterionId: "originality", value: 4 }, { criterionId: "clarity", value: 5 }], 5)).toBeCloseTo(4.25, 10);
  });

  it("reduces to a plain average when every weight is equal", () => {
    const equal = [{ ...originality, weight: 1 }, clarity];
    expect(weightedTotal(equal, [{ criterionId: "originality", value: 2 }, { criterionId: "clarity", value: 4 }], 5)).toBeCloseTo(3, 10);
  });

  it("rescales onto the plan's own scale rather than the criterion maxima", () => {
    const outOfTen: EvaluationCriterion = { id: "depth", label: "Depth", type: "number", max: 10, weight: 1, required: true };
    expect(weightedTotal([outOfTen], [{ criterionId: "depth", value: 10 }], 5)).toBe(5);
  });

  it("returns undefined rather than dividing by zero", () => {
    expect(weightedTotal([notes], [{ criterionId: "notes", text: "Good" }], 5)).toBeUndefined();
    expect(weightedTotal([{ ...originality, weight: 0 }], [{ criterionId: "originality", value: 5 }], 5)).toBeUndefined();
    expect(weightedTotal([], [], 5)).toBeUndefined();
    expect(weightedTotal(undefined, undefined, 5)).toBeUndefined();
    expect(weightedTotal([originality], [], 5)).toBeUndefined();
  });

  it("ignores values whose criterion has since been deleted", () => {
    expect(weightedTotal([clarity], [{ criterionId: "clarity", value: 5 }, { criterionId: "removed", value: 1 }], 5)).toBe(5);
  });

  it("excludes text criteria from the total entirely", () => {
    expect(weightedTotal([clarity, notes], [{ criterionId: "clarity", value: 3 }, { criterionId: "notes", text: "Fine" }], 5)).toBe(3);
  });
});

describe("required criteria", () => {
  it("names the first unanswered required criterion, and nothing when complete", () => {
    expect(firstMissingCriterion([originality, clarity], [{ criterionId: "originality", value: 3 }])?.label).toBe("Clarity");
    expect(firstMissingCriterion([originality, clarity], [{ criterionId: "originality", value: 3 }, { criterionId: "clarity", value: 1 }])).toBeUndefined();
    expect(firstMissingCriterion([notes], [])).toBeUndefined();
    expect(firstMissingCriterion([{ ...notes, required: true }], [{ criterionId: "notes", text: "  " }])?.label).toBe("Notes");
  });
});
