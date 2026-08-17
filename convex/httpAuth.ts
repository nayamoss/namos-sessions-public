import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { hashApiKey, type ApiScope } from "./apiKeyAuth";
import { parseBearerApiKey, publicApiError } from "./publicEventsApi";

export const jsonHeaders = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" };
export const apiError = (status: number, code: string, message: string, extra: HeadersInit = {}) => new Response(JSON.stringify(publicApiError(code, message)), { status, headers: { ...jsonHeaders, ...extra } });
type Auth = { tokenId: Id<"api_tokens">; eventId: Id<"events">; scopes: ApiScope[]; requestId: string };
type Handler = (ctx: ActionCtx, request: Request, auth: Auth) => Promise<Response>;
export function withApiAuth(scope: ApiScope, operation: string, handler: Handler) {
  return async (ctx: ActionCtx, request: Request): Promise<Response> => {
    const rawKey = parseBearerApiKey(request.headers.get("authorization"));
    if (!rawKey) return apiError(401, "unauthorized", "Missing or malformed API token.");
    const token = await ctx.runQuery(internal.apiKeyAuth.findActive, { keyHash: await hashApiKey(rawKey) });
    if (!token) return apiError(401, "unauthorized", "Invalid or revoked API token.");
    const requestId = crypto.randomUUID(); const path = new URL(request.url).pathname;
    const audit = async (status: number) => ctx.runMutation(internal.apiKeyAuth.logAudit, { requestId, tokenId: token._id, operation, method: request.method, path, status, scopeUsed: scope });
    if (!token.scopes.includes(scope)) { await audit(403); return apiError(403, "forbidden", `This token does not have the ${scope} scope.`); }
    const rate = await ctx.runMutation(internal.apiKeyAuth.consumeRateLimit, { tokenId: token._id });
    if (!rate.allowed) { await audit(429); return apiError(429, "rate_limited", "Rate limit exceeded.", { "retry-after": String(rate.retryAfter) }); }
    try { const response = await handler(ctx, request, { tokenId: token._id, eventId: token.eventId, scopes: token.scopes, requestId }); await ctx.runMutation(internal.apiKeyAuth.markUsed, { id: token._id }); await audit(response.status); return response; }
    catch (cause) { console.error(`${request.method} ${path} failed`, cause); await audit(500); return apiError(500, "internal_error", "Something went wrong."); }
  };
}
