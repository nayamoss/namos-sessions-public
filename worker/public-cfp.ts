import { z } from "zod";

export const MAX_CFP_PAYLOAD_BYTES = 256 * 1024;

const answersSchema = z.record(z.string().min(1).max(128), z.string().max(50_000))
  .refine((answers) => Object.keys(answers).length <= 200, "Too many answers.");
const unavailableSchema = z.object({
  date: z.number().finite(),
  hour: z.number().int().min(0).max(23).optional(),
  part: z.enum(["morning", "afternoon", "evening"]).optional(),
}).strict();
const participantSchema = z.object({
  role: z.string().min(1).max(200),
  answers: answersSchema,
  availability: z.object({
    unavailable: z.array(unavailableSchema).max(1_000),
    notes: z.string().max(1_000).optional(),
  }).strict().optional(),
}).strict();
export const cfpSubmissionSchema = z.object({
  input: z.object({
    eventSlug: z.string().min(1).max(160),
    formId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(8).max(128),
    // The CFP wizard collects first and last name separately. `name` remains accepted
    // so the documented public HTTP API keeps working for existing callers; exactly one
    // of the two shapes must be present, and the pair is composed into `name` before the
    // Convex handoff, which still takes a single field.
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(320),
    title: z.string().min(1).max(500),
    answers: answersSchema,
    abstractFieldKey: z.string().min(1).max(128).optional(),
    participants: z.array(participantSchema).max(50).optional(),
  }).strict().refine(
    (input) => Boolean(input.name?.trim()) || Boolean(input.firstName?.trim() && input.lastName?.trim()),
    { message: "Provide either name, or both firstName and lastName." },
  ),
  turnstileToken: z.string().min(1).max(2_048),
}).strict();

type CfpRequest = z.infer<typeof cfpSubmissionSchema>;
type LimitName = "ip" | "form" | "email";
type LimitResult = { allowed: boolean; retryAfterSeconds: number };

