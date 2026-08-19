// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getUserBillingSubscription = vi.fn();
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { getUser }, billing: { getUserBillingSubscription } }),
}));

import { resolveManagedAllowance } from "../../convex/agentBillingResolver";

afterEach(() => {
  delete process.env.CLERK_SECRET_KEY;
  vi.clearAllMocks();
});

describe("demo Operations Agent allowance", () => {
  it("uses a strict demo cap without requiring or reading a billing subscription", async () => {
    process.env.CLERK_SECRET_KEY = "test-secret";
    getUser.mockResolvedValue({ privateMetadata: { namosDemoWorkspaceId: "workspace-1", namosDemoRole: "organizer" } });

    await expect(resolveManagedAllowance("user-organizer")).resolves.toEqual({ planSlug: "demo", runLimit: 3, tokenLimit: 30_000, reserveTokens: 10_000 });
    expect(getUserBillingSubscription).not.toHaveBeenCalled();
  });
});
