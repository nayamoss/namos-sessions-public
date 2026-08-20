import { describe, expect, it, vi } from "vitest";
import { createAirtableRepo } from "@/data/airtable";
import { normalize } from "@/data/convex";
import type { AgentRunId, EventId } from "@/data/types";
import { readFileSync } from "node:fs";

const eventId = "event-a" as EventId;
const runId = "run-a" as AgentRunId;

describe("Operations Agent data boundary", () => {
  it("normalizes nested run details without exposing Convex system fields", () => {
    expect(normalize("agentRuns.get", {
      run: { _id: runId, _creationTime: 1, eventId, objective: "Check readiness" },
      events: [{ _id: "event-1", _creationTime: 2, eventId, runId, sequence: 1 }],
      proposals: [{ _id: "proposal-1", _creationTime: 3, eventId, runId, tasks: [] }],
    })).toEqual({
      run: { id: runId, eventId, objective: "Check readiness" },
      events: [{ id: "event-1", eventId, runId, sequence: 1 }],
      proposals: [{ id: "proposal-1", eventId, runId, tasks: [] }],
    });
  });

  it("normalizes event-scoped run history rows", () => {
    expect(normalize("agentRuns.list", [{ _id: runId, _creationTime: 1, eventId, objective: "Check readiness" }])).toEqual([
      { id: runId, eventId, objective: "Check readiness" },
    ]);
  });

  it("normalizes prepared communication drafts without Convex system fields", () => {
    expect(normalize("comms.listDrafts", [{ _id: "draft-1", _creationTime: 1, eventId, status: "draft", source: "agent" }])).toEqual([
      { id: "draft-1", eventId, status: "draft", source: "agent" },
    ]);
  });

  it("fails explicitly in Airtable mode without making a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const repo = createAirtableRepo();
    await expect(repo.agentRuns.canUse({ eventId })).rejects.toThrow("Operations Agent currently requires the Convex backend.");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("Operations Agent runtime durability", () => {
  it("persists segment steps when clarification or approval pauses execution", () => {
    const runtime = readFileSync("convex/agentRuntime.ts", "utf8");
    const state = readFileSync("convex/agentState.ts", "utf8");
    expect(runtime).toContain("internal.agentState.recordSegmentSteps");
    expect(runtime).toContain("state.run.maxSteps - state.run.stepCount");
    expect(state).toContain("export const recordSegmentSteps");
    expect(state).toContain("Math.min(run.maxSteps, run.stepCount + segmentSteps)");
  });

  it("exposes the durable retry mutation for failed runs", () => {
    const workspace = readFileSync("src/components/agent/AgentWorkspace.tsx", "utf8");
    const inspector = readFileSync("src/components/agent/AgentRunInspector.tsx", "utf8");
    expect(workspace).toContain("repo.agentRuns.retry");
    expect(inspector).toContain("Retry review");
  });

  it("keeps message preparation approval-gated and send-free", () => {
    const runtime = readFileSync("convex/agentRuntime.ts", "utf8");
    const runs = readFileSync("convex/agentRuns.ts", "utf8");
    expect(runtime).toContain("propose_message_drafts");
    expect(runtime).toContain("sendsPerformed: 0");
    expect(runs).toContain("export const approveMessageProposal = mutation");
    expect(runs).toContain("assertEventOrganizerAccess(ctx, args.eventId)");
    expect(runs).toContain('status: "draft", source: "agent"');
    expect(runs).not.toContain("approveMessageProposal = action");
  });
});
