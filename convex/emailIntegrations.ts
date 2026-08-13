import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { mutation, query, assertEventAccess } from "./functions";

const credentialEnvelope = v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() });
const provider = v.union(v.literal("resend"), v.literal("ses"));
const authMethod = v.union(v.literal("resend_oauth"), v.literal("resend_api_key"), v.literal("ses_api"), v.literal("ses_smtp"));
const integrationStatus = v.union(v.literal("connected"), v.literal("error"));

function requireServiceSecret(secret: string) {
  const expected = process.env.EMAIL_INTEGRATION_SERVICE_SECRET;
  if (!expected || secret !== expected) throw new Error("Email integration service is not authorized.");
}

// The organizer-facing surface now lives in Convex itself: `status` below is gated by
// `assertOrganizer`, and convex/emailIntegrationsActions.ts owns save/test/disconnect,
// reaching this table through the `internal*` helpers at the bottom of this file. No shared
// secret is involved on that path because the caller is Convex, not an external service.
//
// The deprecated `*ForService` functions below have no current caller. They remain as an
// authenticated compatibility boundary for older external clients; nothing new should use them.
export const getForService = query({
  args: { eventId: v.id("events"), serviceSecret: v.string() },
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret);
    return ctx.db.query("email_integrations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
  },
});

export const upsertForService = mutation({
  args: {
    serviceSecret: v.string(), eventId: v.id("events"), provider, authMethod, sender: v.string(), region: v.optional(v.string()),
    credentialHint: v.string(), credentialEnvelope, status: integrationStatus, lastError: v.optional(v.string()), updatedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...values } = args;
    const existing = await ctx.db.query("email_integrations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...values, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("email_integrations", { ...values, createdAt: now, updatedAt: now });
  },
});

export const recordServiceError = mutation({
  args: { serviceSecret: v.string(), eventId: v.id("events"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret);
    const integration = await ctx.db.query("email_integrations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (!integration) return;
    await ctx.db.patch(integration._id, { status: args.error ? "error" : "connected", lastError: args.error?.slice(0, 500), updatedAt: Date.now() });
  },
});

export const removeForService = mutation({
  args: { serviceSecret: v.string(), eventId: v.id("events") },
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret);
    const integration = await ctx.db.query("email_integrations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (integration) await ctx.db.delete(integration._id);
  },
});

// --- Organizer-facing surface -------------------------------------------------------------

// Never returns credentialEnvelope: the settings screen only ever needs to know which provider
// is connected and how, not the secret behind it.
export const status = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const integration = await ctx.db.query("email_integrations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (!integration) return null;
    const { credentialEnvelope: _envelope, ...rest } = integration;
    return rest;
  },
});

// --- Internal helpers for convex/emailIntegrationsActions.ts ------------------------------
// Internal functions are unreachable from any client; the calling action does the organizer
// check before it ever reaches them.

export const getInternal = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) =>
    ctx.db.query("email_integrations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique(),
});

export const upsertInternal = internalMutation({
  args: {
    eventId: v.id("events"), provider, authMethod, sender: v.string(), region: v.optional(v.string()),
    credentialHint: v.string(), credentialEnvelope, status: integrationStatus, lastError: v.optional(v.string()), updatedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("email_integrations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("email_integrations", { ...args, createdAt: now, updatedAt: now });
  },
});

export const removeInternal = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const integration = await ctx.db.query("email_integrations").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (integration) await ctx.db.delete(integration._id);
  },
});
