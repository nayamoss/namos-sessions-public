// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { cfpSubmissionSchema, handlePublicCfpSubmission, MAX_CFP_PAYLOAD_BYTES } from "./public-cfp";

const input = {
  eventSlug: "demo-event",
  formId: "form_12345678",
  idempotencyKey: "retry-key-123",
  name: "Ada Lovelace",
  email: "ada@example.test",
  title: "Reliable systems",
  answers: { "field-1": "A useful proposal" },
};

function limiterNamespace() {
  const buckets = new Map<string, { startedAt: number; count: number }>();
  return {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (_url: string, init: RequestInit) => {
        const { limit, windowMs } = JSON.parse(String(init.body)) as { limit: number; windowMs: number };
        const now = Date.now();
        const current = buckets.get(id);
        const state = !current || now - current.startedAt >= windowMs ? { startedAt: now, count: 0 } : current;
        const allowed = state.count < limit;
        if (allowed) state.count += 1;
        buckets.set(id, state);
        return Response.json({ allowed, retryAfterSeconds: allowed ? 0 : 60 });
      },
    }),
  };
}

function environment(overrides: Partial<Record<string, string>> = {}) {
  return {
    CFP_RATE_LIMITER: limiterNamespace(),
    CFP_RATE_LIMIT_KEY_SECRET: "privacy-key-secret",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    TURNSTILE_ALLOWED_HOSTNAMES: "app.example.test",
    TURNSTILE_EXPECTED_ACTION: "cfp-submit",
    TURNSTILE_TEST_MODE: "false",
    CFP_EDGE_SECRET: "edge-secret",
    CONVEX_SITE_URL: "https://convex.example.test",
    CFP_RATE_LIMIT_IP_MAX: "10",
    CFP_RATE_LIMIT_IP_WINDOW_SECONDS: "600",
    CFP_RATE_LIMIT_FORM_MAX: "100",
    CFP_RATE_LIMIT_FORM_WINDOW_SECONDS: "3600",
    CFP_RATE_LIMIT_EMAIL_MAX: "5",
    CFP_RATE_LIMIT_EMAIL_WINDOW_SECONDS: "3600",
    ...overrides,
  } as unknown as Env;
}

