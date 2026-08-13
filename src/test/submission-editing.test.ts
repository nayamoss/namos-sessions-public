import { describe, expect, it } from "vitest";
import { assertAnswers, evaluateEditability, mergeEditableAnswers, readEditableAnswers, requireOwnSubmission } from "../../convex/submissionEditing";
import type { QueryCtx } from "../../convex/_generated/server";
import type { Id } from "../../convex/_generated/dataModel";

const openForm = { status: "open" as const, closeDate: undefined };

describe("speaker submission editability", () => {
  it.each([
    ["draft", true, "draft"],
    ["pending", true, "submitted"],
    ["withdrawn", true, "submitted"],
    ["accept_queue", false, "under_review"],
    ["decline_queue", false, "under_review"],
    ["accepted", false, "decision_recorded"],
    ["declined", false, "decision_recorded"],
  ] as const)("evaluates %s", (status, editable, detail) => {
    const result = evaluateEditability({ status }, openForm as never, 100);
    expect(result.editable).toBe(editable);
    expect(editable ? (result as { mode: string }).mode : (result as { reason: string }).reason).toBe(detail);
  });

  it("checks status locks before a closed form", () => {
    expect(evaluateEditability({ status: "accepted" }, { status: "closed", closeDate: 50 } as never, 100)).toEqual({ editable: false, reason: "decision_recorded" });
    expect(evaluateEditability({ status: "pending" }, { status: "open", closeDate: 50 } as never, 100)).toEqual({ editable: false, reason: "submissions_closed", closedAt: 50 });
  });
});

describe("speaker answer validation and preservation", () => {
  const fields = [
    { _id: "title-id", label: "Session title", required: true, maxChars: 20 },
    { _id: "abstract-id", label: "Abstract", required: true, maxChars: 30 },
    { _id: "details-id", label: "Details", required: true, showIf: { fieldId: "abstract-id", equals: "show" } },
  ] as never;
  const limit = [{ label: "Program copy", fieldIds: ["title-id", "abstract-id"], maxCombinedChars: 25 }];

  it("rejects unknown, required, max-character, and combined-limit failures", () => {
    expect(() => assertAnswers({ fields, crossFieldLimits: limit, answers: { unknown: "x" }, title: "Title", requireRequired: true })).toThrow("unknown form field");
    expect(() => assertAnswers({ fields, crossFieldLimits: limit, answers: { "title-id": "Title", "abstract-id": "" }, title: "Title", requireRequired: true })).toThrow("Abstract is required");
    expect(() => assertAnswers({ fields, crossFieldLimits: limit, answers: { "title-id": "Title", "abstract-id": "x".repeat(31), "details-id": "" }, title: "Title", requireRequired: false })).toThrow("Abstract exceeds");
    expect(() => assertAnswers({ fields, crossFieldLimits: limit, answers: { "title-id": "123456789012345", "abstract-id": "12345678901", "details-id": "" }, title: "Title", requireRequired: false })).toThrow("Program copy");
  });

  it("allows draft-required omissions and hidden required children", () => {
    expect(() => assertAnswers({ fields, crossFieldLimits: limit, answers: { "title-id": "", "abstract-id": "", "details-id": "" }, title: "", requireRequired: false })).not.toThrow();
    expect(() => assertAnswers({ fields, crossFieldLimits: limit, answers: { "title-id": "Title", "abstract-id": "hidden", "details-id": "" }, title: "Title", requireRequired: true })).not.toThrow();
  });

  it("round-trips public fieldValues while preserving email, participants, and archived answers", () => {
    const stored = {
      email: "speaker@example.test",
      fieldValues: { "title-id": "Old title", "abstract-id": "Old abstract", "deleted-id": "Archived" },
      fieldLabels: { "title-id": "Session title", "abstract-id": "Abstract", "deleted-id": "Old question" },
      participantValues: [{ role: "Speaker", fieldValues: { name: "Ada" } }],
    };
    const visible = readEditableAnswers(stored, fields);
    expect(visible.answers).toEqual({ "title-id": "Old title", "abstract-id": "Old abstract" });
    expect(visible.archivedAnswers).toEqual([{ key: "deleted-id", label: "Old question", value: "Archived" }]);
    const merged = mergeEditableAnswers(stored, { ...visible.answers, "abstract-id": "New abstract" });
    expect(merged).toEqual({ ...stored, fieldValues: { ...stored.fieldValues, "abstract-id": "New abstract" } });
  });
});

describe("speaker submission ownership", () => {
  const eventId = "event-a" as Id<"events">;
  const submissionId = "submission-a" as Id<"submissions">;
  const speakerId = "speaker-a" as Id<"speakers">;
  const submission = { _id: submissionId, eventId, speakerId };
  const speaker = { _id: speakerId, eventId, email: "speaker@example.test" };
  const context = (identity: Record<string, unknown> | null, submissionRow: unknown = submission) => ({
    auth: { getUserIdentity: async () => identity },
    db: { get: async (id: string) => id === submissionId ? submissionRow : id === speakerId ? speaker : null },
  }) as unknown as QueryCtx;

  it("requires a provider-verified email matching the submission speaker", async () => {
    await expect(requireOwnSubmission(context({ subject: "user-a", email: "SPEAKER@example.test", emailVerified: true }), { eventId, submissionId, speakerId })).resolves.toEqual(submission);
    await expect(requireOwnSubmission(context({ subject: "user-a", email: "speaker@example.test", emailVerified: false }), { eventId, submissionId, speakerId })).rejects.toThrow("That submission is not available on your portal.");
    await expect(requireOwnSubmission(context({ subject: "user-a", email: "attacker@example.test", emailVerified: true }), { eventId, submissionId, speakerId })).rejects.toThrow("That submission is not available on your portal.");
    await expect(requireOwnSubmission(context(null), { eventId, submissionId, speakerId })).rejects.toThrow("That submission is not available on your portal.");
  });

  it("uses the same neutral error for a missing or differently owned submission", async () => {
    await expect(requireOwnSubmission(context({ subject: "user-a", email: "speaker@example.test", emailVerified: true }, null), { eventId, submissionId, speakerId })).rejects.toThrow("That submission is not available on your portal.");
    await expect(requireOwnSubmission(context({ subject: "user-a", email: "speaker@example.test", emailVerified: true }, { ...submission, speakerId: "speaker-b" }), { eventId, submissionId, speakerId })).rejects.toThrow("That submission is not available on your portal.");
  });
});
