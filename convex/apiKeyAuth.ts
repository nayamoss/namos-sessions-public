import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export async function hashApiKey(rawKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(rawKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isApiKeyActive(key: { revokedAt?: number } | null): boolean {
  return Boolean(key && !key.revokedAt);
}

export const findActive = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db.query("api_keys").withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash)).unique();
    return isApiKeyActive(key) ? key : null;
  },
});

export const markUsed = internalMutation({
  args: { id: v.id("api_keys") },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.id);
    if (key && !key.revokedAt) await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
  },
});
