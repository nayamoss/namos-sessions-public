"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptSlackToken, safeSlackError } from "./slackSecurity";
import { postMessage, SlackApiError } from "./slackClient";
import { escapeSlack } from "./slackBlocks";

const retryDelays = [30_000, 120_000, 600_000];

export const deliver = internalAction({
  args: { outboxId: v.id("slack_delivery_outbox") },
  handler: async (ctx, args) => {
    if (!(await ctx.runMutation(internal.slackNotifications.claimDelivery, args))) return;
    const state = await ctx.runQuery(internal.slackNotifications.deliveryContext, args);
    if (!state?.binding || !state.workspace || state.workspace.status !== "connected" || !state.event) {
      await ctx.runMutation(internal.slackNotifications.markFailed, { outboxId: args.outboxId, error: "Slack binding is no longer active." });
      return;
    }
    const origin = process.env.PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
    const href = origin && state.outbox.linkPath ? `${origin}${state.outbox.linkPath.startsWith("/") ? state.outbox.linkPath : `/${state.outbox.linkPath}`}` : undefined;
    const fallback = `${state.event.name}: ${state.outbox.title}`.slice(0, 500);
    const blocks: Record<string, unknown>[] = [
      { type: "section", text: { type: "mrkdwn", text: `*${escapeSlack(state.outbox.title)}*${state.outbox.body ? `\n${escapeSlack(state.outbox.body).slice(0, 1800)}` : ""}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `${escapeSlack(state.event.name)} · ${escapeSlack(state.outbox.kind.replace(/_/g, " "))}` }] },
      ...(href ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Namos" }, url: href }] }] : []),
    ];
    try {
      const result = await postMessage(decryptSlackToken(state.workspace.botTokenEnvelope), { channel: state.binding.slackChannelId, text: fallback, blocks, clientMsgId: `namos-${state.outbox.dedupeKey}`.slice(0, 36) });
      await ctx.runMutation(internal.slackNotifications.markSent, { outboxId: args.outboxId, slackMessageTs: result.ts });
    } catch (error) {
      const refreshed = await ctx.runQuery(internal.slackNotifications.deliveryContext, args);
      const attempts = refreshed?.outbox.attempts ?? 4;
      const retryable = error instanceof SlackApiError && error.retryable && attempts < 4;
      const delay = error instanceof SlackApiError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : retryDelays[Math.max(0, attempts - 1)];
      const nextAttemptAt = retryable && delay ? Date.now() + delay : undefined;
      await ctx.runMutation(internal.slackNotifications.markFailed, { outboxId: args.outboxId, error: safeSlackError(error), ...(nextAttemptAt ? { nextAttemptAt } : {}) });
      if (retryable && delay) await ctx.scheduler.runAfter(delay, internal.slackNotificationsActions.deliver, args);
      else if (error instanceof SlackApiError && !error.retryable) await ctx.runMutation(internal.slackIntegrations.markWorkspaceError, { workspaceId: state.workspace._id, error: safeSlackError(error) });
    }
  },
});
