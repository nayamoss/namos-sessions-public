import { describe, expect, it } from "vitest";

import { cleanErrorMessage } from "@/lib/errors";

describe("cleanErrorMessage", () => {
  it("removes Convex request framing and stack details", () => {
    const error = new Error(
      "[Request ID: abc123] Server Error\nUncaught Error: That event slug is already in use.\n    at handler (../convex/events.ts:128:13)",
    );

    expect(cleanErrorMessage(error, "Could not save event.")).toBe(
      "That event slug is already in use.",
    );
  });

  it("uses the fallback for non-errors", () => {
    expect(cleanErrorMessage(null, "Could not save event.")).toBe(
      "Could not save event.",
    );
  });
});
