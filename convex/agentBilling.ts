import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const monthStart = (now: number) => {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

export const allowance = internalQuery({
  args: { billingOwnerUserId: v.string(), now: v.optional(v.number()) },
  handler: async (ctx, args) =>
    ctx.db.query("agent_managed_allowances")
      .withIndex("by_owner_period", (q) => q.eq("billingOwnerUserId", args.billingOwnerUserId).eq("periodStart", monthStart(args.now ?? Date.now())))
      .unique(),
});

// Reservation is intentionally a mutation: concurrent model starts can never both spend the
// last run or token allowance.
export const reserve = internalMutation({
  args: { runId: v.id("agent_runs"), billingOwnerUserId: v.string(), planSlug: v.string(), runLimit: v.number(), tokenLimit: v.number(), reserveTokens: v.number() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Agent run no longer exists.");
    if (run.managedAllowanceId) return { allowanceId: run.managedAllowanceId, reserveTokens: run.managedReservedTokens ?? 0 };
    const now = Date.now();
    const periodStart = monthStart(now);
    const runLimit = Math.max(0, Math.floor(args.runLimit));
    const tokenLimit = Math.max(0, Math.floor(args.tokenLimit));
    const reserveTokens = Math.max(1, Math.min(tokenLimit, Math.floor(args.reserveTokens)));
    let allowance = await ctx.db.query("agent_managed_allowances")
      .withIndex("by_owner_period", (q) => q.eq("billingOwnerUserId", args.billingOwnerUserId).eq("periodStart", periodStart))
      .unique();
    if (!allowance) {
      const allowanceId = await ctx.db.insert("agent_managed_allowances", { billingOwnerUserId: args.billingOwnerUserId, periodStart, planSlug: args.planSlug, runLimit, tokenLimit, reservedRuns: 0, reservedTokens: 0, usedRuns: 0, usedTokens: 0, createdAt: now, updatedAt: now });
      allowance = await ctx.db.get(allowanceId);
    }
    if (!allowance) throw new Error("Could not create the managed AI allowance.");
    if (allowance.usedRuns + allowance.reservedRuns + 1 > allowance.runLimit) throw new Error("Your Namos plan has reached its monthly Operations Agent run allowance.");
    if (allowance.usedTokens + allowance.reservedTokens + reserveTokens > allowance.tokenLimit) throw new Error("Your Namos plan has reached its monthly Operations Agent token allowance.");
    await ctx.db.patch(allowance._id, { reservedRuns: allowance.reservedRuns + 1, reservedTokens: allowance.reservedTokens + reserveTokens, updatedAt: now });
    await ctx.db.patch(run._id, { billingOwnerUserId: args.billingOwnerUserId, managedAllowanceId: allowance._id, managedReservedTokens: reserveTokens, updatedAt: now });
    return { allowanceId: allowance._id, reserveTokens };
  },
});

export const settle = internalMutation({
  args: { runId: v.id("agent_runs"), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run?.managedAllowanceId) return;
    const allowance = await ctx.db.get(run.managedAllowanceId);
    if (!allowance) return;
    const existing = await ctx.db.query("agent_usage_records").withIndex("by_run", (q) => q.eq("runId", run._id)).first();
    if (existing?.billable && existing.settledAt) return;
    const actualTokens = Math.max(0, Math.floor(args.inputTokens)) + Math.max(0, Math.floor(args.outputTokens));
    const reserved = run.managedReservedTokens ?? 0;
    const now = Date.now();
    await ctx.db.patch(allowance._id, { reservedRuns: Math.max(0, allowance.reservedRuns - 1), reservedTokens: Math.max(0, allowance.reservedTokens - reserved), usedRuns: allowance.usedRuns + 1, usedTokens: allowance.usedTokens + actualTokens, updatedAt: now });
    if (existing) await ctx.db.patch(existing._id, { settledAt: now });
  },
});

// A provider failure must not strand the bounded reservation. The run itself remains in the
// audit timeline; no token claim is made when the provider did not return usage.
export const release = internalMutation({
  args: { runId: v.id("agent_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run?.managedAllowanceId) return;
    const allowance = await ctx.db.get(run.managedAllowanceId);
    if (!allowance) return;
    const usage = await ctx.db.query("agent_usage_records").withIndex("by_run", (q) => q.eq("runId", run._id)).first();
    if (usage?.settledAt) return;
    const now = Date.now();
    await ctx.db.patch(allowance._id, {
      reservedRuns: Math.max(0, allowance.reservedRuns - 1),
      reservedTokens: Math.max(0, allowance.reservedTokens - (run.managedReservedTokens ?? 0)),
      updatedAt: now,
    });
    if (usage) await ctx.db.patch(usage._id, { settledAt: now });
  },
});
