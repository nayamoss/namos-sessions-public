import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mutation, query, assertEventOrganizerAccess, isEventOrganizer, requireIdentity } from "./functions";
import { API_SCOPES } from "./apiKeyAuth";

const scopes = v.array(v.union(v.literal("events:read"), v.literal("submissions:read"), v.literal("submissions:write"), v.literal("speakers:read"), v.literal("agenda:read"), v.literal("tasks:read")));

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return (await ctx.db.query("api_tokens").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect())
      .filter((token) => !token.revokedAt)
      .map(({ keyHash: _hash, ...token }) => token)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const revoke = mutation({
  args: { eventId: v.id("events"), id: v.id("api_tokens") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const token = await ctx.db.get(args.id);
    if (!token || token.eventId !== args.eventId) throw new Error("API token not found for this event.");
    if (!token.revokedAt) await ctx.db.patch(args.id, { revokedAt: Date.now() });
  },
});

export const canManage = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => isEventOrganizer(ctx, args.eventId, await requireIdentity(ctx)),
});

export const storeInternal = internalMutation({
  args: { eventId: v.id("events"), label: v.string(), keyHash: v.string(), keyPrefix: v.string(), scopes, createdByUserId: v.string() },
  handler: (ctx, args) => ctx.db.insert("api_tokens", { ...args, createdAt: Date.now() }),
});

export const auditLog = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const tokens = await ctx.db.query("api_tokens").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    const tokenIds = new Set(tokens.map((token) => token._id));
    const labels = new Map(tokens.map((token) => [token._id, token.label]));
    const entries = await ctx.db.query("api_audit_log").withIndex("by_createdAt").order("desc").take(500);
    return entries
      .filter((entry) => tokenIds.has(entry.tokenId))
      .slice(0, 100)
      .map((entry) => ({ ...entry, tokenLabel: labels.get(entry.tokenId) ?? "Revoked token" }));
  },
});

export const backfillLegacyKeys = internalMutation({
  args: {},
  handler: async () => ({ migrated: 0, note: "Legacy api_keys were replaced by event-scoped api_tokens before this deployment; run this mutation only on the additive migration release." }),
});

export { API_SCOPES };
