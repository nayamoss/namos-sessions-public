import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { isManagedAiDisabled } from "../../convex/managedAi";

const originalDisabled = process.env.MANAGED_AI_DISABLED;

afterEach(() => {
  if (originalDisabled === undefined) delete process.env.MANAGED_AI_DISABLED;
  else process.env.MANAGED_AI_DISABLED = originalDisabled;
});

describe("managed AI usage gating", () => {
  it("treats any non-empty kill-switch value as disabled", () => {
    delete process.env.MANAGED_AI_DISABLED;
    expect(isManagedAiDisabled()).toBe(false);
    process.env.MANAGED_AI_DISABLED = "";
    expect(isManagedAiDisabled()).toBe(false);
    process.env.MANAGED_AI_DISABLED = "1";
    expect(isManagedAiDisabled()).toBe(true);
    process.env.MANAGED_AI_DISABLED = "false";
    expect(isManagedAiDisabled()).toBe(true);
  });

  it("checks the kill switch before creating or dispatching managed Operations Agent runs", () => {
    const runs = readFileSync("convex/agentRuns.ts", "utf8");
    const runtime = readFileSync("convex/agentRuntime.ts", "utf8");
    expect(runs.indexOf("if (isManagedAiDisabled())")).toBeLessThan(runs.indexOf('ctx.db.insert("agent_runs"'));
    expect(runtime.indexOf("if (isManagedAiDisabled())")).toBeLessThan(runtime.lastIndexOf("resolveManagedAllowance"));
    expect(runtime).toContain("MANAGED_AI_DISABLED_MESSAGE");
  });

  it("reserves assessment quota atomically and finalizes it with assessment state", () => {
    const assessments = readFileSync("convex/aiAssessments.ts", "utf8");
    const actions = readFileSync("convex/aiAssessmentActions.ts", "utf8");
    expect(assessments).toContain("export const request = action");
    expect(assessments).toContain("reserveManagedAllowance");
    expect(assessments).toContain("settleManagedAllowance");
    expect(assessments).toContain("releaseManagedAllowance");
    expect(assessments.indexOf("reserveManagedAllowance(ctx")).toBeLessThan(assessments.indexOf("ctx.scheduler.runAfter"));
    expect(actions).toContain("export const run = internalAction");
    expect(actions).toContain("assessment.providerMode");
    expect(actions).toContain("assessment.managedAllowanceId");
  });

  it("exposes a distinct disabled provider state and user-facing explanation", () => {
    const settings = readFileSync("convex/agentProviderSettings.ts", "utf8");
    const form = readFileSync("src/components/shared/AgentProviderSettingsForm.tsx", "utf8");
    const types = readFileSync("src/data/types.ts", "utf8");
    expect(settings).toContain('"disabled" as const');
    expect(settings).toContain("managedDisabled");
    expect(types).toContain('"ready" | "error" | "disabled"');
    expect(form).toContain("Managed AI is temporarily disabled");
  });
});
