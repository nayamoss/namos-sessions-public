import { describe, expect, it } from "vitest";
import { buildDemoAcceptanceProposal } from "../../convex/demoAgent";

describe("deterministic demo Operations Agent", () => {
  it("builds grounded acceptance drafts and preserves confirmation-before-write", () => {
    const proposal = buildDemoAcceptanceProposal("Namos Demo", [
      { speakerId: "speaker-1", speakerName: "Jordan Demo", submissionId: "submission-1", submissionTitle: "Reliable agents", templateId: "template-1", scheduled: true },
      { speakerId: "speaker-2", speakerName: "Casey Demo", submissionId: "submission-2", submissionTitle: "Human operations", scheduled: false },
    ]);

    expect(proposal?.summary).toContain("Review and confirm");
    expect(proposal?.summary).toContain("nothing has been sent");
    expect(proposal?.messages).toEqual([
      expect.objectContaining({ speakerId: "speaker-1", submissionId: "submission-1", templateId: "template-1", calendarAttached: true }),
      expect.objectContaining({ speakerId: "speaker-2", submissionId: "submission-2", calendarAttached: false }),
    ]);
    expect(JSON.parse(proposal!.canonicalPayload)).toMatchObject({ kind: "prepare_message_drafts", messages: [{ submissionId: "submission-1" }, { submissionId: "submission-2" }] });
  });

  it("does not invent a proposal when live state has no eligible records", () => {
    expect(buildDemoAcceptanceProposal("Namos Demo", [])).toBeNull();
  });

  it("keeps the bypass scoped to a verified demo workspace and non-demo provider failures fail closed", async () => {
    const runtime = await import("node:fs").then(({ readFileSync }) => readFileSync("convex/agentRuntime.ts", "utf8"));
    expect(runtime).toContain("internal.demoWorkspaces.getByEvent");
    expect(runtime).toContain("executeDeterministicDemoRun");
    expect(runtime.indexOf("if (demoWorkspace)")).toBeLessThan(runtime.indexOf("const apiKey = await resolveApiKey"));
    expect(runtime).toContain("safeProviderError(error)");
  });
});
