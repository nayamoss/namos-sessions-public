"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { acknowledgementBlocks, decidedProposalBlocks, runUrl } from "./slackBlocks";
import { decryptSlackToken, randomToken, safeSlackError, sha256Base64Url } from "./slackSecurity";
import { postEphemeral, postMessage, updateMessage } from "./slackClient";

const eventEnvelope = v.object({ teamId: v.string(), eventId: v.string(), type: v.union(v.literal("app_mention"), v.literal("message")), userId: v.string(), channelId: v.string(), text: v.string(), ts: v.string(), threadTs: v.optional(v.string()), channelType: v.optional(v.string()), botId: v.optional(v.string()), subtype: v.optional(v.string()) });
const commandEnvelope = v.object({ teamId: v.string(), channelId: v.string(), userId: v.string(), subcommand: v.string(), objective: v.optional(v.string()), responseUrl: v.string() });
const interactionEnvelope = v.object({ teamId: v.string(), userId: v.string(), channelId: v.string(), messageTs: v.string(), threadTs: v.optional(v.string()), actionId: v.union(v.literal("namos_proposal_approve"), v.literal("namos_proposal_reject")), value: v.string() });

type ChannelContext = {
  workspace: Doc<"slack_workspaces">;
  binding: Doc<"slack_channel_bindings"> | null;
  mapping: Doc<"slack_user_mappings"> | null;
  event: Doc<"events"> | null;
  authorized: boolean;
  thread: Doc<"slack_agent_threads"> | null;
  run: Doc<"agent_runs"> | null;
};
type RunnableChannelContext = ChannelContext & {
  binding: Doc<"slack_channel_bindings">;
  mapping: Doc<"slack_user_mappings">;
  event: Doc<"events">;
};

function appOrigin() {
  const value = process.env.PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
  if (!value) throw new Error("PUBLIC_APP_ORIGIN is not configured.");
  return value;
}

async function finishReceipt(ctx: ActionCtx, receiptId: Id<"slack_request_receipts">, error?: unknown) {
  await ctx.runMutation(internal.slackInbound.markReceipt, { receiptId, status: error ? "failed" : "processed", ...(error ? { error: safeSlackError(error) } : {}) });
}

