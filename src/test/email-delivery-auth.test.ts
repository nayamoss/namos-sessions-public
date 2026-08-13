import { describe, expect, it, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import type { ActionCtx } from "../../convex/_generated/server";
import { assertOrganizerAction } from "../../convex/emailDelivery";

function actionContext(identity: { subject: string } | null, organizerCheck = vi.fn()) {
  return {
    auth: { getUserIdentity: vi.fn().mockResolvedValue(identity) },
    runQuery: organizerCheck,
  } as unknown as ActionCtx;
}

describe("assertOrganizerAction", () => {
  it("rejects an unauthenticated action before querying organizer status", async () => {
    const organizerCheck = vi.fn();
    const ctx = actionContext(null, organizerCheck);

    await expect(assertOrganizerAction(ctx)).rejects.toThrow("Unauthenticated");
    expect(organizerCheck).not.toHaveBeenCalled();
  });

  it("returns the caller after checking the organizers table", async () => {
    const identity = { subject: "user_admin" };
    const organizerCheck = vi.fn().mockResolvedValue(true);
    const ctx = actionContext(identity, organizerCheck);

    await expect(assertOrganizerAction(ctx)).resolves.toBe(identity);
    expect(organizerCheck).toHaveBeenCalledWith(api.organizers.isCurrentUserOrganizer, {});
  });

  it("rejects a signed-in caller without an organizers-table row", async () => {
    const ctx = actionContext({ subject: "user_member" }, vi.fn().mockResolvedValue(false));

    await expect(assertOrganizerAction(ctx)).rejects.toThrow("Forbidden: organizer access required.");
  });

  it("fails closed when organizer status cannot be resolved", async () => {
    const ctx = actionContext(
      { subject: "user_admin" },
      vi.fn().mockRejectedValue(new Error("Organizer lookup failed")),
    );

    await expect(assertOrganizerAction(ctx)).rejects.toThrow("Organizer lookup failed");
  });
});
