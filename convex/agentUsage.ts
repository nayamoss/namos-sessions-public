import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertEventOrganizerAccess } from "./functions";

const DAY_MS = 24 * 60 * 60 * 1000;

const monthStart = (now: number) => {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

// Read-side aggregation over the append-only agent_usage_records ledger. Namos does not log a
// per-call dollar cost (see agent_usage_records in schema.ts), so this reports tokens and
// requests rather than fabricating a price for models that have no published rate card.
export const stats = query({
  args: { eventId: v.id("events"), days: v.optional(v.number()) },
  handler: async (ctx, { eventId, days }) => {
    await assertEventOrganizerAccess(ctx, eventId);
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found.");
    const rangeDays = Math.max(1, Math.min(90, Math.floor(days ?? 30)));
    const cutoff = Date.now() - rangeDays * DAY_MS;

    const [records, runs, allowance] = await Promise.all([
      ctx.db.query("agent_usage_records").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
      ctx.db.query("agent_runs").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
      event.billingOwnerUserId
        ? ctx.db.query("agent_managed_allowances")
            .withIndex("by_owner_period", (q) => q.eq("billingOwnerUserId", event.billingOwnerUserId!).eq("periodStart", monthStart(Date.now())))
            .unique()
        : Promise.resolve(null),
    ]);

    const inRange = records.filter((r) => r.createdAt >= cutoff);

    let inputTokens = 0;
    let outputTokens = 0;
    const byDay = new Map<string, { requests: number; inputTokens: number; outputTokens: number }>();
    const byModel = new Map<string, { requests: number; tokens: number }>();
    const byProvider = new Map<string, { requests: number; inputTokens: number; outputTokens: number; billable: number }>();

    for (const r of inRange) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;

      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      const d = byDay.get(day) ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
      d.requests += 1;
      d.inputTokens += r.inputTokens;
      d.outputTokens += r.outputTokens;
      byDay.set(day, d);

      const m = byModel.get(r.model) ?? { requests: 0, tokens: 0 };
      m.requests += 1;
      m.tokens += r.inputTokens + r.outputTokens;
      byModel.set(r.model, m);

      const p = byProvider.get(r.provider) ?? { requests: 0, inputTokens: 0, outputTokens: 0, billable: 0 };
      p.requests += 1;
      p.inputTokens += r.inputTokens;
      p.outputTokens += r.outputTokens;
      if (r.billable) p.billable += 1;
      byProvider.set(r.provider, p);
    }

    const dailyTrend = Array.from({ length: rangeDays }, (_, i) => {
      const date = new Date(cutoff + i * DAY_MS).toISOString().slice(0, 10);
      const row = byDay.get(date);
      return { date, requests: row?.requests ?? 0, tokens: (row?.inputTokens ?? 0) + (row?.outputTokens ?? 0) };
    });

    const modelBreakdown = Array.from(byModel.entries())
      .map(([model, v]) => ({ model, requests: v.requests, tokens: v.tokens }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);

    const providerBreakdown = Array.from(byProvider.entries()).map(([provider, v]) => ({
      provider,
      requests: v.requests,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      totalTokens: v.inputTokens + v.outputTokens,
      billableRequests: v.billable,
    }));

    const runsInRange = runs.filter((r) => r.createdAt >= cutoff);
    const failedRuns = runsInRange.filter((r) => r.status === "failed").length;
    const completedRuns = runsInRange.filter((r) => r.status === "completed").length;

    return {
      rangeDays,
      totalRequests: inRange.length,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      runsStarted: runsInRange.length,
      completedRuns,
      failedRuns,
      successRate: runsInRange.length === 0 ? null : completedRuns / runsInRange.length,
      dailyTrend,
      modelBreakdown,
      providerBreakdown,
      allowance: allowance
        ? {
            planSlug: allowance.planSlug,
            runLimit: allowance.runLimit,
            tokenLimit: allowance.tokenLimit,
            usedRuns: allowance.usedRuns,
            usedTokens: allowance.usedTokens,
            reservedRuns: allowance.reservedRuns,
            reservedTokens: allowance.reservedTokens,
          }
        : null,
    };
  },
});
