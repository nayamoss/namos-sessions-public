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

  it("removes nested Convex action and mutation error framing", () => {
    const error = new Error(
      "[Request ID: abc123] Server Error\nUncaught Error: Uncaught Error: You cannot remove the event's last organizer.\n    at async handler (../convex/eventInviteActions.ts:188:5)",
    );

    expect(cleanErrorMessage(error, "Could not remove event member.")).toBe(
      "You cannot remove the event's last organizer.",
    );
  });
});