/** Convex's submit mutation takes a single `name`; collapse the wizard's pair into it. */
function convexInput(input: CfpRequest["input"]) {
  const { firstName, lastName, ...rest } = input;
  const name = input.name?.trim() || `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return { ...rest, name };
}

function json(status: number, body: object, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function positiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function privacyKey(secret: string, scope: LimitName, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${scope}:${value}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkLimit(env: Env, scope: LimitName, value: string, limit: number, windowSeconds: number) {
  const key = await privacyKey(env.CFP_RATE_LIMIT_KEY_SECRET, scope, value);
  const id = env.CFP_RATE_LIMITER.idFromName(`${scope}:${key}`);
  const response = await env.CFP_RATE_LIMITER.get(id).fetch("https://rate-limit.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit, windowMs: windowSeconds * 1_000 }),
  });
  if (!response.ok) throw new Error("Rate limiter unavailable.");
  return response.json<LimitResult>();
}

type TurnstileResult = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

async function verifyTurnstile(env: Env, token: string, remoteIp: string) {
  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return { available: false, valid: false };
  }
  if (!response.ok) return { available: false, valid: false };
  const result = await response.json<TurnstileResult>();
  const allowedHostnames = new Set(env.TURNSTILE_ALLOWED_HOSTNAMES.split(",").map((hostname) => hostname.trim().toLowerCase()).filter(Boolean));
  // Cloudflare's documented test secret returns hostname=example.com with no action for the
  // documented dummy token. This branch is available only when the checked-in environment says
  // test mode; production uses a real secret and keeps this flag false.
  const officialTestResult = String(env.TURNSTILE_TEST_MODE) === "true"
    && result.hostname === "example.com"
    && result.action === undefined;
  return {
    available: true,
    valid: result.success === true
      && (officialTestResult || (
        result.action === env.TURNSTILE_EXPECTED_ACTION
        && typeof result.hostname === "string"
        && allowedHostnames.has(result.hostname.toLowerCase())
      )),
  };
}

function metric(outcome: "accepted" | "rejected" | "throttled" | "unavailable", reason: string) {
  console.log(JSON.stringify({ metric: "public_cfp_submission", outcome, reason }));
}

function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim() || "";
}

function environmentReady(env: Env) {
  return [env.CFP_EDGE_SECRET, env.CFP_RATE_LIMIT_KEY_SECRET, env.TURNSTILE_SECRET_KEY, env.CONVEX_SITE_URL, env.TURNSTILE_ALLOWED_HOSTNAMES, env.TURNSTILE_EXPECTED_ACTION, env.TURNSTILE_TEST_MODE]
    .every((value) => typeof value === "string" && value.trim().length > 0);
}

async function parseRequest(request: Request): Promise<CfpRequest | Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  let oversized = Number.isFinite(declaredLength) && declaredLength > MAX_CFP_PAYLOAD_BYTES;
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bodyBytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bodyBytes += value.byteLength;
      if (oversized || bodyBytes > MAX_CFP_PAYLOAD_BYTES) {
        oversized = true;
        chunks.length = 0;
        continue;
      }
      chunks.push(value);
    }
  }
  if (oversized) return json(413, { error: "payload_too_large" });
  const body = new Uint8Array(bodyBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json(400, { error: "invalid_request" });
  }
  const result = cfpSubmissionSchema.safeParse(parsed);
  return result.success ? result.data : json(400, { error: "invalid_request" });
}

export async function handlePublicCfpSubmission(request: Request, env: Env) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    metric("rejected", "origin");
    return json(403, { error: "request_rejected" });
  }
  const remoteIp = requestIp(request);
  if (!remoteIp) {
    metric("rejected", "missing_ip");
    return json(403, { error: "request_rejected" });
  }
  if (!environmentReady(env)) {
    metric("unavailable", "configuration");
    return json(503, { error: "service_unavailable" });
  }

  let ipLimit: LimitResult;
  try {
    ipLimit = await checkLimit(
      env,
      "ip",
      remoteIp,
      positiveInteger(env.CFP_RATE_LIMIT_IP_MAX, 30),
      positiveInteger(env.CFP_RATE_LIMIT_IP_WINDOW_SECONDS, 600),
    );
  } catch {
    metric("unavailable", "rate_limit");
    return json(503, { error: "service_unavailable" });
  }
  if (!ipLimit.allowed) {
    metric("throttled", "ip");
    return json(429, { error: "rate_limited" }, { "retry-after": String(ipLimit.retryAfterSeconds) });
  }

  const parsed = await parseRequest(request);
  if (parsed instanceof Response) {
    metric("rejected", parsed.status === 413 ? "payload_too_large" : "invalid_request");
    return parsed;
  }

  try {
    const verification = await verifyTurnstile(env, parsed.turnstileToken, remoteIp);
    if (!verification.available) {
      metric("unavailable", "turnstile");
      return json(503, { error: "verification_unavailable" });
    }
    if (!verification.valid) {
      metric("rejected", "verification");
      return json(403, { error: "verification_failed" });
    }

    const formLimit = await checkLimit(
      env,
      "form",
      parsed.input.formId,
      positiveInteger(env.CFP_RATE_LIMIT_FORM_MAX, 300),
      positiveInteger(env.CFP_RATE_LIMIT_FORM_WINDOW_SECONDS, 3_600),
    );
    if (!formLimit.allowed) {
      metric("throttled", "form");
      return json(429, { error: "rate_limited" }, { "retry-after": String(formLimit.retryAfterSeconds) });
    }
    const emailLimit = await checkLimit(
      env,
      "email",
      parsed.input.email.trim().toLowerCase(),
      positiveInteger(env.CFP_RATE_LIMIT_EMAIL_MAX, 5),
      positiveInteger(env.CFP_RATE_LIMIT_EMAIL_WINDOW_SECONDS, 3_600),
    );
    if (!emailLimit.allowed) {
      metric("throttled", "email");
      return json(429, { error: "rate_limited" }, { "retry-after": String(emailLimit.retryAfterSeconds) });
    }

    const headers = new Headers({
      "content-type": "application/json",
      "x-namos-edge-secret": env.CFP_EDGE_SECRET,
    });
    const authorization = request.headers.get("authorization");
    if (authorization) headers.set("authorization", authorization);
    const backend = await fetch(`${env.CONVEX_SITE_URL.replace(/\/$/, "")}/internal/public-cfp-submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: convexInput(parsed.input) }),
      signal: AbortSignal.timeout(10_000),
    });
    let result: { speakerId?: string; error?: string } = { error: "backend_error" };
    try {
      result = await backend.json<{ speakerId?: string; error?: string }>();
    } catch {
      // Keep the generic backend error; no response body is exposed or logged.
    }
    if (!backend.ok) {
      const code = ["form_closed", "submission_limit"].includes(result.error ?? "") ? result.error : "submission_rejected";
      metric("rejected", code ?? "submission_rejected");
      return json(backend.status === 409 ? 409 : 422, { error: code });
    }
    metric("accepted", "ok");
    return json(200, { ...(typeof result.speakerId === "string" ? { speakerId: result.speakerId } : {}) });
  } catch {
    metric("unavailable", "edge_dependency");
    return json(503, { error: "service_unavailable" });
  }
}
