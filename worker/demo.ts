import { createClerkClient } from "@clerk/backend";

export type DemoRole = "organizer" | "reviewer" | "speaker";

type Workspace = {
  workspaceId: string;
  eventId: string;
  eventSlug: string;
  userIds: Record<DemoRole, string>;
  activeRole: DemoRole;
  expiresAt: number;
  absoluteExpiresAt: number;
};

type CookiePayload = { workspaceId: string; csrf: string; expiresAt: number };
type LimitResult = { allowed: boolean; retryAfterSeconds: number };
const cookieName = "__Host-namos_demo_v2";
const maxCookieAgeSeconds = 24 * 60 * 60;

function json(status: number, body: object, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim() ?? "";
}

function configured(env: Env) {
  return env.DEMO_ENABLED === "true" && [env.DEMO_EDGE_SECRET, env.DEMO_COOKIE_SECRET, env.CLERK_SECRET_KEY, env.CONVEX_SITE_URL]
    .every((value) => typeof value === "string" && value.length >= 16);
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function hmac(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function verifyHmac(secret: string, value: string, signature: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  try {
    return await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), encoder.encode(value));
  } catch {
    return false;
  }
}

async function signCookie(env: Env, payload: CookiePayload) {
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(env.DEMO_COOKIE_SECRET, encoded)}`;
}

async function readCookie(request: Request, env: Env): Promise<CookiePayload | null> {
  const raw = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) return null;
  const [encoded, signature, extra] = raw.split(".");
  if (!encoded || !signature || extra || !(await verifyHmac(env.DEMO_COOKIE_SECRET, encoded, signature))) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))) as CookiePayload;
    return typeof parsed.workspaceId === "string" && typeof parsed.csrf === "string" && parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function setCookie(value: string) {
  return `${cookieName}=${value}; Path=/; Max-Age=${maxCookieAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie() {
  return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function rateLimit(env: Env, scope: string, value: string, limit: number, windowMs: number) {
  const privateKey = await hmac(env.DEMO_COOKIE_SECRET, `${scope}:${value}`);
  const id = env.CFP_RATE_LIMITER.idFromName(`demo:${scope}:${privateKey}`);
  const response = await env.CFP_RATE_LIMITER.get(id).fetch("https://rate-limit.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit, windowMs }),
  });
  if (!response.ok) throw new Error("Rate limiter unavailable.");
  return response.json<LimitResult>();
}

async function verifyTurnstile(request: Request, env: Env, token: string) {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: requestIp(request) }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return false;
  const result = await response.json<{ success?: boolean; hostname?: string; action?: string }>();
  if ((env.TURNSTILE_TEST_MODE as string) === "true" && result.success === true && result.hostname === "example.com") return true;
  const hostnames = new Set(env.TURNSTILE_ALLOWED_HOSTNAMES.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return result.success === true && result.action === "demo-create" && typeof result.hostname === "string" && hostnames.has(result.hostname.toLowerCase());
}

async function convex(env: Env, input: Record<string, unknown>) {
  const response = await fetch(`${env.CONVEX_SITE_URL.replace(/\/$/, "")}/internal/demo-workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-namos-demo-secret": env.DEMO_EDGE_SECRET },
    body: JSON.stringify({ ...input, now: Date.now() }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Demo backend rejected operation (${response.status}).`);
  return response.json<Record<string, unknown>>();
}

async function ticket(env: Env, userId: string, redirectUrl: string) {
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const token = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: 60 });
  const url = new URL(token.url);
  url.searchParams.set("redirect_url", redirectUrl);
  return url.toString();
}

function roleDestination(request: Request, workspace: Pick<Workspace, "eventSlug">, role: DemoRole) {
  const path = role === "organizer"
    ? `/events/${workspace.eventSlug}/dashboard`
    : role === "reviewer"
      ? `/events/${workspace.eventSlug}/program/evaluation`
      : "/portal";
  return new URL(path, new URL(request.url).origin).toString();
}

