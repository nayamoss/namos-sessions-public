import { describe, expect, it } from "vitest";
import { computeReviewerProgress, reviewersBelowThreshold } from "@/lib/reviewer-progress";

const assignment = (id: string, reviewerUserId: string) => ({ id, reviewerUserId });

describe("computeReviewerProgress", () => {
  it("returns nothing when the plan has no assignments", () => {
    expect(computeReviewerProgress([], [], [])).toEqual([]);
  });

  it("counts an assignment complete only when a linked review carries a numeric score", () => {
    const rows = computeReviewerProgress(
      [assignment("a1", "chair@conf.dev"), assignment("a2", "chair@conf.dev")],
      [{ assignmentId: "a1", score: 4 }, { assignmentId: "a2" }],
      [],
    );
    expect(rows).toEqual([{ reviewerUserId: "chair@conf.dev", assigned: 2, completed: 1, outstanding: 1, completionRate: 50, emailResolved: true, toEmail: "chair@conf.dev" }]);
  });

  it("reports every reviewer at 100% when all assignments are scored", () => {
    const rows = computeReviewerProgress(
      [assignment("a1", "chair@conf.dev"), assignment("a2", "pc@conf.dev")],
      [{ assignmentId: "a1", score: 5 }, { assignmentId: "a2", score: 3 }],
      [],
    );
    expect(rows.map(row => row.completionRate)).toEqual([100, 100]);
    expect(rows.every(row => row.outstanding === 0)).toBe(true);
  });

  it("ignores an ad-hoc review that is not linked to an assignment", () => {
    const rows = computeReviewerProgress([assignment("a1", "chair@conf.dev")], [{ score: 5 }], []);
    expect(rows[0]).toMatchObject({ completed: 0, completionRate: 0 });
  });

  it("resolves an email-shaped reviewer identifier to itself", () => {
    const rows = computeReviewerProgress([assignment("a1", "Chair@Conf.dev")], [], []);
    expect(rows[0]).toMatchObject({ emailResolved: true, toEmail: "chair@conf.dev" });
  });

  it("resolves a reviewer identifier that matches a speaker email, case-insensitively", () => {
    const rows = computeReviewerProgress([assignment("a1", "Speaker@Seed.invalid")], [], ["speaker@seed.invalid"]);
    expect(rows[0]).toMatchObject({ emailResolved: true, toEmail: "speaker@seed.invalid" });
  });

  it("marks a non-address reviewer identifier unresolvable rather than dropping the row", () => {
    const rows = computeReviewerProgress([assignment("a1", "Reviewer 2")], [], ["speaker@seed.invalid"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].emailResolved).toBe(false);
    expect(rows[0].toEmail).toBeUndefined();
  });

  it("orders least-complete first and breaks ties on the reviewer identifier", () => {
    const rows = computeReviewerProgress(
      [assignment("a1", "zoe@conf.dev"), assignment("a2", "amy@conf.dev"), assignment("a3", "bob@conf.dev")],
      [{ assignmentId: "a3", score: 2 }],
      [],
    );
    expect(rows.map(row => row.reviewerUserId)).toEqual(["amy@conf.dev", "zoe@conf.dev", "bob@conf.dev"]);
  });

  it("aggregates a reviewer assigned across two rounds into one row", () => {
    const rows = computeReviewerProgress(
      [assignment("r1", "chair@conf.dev"), assignment("r2", "chair@conf.dev"), assignment("r3", "chair@conf.dev")],
      [{ assignmentId: "r1", score: 4 }],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ assigned: 3, completed: 1, outstanding: 2, completionRate: 33 });
  });
});

describe("reviewersBelowThreshold", () => {
  const rows = computeReviewerProgress(
    [assignment("a1", "amy@conf.dev"), assignment("a2", "bob@conf.dev"), assignment("a3", "cat@conf.dev")],
    [{ assignmentId: "a2", score: 4 }, { assignmentId: "a3", score: 4 }],
    [],
  );

  it("selects strictly below the threshold", () => {
    expect(reviewersBelowThreshold(rows, 50).map(row => row.reviewerUserId)).toEqual(["amy@conf.dev"]);
    // 100 means "everyone not finished" — a reviewer already at 100% is still excluded (E12).
    expect(reviewersBelowThreshold(rows, 100).map(row => row.reviewerUserId)).toEqual(["amy@conf.dev"]);
  });

  it("selects nobody when every reviewer is complete", () => {
    const complete = computeReviewerProgress([assignment("a1", "amy@conf.dev")], [{ assignmentId: "a1", score: 5 }], []);
    expect(reviewersBelowThreshold(complete, 100)).toEqual([]);
  });
});
