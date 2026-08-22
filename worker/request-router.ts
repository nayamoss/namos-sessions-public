import { handlePublicCfpSubmission } from "./public-cfp";
import { handleDemoRequest } from "./demo";
import { handleResendInbound, handleSesInbound } from "./inbound-email";

export async function routeRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/public/cfp-submissions") return handlePublicCfpSubmission(request, env);
  if (url.pathname === "/api/webhooks/resend/inbound") return handleResendInbound(request, env);
  if (url.pathname === "/api/webhooks/ses/inbound") return handleSesInbound(request, env);
  if (url.pathname.startsWith("/api/demo/") || url.pathname === "/demo" || url.pathname === "/demo/schedule-studio") return handleDemoRequest(request, env);
  if (url.pathname.startsWith("/api/")) return Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
  if (url.pathname === "/index.html" && (request.method === "GET" || request.method === "HEAD")) {
    url.pathname = "/";
    url.search = "";
    return env.ASSETS.fetch(new Request(url, request));
  }
  return env.ASSETS.fetch(request);
}
