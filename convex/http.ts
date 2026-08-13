import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashApiKey } from "./apiKeyAuth";
import { parseBearerApiKey, projectPublicEvent, publicApiError } from "./publicEventsApi";

const http = httpRouter();
const headers = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" };
const errorResponse = (status: number, code: string, message: string) =>
  new Response(JSON.stringify(publicApiError(code, message)), { status, headers });

http.route({
  path: "/api/v1/events",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const rawKey = parseBearerApiKey(request.headers.get("authorization"));
    if (!rawKey) return errorResponse(401, "unauthorized", "Missing or malformed API key.");
    try {
      const key = await ctx.runQuery(internal.apiKeyAuth.findActive, { keyHash: await hashApiKey(rawKey) });
      if (!key) return errorResponse(401, "unauthorized", "Invalid or revoked API key.");
      const events = await ctx.runQuery(internal.events.listForApi, {});
      await ctx.runMutation(internal.apiKeyAuth.markUsed, { id: key._id });
      return new Response(JSON.stringify({ data: events.map(projectPublicEvent) }), { status: 200, headers });
    } catch (cause) {
      console.error("GET /api/v1/events failed", cause);
      return errorResponse(500, "internal_error", "Something went wrong.");
    }
  }),
});

http.route({
  path: "/api/v1/events",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "Authorization, Content-Type", "access-control-max-age": "86400" } })),
});

export default http;
