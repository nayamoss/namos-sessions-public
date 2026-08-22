import { describe, expect, it } from "vitest";

import { cleanErrorMessage, friendlyErrorMessage } from "@/lib/errors";

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

  // The two tests above assume the real message rides along in `.message` as an "Uncaught
  // Error: ..." envelope. Verified live against this app's actual production Convex client:
  // that is NOT what happens — `.message` on a real thrown-server-error is always just the
  // generic "[Request ID: ...] Server Error" framing, for a plain Error *and* a ConvexError,
  // with no envelope to strip at all. The one channel that reliably carries the real text is
  // `ConvexError#data`. convex/functions.ts's `mutation`/`query` wrappers re-raise every plain
  // Error a handler throws as `new ConvexError(cause.message)` specifically so a bare string
  // ends up on `.data` for this to read.
  it("reads the real message off .data on a re-raised ConvexError, not the generic .message", () => {
    const error = Object.assign(new Error("[Request ID: abc123] Server Error"), {
      name: "ConvexError",
      data: "Publish the event before opening its call for proposals.",
    });

    expect(cleanErrorMessage(error, "Could not change this form's status.")).toBe(
      "Publish the event before opening its call for proposals.",
    );
    expect(friendlyErrorMessage(error, "Could not change this form's status.")).toBe(
      "Publish the event before opening its call for proposals.",
    );
  });

  it("still falls back to the generic message when .data is absent (a genuinely unexpected server fault)", () => {
    const error = new Error("[Request ID: abc123] Server Error");

    expect(friendlyErrorMessage(error, "Could not change this form's status.")).toBe(
      "Could not change this form's status.",
    );
  });

  it("recognizes the demo read-only guard via .data, not .message", () => {
    const error = Object.assign(new Error("[Request ID: abc123] Server Error"), {
      name: "ConvexError",
      data: { code: "demo_read_only", message: "This is a read-only demo." },
    });

    expect(friendlyErrorMessage(error, "Could not save changes.")).toBe(
      "This is a read-only demo.",
    );
  });
});