async function requireWorkspace(request: Request, env: Env, csrf = false) {
  const cookie = await readCookie(request, env);
  if (!cookie || (csrf && request.headers.get("x-demo-csrf") !== cookie.csrf)) return null;
  const result = await convex(env, { action: "get", workspaceId: cookie.workspaceId });
  return result.workspace ? { cookie, workspace: result.workspace as Workspace } : null;
}

async function createWorkspace(request: Request, env: Env, judgeEntry = false) {
  if (!judgeEntry && !sameOrigin(request)) return json(403, { error: "request_rejected" });
  const ip = requestIp(request);
  if (!ip) return json(403, { error: "request_rejected" });
  let body: { turnstileToken?: string } = {};
  if (!judgeEntry) {
    try { body = await request.json<{ turnstileToken?: string }>(); }
    catch { return json(400, { error: "invalid_request" }); }
  }
  const allowed = await rateLimit(env, judgeEntry ? "judge-entry" : "create-v2", ip, judgeEntry ? 10 : 3, 60 * 60 * 1_000);
  if (!allowed.allowed) return json(429, { error: "rate_limited" }, { "retry-after": String(allowed.retryAfterSeconds) });
  if (!judgeEntry && (!body.turnstileToken || !(await verifyTurnstile(request, env, body.turnstileToken)))) return json(403, { error: "verification_failed" });

  const workspaceId = crypto.randomUUID();
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const users: Partial<Record<DemoRole, string>> = {};
  try {
    const emails = {
      organizer: `organizer+${workspaceId}@demo.your-project.example`,
      reviewer: `reviewer+${workspaceId}@demo.your-project.example`,
      speaker: `speaker+${workspaceId}@demo.your-project.example`,
    } as const;
    for (const role of ["organizer", "reviewer", "speaker"] as const) {
      const user = await clerk.users.createUser({
        externalId: `namos-demo:${workspaceId}:${role}`,
        emailAddress: [emails[role]],
        firstName: role[0].toUpperCase() + role.slice(1),
        lastName: "Demo",
        skipPasswordRequirement: true,
        privateMetadata: { namosDemoWorkspaceId: workspaceId, namosDemoRole: role },
      });
      const emailAddressId = user.emailAddresses[0]?.id;
      if (!emailAddressId) throw new Error("Demo user email was not created.");
      await clerk.emailAddresses.updateEmailAddress(emailAddressId, { verified: true });
      users[role] = user.id;
    }
    const organizerUserId = users.organizer;
    const reviewerUserId = users.reviewer;
    const speakerUserId = users.speaker;
    if (!organizerUserId || !reviewerUserId || !speakerUserId) throw new Error("Demo users were not created.");
    const destination = judgeEntry ? `/events/demo-${workspaceId}/program/agenda` : `/events/demo-${workspaceId}/dashboard`;
    const signInUrl = await ticket(env, organizerUserId, new URL(destination, new URL(request.url).origin).toString());
    const workspace = await convex(env, { action: "provision", workspaceId, organizerUserId, reviewerUserId, speakerUserId, organizerEmail: emails.organizer, reviewerEmail: emails.reviewer, speakerEmail: emails.speaker }) as unknown as Workspace;
    const csrf = crypto.randomUUID();
    const cookie = await signCookie(env, { workspaceId, csrf, expiresAt: workspace.absoluteExpiresAt });
    if (judgeEntry) return new Response(null, { status: 302, headers: { location: signInUrl, "set-cookie": setCookie(cookie), "cache-control": "no-store" } });
    return json(201, { workspace: { ...workspace, userIds: undefined }, csrf, signInUrl }, { "set-cookie": setCookie(cookie) });
  } catch {
    await Promise.allSettled(Object.values(users).map((userId) => clerk.users.deleteUser(userId)));
    return json(503, { error: "demo_unavailable" });
  }
}

async function judgeScheduleStudio(request: Request, env: Env) {
  const key = new URL(request.url).searchParams.get("access");
  const configuredKey = (env as Env & { DEMO_JUDGE_ACCESS_KEY?: string }).DEMO_JUDGE_ACCESS_KEY;
  if (!configuredKey || !key || key !== configuredKey) return json(404, { error: "not_found" });
  const active = await requireWorkspace(request, env);
  if (active) {
    const destination = new URL(`/events/${active.workspace.eventSlug}/program/agenda`, new URL(request.url).origin).toString();
    return new Response(null, { status: 302, headers: { location: await ticket(env, active.workspace.userIds.organizer, destination), "cache-control": "no-store" } });
  }
  return createWorkspace(request, env, true);
}

