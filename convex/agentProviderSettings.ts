import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { assertEventOrganizerAccess } from "./functions";

const mode = v.union(v.literal("managed"), v.literal("bring_your_own"));
const envelope = v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() });

export const status = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const stored = await ctx.db.query("agent_provider_settings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (!stored) return { eventId: args.eventId, mode: "managed" as const, provider: "openai" as const, status: process.env.OPENAI_API_KEY ? "ready" as const : "error" as const, managedAvailable: Boolean(process.env.OPENAI_API_KEY), updatedAt: 0 };
    return { eventId: stored.eventId, mode: stored.mode, provider: stored.provider, credentialHint: stored.credentialHint, status: stored.mode === "managed" && !process.env.OPENAI_API_KEY ? "error" as const : stored.status, lastError: stored.lastError, managedAvailable: Boolean(process.env.OPENAI_API_KEY), updatedAt: stored.updatedAt };
  },
});

export const getInternal = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => ctx.db.query("agent_provider_settings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique(),
});

export const upsertInternal = internalMutation({
  args: { eventId: v.id("events"), mode, credentialHint: v.optional(v.string()), credentialEnvelope: v.optional(envelope), status: v.union(v.literal("ready"), v.literal("error")), lastError: v.optional(v.string()), updatedByUserId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("agent_provider_settings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    const now = Date.now();
    const values = { ...args, provider: "openai" as const, updatedAt: now };
    if (existing) { await ctx.db.replace(existing._id, { ...values, createdAt: existing.createdAt }); return existing._id; }
    return ctx.db.insert("agent_provider_settings", { ...values, createdAt: now });
  },
});

export const recordUsage = internalMutation({
  args: { runId: v.id("agent_runs"), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Agent run no longer exists.");
    const providerMode = run.providerMode ?? "managed";
    return ctx.db.insert("agent_usage_records", { eventId: run.eventId, runId: run._id, providerMode, provider: "openai", model: run.model, inputTokens: Math.max(0, Math.floor(args.inputTokens)), outputTokens: Math.max(0, Math.floor(args.outputTokens)), billable: providerMode === "managed", createdAt: Date.now() });
  },
});
