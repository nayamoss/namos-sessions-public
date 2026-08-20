import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { slackNotificationKindValidator } from "./slackIntegrations";

export const enqueueEventNotification = internalMutation({
  args: { eventId: v.id("events"), kind: slackNotificationKindValidator, title: v.string(), body: v.optional(v.string()), linkPath: v.optional(v.string()), relatedId: v.optional(v.string()), dedupeKey: v.string(), sourceNotificationId: v.optional(v.id("notifications")) },
  handler: async (ctx, args) => {
    const binding = await ctx.db.query("slack_channel_bindings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (!binding || !binding.notificationsEnabled || !binding.notificationKinds.includes(args.kind)) return { queued: false as const };
    const existing = await ctx.db.query("slack_delivery_outbox").withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey)).unique();
    if (existing) return { queued: false as const, outboxId: existing._id };
    const now = Date.now();
    const outboxId = await ctx.db.insert("slack_delivery_outbox", { ...args, bindingId: binding._id, status: "queued", attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.slackNotificationsActions.deliver, { outboxId });
    return { queued: true as const, outboxId };
  },
});

export const deliveryContext = internalQuery({
  args: { outboxId: v.id("slack_delivery_outbox") },
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId);
    if (!outbox) return null;
    const binding = await ctx.db.get(outbox.bindingId);
    if (!binding || binding.eventId !== outbox.eventId || !binding.notificationsEnabled || !binding.notificationKinds.includes(outbox.kind)) return { outbox, binding: null, workspace: null, event: null };
    const [workspace, event] = await Promise.all([ctx.db.get(binding.slackWorkspaceId), ctx.db.get(outbox.eventId)]);
    return { outbox, binding, workspace, event };
  },
});

export const claimDelivery = internalMutation({
  args: { outboxId: v.id("slack_delivery_outbox"), now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId);
    const now = args.now ?? Date.now();
    if (!outbox || outbox.status === "sent" || outbox.status === "sending" || outbox.attempts >= 4 || (outbox.nextAttemptAt && outbox.nextAttemptAt > now)) return false;
    await ctx.db.patch(outbox._id, { status: "sending", attempts: outbox.attempts + 1, nextAttemptAt: undefined, updatedAt: now });
    return true;
  },
});

export const markSent = internalMutation({
  args: { outboxId: v.id("slack_delivery_outbox"), slackMessageTs: v.string() },
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId);
    if (outbox) await ctx.db.patch(outbox._id, { status: "sent", slackMessageTs: args.slackMessageTs, lastError: undefined, nextAttemptAt: undefined, updatedAt: Date.now() });
  },
});

export const markFailed = internalMutation({
  args: { outboxId: v.id("slack_delivery_outbox"), error: v.string(), nextAttemptAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId);
    if (outbox) await ctx.db.patch(outbox._id, { status: "failed", lastError: args.error.slice(0, 300), nextAttemptAt: args.nextAttemptAt, updatedAt: Date.now() });
  },
});
