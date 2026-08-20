"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { assertEventOrganizerAction } from "./emailDelivery";
import { decryptSlackToken, encryptSlackToken, randomToken, safeSlackError, sha256Base64Url } from "./slackSecurity";
import { exchangeOAuthCode, getConversation, listConversations, postMessage, revokeToken, SlackApiError } from "./slackClient";
import { slackNotificationKindValidator } from "./slackIntegrations";

function config() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
  if (!clientId || !clientSecret || !site) throw new Error("Slack is not configured for this deployment.");
  return { clientId, clientSecret, redirectUri: `${site}/oauth/slack/callback` };
}

async function authorizedContext(ctx: ActionCtx, eventId: Id<"events">, ownerOnly = false) {
  const identity = await assertEventOrganizerAction(ctx, eventId);
  const result = await ctx.runQuery(internal.slackIntegrations.authorizationContext, { eventId, userId: identity.subject });
  if (ownerOnly && !result.canDisconnectWorkspace) throw new Error("Only an organization owner or admin can manage the Slack workspace connection.");
  return { identity, ...result };
}

export const startOAuth = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { identity, event } = await authorizedContext(ctx, args.eventId, true);
    const slack = config();
    const state = randomToken();
    const expiresAt = Date.now() + 10 * 60_000;
    await ctx.runMutation(internal.slackIntegrations.createOAuthState, { stateHash: sha256Base64Url(state), organizationId: event.organizationId, eventId: args.eventId, userId: identity.subject, expiresAt });
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.search = new URLSearchParams({ client_id: slack.clientId, scope: "app_mentions:read,chat:write,commands,channels:read,groups:read,im:history,im:read", redirect_uri: slack.redirectUri, state }).toString();
    return { url: url.toString(), expiresAt };
  },
});

export const completeOAuthCallback = internalAction({
  args: { state: v.string(), code: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const consumed = await ctx.runMutation(internal.slackIntegrations.consumeOAuthState, { stateHash: sha256Base64Url(args.state) });
    if (!consumed) throw new Error("invalid_state");
    if (args.error || !args.code) return { connected: false as const, eventSlug: consumed.eventSlug, reason: args.error === "access_denied" ? "access_denied" : "authorization_failed" };
    const slack = config();
    const installation = await exchangeOAuthCode({ clientId: slack.clientId, clientSecret: slack.clientSecret, code: args.code, redirectUri: slack.redirectUri });
    await ctx.runMutation(internal.slackIntegrations.upsertWorkspace, { organizationId: consumed.state.organizationId, slackTeamId: installation.teamId, slackTeamName: installation.teamName, botUserId: installation.botUserId, botTokenEnvelope: encryptSlackToken(installation.accessToken), scopes: installation.scopes, installedByUserId: consumed.state.userId });
    return { connected: true as const, eventSlug: consumed.eventSlug };
  },
});

export const listChannels = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { workspace } = await authorizedContext(ctx, args.eventId);
    if (!workspace || workspace.status !== "connected") throw new Error("Connect Slack before choosing a channel.");
    const channels = await listConversations(decryptSlackToken(workspace.botTokenEnvelope), 500);
    return { channels: channels.filter((channel) => !channel.isArchived).map(({ id, name, isPrivate, isMember }) => ({ id, name, isPrivate, isMember })) };
  },
});

export const saveBinding = action({
  args: { eventId: v.id("events"), channelId: v.string(), agentEnabled: v.boolean(), notificationsEnabled: v.boolean(), notificationKinds: v.array(slackNotificationKindValidator) },
  handler: async (ctx, args) => {
    const { identity, workspace } = await authorizedContext(ctx, args.eventId);
    if (!workspace || workspace.status !== "connected") throw new Error("Connect Slack before choosing a channel.");
    const channel = await getConversation(decryptSlackToken(workspace.botTokenEnvelope), args.channelId);
    if (channel.isArchived) throw new Error("Archived Slack channels cannot be connected.");
    if (channel.isPrivate && !channel.isMember) throw new Error("Invite Namos to this private channel before connecting it.");
    await ctx.runMutation(internal.slackIntegrations.saveBindingInternal, { ...args, slackWorkspaceId: workspace._id, slackChannelId: channel.id, slackChannelName: channel.name, isPrivate: channel.isPrivate, userId: identity.subject });
    return { status: "connected" as const, channelId: channel.id, channelName: channel.name, isPrivate: channel.isPrivate, updatedAt: Date.now() };
  },
});

export const disconnectWorkspace = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { workspace } = await authorizedContext(ctx, args.eventId, true);
    if (!workspace) return { disconnected: true as const };
    try { await revokeToken(decryptSlackToken(workspace.botTokenEnvelope)); } catch { /* Local cleanup is retry-safe even if Slack already revoked the token. */ }
    await ctx.runMutation(internal.slackIntegrations.deleteWorkspaceInternal, { workspaceId: workspace._id });
    return { disconnected: true as const };
  },
});

export const testNotification = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, workspace, binding } = await authorizedContext(ctx, args.eventId);
    if (!workspace || !binding || !binding.notificationsEnabled) throw new Error("Enable Slack notifications and save a channel before sending a test.");
    try {
      const result = await postMessage(decryptSlackToken(workspace.botTokenEnvelope), { channel: binding.slackChannelId, text: `Test — Slack notifications are connected for ${event.name}.`, blocks: [{ type: "section", text: { type: "mrkdwn", text: `*Test — Slack notifications are connected for ${event.name}.*` } }] });
      return { sent: true as const, slackMessageTs: result.ts };
    } catch (error) {
      if (error instanceof SlackApiError && !error.retryable) await ctx.runMutation(internal.slackIntegrations.markWorkspaceError, { workspaceId: workspace._id, error: safeSlackError(error) });
      throw new Error("The Slack test message could not be delivered. Check the workspace and channel connection.");
    }
  },
});