function request(payload: unknown = { input, turnstileToken: "turnstile-token" }, headers: Record<string, string> = {}) {
  return new Request("https://app.example.test/api/public/cfp-submissions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example.test",
      "cf-connecting-ip": "203.0.113.10",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

function services(backend: { status?: number; body?: object } = {}) {
  return vi.fn(async (resource: string | URL | Request, init?: RequestInit) => {
    const url = String(resource);
    if (url.includes("turnstile")) {
      return Response.json({ success: true, hostname: "app.example.test", action: "cfp-submit" });
    }
    expect(init?.headers).toBeInstanceOf(Headers);
    expect((init?.headers as Headers).get("x-namos-edge-secret")).toBe("edge-secret");
    return Response.json(backend.body ?? { speakerId: "speaker-1" }, { status: backend.status ?? 200 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("public CFP edge boundary", () => {
  it("accepts a strict, same-origin request after verification and privacy-safe limits", async () => {
    const fetchMock = services();
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handlePublicCfpSubmission(request(), environment());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ speakerId: "speaker-1" });
    const backendCall = fetchMock.mock.calls.find(([url]) => String(url).includes("convex.example.test"));
    expect(JSON.parse(String(backendCall?.[1]?.body))).toEqual({ input });
    const emitted = log.mock.calls.flat().join(" ");
    expect(emitted).toContain('"outcome":"accepted"');
    expect(emitted).not.toContain(input.email);
    expect(emitted).not.toContain("203.0.113.10");
    expect(emitted).not.toContain("turnstile-token");
  });

  it("fails closed when Turnstile proof is invalid", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: false, hostname: "app.example.test", action: "cfp-submit" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handlePublicCfpSubmission(request(), environment());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "verification_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts Cloudflare's official dummy response only in an explicit non-production test environment", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ success: true, hostname: "example.com" }))
      .mockResolvedValueOnce(Response.json({ speakerId: "speaker-1" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handlePublicCfpSubmission(request(), environment({ TURNSTILE_TEST_MODE: "true" }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed before parsing secrets when required edge configuration is absent", async () => {
    const fetchMock = services();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handlePublicCfpSubmission(request(), environment({ TURNSTILE_SECRET_KEY: "" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "service_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized and unknown-field payloads before external side effects", async () => {
    const fetchMock = services();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const oversized = await handlePublicCfpSubmission(request(undefined, { "content-length": String(MAX_CFP_PAYLOAD_BYTES + 1) }), environment());
    const oversizedStream = await handlePublicCfpSubmission(request({ padding: "x".repeat(MAX_CFP_PAYLOAD_BYTES + 1) }), environment());
    const invalid = await handlePublicCfpSubmission(request({ input: { ...input, unexpected: true }, turnstileToken: "token" }), environment());

    expect(oversized.status).toBe(413);
    expect(oversizedStream.status).toBe(413);
    expect(invalid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throttles IP bursts before verification or backend writes", async () => {
    const fetchMock = services();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = environment({ CFP_RATE_LIMIT_IP_MAX: "1" });

    expect((await handlePublicCfpSubmission(request(), env)).status).toBe(200);
    const throttled = await handlePublicCfpSubmission(request({ input: { ...input, idempotencyKey: "retry-key-456" }, turnstileToken: "second-token" }), env);

    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBe("60");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses normalized email limits across different source IPs", async () => {
    const fetchMock = services();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = environment({ CFP_RATE_LIMIT_EMAIL_MAX: "1" });

    expect((await handlePublicCfpSubmission(request(), env)).status).toBe(200);
    const second = request({ input: { ...input, idempotencyKey: "retry-key-456", email: "ADA@example.test" }, turnstileToken: "second-token" }, { "cf-connecting-ip": "198.51.100.12" });

    expect((await handlePublicCfpSubmission(second, env)).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses a shared form limit across different source IPs and emails", async () => {
    const fetchMock = services();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = environment({ CFP_RATE_LIMIT_FORM_MAX: "1" });

    expect((await handlePublicCfpSubmission(request(), env)).status).toBe(200);
    const second = request({ input: { ...input, idempotencyKey: "retry-key-456", email: "grace@example.test" }, turnstileToken: "second-token" }, { "cf-connecting-ip": "198.51.100.12" });

    expect((await handlePublicCfpSubmission(second, env)).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails closed with a retryable response when Turnstile is unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handlePublicCfpSubmission(request(), environment());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "verification_unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves a generic closed-form response and never exposes the backend body", async () => {
    const fetchMock = services({ status: 409, body: { error: "form_closed", detail: "private detail" } });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handlePublicCfpSubmission(request(), environment());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "form_closed" });
  });

  it("preserves only the generic submission-limit code", async () => {
    const fetchMock = services({ status: 409, body: { error: "submission_limit", email: input.email } });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await handlePublicCfpSubmission(request(), environment());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "submission_limit" });
  });
});

// The CFP wizard was changed to collect first and last name separately, but this schema
// still required a single `name` and is .strict(), so every real submission was rejected
// as invalid_request. Caught by submitting a proposal end to end for the first time.
describe("submitter name shape", () => {
  const base = { eventSlug: "demo-event", formId: "form_12345678", idempotencyKey: "retry-key-123", email: "ada@example.test", title: "Reliable systems", answers: { "field-1": "A useful proposal" } };
  const wrap = (input: Record<string, unknown>) => ({ input, turnstileToken: "token-abc" });

  it("accepts the wizard's firstName + lastName pair", () => {
    expect(cfpSubmissionSchema.safeParse(wrap({ ...base, firstName: "Ada", lastName: "Lovelace" })).success).toBe(true);
  });

  it("still accepts the legacy single name field", () => {
    expect(cfpSubmissionSchema.safeParse(wrap({ ...base, name: "Ada Lovelace" })).success).toBe(true);
  });

  it("rejects a submission carrying neither shape", () => {
    expect(cfpSubmissionSchema.safeParse(wrap({ ...base })).success).toBe(false);
  });

  it("rejects a half-filled pair", () => {
    expect(cfpSubmissionSchema.safeParse(wrap({ ...base, firstName: "Ada" })).success).toBe(false);
  });
});
