import { describe, expect, it } from "vitest";
import { canonicalMessageDraftProposalPayload, canonicalProposalPayload } from "../../convex/agentProposal";

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

describe("agent message proposal canonicalization", () => {
  it("normalizes exact draft content and binds it to the message proposal kind", () => {
    const first = canonicalMessageDraftProposalPayload("  Prepare acceptance  ", [{ speakerId: "speaker-1", submissionId: "submission-1", kind: "acceptance", subject: "  Welcome  ", body: "  You are accepted.  ", calendarAttached: true, reason: "  Accepted but not notified.  " }]);
    const second = canonicalMessageDraftProposalPayload("Prepare acceptance", [{ speakerId: "speaker-1", submissionId: "submission-1", kind: "acceptance", subject: "Welcome", body: "You are accepted.", calendarAttached: true, reason: "Accepted but not notified." }]);
    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual({ kind: "prepare_message_drafts", summary: "Prepare acceptance", messages: [{ speakerId: "speaker-1", submissionId: "submission-1", kind: "acceptance", subject: "Welcome", body: "You are accepted.", calendarAttached: true, reason: "Accepted but not notified." }] });
  });

  it("rejects empty and invalid message drafts", () => {
    expect(() => canonicalMessageDraftProposalPayload("Summary", [])).toThrow(/between 1 and 50/);
    expect(() => canonicalMessageDraftProposalPayload("Summary", [{ speakerId: "", kind: "custom", subject: "Subject", body: "Body", calendarAttached: false, reason: "Reason" }])).toThrow(/needs a speaker/);
    expect(() => canonicalMessageDraftProposalPayload("Summary", [{ speakerId: "speaker-1", kind: "custom", subject: "", body: "Body", calendarAttached: false, reason: "Reason" }])).toThrow(/needs a subject/);
  });
});
