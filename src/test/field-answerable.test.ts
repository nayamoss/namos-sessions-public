import { describe, expect, it } from "vitest";
import { fieldAnswerable, fieldBlocksSubmission } from "@/lib/field-answerable";

// Found by submitting a proposal end to end for the first time (2026-08-16): the
// Wizard QA Summit CFP was published and open, but "Track" was required and drew its
// options from the event's tracks — of which there were none. The dropdown rendered
// empty, validation said "Track is required.", and no submitter could ever get past
// step 3. The CFP looked healthy from the organizer side the whole time.
describe("optionless choice fields", () => {
  const track = { type: "dropdown", required: true, options: [] as string[] };
  const level = { type: "dropdown", required: true, options: ["Beginner", "Advanced"] };
  const title = { type: "text", required: true };

  it("treats a choice field with no options as unanswerable", () => {
    expect(fieldAnswerable(track)).toBe(false);
    expect(fieldAnswerable({ type: "dropdown", options: undefined })).toBe(false);
    expect(fieldAnswerable(level)).toBe(true);
    // Free-text fields are always answerable; they have no options by design.
    expect(fieldAnswerable(title)).toBe(true);
  });

  it("does not block submission on a required field nobody can answer", () => {
    expect(fieldBlocksSubmission(track, undefined)).toBe(false);
    expect(fieldBlocksSubmission(track, "")).toBe(false);
  });

  it("still blocks on required fields that can be answered", () => {
    expect(fieldBlocksSubmission(level, undefined)).toBe(true);
    expect(fieldBlocksSubmission(level, "   ")).toBe(true);
    expect(fieldBlocksSubmission(level, "Beginner")).toBe(false);
    expect(fieldBlocksSubmission(title, "")).toBe(true);
    expect(fieldBlocksSubmission(title, "A proposal")).toBe(false);
  });

  it("never blocks on optional fields", () => {
    expect(fieldBlocksSubmission({ type: "dropdown", required: false, options: ["a"] }, "")).toBe(false);
    expect(fieldBlocksSubmission({ type: "text", required: false }, "")).toBe(false);
  });
});
