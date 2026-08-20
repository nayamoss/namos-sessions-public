// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const getUserBillingSubscription = vi.fn();
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ billing: { getUserBillingSubscription } }),
}));

import { resolveManagedAllowance } from "../../convex/agentBillingResolver";

afterEach(() => {
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_AGENT_PLAN_ALLOWANCES;
  vi.clearAllMocks();
});

describe("Operations Agent allowance", () => {
  it("resolves the active Clerk plan from server configuration", async () => {
    process.env.CLERK_SECRET_KEY = "test-secret";
    process.env.CLERK_AGENT_PLAN_ALLOWANCES = JSON.stringify({
      free_user: { runs: 3, tokens: 30_000, perRunTokens: 10_000 },
    });
    getUserBillingSubscription.mockResolvedValue({
      subscriptionItems: [{
        status: "active",
        plan: { slug: "free_user", features: [{ slug: "agent-managed-ai" }] },
      }],
    });

    await expect(resolveManagedAllowance("user-organizer")).resolves.toEqual({ planSlug: "free_user", runLimit: 3, tokenLimit: 30_000, reserveTokens: 10_000 });
    expect(getUserBillingSubscription).toHaveBeenCalledWith("user-organizer");
  });
});
