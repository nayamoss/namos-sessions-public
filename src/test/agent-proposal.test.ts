import { describe, expect, it } from "vitest";
import { canonicalProposalPayload } from "../../convex/agentProposal";

describe("agent proposal canonicalization", () => {
  it("normalizes whitespace and emits a stable fixed-key payload", () => {
    const first = canonicalProposalPayload("  Prepare follow-up  ", [{ title: "  Upload slides ", targetType: "contact", speakerId: "speaker-1", reason: "  Slides are missing. " }]);
    const second = canonicalProposalPayload("Prepare follow-up", [{ title: "Upload slides", targetType: "contact", speakerId: "speaker-1", reason: "Slides are missing." }]);
    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual({ kind: "create_tasks", summary: "Prepare follow-up", tasks: [{ title: "Upload slides", targetType: "contact", speakerId: "speaker-1", reason: "Slides are missing." }] });
  });

  it("rejects empty, oversized, and invalid-date task proposals", () => {
    expect(() => canonicalProposalPayload("Summary", [])).toThrow(/between 1 and 50/);
    expect(() => canonicalProposalPayload("Summary", Array.from({ length: 51 }, () => ({ title: "Task", targetType: "contact" as const, reason: "Reason" })))).toThrow(/between 1 and 50/);
    expect(() => canonicalProposalPayload("Summary", [{ title: "Task", targetType: "contact", reason: "Reason", dueDate: Number.NaN }])).toThrow(/valid timestamp/);
  });
});
