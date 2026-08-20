import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("evaluation page layout", () => {
  it("keeps plan work in one readable workspace instead of a metric dashboard", () => {
    const source = readFileSync(
      join(process.cwd(), "src/pages/program/Evaluation.tsx"),
      "utf8",
    );

    expect(source).not.toContain("StatCard");
    expect(source).not.toContain("planRows");
    expect(source).toContain('title="No evaluation plans yet"');
    expect(source).toContain("Manage evaluations");
    expect(source).not.toContain('aria-label="Selected evaluation plan"');
    expect(source).not.toContain('<dl className="mt-4 flex flex-wrap');
    expect(source).toContain('setPlanWorkspaceTab("progress")');
    expect(source).toContain('setPlanWorkspaceTab("criteria")');
    expect(source).toContain('setPlanWorkspaceTab("assignments")');
    expect(source).not.toContain("<TabsList");
    expect(source).toContain("showCreatePlan");
    expect(source.match(/Manage evaluations/g)).toHaveLength(1);

    const progress = readFileSync(
      join(process.cwd(), "src/components/evaluation/ReviewerProgressPanel.tsx"),
      "utf8",
    );
    expect(progress).toContain("Assigned CFP review progress");
    expect(progress).toContain('header: "CFPs assigned"');
    expect(progress).toContain('header: "CFPs reviewed"');
    expect(progress).toContain('header: "Assigned CFPs reviewed"');
  });

});
