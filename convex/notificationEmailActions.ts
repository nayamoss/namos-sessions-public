"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { deliverEventEmail } from "./emailDelivery";
import { v } from "convex/values";

export const sendHighPriorityEmail = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    try {
      const record = await ctx.runQuery(internal.notifications.getForEmail, { notificationId: args.notificationId });
      if (!record?.email) return;
      await deliverEventEmail(ctx, record.notification.eventId, {
        to: record.email,
        subject: record.notification.title,
        text: [record.notification.title, record.notification.body].filter(Boolean).join("\n\n"),
      });
      await ctx.runMutation(internal.notifications.markEmailed, { notificationId: args.notificationId });
    } catch (error) {
      console.error("High-priority notification email failed", error);
    }
  },
});
