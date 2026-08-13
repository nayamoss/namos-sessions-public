import { describe, expect, it } from "vitest";
import { assertCrossFieldLimits, assertParticipantRoleBounds } from "../../convex/publicFormValidation";
import { evaluateCrossFieldLimits } from "@/lib/form-validation";

describe("cross-field character limits", () => {
  it("counts a configured set of fields live", () => {
    const [result] = evaluateCrossFieldLimits({ title: "Talk", description: "Useful session" }, [{ id: "program-copy", label: "Program copy", fieldIds: ["title", "description"], maxCombinedChars: 20, perParticipant: false }]);
    expect(result).toMatchObject({ count: 18, remaining: 2, valid: true });
  });
  it("rejects an over-limit combined value", () => expect(evaluateCrossFieldLimits({ title: "Long title", description: "Longer description" }, [{ id: "copy", label: "Copy", fieldIds: ["title", "description"], maxCombinedChars: 10, perParticipant: false }])[0].valid).toBe(false));
  it("enforces the same configured limit after opaque public field keys are resolved", () => {
    const keys = new Map([["field-title", "field-1"], ["field-description", "field-2"]]);
    expect(() => assertCrossFieldLimits([{ label: "Program copy", fieldIds: ["field-title", "field-description"], maxCombinedChars: 10 }], keys, { "field-1": "Talk", "field-2": "Detailed copy" })).toThrow("Program copy must be 10 characters or fewer.");
  });
  it("enforces configured participant role minimums, maximums, and names", () => {
    const roles = [{ role: "Speaker", min: 1, max: 2 }];
    expect(() => assertParticipantRoleBounds(roles, [])).toThrow("Add at least 1 Speaker participant.");
    expect(() => assertParticipantRoleBounds(roles, [{ role: "Speaker", answers: {} }, { role: "Speaker", answers: {} }, { role: "Speaker", answers: {} }])).toThrow("Add no more than 2 Speaker participants.");
    expect(() => assertParticipantRoleBounds(roles, [{ role: "Moderator", answers: {} }])).toThrow("unknown participant role");
    expect(() => assertParticipantRoleBounds(roles, [{ role: "Speaker", answers: {} }])).not.toThrow();
  });
});
