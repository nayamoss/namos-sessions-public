import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  query: vi.fn(),
  setAuth: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({ verifyToken: mocks.verifyToken }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = mocks.query;
    setAuth = mocks.setAuth;
  },
}));

import { onRequestPost } from "../../functions/api/data";
import { api } from "../../convex/_generated/api";

const env = {
  AIRTABLE_API_KEY: "test-key",
  AIRTABLE_BASE_ID: "test-base",
  CLERK_SECRET_KEY: "test-clerk-secret",
  CONVEX_URL: "https://convex.example.test",
};

function request(authorization?: string) {
  return new Request("https://example.test/api/data", {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify({ operation: "events.list", input: {} }),
  });
}

describe("Airtable bridge authentication", () => {
  beforeEach(() => {
    mocks.verifyToken.mockReset();
    mocks.query.mockReset();
    mocks.setAuth.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] }), { status: 200 })));
  });

  it("rejects requests without a Clerk bearer token before touching Airtable", async () => {
    const response = await onRequestPost({ request: request(), env });
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a verified user that has no organizers-table row", async () => {
    mocks.verifyToken.mockResolvedValue({ sub: "user_member" });
    mocks.query.mockResolvedValue(false);
    const response = await onRequestPost({ request: request("Bearer signed-token"), env });
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks the organizers table with the caller's token before issuing an Airtable request", async () => {
    mocks.verifyToken.mockResolvedValue({ sub: "user_admin" });
    mocks.query.mockResolvedValue(true);
    const response = await onRequestPost({ request: request("Bearer signed-token"), env });
    expect(response.status).toBe(200);
    expect(mocks.verifyToken).toHaveBeenCalledWith("signed-token", expect.objectContaining({ secretKey: "test-clerk-secret" }));
    expect(mocks.setAuth).toHaveBeenCalledWith("signed-token");
    expect(mocks.query).toHaveBeenCalledWith(api.organizers.isCurrentUserOrganizer, {});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed when organizer status cannot be resolved", async () => {
    mocks.verifyToken.mockResolvedValue({ sub: "user_admin" });
    mocks.query.mockRejectedValue(new Error("Unauthenticated"));
    const response = await onRequestPost({ request: request("Bearer signed-token"), env });
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});