async function createLink(ctx: ActionCtx, context: ChannelContext, userId: string, channelId: string, directMessage: boolean) {
  if (!context.binding || !context.event) return;
  const token = randomToken();
  await ctx.runMutation(internal.slackIntegrations.linkTokenInternal, { tokenHash: sha256Base64Url(token), slackWorkspaceId: context.workspace._id, eventId: context.event._id, slackUserId: userId, expiresAt: Date.now() + 10 * 60_000 });
  const url = `${appOrigin()}/events/${encodeURIComponent(context.event.slug)}/settings/integrations?slack_link=${encodeURIComponent(token)}`;
  const text = "Link your Slack account to Namos before using event operations. This link expires in 10 minutes.";
  const blocks = [{ type: "section", text: { type: "mrkdwn", text } }, { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Link account" }, url }] }];
  if (directMessage) await postMessage(decryptSlackToken(context.workspace.botTokenEnvelope), { channel: channelId, text, blocks });
  else await postEphemeral(decryptSlackToken(context.workspace.botTokenEnvelope), { channel: channelId, user: userId, text, blocks });
}

async function startRun(ctx: ActionCtx, input: { context: RunnableChannelContext; userId: string; channelId: string; objective: string; idempotencyKey: string; threadTs?: string }) {
  const created = await ctx.runMutation(internal.slackAgent.createRunFromSlack, { eventId: input.context.event._id, requestedByUserId: input.context.mapping.namosUserId, objective: input.objective, idempotencyKey: input.idempotencyKey });
  const url = runUrl(input.context.event.slug, created.runId);
  const text = `Namos started an Operations Agent run for ${input.context.event.name}.`;
  const posted = await postMessage(decryptSlackToken(input.context.workspace.botTokenEnvelope), { channel: input.channelId, text, blocks: acknowledgementBlocks({ eventName: input.context.event.name, objective: input.objective, url }), ...(input.threadTs ? { threadTs: input.threadTs } : {}), clientMsgId: `namos-${input.idempotencyKey}`.slice(0, 36) });
  const rootThreadTs = input.threadTs ?? posted.ts;
  await ctx.runMutation(internal.slackAgent.mapThread, { eventId: input.context.event._id, agentRunId: created.runId, slackWorkspaceId: input.context.workspace._id, slackChannelId: input.channelId, slackThreadTs: rootThreadTs, slackUserId: input.userId });
  // Close the small race where a very fast/failed run reaches a terminal state before the
  // Slack thread mapping exists and the runtime's projection hook therefore has nothing to post.
  await ctx.scheduler.runAfter(0, internal.slackAgentActions.projectRunUpdate, { runId: created.runId });
}

export const processEvent = internalAction({
  args: { receiptId: v.id("slack_request_receipts"), envelope: eventEnvelope },
  handler: async (ctx, { receiptId, envelope }) => {
    try {
      if (envelope.botId || envelope.subtype || !envelope.userId) { await finishReceipt(ctx, receiptId); return; }
      let context: ChannelContext;
      const isDm = envelope.channelType === "im";
      if (isDm) {
        const dm = await ctx.runQuery(internal.slackInbound.dmContext, { slackTeamId: envelope.teamId, slackUserId: envelope.userId });
        if (!dm) { await finishReceipt(ctx, receiptId); return; }
        if (!dm.mapping) {
          // A DM has no event context from which to mint a scoped link safely.
          await postMessage(decryptSlackToken(dm.workspace.botTokenEnvelope), { channel: envelope.channelId, text: "Open an event's Slack integration settings and use Namos from its connected channel to link your account." });
          await finishReceipt(ctx, receiptId); return;
        }
        if (dm.matches.length !== 1) {
          await postMessage(decryptSlackToken(dm.workspace.botTokenEnvelope), { channel: envelope.channelId, text: "Choose an event from Namos and use its connected channel. Direct messages require exactly one active linked event." });
          await finishReceipt(ctx, receiptId); return;
        }
        context = { workspace: dm.workspace, mapping: dm.mapping, binding: dm.matches[0].binding, event: dm.matches[0].event, authorized: true, thread: null, run: null };
      } else {
        const root = envelope.threadTs ?? envelope.ts;
        context = await ctx.runQuery(internal.slackInbound.channelContext, { slackTeamId: envelope.teamId, slackChannelId: envelope.channelId, slackUserId: envelope.userId, slackThreadTs: root });
        if (!context?.binding || !context.event || !context.binding.agentEnabled) { await finishReceipt(ctx, receiptId); return; }
        if (!context.mapping) { await createLink(ctx, context, envelope.userId, envelope.channelId, false); await finishReceipt(ctx, receiptId); return; }
        if (!context.authorized) { await postEphemeral(decryptSlackToken(context.workspace.botTokenEnvelope), { channel: envelope.channelId, user: envelope.userId, text: "Your Namos event access is no longer active." }); await finishReceipt(ctx, receiptId); return; }
      }
      const objective = envelope.text.replace(new RegExp(`<@${context.workspace.botUserId}>`, "g"), "").trim();
      if (!objective || objective.length > 4000) { await postEphemeral(decryptSlackToken(context.workspace.botTokenEnvelope), { channel: envelope.channelId, user: envelope.userId, text: objective ? "Objectives are limited to 4,000 characters." : "Tell Namos what you want to inspect or prepare." }); await finishReceipt(ctx, receiptId); return; }
      const root = envelope.threadTs ?? envelope.ts;
      if (context.thread && context.run?.status === "needs_input") {
        await ctx.runMutation(internal.slackAgent.respondFromSlack, { eventId: context.event._id, runId: context.run._id, requestedByUserId: context.mapping.namosUserId, message: objective, idempotencyKey: `slack-event-${envelope.eventId}-${envelope.ts}` });
      } else {
        await startRun(ctx, { context: context as RunnableChannelContext, userId: envelope.userId, channelId: envelope.channelId, objective, idempotencyKey: `slack-event-${envelope.eventId}`, threadTs: root });
      }
      await finishReceipt(ctx, receiptId);
    } catch (error) { await finishReceipt(ctx, receiptId, error); }
  },
});

async function respondUrl(url: string, payload: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error("Slack command response failed.");
}

export const processCommand = internalAction({
  args: { receiptId: v.id("slack_request_receipts"), envelope: commandEnvelope },
  handler: async (ctx, { receiptId, envelope }) => {
    try {
      if (envelope.subcommand === "help") { await finishReceipt(ctx, receiptId); return; }
      const context = await ctx.runQuery(internal.slackInbound.channelContext, { slackTeamId: envelope.teamId, slackChannelId: envelope.channelId, slackUserId: envelope.userId });
      if (!context?.binding || !context.event) { await respondUrl(envelope.responseUrl, { response_type: "ephemeral", replace_original: true, text: "This channel is not connected to a Namos event." }); await finishReceipt(ctx, receiptId); return; }
      if (!context.mapping) { await createLink(ctx, context, envelope.userId, envelope.channelId, false); await respondUrl(envelope.responseUrl, { response_type: "ephemeral", replace_original: true, text: "Link your Slack account using the private action sent in this channel." }); await finishReceipt(ctx, receiptId); return; }
      if (!context.authorized) { await respondUrl(envelope.responseUrl, { response_type: "ephemeral", replace_original: true, text: "Your Namos event access is no longer active." }); await finishReceipt(ctx, receiptId); return; }
      const eventUrl = `${appOrigin()}/events/${encodeURIComponent(context.event.slug)}/operations-agent`;
      if (envelope.subcommand === "status") {
        await respondUrl(envelope.responseUrl, { response_type: "ephemeral", replace_original: true, text: `${context.event.name}: Slack is connected to #${context.binding.slackChannelName}. Operations Agent is ${context.binding.agentEnabled ? "on" : "off"}. ${eventUrl}` });
        await finishReceipt(ctx, receiptId); return;
      }
      if (!context.binding.agentEnabled) { await respondUrl(envelope.responseUrl, { response_type: "ephemeral", replace_original: true, text: `Operations Agent is off for this event. ${appOrigin()}/events/${context.event.slug}/settings/integrations` }); await finishReceipt(ctx, receiptId); return; }
      await startRun(ctx, { context: context as RunnableChannelContext, userId: envelope.userId, channelId: envelope.channelId, objective: envelope.objective!, idempotencyKey: `slack-command-${receiptId}` });
      await respondUrl(envelope.responseUrl, { response_type: "ephemeral", replace_original: true, text: "Namos started the run in a new channel thread." });
      await finishReceipt(ctx, receiptId);
    } catch (error) { await finishReceipt(ctx, receiptId, error); }
  },
});

export const processInteraction = internalAction({
  args: { receiptId: v.id("slack_request_receipts"), envelope: interactionEnvelope },
  handler: async (ctx, { receiptId, envelope }) => {
    try {
      let value: { proposalId?: string; expectedPayloadHash?: string; eventId?: string };
      try { value = JSON.parse(Buffer.from(envelope.value, "base64url").toString("utf8")); } catch { throw new Error("Invalid Slack proposal action."); }
      if (!value.proposalId || !value.expectedPayloadHash || !value.eventId) throw new Error("Invalid Slack proposal action.");
      const context = await ctx.runQuery(internal.slackInbound.channelContext, { slackTeamId: envelope.teamId, slackChannelId: envelope.channelId, slackUserId: envelope.userId });
      if (!context?.binding || !context.event || !context.mapping || !context.authorized || context.event._id !== value.eventId) throw new Error("This proposal action is not authorized.");
      const proposalContext = await ctx.runQuery(internal.slackAgent.proposalContext, { proposalId: value.proposalId, eventId: context.event._id });
      if (!proposalContext) throw new Error("This proposal action is no longer available.");
      const url = runUrl(context.event.slug, proposalContext.runId);
      if (envelope.actionId === "namos_proposal_approve") await ctx.runMutation(internal.slackAgent.approveFromSlack, { eventId: context.event._id, proposalId: value.proposalId, expectedPayloadHash: value.expectedPayloadHash, requestedByUserId: context.mapping.namosUserId });
      else await ctx.runMutation(internal.slackAgent.rejectFromSlack, { eventId: context.event._id, proposalId: value.proposalId, requestedByUserId: context.mapping.namosUserId });
      const decision = envelope.actionId === "namos_proposal_approve" ? "Applied" : "Rejected";
      await updateMessage(decryptSlackToken(context.workspace.botTokenEnvelope), { channel: envelope.channelId, ts: envelope.messageTs, text: `${decision} by ${envelope.userId}`, blocks: decidedProposalBlocks({ text: decision, slackUserId: envelope.userId, url }) });
      await finishReceipt(ctx, receiptId);
    } catch (error) { await finishReceipt(ctx, receiptId, error); }
  },
});