async function state(request: Request, env: Env) {
  const active = await requireWorkspace(request, env);
  if (!active) return json(401, { error: "workspace_expired" }, { "set-cookie": clearCookie() });
  return json(200, { workspace: { ...active.workspace, userIds: undefined }, csrf: active.cookie.csrf });
}

async function switchRole(request: Request, env: Env) {
  if (!sameOrigin(request)) return json(403, { error: "request_rejected" });
  const active = await requireWorkspace(request, env, true);
  if (!active) return json(401, { error: "workspace_expired" }, { "set-cookie": clearCookie() });
  let role: DemoRole;
  try { role = (await request.json<{ role: DemoRole }>()).role; }
  catch { return json(400, { error: "invalid_request" }); }
  if (!["organizer", "reviewer", "speaker"].includes(role)) return json(400, { error: "invalid_role" });
  const result = await convex(env, { action: "switch", workspaceId: active.cookie.workspaceId, role });
  const workspace = result.workspace as Workspace | null;
  if (!workspace) return json(401, { error: "workspace_expired" }, { "set-cookie": clearCookie() });
  return json(200, { workspace: { ...workspace, userIds: undefined }, signInUrl: await ticket(env, active.workspace.userIds[role], roleDestination(request, workspace, role)) });
}

async function resetWorkspace(request: Request, env: Env) {
  if (!sameOrigin(request)) return json(403, { error: "request_rejected" });
  const active = await requireWorkspace(request, env, true);
  if (!active) return json(401, { error: "workspace_expired" }, { "set-cookie": clearCookie() });
  const allowed = await rateLimit(env, "reset", active.cookie.workspaceId, 10, 60 * 60 * 1_000);
  if (!allowed.allowed) return json(429, { error: "rate_limited" }, { "retry-after": String(allowed.retryAfterSeconds) });
  const result = await convex(env, { action: "reset", workspaceId: active.cookie.workspaceId });
  const workspace = result.workspace as Workspace | null;
  if (!workspace) return json(401, { error: "workspace_expired" }, { "set-cookie": clearCookie() });
  return json(200, { workspace: { ...workspace, userIds: undefined }, signInUrl: await ticket(env, active.workspace.userIds.organizer, roleDestination(request, workspace, "organizer")) });
}

async function inbox(request: Request, env: Env) {
  const active = await requireWorkspace(request, env);
  if (!active) return json(401, { error: "workspace_expired" }, { "set-cookie": clearCookie() });
  const result = await convex(env, { action: "inbox", workspaceId: active.cookie.workspaceId });
  return json(200, { deliveries: result.deliveries ?? [] });
}

export async function handleDemoRequest(request: Request, env: Env) {
  if (!configured(env)) return json(404, { error: "not_found" });
  const { pathname } = new URL(request.url);
  try {
    if (pathname === "/api/demo/workspaces" && request.method === "POST") return await createWorkspace(request, env);
    if (pathname === "/demo/schedule-studio" && request.method === "GET") return await judgeScheduleStudio(request, env);
    if (pathname === "/api/demo/workspaces/current" && request.method === "GET") return await state(request, env);
    if (pathname === "/api/demo/workspaces/current/role" && request.method === "POST") return await switchRole(request, env);
    if (pathname === "/api/demo/workspaces/current/reset" && request.method === "POST") return await resetWorkspace(request, env);
    if (pathname === "/api/demo/inbox" && request.method === "GET") return await inbox(request, env);
    return json(404, { error: "not_found" });
  } catch {
    return json(503, { error: "demo_unavailable" });
  }
}

export async function cleanupDemoWorkspaces(env: Env) {
  if (!configured(env)) return;
  const result = await convex(env, { action: "cleanup" }) as { clerkUserIds?: string[] };
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  await Promise.allSettled((result.clerkUserIds ?? []).map((userId) => clerk.users.deleteUser(userId)));
}
