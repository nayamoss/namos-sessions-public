import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workspace = readFileSync("src/components/agent/AgentWorkspace.tsx", "utf8");
const dashboard = readFileSync("src/pages/dashboard/DashboardHome.tsx", "utf8");
const operationsRoute = readFileSync("src/pages/program/AgentOperations.tsx", "utf8");
const timeline = readFileSync("src/components/agent/AgentTimeline.tsx", "utf8");
const composer = readFileSync("src/components/agent/AgentComposer.tsx", "utf8");

describe("Operations Agent workspace", () => {
  it("uses one live workspace from both organizer entry points", () => {
    expect(dashboard).toContain("<AgentWorkspace />");
    expect(operationsRoute).toContain("<AgentWorkspace />");
    expect(dashboard).not.toContain("ComposerStub");
    expect(dashboard).not.toContain("not available yet");
  });

  it("uses clear review language and real proposal controls", () => {
    expect(composer).toContain("Ask anything about this event");
    expect(composer).toContain("Send request");
    expect(workspace).toContain("repo.agentRuns.approveTaskProposal");
    expect(workspace).toContain("repo.agentRuns.cancel");
    expect(workspace).toContain("repo.agentRuns.retry");
  });

  it("keeps technical activity disclosed instead of showing it by default", () => {
    expect(workspace).toContain('presentation="run"');
    expect(workspace).toContain("status={selected?.run.status}");
    expect(timeline).toContain("Review activity");
    expect(timeline).toContain("<details");
    expect(timeline).toContain("Review could not be completed");
    expect(timeline).toContain("hasReviewActivity");
  });

  it("uses a full-height conversation layout with a bottom composer", () => {
    expect(workspace).toContain("flex h-full min-h-0 w-full flex-col");
    expect(workspace).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(workspace).not.toContain("Start with a focused question");
    expect(workspace).not.toContain("max-w-4xl");
    expect(composer).toContain("shrink-0 bg-card p-3");
    expect(composer).toContain("rounded-full bg-foreground");
    expect(composer).not.toContain("Start review");
  });
});
