import { DurableObject } from "cloudflare:workers";
import { cleanupDemoWorkspaces } from "./demo";
import { routeRequest } from "./request-router";
import { contentSecurityPolicy } from "./security-headers";

function withSecurityHeaders(response: Response, pathname: string, env: Env) {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", contentSecurityPolicy(env, pathname));
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  if (pathname === "/robots.txt" || pathname === "/llms.txt") headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

type LimitState = { windowStartedAt: number; count: number };

export class CfpRateLimiter extends DurableObject<Env> {
  async fetch(request: Request) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    let body: { limit?: number; windowMs?: number } = {};
    try {
      body = await request.json<{ limit?: number; windowMs?: number }>();
    } catch {
      // Invalid bodies fail through the numeric validation below.
    }
    const limit = Number(body.limit);
    const windowMs = Number(body.windowMs);
    if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(windowMs) || windowMs <= 0) {
      return Response.json({ error: "invalid_limit" }, { status: 400 });
    }
    const now = Date.now();
    const result = await this.ctx.storage.transaction(async (transaction) => {
      const current = await transaction.get<LimitState>("limit");
      const state = !current || now - current.windowStartedAt >= windowMs
        ? { windowStartedAt: now, count: 0 }
        : current;
      const allowed = state.count < limit;
      if (allowed) {
        state.count += 1;
        await transaction.put("limit", state);
      }
      return {
        allowed,
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((state.windowStartedAt + windowMs - now) / 1_000)),
      };
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const response = await routeRequest(request, env);
    return withSecurityHeaders(response, url.pathname, env);
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await cleanupDemoWorkspaces(env);
  },
} satisfies ExportedHandler<Env>;
