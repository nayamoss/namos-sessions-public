import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { assertEventOrganizerAccess, mutation } from "./functions";
import { isManagedAiDisabled } from "./managedAi";
import { hasUsableManagedOpenAiKey } from "./agentProviderConfig";

const mode = v.union(v.literal("managed"), v.literal("bring_your_own"));
const envelope = v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() });

export const status = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const stored = await ctx.db.query("agent_provider_settings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    const periodStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
    const usage = event.billingOwnerUserId
      ? await ctx.db.query("agent_managed_allowances").withIndex("by_owner_period", (q) => q.eq("billingOwnerUserId", event.billingOwnerUserId!).eq("periodStart", periodStart)).unique()
      : null;
    const managedDisabled = isManagedAiDisabled();
    const shared = { billingOwnerAssigned: Boolean(event.billingOwnerUserId), managedDisabled, managedUsage: usage ? { periodStart: usage.periodStart, planSlug: usage.planSlug, runLimit: usage.runLimit, tokenLimit: usage.tokenLimit, usedRuns: usage.usedRuns, usedTokens: usage.usedTokens, reservedRuns: usage.reservedRuns, reservedTokens: usage.reservedTokens } : undefined };
    const managedKeyAvailable = hasUsableManagedOpenAiKey(process.env.OPENAI_API_KEY);
    const managedAvailable = managedKeyAvailable && !managedDisabled;
    if (!stored) return { eventId: args.eventId, mode: "managed" as const, provider: "openai" as const, status: managedDisabled ? "disabled" as const : managedKeyAvailable ? "ready" as const : "error" as const, managedAvailable, updatedAt: 0, ...shared };
    const status = stored.mode === "managed"
      ? managedDisabled ? "disabled" as const : managedKeyAvailable ? stored.status : "error" as const
      : stored.status;
    return { eventId: stored.eventId, mode: stored.mode, provider: stored.provider, credentialHint: stored.credentialHint, status, lastError: stored.lastError, managedAvailable, updatedAt: stored.updatedAt, ...shared };
  },
});

// Legacy events predate immutable billing ownership. An installation owner can set it once;
// it is intentionally never transferable through the product UI.
export const assignBillingOwner = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const organizer = await ctx.db.query("organizers").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).unique();
    if (organizer?.role !== "owner") throw new Error("Only a Namos owner can assign a billing owner for an existing event.");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (event.billingOwnerUserId) return { billingOwnerAssigned: true };
    await ctx.db.patch(event._id, { billingOwnerUserId: identity.subject, updatedAt: Date.now() });
    return { billingOwnerAssigned: true };
  },
});

export const getInternal = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => ctx.db.query("agent_provider_settings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique(),
});

export const eventForBilling = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    return event ? { billingOwnerUserId: event.billingOwnerUserId } : null;
  },
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
    const inputTokens = Math.max(0, Math.floor(args.inputTokens));
    const outputTokens = Math.max(0, Math.floor(args.outputTokens));
    const existing = await ctx.db.query("agent_usage_records").withIndex("by_run", (q) => q.eq("runId", run._id)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { inputTokens: existing.inputTokens + inputTokens, outputTokens: existing.outputTokens + outputTokens });
      return { inputTokens: existing.inputTokens + inputTokens, outputTokens: existing.outputTokens + outputTokens };
    }
    await ctx.db.insert("agent_usage_records", { eventId: run.eventId, runId: run._id, providerMode, provider: "openai", model: run.model, inputTokens, outputTokens, billable: providerMode === "managed", createdAt: Date.now() });
    return { inputTokens, outputTokens };
  },
});
