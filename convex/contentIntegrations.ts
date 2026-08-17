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
const authMethod = v.union(v.literal("notion_internal_token"), v.literal("airtable_pat"), v.literal("sanity_token"));
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
