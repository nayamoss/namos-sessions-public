import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { mutation, requireIdentity } from "./functions";

export const notificationKind = v.union(
  v.literal("invite_sent"),
  v.literal("invite_accepted"),
  v.literal("invite_declined"),
  v.literal("member_removed"),
  v.literal("submission_received"),
  v.literal("submission_withdrawn"),
  v.literal("reviewer_assigned"),
  v.literal("evaluation_completed"),
  v.literal("decision_sent"),
  v.literal("comms_delivery_failed"),
);

export type NotificationKind =
  | "invite_sent"
  | "invite_accepted"
  | "invite_declined"
  | "member_removed"
  | "submission_received"
  | "submission_withdrawn"
  | "reviewer_assigned"
  | "evaluation_completed"
  | "decision_sent"
  | "comms_delivery_failed";

type NotificationCtx = MutationCtx | QueryCtx;

// Organizers of THIS event's organization only. This used to be query("organizers").collect(),
// which notified every organizer on the deployment about every event.
async function organizationOrganizerIds(ctx: NotificationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event?.organizationId) return [];
  const organizers = await ctx.db
    .query("organizers")
    .withIndex("by_organization", (q) => q.eq("organizationId", event.organizationId))
    .collect();
  return organizers.map((organizer) => organizer.userId).filter((userId) => !userId.startsWith("pending:"));
}

export async function eventOrganizers(ctx: NotificationCtx, eventId: Id<"events">) {
  const [members, organizerIds] = await Promise.all([
    ctx.db.query("event_members").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    organizationOrganizerIds(ctx, eventId),
  ]);
  return [...new Set([
    ...members.filter((member) => member.role === "organizer" && !member.userId.startsWith("pending:")).map((member) => member.userId),
    ...organizerIds,
  ])];
}

export async function eventMembers(ctx: NotificationCtx, eventId: Id<"events">) {
  const [members, organizerIds] = await Promise.all([
    ctx.db.query("event_members").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    organizationOrganizerIds(ctx, eventId),
  ]);
  return [...new Set([
    ...members.filter((member) => !member.userId.startsWith("pending:")).map((member) => member.userId),
    ...organizerIds,
  ])];
}

export async function notifyEvent(ctx: MutationCtx, args: {
  eventId: Id<"events">;
  kind: NotificationKind;
  title: string;
  body?: string;
  linkPath?: string;
  relatedId?: string;
  recipientUserIds: string[];
  highPriority?: boolean;
}): Promise<void> {
  try {
    const createdAt = Date.now();
    let sourceNotificationId: Id<"notifications"> | undefined;
    for (const recipientUserId of [...new Set(args.recipientUserIds)].filter(Boolean)) {
      const notificationId = await ctx.db.insert("notifications", {
        eventId: args.eventId,
        recipientUserId,
        kind: args.kind,
        title: args.title,
        ...(args.body ? { body: args.body } : {}),
        ...(args.linkPath ? { linkPath: args.linkPath } : {}),
        ...(args.relatedId ? { relatedId: args.relatedId } : {}),
        createdAt,
      });
      sourceNotificationId ??= notificationId;
      if (args.highPriority) {
        await ctx.scheduler.runAfter(0, internal.notificationEmailActions.sendHighPriorityEmail, { notificationId });
      }
    }
    if (["submission_received", "reviewer_assigned", "evaluation_completed", "decision_sent", "comms_delivery_failed"].includes(args.kind)) {
      const sourceKey = args.relatedId ?? args.linkPath ?? args.title;
      await ctx.scheduler.runAfter(0, internal.slackNotifications.enqueueEventNotification, {
        eventId: args.eventId,
        kind: args.kind as "submission_received" | "reviewer_assigned" | "evaluation_completed" | "decision_sent" | "comms_delivery_failed",
        title: args.title,
        ...(args.body ? { body: args.body } : {}),
        ...(args.linkPath ? { linkPath: args.linkPath } : {}),
        ...(args.relatedId ? { relatedId: args.relatedId } : {}),
        dedupeKey: `notification:${args.eventId}:${args.kind}:${sourceKey}`,
        ...(sourceNotificationId ? { sourceNotificationId } : {}),
      });
    }
  } catch (error) {
    console.error("Notification fan-out failed", error);
  }
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    return ctx.db.query("notifications")
      .withIndex("by_recipient", (q) => q.eq("recipientUserId", identity.subject))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return (await ctx.db.query("notifications")
      .withIndex("by_recipient_unread", (q) => q.eq("recipientUserId", identity.subject).eq("readAt", undefined))
      .collect()).length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.recipientUserId !== identity.subject) throw new Error("Notification not found.");
    if (!notification.readAt) await ctx.db.patch(args.notificationId, { readAt: Date.now() });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const notifications = await ctx.db.query("notifications")
      .withIndex("by_recipient_unread", (q) => q.eq("recipientUserId", identity.subject).eq("readAt", undefined))
      .collect();
    const readAt = Date.now();
    for (const notification of notifications) await ctx.db.patch(notification._id, { readAt });
  },
});

export const getForEmail = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    const organizer = await ctx.db.query("organizers").withIndex("by_userId", (q) => q.eq("userId", notification.recipientUserId)).unique();
    if (organizer) return { notification, email: organizer.email };
    const member = await ctx.db.query("event_members").withIndex("by_event_userId", (q) => q.eq("eventId", notification.eventId).eq("userId", notification.recipientUserId)).unique();
    return member ? { notification, email: member.email } : null;
  },
});

export const markEmailed = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (notification) await ctx.db.patch(args.notificationId, { emailedAt: Date.now() });
  },
});
