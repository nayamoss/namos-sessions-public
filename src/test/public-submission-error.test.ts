import { describe, expect, it } from "vitest";
import { publicSubmissionErrorMessage } from "@/lib/public-submission-error";

describe("public submission errors", () => {
  it("does not expose Convex request metadata for a reached submission limit", () => {
    const error = new Error("[Request ID: abc123] Server Error Uncaught Error: You have reached this form's submission limit. at handler (../convex/publicForms.ts:152:53)");
    expect(publicSubmissionErrorMessage(error)).toBe("You have reached this form's submission limit.");
  });

  it("uses a safe retry message for unknown backend errors", () => {
    expect(publicSubmissionErrorMessage(new Error("internal transport details"))).toBe("Your submission could not be saved. Please try again.");
  });
});
