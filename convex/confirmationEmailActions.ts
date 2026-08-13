"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { deliverEventEmail } from "./emailDelivery";

function confirmationMessage(input: {
  speakerName: string;
  eventName: string;
  sessionTitle: string;
  portalUrl: string;
}) {
  return {
    subject: `We received your submission for ${input.eventName}`,
    text: `Hi ${input.speakerName},\n\nThanks for submitting “${input.sessionTitle}” to ${input.eventName}. We’ll email you when there is an update.\n\nYou can review your submission and complete speaker tasks here: ${input.portalUrl}\n`,
  };
}

export const deliver = internalAction({
  args: { confirmationToken: v.string() },
  handler: async (ctx, args) => {
    const context = await ctx.runMutation(internal.publicForms.claimConfirmationInternal, args);
    if (!context) return { status: "already_processed" as const };

    let portalUrl: string;
    try {
      portalUrl = new URL("/portal", process.env.PUBLIC_APP_ORIGIN).toString();
    } catch {
      await ctx.runMutation(internal.publicForms.recordConfirmationDeliveryInternal, {
        commsLogId: context.commsLogId,
        status: "failed",
        error: "PUBLIC_APP_ORIGIN is not configured.",
      });
      return { status: "failed" as const };
    }

    const email = confirmationMessage({
      speakerName: context.speakerName,
      eventName: context.eventName,
      sessionTitle: context.sessionTitle,
      portalUrl,
    });
    try {
      await deliverEventEmail(ctx, context.eventId, { to: context.toEmail, ...email });
      await ctx.runMutation(internal.publicForms.recordConfirmationDeliveryInternal, {
        commsLogId: context.commsLogId,
        status: "sent",
      });
      return { status: "sent" as const };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "Email delivery failed.";
      await ctx.runMutation(internal.publicForms.recordConfirmationDeliveryInternal, {
        commsLogId: context.commsLogId,
        status: "failed",
        error,
      });
      return { status: "failed" as const };
    }
  },
});
