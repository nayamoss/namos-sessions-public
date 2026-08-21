import { describe, expect, it } from "vitest";
import { redactedSubmissionInput } from "../../convex/aiAssessmentActions";

describe("AI assessment input redaction", () => {
  it("removes identity fields and redacts contact details inside proposal text", () => {
    const value = redactedSubmissionInput({
      abstract: "Contact ada@example.test or +1 (212) 555-0199 for details.",
      email: "ada@example.test",
      speaker_name: "Ada Lovelace",
      nested: { phone: "212-555-0100", learningOutcome: "Safer retries" },
    });
    expect(value).toEqual({ abstract: "Contact [redacted email] or [redacted phone] for details.", nested: { learningOutcome: "Safer retries" } });
  });
});
