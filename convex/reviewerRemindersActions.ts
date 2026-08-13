"use node";

// Organizer-triggered reminders for reviewers who are behind on an evaluation plan (issue #59).
//
// Deliberately a Convex Node action, not a Netlify function: the app has to stay portable to
// other hosts, and the send path already lives in Convex (convex/emailDelivery.ts, shared with
// emailIntegrationsActions.ts). ctx.auth gives this action a verified caller identity for free,
// so the organizer check is the same `organizers` table row every other surface uses.
//
// Nothing here is scheduled. There is no cron, no ctx.scheduler, no deadline model: an
// organizer presses a button, confirms inline, and mail goes out. An unattended send loop
// pointed at seed data is exactly the failure mode this feature must not have.

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { assertEventAccessAction, deliverEventEmail, providerNotConfigured } from "./emailDelivery";
import { reviewersBelowThreshold, type ReviewerProgressRow } from "../src/lib/reviewer-progress";

export type ReminderResult = {
  reviewerUserId: string;
  toEmail?: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  reason?: string;
};

export type ReminderBatch = {
  status: "sent" | "failed" | "skipped";
  requested: number;
  sent: number;
  failed: number;
  skippedNoEmail: number;
  results: ReminderResult[];
};

// One message per reviewer, whatever their outstanding count — a reviewer with eight open
// items gets one email saying "8 of 9", never eight emails. No submission titles: that would
// leak other reviewers' scope and makes the message long for no gain.
function reminderMessage(row: ReviewerProgressRow, eventName: string, planName: string, queueUrl: string) {
  const plural = row.outstanding === 1 ? "" : "s";
  return {
    subject: `Reviews outstanding for ${eventName}`,
    text: [
      `Hi ${row.reviewerUserId},`,
      "",
      `You have ${row.outstanding} of ${row.assigned} assigned review${plural} still to complete for ${eventName} (${planName}).`,
      "",
      `Open your reviewer queue: ${queueUrl}`,
      "",
      "Thank you — the program committee.",
    ].join("\n"),
  };
}

export const send = action({
  args: {
    eventId: v.id("events"),
    evaluationPlanId: v.id("evaluation_plans"),
    queueUrl: v.string(),
    // Exactly one selector. The client never supplies a recipient list.
    reviewerUserId: v.optional(v.string()),
    thresholdPercent: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ReminderBatch> => {
    await assertEventAccessAction(ctx, args.eventId);
    const queueUrl = args.queueUrl.trim();
    if (!queueUrl) throw new Error("A reviewer queue link is required.");
    const single = args.reviewerUserId?.trim();
    const threshold = args.thresholdPercent;
    if ((single ? 1 : 0) + (threshold === undefined ? 0 : 1) !== 1) throw new Error("Send to one reviewer or to everyone below a threshold, not both.");
    if (threshold !== undefined && (!Number.isInteger(threshold) || threshold < 1 || threshold > 100)) throw new Error("The reminder threshold must be a whole number between 1 and 100.");

    // Authoritative re-read: a stale browser tab cannot mail a reviewer who has since finished,
    // and no address the client typed ever reaches the provider.
    const rows: ReviewerProgressRow[] = await ctx.runQuery(api.evaluations.reviewerProgress, { eventId: args.eventId, evaluationPlanId: args.evaluationPlanId });
    const selected = single ? rows.filter(row => row.reviewerUserId === single) : reviewersBelowThreshold(rows, threshold!);

    const event = await ctx.runQuery(api.events.get, { eventId: args.eventId });
    const plans = await ctx.runQuery(api.evaluations.listPlans, { eventId: args.eventId });
    const eventName = event?.name ?? "your event";
    const planName = plans.find((plan: { _id: string; name: string }) => plan._id === args.evaluationPlanId)?.name ?? "this evaluation plan";

    const results: ReminderResult[] = [];
    let sent = 0;
    let failed = 0;
    let skippedNoEmail = 0;
    let notConfigured = 0;

    // Sequential: batches are small at this scale, and it keeps provider rate limits and
    // comms_log ordering trivially safe. A failure never aborts the remaining recipients.
    for (const row of selected) {
      if (!row.emailResolved || !row.toEmail) {
        skippedNoEmail += 1;
        results.push({ reviewerUserId: row.reviewerUserId, status: "skipped", reason: "No email on file" });
        continue;
      }
      const message = reminderMessage(row, eventName, planName, queueUrl);
      let error: string | undefined;
      try {
        await deliverEventEmail(ctx, args.eventId, { to: row.toEmail, ...message });
        sent += 1;
        results.push({ reviewerUserId: row.reviewerUserId, toEmail: row.toEmail, status: "sent" });
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "The email provider rejected the message.";
        if (error === providerNotConfigured) notConfigured += 1;
        failed += 1;
        results.push({ reviewerUserId: row.reviewerUserId, toEmail: row.toEmail, status: "failed", error });
      }
      // Every attempt is logged, sent or failed. A logging outage must never turn a delivered
      // email into a reported failure, so the write is best effort.
      try {
        await ctx.runMutation(api.comms.recordDelivery, {
          eventId: args.eventId,
          channel: "email",
          status: error ? "failed" : "sent",
          toEmail: row.toEmail,
          subject: message.subject,
          ...(error ? { error: error.slice(0, 500) } : {}),
        });
      } catch { /* delivery already happened; the audit row is not worth failing the batch for */ }
    }

    // Every failure being "no provider" is a configuration state, not N separate errors — the
    // UI can then say so once instead of painting an identical red line per reviewer.
    const status: ReminderBatch["status"] = sent > 0 ? "sent" : (failed > 0 && notConfigured === failed) || selected.length === 0 || failed === 0 ? "skipped" : "failed";
    return { status, requested: selected.length, sent, failed, skippedNoEmail, results };
  },
});
