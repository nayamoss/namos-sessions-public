import { DurableObject } from "cloudflare:workers";
import { handlePublicCfpSubmission } from "./public-cfp";

// Replace clerk.your-project.example / your-project.convex.cloud / your-project.convex.site /
// your-sentry-org.ingest.us.sentry.io below with your own Clerk, Convex, and (optional) Sentry
// domains before deploying. These are client-visible by design — a CSP header ships to every
// visitor's browser — so this is a config step, not a secret.
const commonCsp = "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' https://clerk.your-project.example https://challenges.cloudflare.com https://browser.sentry-cdn.com; connect-src 'self' https://clerk.your-project.example https://your-project.convex.cloud https://your-project.convex.site https://your-sentry-org.ingest.us.sentry.io; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src https://clerk.your-project.example https://challenges.cloudflare.com; worker-src 'self' blob:";

function withSecurityHeaders(response: Response, pathname: string) {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", `${commonCsp}; frame-ancestors ${pathname.startsWith("/embed/") ? "*" : "'none'"}`);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()");
  headers.set("cross-origin-opener-policy", "same-origin");
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
    const response = url.pathname === "/api/public/cfp-submissions"
      ? await handlePublicCfpSubmission(request, env)
      : url.pathname.startsWith("/api/")
        ? Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } })
        : await env.ASSETS.fetch(request);
    return withSecurityHeaders(response, url.pathname);
  },
} satisfies ExportedHandler<Env>;
