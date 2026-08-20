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

import { cleanupDemoWorkspaces, handleDemoRequest, type DemoRole } from "./demo";

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

function get(path: string, headers: Record<string, string> = {}, method = "GET") {
  return new Request(`https://app.example.test${path}`, { method, headers: { "cf-connecting-ip": "203.0.113.7", ...headers } });
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
  it("provisions the public GET without Turnstile and redirects to organizer autolaunch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(workspace, { status: 201 })));
    const response = await handleDemoRequest(get("/demo"), environment());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example.test/demo/start?autolaunch=organizer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax");
    expect(createUser).toHaveBeenCalledTimes(3);
    expect(createSignInToken).not.toHaveBeenCalled();
  });

  it("keeps HEAD side-effect free and the legacy route key-free", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const head = await handleDemoRequest(get("/demo", {}, "HEAD"), environment());
    expect(head.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    const legacy = await handleDemoRequest(get("/demo/schedule-studio?access=retired"), environment());
    expect(legacy.status).toBe(302);
    expect(legacy.headers.get("location")).toBe("https://app.example.test/demo");
  });
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
    expect(destination).toBe("https://app.example.test/events/demo-workspace-1/dashboard");
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

  it("preserves an allowlisted proof destination through role sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request) => String(resource).includes("turnstile")
      ? Response.json({ success: true, hostname: "app.example.test", action: "demo-create" })
      : Response.json(workspace, { status: 201 })));
    const created = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment());
    const cookie = created.headers.get("set-cookie")?.split(";")[0] ?? "";
    const csrf = String((await created.json() as { csrf: string }).csrf);
    vi.stubGlobal("fetch", vi.fn(async (_resource: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action: string; role?: DemoRole };
      if (body.action === "get") return Response.json({ workspace });
      return Response.json({ workspace: { ...workspace, activeRole: body.role } });
    }));

    const speaker = await handleDemoRequest(post("/api/demo/workspaces/current/role", { role: "speaker", proof: "resources" }, { cookie, "x-demo-csrf": csrf }), environment());
    const destination = new URL(String((await speaker.json() as { signInUrl: string }).signInUrl)).searchParams.get("redirect_url");
    expect(destination).toBe("https://app.example.test/portal/resources");

    const rejected = await handleDemoRequest(post("/api/demo/workspaces/current/role", { role: "speaker", proof: "operations-agent" }, { cookie, "x-demo-csrf": csrf }), environment());
    const fallback = new URL(String((await rejected.json() as { signInUrl: string }).signInUrl)).searchParams.get("redirect_url");
    expect(fallback).toBe("https://app.example.test/portal");
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

  it("rejects a tampered workspace cookie without consulting the backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request) => String(resource).includes("turnstile")
      ? Response.json({ success: true, hostname: "app.example.test", action: "demo-create" })
      : Response.json(workspace, { status: 201 })));
    const created = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment());
    const cookie = created.headers.get("set-cookie")?.split(";")[0] ?? "";
    const [name, value] = cookie.split("=");
    const separator = value.indexOf(".");
    const signatureStart = separator + 1;
    const replacement = value[signatureStart] === "a" ? "b" : "a";
    const tampered = `${name}=${value.slice(0, signatureStart)}${replacement}${value.slice(signatureStart + 1)}`;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleDemoRequest(get("/api/demo/workspaces/current", { cookie: tampered }), environment());

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps two browser cookies bound to their own workspace even when a foreign id is supplied in the URL", async () => {
    createUser.mockReset().mockImplementation(async (input: { emailAddress: string[] }) => {
      const [role, workspaceId] = input.emailAddress[0].split(/[+@]/);
      return { id: `${role}-${workspaceId}`, emailAddresses: [{ id: `email-${role}-${workspaceId}` }] };
    });
    const backendActions: Array<{ action: string; workspaceId?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request, init?: RequestInit) => {
      if (String(resource).includes("turnstile")) return Response.json({ success: true, hostname: "app.example.test", action: "demo-create" });
      const body = JSON.parse(String(init?.body)) as { action: string; workspaceId?: string; organizerUserId?: string; reviewerUserId?: string; speakerUserId?: string };
      backendActions.push(body);
      const workspaceId = body.workspaceId!;
      const isolated = {
        ...workspace,
        workspaceId,
        eventId: `event-${workspaceId}`,
        eventSlug: `demo-${workspaceId}`,
        userIds: {
          organizer: body.organizerUserId ?? `organizer-${workspaceId}`,
          reviewer: body.reviewerUserId ?? `reviewer-${workspaceId}`,
          speaker: body.speakerUserId ?? `speaker-${workspaceId}`,
        },
      };
      return body.action === "get" ? Response.json({ workspace: isolated }) : Response.json(isolated, { status: 201 });
    }));

    const createdA = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }, { "cf-connecting-ip": "203.0.113.10" }), environment());
    const createdB = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }, { "cf-connecting-ip": "203.0.113.11" }), environment());
    const bodyA = await createdA.clone().json() as { workspace: { workspaceId: string } };
    const bodyB = await createdB.clone().json() as { workspace: { workspaceId: string } };
    const cookieA = createdA.headers.get("set-cookie")?.split(";")[0] ?? "";
    const cookieB = createdB.headers.get("set-cookie")?.split(";")[0] ?? "";

    const stateA = await handleDemoRequest(get(`/api/demo/workspaces/current?workspaceId=${bodyB.workspace.workspaceId}`, { cookie: cookieA }), environment());
    const stateB = await handleDemoRequest(get(`/api/demo/workspaces/current?workspaceId=${bodyA.workspace.workspaceId}`, { cookie: cookieB }), environment());

    expect((await stateA.json() as { workspace: { workspaceId: string } }).workspace.workspaceId).toBe(bodyA.workspace.workspaceId);
    expect((await stateB.json() as { workspace: { workspaceId: string } }).workspace.workspaceId).toBe(bodyB.workspace.workspaceId);
    expect(backendActions.slice(-2).map((entry) => entry.workspaceId)).toEqual([bodyA.workspace.workspaceId, bodyB.workspace.workspaceId]);
  });

  it("scopes reset to the signed workspace and rejects cross-origin mutation", async () => {
    const actions: Array<{ action: string; workspaceId?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request, init?: RequestInit) => {
      if (String(resource).includes("turnstile")) return Response.json({ success: true, hostname: "app.example.test", action: "demo-create" });
      const body = JSON.parse(String(init?.body)) as { action: string; workspaceId?: string };
      actions.push(body);
      const scopedWorkspace = { ...workspace, workspaceId: body.workspaceId ?? workspace.workspaceId };
      return body.action === "provision" ? Response.json(scopedWorkspace, { status: 201 }) : Response.json({ workspace: scopedWorkspace });
    }));
    const created = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment());
    const cookie = created.headers.get("set-cookie")?.split(";")[0] ?? "";
    const csrf = String((await created.json() as { csrf: string }).csrf);

    const crossOrigin = await handleDemoRequest(post("/api/demo/workspaces/current/reset", {}, { cookie, "x-demo-csrf": csrf, origin: "https://evil.example" }), environment());
    expect(crossOrigin.status).toBe(403);
    expect(actions.some((entry) => entry.action === "reset")).toBe(false);

    const reset = await handleDemoRequest(post("/api/demo/workspaces/current/reset", {}, { cookie, "x-demo-csrf": csrf }), environment());
    expect(reset.status).toBe(200);
    const provisionedId = actions.find((entry) => entry.action === "provision")?.workspaceId;
    expect(actions.filter((entry) => entry.action === "reset")).toEqual([expect.objectContaining({ action: "reset", workspaceId: provisionedId })]);
  });

  it("clears the cookie when the backend reports idle expiry", async () => {
    let provisionedId = "";
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request, init?: RequestInit) => {
      if (String(resource).includes("turnstile")) return Response.json({ success: true, hostname: "app.example.test", action: "demo-create" });
      const body = JSON.parse(String(init?.body)) as { workspaceId: string };
      provisionedId = body.workspaceId;
      return Response.json({ ...workspace, workspaceId: provisionedId }, { status: 201 });
    }));
    const created = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment());
    const cookie = created.headers.get("set-cookie")?.split(";")[0] ?? "";
    const backend = vi.fn().mockResolvedValue(Response.json({ workspace: null }));
    vi.stubGlobal("fetch", backend);

    const response = await handleDemoRequest(get("/api/demo/workspaces/current", { cookie }), environment());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "workspace_expired" });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(JSON.parse(String(backend.mock.calls[0][1]?.body))).toMatchObject({ action: "get", workspaceId: provisionedId });
  });

  it("rejects an absolutely expired signed cookie before a backend request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00Z"));
    const timedWorkspace = { ...workspace, expiresAt: Date.now() + 60 * 60 * 1_000, absoluteExpiresAt: Date.now() + 24 * 60 * 60 * 1_000 };
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request) => String(resource).includes("turnstile")
      ? Response.json({ success: true, hostname: "app.example.test", action: "demo-create" })
      : Response.json(timedWorkspace, { status: 201 })));
    const created = await handleDemoRequest(post("/api/demo/workspaces", { turnstileToken: "token" }), environment());
    const cookie = created.headers.get("set-cookie")?.split(";")[0] ?? "";
    vi.setSystemTime(new Date("2026-08-20T12:00:01Z"));
    const backend = vi.fn();
    vi.stubGlobal("fetch", backend);

    const response = await handleDemoRequest(get("/api/demo/workspaces/current", { cookie }), environment());

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(backend).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("deletes every Clerk identity returned by scheduled cleanup", async () => {
    const backend = vi.fn().mockResolvedValue(Response.json({ removed: 2, clerkUserIds: ["organizer-a", "reviewer-a", "speaker-a", "organizer-b", "reviewer-b", "speaker-b"] }));
    vi.stubGlobal("fetch", backend);

    await cleanupDemoWorkspaces(environment());

    expect(JSON.parse(String(backend.mock.calls[0][1]?.body))).toMatchObject({ action: "cleanup" });
    expect(deleteUser.mock.calls.map(([userId]) => userId)).toEqual(["organizer-a", "reviewer-a", "speaker-a", "organizer-b", "reviewer-b", "speaker-b"]);
  });
});
