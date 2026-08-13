"use node";

// Confirmation email for a submitted portal form. Ported off the Netlify function
// (netlify/functions/portal-form-confirmation.mjs) onto the same Convex Node-action pattern as
// convex/confirmationEmailActions.ts: fire-and-forget, triggered server-side via ctx.scheduler
// from portalFormResponses.submit, never called directly by the browser. This keeps delivery
// host-portable — see convex/emailDelivery.ts for why nothing here is Netlify-specific.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { deliverEventEmail } from "./emailDelivery";

export const deliver = internalAction({
  args: { eventId: v.id("events"), formId: v.id("submission_forms"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.portalFormResponses.notificationContextInternal, args);
    if (!context.enabled) return { status: "disabled" as const };

    const subject = `We received your ${context.formTitle} form for ${context.eventName}`;
    const text =
      context.confirmationBody?.replace(/<[^>]*>/g, "").trim() ||
      `Hi ${context.speakerName},\n\nWe received your ${context.formTitle} form for ${context.eventName}.`;

    try {
      await deliverEventEmail(ctx, args.eventId, { to: context.toEmail, subject, text });
      await ctx.runMutation(internal.comms.recordDeliveryInternal, {
        eventId: args.eventId,
        speakerId: args.speakerId,
        channel: "email",
        status: "sent",
        toEmail: context.toEmail,
        subject,
      });
      return { status: "sent" as const };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "Email delivery failed.";
      await ctx.runMutation(internal.comms.recordDeliveryInternal, {
        eventId: args.eventId,
        speakerId: args.speakerId,
        channel: "email",
        status: "failed",
        toEmail: context.toEmail,
        subject,
        error,
      });
      return { status: "failed" as const };
    }
  },
});
