import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { query, assertEventAccess } from "./functions";

const credentialEnvelope = v.object({
  version: v.literal(1),
  iv: v.string(),
  ciphertext: v.string(),
  tag: v.string(),
});
const provider = v.union(v.literal("notion"), v.literal("airtable"), v.literal("sanity"));
const authMethod = v.union(v.literal("notion_internal_token"), v.literal("notion_oauth"), v.literal("airtable_pat"), v.literal("airtable_oauth"), v.literal("sanity_token"));
const direction = v.union(v.literal("pull"), v.literal("push"));
const target = v.union(v.literal("speakers"), v.literal("submissions"), v.literal("public_program"));
const integrationStatus = v.union(v.literal("connected"), v.literal("error"));
const config = v.object({
  notionDatabaseId: v.optional(v.string()),
  airtableBaseId: v.optional(v.string()),
  airtableTableName: v.optional(v.string()),
  sanityProjectId: v.optional(v.string()),
  sanityDataset: v.optional(v.string()),
});

export const status = query({
  args: { eventId: v.id("events"), provider },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const integration = await ctx.db
      .query("content_integrations")
      .withIndex("by_event_provider", (q) => q.eq("eventId", args.eventId).eq("provider", args.provider))
      .unique();
    if (!integration) return null;
    const { credentialEnvelope: _envelope, ...safeIntegration } = integration;
    return safeIntegration;
  },
});

export const getInternal = internalQuery({
  args: { eventId: v.id("events"), provider },
  handler: async (ctx, args) =>
    ctx.db
      .query("content_integrations")
      .withIndex("by_event_provider", (q) => q.eq("eventId", args.eventId).eq("provider", args.provider))
      .unique(),
});

export const upsertInternal = internalMutation({
  args: {
    eventId: v.id("events"),
    provider,
    authMethod,
    direction,
    target,
    config,
    credentialHint: v.string(),
    credentialEnvelope,
    oauthExpiresAt: v.optional(v.number()),
    status: integrationStatus,
    lastError: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    lastSyncCursor: v.optional(v.string()),
    updatedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("content_integrations")
      .withIndex("by_event_provider", (q) => q.eq("eventId", args.eventId).eq("provider", args.provider))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("content_integrations", { ...args, createdAt: now, updatedAt: now });
  },
});

export const createOAuthStateInternal = internalMutation({ args: {
  stateHash: v.string(), provider: v.union(v.literal("notion"), v.literal("airtable")), eventId: v.id("events"), userId: v.string(),
  target: v.union(v.literal("speakers"), v.literal("submissions")), verifierEnvelope: v.optional(credentialEnvelope), expiresAt: v.number(),
}, handler: (ctx, args) => ctx.db.insert("content_oauth_states", { ...args, createdAt: Date.now() }) });

export const consumeOAuthStateInternal = internalMutation({ args: { stateHash: v.string() }, handler: async (ctx, args) => {
  const state = await ctx.db.query("content_oauth_states").withIndex("by_stateHash", q => q.eq("stateHash", args.stateHash)).unique();
  if (!state || state.expiresAt < Date.now()) { if (state) await ctx.db.delete(state._id); return null; }
  await ctx.db.delete(state._id); return state;
} });

export const createOAuthPendingInternal = internalMutation({ args: {
  pendingId: v.string(), provider: v.union(v.literal("notion"), v.literal("airtable")), eventId: v.id("events"), userId: v.string(),
  target: v.union(v.literal("speakers"), v.literal("submissions")), credentialEnvelope, oauthExpiresAt: v.optional(v.number()), expiresAt: v.number(),
}, handler: (ctx, args) => ctx.db.insert("content_oauth_pending", { ...args, createdAt: Date.now() }) });

export const consumeOAuthPendingInternal = internalMutation({ args: { pendingId: v.string(), userId: v.string(), provider: v.union(v.literal("notion"), v.literal("airtable")) }, handler: async (ctx, args) => {
  const pending = await ctx.db.query("content_oauth_pending").withIndex("by_pendingId", q => q.eq("pendingId", args.pendingId)).unique();
  if (!pending || pending.userId !== args.userId || pending.provider !== args.provider || pending.expiresAt < Date.now()) { if (pending && pending.expiresAt < Date.now()) await ctx.db.delete(pending._id); return null; }
  await ctx.db.delete(pending._id); return pending;
} });

export const getOAuthPendingInternal = internalQuery({ args: { pendingId: v.string(), userId: v.string(), provider: v.union(v.literal("notion"), v.literal("airtable")) }, handler: async (ctx, args) => {
  const pending = await ctx.db.query("content_oauth_pending").withIndex("by_pendingId", q => q.eq("pendingId", args.pendingId)).unique();
  return pending && pending.userId === args.userId && pending.provider === args.provider && pending.expiresAt >= Date.now() ? pending : null;
} });

export const removeInternal = internalMutation({
  args: { eventId: v.id("events"), provider },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("content_integrations")
      .withIndex("by_event_provider", (q) => q.eq("eventId", args.eventId).eq("provider", args.provider))
      .unique();
    if (integration) await ctx.db.delete(integration._id);
  },
});
