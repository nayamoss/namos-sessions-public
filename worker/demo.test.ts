// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const deleteUser = vi.fn();
const updateEmailAddress = vi.fn();
const createSignInToken = vi.fn();

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: { createUser, deleteUser },
    emailAddresses: { updateEmailAddress },
    signInTokens: { createSignInToken },
  }),
}));

import { handleDemoRequest } from "./demo";

function limiterNamespace() {
  const counts = new Map<string, number>();
  return {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (_url: string, init: RequestInit) => {
        const { limit } = JSON.parse(String(init.body)) as { limit: number };
        const count = counts.get(id) ?? 0;
        const allowed = count < limit;
        if (allowed) counts.set(id, count + 1);
        return Response.json({ allowed, retryAfterSeconds: allowed ? 0 : 60 });
      },
    }),
  };
}

function environment(overrides: Record<string, unknown> = {}) {
  return {
    DEMO_ENABLED: "true",
    DEMO_EDGE_SECRET: "demo-edge-secret-long",
    DEMO_COOKIE_SECRET: "demo-cookie-secret-long",
    CLERK_SECRET_KEY: "clerk-secret-key-long",
    CONVEX_SITE_URL: "https://convex.example.test",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    TURNSTILE_ALLOWED_HOSTNAMES: "app.example.test",
    TURNSTILE_TEST_MODE: "false",
    CFP_RATE_LIMITER: limiterNamespace(),
    ...overrides,
  } as unknown as Env;
}

function post(path: string, body: object, headers: Record<string, string> = {}) {
  return new Request(`https://app.example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example.test",
      "cf-connecting-ip": "203.0.113.7",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const workspace = {
  workspaceId: "workspace-1",
  eventId: "event-1",
  eventSlug: "demo-workspace-1",
  userIds: { organizer: "user-organizer", reviewer: "user-reviewer", speaker: "user-speaker" },
  activeRole: "organizer",
  expiresAt: Date.now() + 60 * 60 * 1_000,
  absoluteExpiresAt: Date.now() + 24 * 60 * 60 * 1_000,
};

beforeEach(() => {
  createUser.mockReset();
  deleteUser.mockReset().mockResolvedValue({});
  updateEmailAddress.mockReset().mockResolvedValue({});
  createSignInToken.mockReset().mockResolvedValue({ url: "https://accounts.example.test/ticket" });
  createUser
    .mockResolvedValueOnce({ id: "user-organizer", emailAddresses: [{ id: "email-organizer" }] })
    .mockResolvedValueOnce({ id: "user-reviewer", emailAddresses: [{ id: "email-reviewer" }] })
    .mockResolvedValueOnce({ id: "user-speaker", emailAddresses: [{ id: "email-speaker" }] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("demo workspace edge boundary", () => {
  it("fails closed when the demo feature flag or required secrets are absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment({ DEMO_ENABLED: "false" }));
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("provisions three isolated Clerk identities and returns a signed HttpOnly workspace cookie", async () => {
    const fetchMock = vi.fn(async (resource: string | URL | Request, init?: RequestInit) => {
      if (String(resource).includes("turnstile")) return Response.json({ success: true, hostname: "app.example.test", action: "demo-create" });
      expect((init?.headers as Record<string, string>)["x-namos-demo-secret"]).toBe("demo-edge-secret-long");
      return Response.json(workspace, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment());

    expect(response.status).toBe(201);
    expect(createUser).toHaveBeenCalledTimes(3);
    expect(updateEmailAddress.mock.calls).toEqual([
      ["email-organizer", { verified: true }],
      ["email-reviewer", { verified: true }],
      ["email-speaker", { verified: true }],
    ]);
    expect(createUser.mock.calls.map(([input]) => input.privateMetadata.namosDemoRole)).toEqual(["organizer", "reviewer", "speaker"]);
    expect(createUser.mock.calls.map(([input]) => input.emailAddress[0])).toEqual([
      expect.stringMatching(/^organizer\+[0-9a-f-]+@demo\.your-project\.example$/),
      expect.stringMatching(/^reviewer\+[0-9a-f-]+@demo\.your-project\.example$/),
      expect.stringMatching(/^speaker\+[0-9a-f-]+@demo\.your-project\.example$/),
    ]);
    expect(response.headers.get("set-cookie")).toMatch(/^__Host-namos_demo_v2=.*HttpOnly; Secure; SameSite=Lax$/);
    const body = await response.json() as Record<string, unknown>;
    expect(String(body.signInUrl)).toContain("https://accounts.example.test/ticket?redirect_url=");
    const destination = new URL(String(body.signInUrl)).searchParams.get("redirect_url");
    expect(destination).toMatch(/^https:\/\/app\.example\.test\/events\/demo-[0-9a-f-]+\/dashboard$/);
    expect(JSON.stringify(body)).not.toContain("user-organizer");
  });

  it("rejects role switching without the CSRF proof bound into the signed cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request) => String(resource).includes("turnstile")
      ? Response.json({ success: true, hostname: "app.example.test", action: "demo-create" })
      : Response.json(workspace, { status: 201 })));
    const created = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment());
    const cookie = created.headers.get("set-cookie")?.split(";")[0] ?? "";

    const response = await handleDemoRequest(post("/api/demo/workspaces/current/role", { role: "reviewer" }, { cookie }), environment());

    expect(response.status).toBe(401);
    expect(createSignInToken).toHaveBeenCalledTimes(1);
  });

  it("sends reviewer and speaker tickets to their exact same-origin role destinations", async () => {
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request) => String(resource).includes("turnstile")
      ? Response.json({ success: true, hostname: "app.example.test", action: "demo-create" })
      : Response.json(workspace, { status: 201 })));
    const created = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment());
    const cookie = created.headers.get("set-cookie")?.split(";")[0] ?? "";
    const csrf = String((await created.json() as { csrf: string }).csrf);
    vi.stubGlobal("fetch", vi.fn(async (_resource: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action: string; role?: "reviewer" | "speaker" };
      if (body.action === "get") return Response.json({ workspace });
      return Response.json({ workspace: { ...workspace, activeRole: body.role } });
    }));

    const reviewer = await handleDemoRequest(post("/api/demo/workspaces/current/role", { role: "reviewer" }, { cookie, "x-demo-csrf": csrf }), environment());
    const reviewerDestination = new URL(String((await reviewer.json() as { signInUrl: string }).signInUrl)).searchParams.get("redirect_url");
    expect(reviewerDestination).toBe("https://app.example.test/events/demo-workspace-1/program/evaluation");

    const speaker = await handleDemoRequest(post("/api/demo/workspaces/current/role", { role: "speaker" }, { cookie, "x-demo-csrf": csrf }), environment());
    const speakerDestination = new URL(String((await speaker.json() as { signInUrl: string }).signInUrl)).searchParams.get("redirect_url");
    expect(speakerDestination).toBe("https://app.example.test/portal");
  });

  it("rejects cross-origin workspace creation before Turnstile or Clerk side effects", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = post("/api/demo/workspaces", { turnstileToken: "token" }, { origin: "https://evil.example" });
    const response = await handleDemoRequest(request, environment());
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });
});
