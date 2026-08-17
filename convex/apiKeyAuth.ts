import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const API_SCOPES = ["events:read", "submissions:read", "submissions:write", "speakers:read", "agenda:read", "tasks:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export async function hashApiKey(rawKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function isApiKeyActive(key: { revokedAt?: number } | null): boolean { return Boolean(key && !key.revokedAt); }
export const findActive = internalQuery({ args: { keyHash: v.string() }, handler: async (ctx, args) => {
  const token = await ctx.db.query("api_tokens").withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash)).unique();
  return isApiKeyActive(token) ? token : null;
} });
export const markUsed = internalMutation({ args: { id: v.id("api_tokens") }, handler: async (ctx, args) => {
  const token = await ctx.db.get(args.id); if (token && !token.revokedAt) await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
} });
export const consumeRateLimit = internalMutation({ args: { tokenId: v.id("api_tokens") }, handler: async (ctx, args) => {
  const now = Date.now(); const windowStart = now - (now % 60_000);
  const record = await ctx.db.query("api_rate_limits").withIndex("by_token", (q) => q.eq("tokenId", args.tokenId)).unique();
  if (!record) { await ctx.db.insert("api_rate_limits", { tokenId: args.tokenId, windowStart, count: 1 }); return { allowed: true, retryAfter: 60 }; }
  if (record.windowStart !== windowStart) { await ctx.db.patch(record._id, { windowStart, count: 1 }); return { allowed: true, retryAfter: 60 }; }
  if (record.count >= 60) return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowStart + 60_000 - now) / 1000)) };
  await ctx.db.patch(record._id, { count: record.count + 1 }); return { allowed: true, retryAfter: 60 };
} });
export const logAudit = internalMutation({ args: { requestId: v.string(), tokenId: v.id("api_tokens"), operation: v.string(), method: v.string(), path: v.string(), status: v.number(), scopeUsed: v.string() }, handler: (ctx, args) => ctx.db.insert("api_audit_log", { ...args, createdAt: Date.now() }) });
export const getIdempotency = internalQuery({ args: { tokenId: v.id("api_tokens"), method: v.string(), path: v.string(), key: v.string() }, handler: async (ctx, args) => {
  const row = await ctx.db.query("api_idempotency_keys").withIndex("by_token_method_path_key", (q) => q.eq("tokenId", args.tokenId).eq("method", args.method).eq("path", args.path).eq("key", args.key)).unique(); return row && row.expiresAt > Date.now() ? row : null;
} });
export const storeIdempotency = internalMutation({ args: { tokenId: v.id("api_tokens"), method: v.string(), path: v.string(), key: v.string(), bodyHash: v.string(), status: v.number(), responseJson: v.string() }, handler: (ctx, args) => ctx.db.insert("api_idempotency_keys", { ...args, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 }) });
