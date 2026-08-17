import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import { withApiAuth, apiError, jsonHeaders } from "./httpAuth";
import { projectPublicEvent } from "./publicEventsApi";

const http = httpRouter();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: jsonHeaders });
const internalHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const maxCfpPayloadBytes = 256 * 1024;

async function secretsMatch(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const actualBytes = new Uint8Array(actualHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = actualBytes.length ^ expectedBytes.length;
  for (let index = 0; index < Math.max(actualBytes.length, expectedBytes.length); index += 1) {
    difference |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
}

function internalError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), { status, headers: internalHeaders });
}

function oauthCallback(provider: "notion" | "airtable") {
  return httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const origin = process.env.PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
    if (!origin) return new Response("OAuth callback is not configured.", { status: 500 });
    // Fallback path only used when we error out before resolving which event this OAuth flow
    // belongs to (invalid state, exchange failure) — there is no event-scoped page to send the
    // user back to in that case, so the generic events list is the best available landing spot.
    const destination = new URL("/events", origin);
    if (error || !code || !state) { destination.searchParams.set("content_oauth_error", error ?? "authorization_failed"); return Response.redirect(destination, 302); }
    try {
      const result = await ctx.runAction(internal.contentIntegrationsActions.completeOAuthCallback, { provider, state, code });
      if (result.eventSlug) destination.pathname = `/events/${result.eventSlug}/settings/integrations`;
      destination.searchParams.set("content_oauth", result.pendingId);
      destination.searchParams.set("provider", provider);
    } catch {
      destination.searchParams.set("content_oauth_error", "authorization_failed");
    }
    return Response.redirect(destination, 302);
  });
}
http.route({ path: "/oauth/notion/callback", method: "GET", handler: oauthCallback("notion") });
http.route({ path: "/oauth/airtable/callback", method: "GET", handler: oauthCallback("airtable") });

// Every route below scopes strictly to auth.eventId (the event the *token* was minted for),
// never to a client-supplied eventId query param or path segment. A token only ever grants
// access to the one event it was issued against — see convex/schema.ts's api_tokens comment
// and the #178 security review (2026-08-15) that caught the earlier org-wide/no-scoping design.

http.route({ path: "/api/v1/events", method: "GET", handler: httpAction(withApiAuth("events:read", "events.list", async (ctx, _request, auth) => {
  const event = await ctx.runQuery(internal.events.getForApi, { eventId: auth.eventId });
  return json({ data: event ? [projectPublicEvent(event)] : [] });
})) });

// This is a server-to-server handoff from the same-origin Cloudflare Worker. It is deliberately
// not a browser API: the Worker secret is required before parsing or invoking the internal write.
// Unrelated to the token-authenticated /api/v1/* surface above — no withApiAuth, no api_tokens
// involved, gated purely by CFP_EDGE_SECRET.
http.route({
  path: "/internal/public-cfp-submissions",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await secretsMatch(request.headers.get("x-namos-edge-secret"), process.env.CFP_EDGE_SECRET))) {
      return internalError(401, "unauthorized");
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxCfpPayloadBytes) return internalError(413, "payload_too_large");

    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maxCfpPayloadBytes) return internalError(413, "payload_too_large");
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return internalError(400, "invalid_request");
    }
    if (!parsed || typeof parsed !== "object" || !("input" in parsed)) return internalError(400, "invalid_request");

    try {
      const identity = await ctx.auth.getUserIdentity();
      const result = await ctx.runMutation(internal.publicForms.submit, {
        input: (parsed as { input: unknown }).input,
        ...(typeof identity?.email === "string" ? { verifiedIdentityEmail: identity.email } : {}),
      } as never);
      return new Response(JSON.stringify(result), { status: 200, headers: internalHeaders });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message.includes("not available") || message.includes("not accepting responses") || message.includes("form is closed")) {
        return internalError(409, "form_closed");
      }
      if (message.includes("submission limit")) return internalError(409, "submission_limit");
      return internalError(422, "submission_rejected");
    }
  }),
});

for (const [path, scope, operation, fn] of [
  ["/api/v1/submissions", "submissions:read", "submissions.list", internal.publicApi.submissions],
  ["/api/v1/speakers", "speakers:read", "speakers.list", internal.publicApi.speakers],
  ["/api/v1/agenda", "agenda:read", "agenda.list", internal.publicApi.agenda],
  ["/api/v1/tasks", "tasks:read", "tasks.list", internal.publicApi.tasks],
] as const) http.route({ path, method: "GET", handler: httpAction(withApiAuth(scope, operation, async (ctx, _request, auth) => json({ data: await ctx.runQuery(fn, { eventId: auth.eventId }) }))) });

// Convex's httpRouter only supports exact-path or trailing-slash pathPrefix matching — it has
// no Express-style ":id" dynamic segment syntax. A literal `path: "/api/v1/submissions/:id/status"`
// registers a route that matches only the literal string ":id" and never matches any real
// request; this was a real, previously-undeployed bug (caught 2026-08-16 by the MCP server's
// first live end-to-end call — nothing had exercised this route with a real HTTP request
// before then). Use pathPrefix and parse+validate the shape by hand instead.
http.route({ pathPrefix: "/api/v1/submissions/", method: "POST", handler: httpAction(withApiAuth("submissions:write", "submissions.updateStatus", async (ctx, request, auth) => {
  const path = new URL(request.url).pathname;
  const match = /^\/api\/v1\/submissions\/([^/]+)\/status$/.exec(path);
  if (!match) return apiError(404, "not_found", "No matching route.");
  const id = match[1];
  const key = request.headers.get("idempotency-key"); if (!key) return apiError(400, "invalid_request", "Idempotency-Key is required.");
  const body = await request.text(); const bodyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)).then((value) => Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join(""));
  const prior = await ctx.runQuery(internal.apiKeyAuth.getIdempotency, { tokenId: auth.tokenId, method: request.method, path, key });
  if (prior) return prior.bodyHash === bodyHash ? new Response(prior.responseJson, { status: prior.status, headers: jsonHeaders }) : apiError(409, "idempotency_conflict", "Idempotency-Key was already used with a different request body.");
  let status: string; try { status = (JSON.parse(body) as { status?: string }).status ?? ""; } catch { return apiError(400, "invalid_request", "Body must be valid JSON."); }
  // Cross-event IDOR guard: a submission id is a global Convex id, not scoped by URL — a
  // token for event A could otherwise be used to mutate a submission belonging to event B
  // just by guessing/enumerating ids. Load-then-check before ever writing.
  const submission = await ctx.runQuery(internal.publicApi.getSubmissionEventId, { id: id as never });
  if (!submission) return apiError(404, "not_found", "Submission not found.");
  if (submission.eventId !== auth.eventId) return apiError(404, "not_found", "Submission not found.");
  const updated = await ctx.runMutation(internal.publicApi.updateSubmissionStatus, { id: id as never, status: status as never });
  const response = updated ? json({ data: updated }) : apiError(404, "not_found", "Submission not found."); await ctx.runMutation(internal.apiKeyAuth.storeIdempotency, { tokenId: auth.tokenId, method: request.method, path, key, bodyHash, status: response.status, responseJson: await response.clone().text() }); return response;
})) });

// Token management deliberately uses the organizer's Clerk session, never a bearer API token
// — an API token must never be able to mint, list, or revoke API tokens (itself included).
const withOrganizerSession = (handler: (ctx: ActionCtx, request: Request) => Promise<Response>) => async (ctx: ActionCtx, request: Request) => {
  // ctx.auth.getUserIdentity() throws an *uncaught* error (leaking an internal stack trace,
  // including file paths) when the Authorization header isn't a well-formed JWT — e.g. an
  // API token (ns_live_...) sent to a session-only route by mistake. It must never reach the
  // caller as a raw 500; treat any auth-resolution failure the same as "not signed in".
  // Caught live 2026-08-16 sending a bearer API token to GET /api/v1/tokens.
  let identity;
  try { identity = await ctx.auth.getUserIdentity(); }
  catch { return apiError(401, "unauthorized", "Sign in as an organizer."); }
  if (!identity) return apiError(401, "unauthorized", "Sign in as an organizer.");
  try { return await handler(ctx, request); } catch (cause) { const message = cause instanceof Error ? cause.message : "Unable to manage API tokens."; return apiError(message.startsWith("Forbidden") ? 403 : 400, "forbidden", message); }
};
const queryEventId = (request: Request) => new URL(request.url).searchParams.get("eventId");
http.route({ path: "/api/v1/tokens", method: "GET", handler: httpAction(withOrganizerSession(async (ctx, request) => {
  const eventId = queryEventId(request); if (!eventId) return apiError(400, "invalid_request", "eventId is required.");
  return json({ data: await ctx.runQuery(api.apiKeys.list, { eventId: eventId as never }) });
})) });
http.route({ path: "/api/v1/tokens", method: "POST", handler: httpAction(withOrganizerSession(async (ctx, request) => {
  const body = await request.json() as { eventId?: string; label?: string; scopes?: string[] };
  if (!body.eventId || !body.label || !Array.isArray(body.scopes)) return apiError(400, "invalid_request", "eventId, label, and scopes are required.");
  const result = await ctx.runAction(api.apiKeysActions.generate, { eventId: body.eventId as never, label: body.label, scopes: body.scopes }); return json({ token: result.rawKey, prefix: result.rawKey.slice(0, 16) }, 201);
})) });
// Same pathPrefix reasoning as the submissions/:id/status route above — Convex has no ":id"
// dynamic-segment syntax.
http.route({ pathPrefix: "/api/v1/tokens/", method: "DELETE", handler: httpAction(withOrganizerSession(async (ctx, request) => {
  const eventId = queryEventId(request); if (!eventId) return apiError(400, "invalid_request", "eventId is required.");
  const id = new URL(request.url).pathname.slice("/api/v1/tokens/".length);
  if (!id || id.includes("/")) return apiError(404, "not_found", "No matching route.");
  await ctx.runMutation(api.apiKeys.revoke, { eventId: eventId as never, id: id as never }); return json({ revoked: true });
})) });

const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "Authorization, Content-Type, Idempotency-Key", "access-control-max-age": "86400" };
const preflight = httpAction(async () => new Response(null, { status: 204, headers: cors }));
for (const path of ["/api/v1/events", "/api/v1/submissions", "/api/v1/speakers", "/api/v1/agenda", "/api/v1/tasks", "/api/v1/tokens"]) http.route({ path, method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/api/v1/submissions/", method: "OPTIONS", handler: preflight });
http.route({ pathPrefix: "/api/v1/tokens/", method: "OPTIONS", handler: preflight });
export default http;
