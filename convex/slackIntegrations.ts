import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertEventOrganizerAccess } from "./functions";

export const slackNotificationKindValidator = v.union(
  v.literal("submission_received"),
  v.literal("reviewer_assigned"),
  v.literal("evaluation_completed"),
  v.literal("decision_sent"),
  v.literal("comms_delivery_failed"),
);

const notificationKinds = v.array(slackNotificationKindValidator);
const envelope = v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() });

async function sha256Base64Url(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const base64 = btoa(String.fromCharCode(...digest));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function validateCapabilities(agentEnabled: boolean, notificationsEnabled: boolean, kinds: string[]) {
  if (!agentEnabled && !notificationsEnabled) throw new Error("Turn on the Operations Agent or event notifications.");
  if (notificationsEnabled && kinds.length === 0) throw new Error("Choose at least one Slack notification type.");
  if (!notificationsEnabled && kinds.length > 0) throw new Error("Notification types require event notifications to be enabled.");
  if (new Set(kinds).size !== kinds.length) throw new Error("Slack notification types must be unique.");
}

async function contextForEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, userId?: string) {
  const event = await ctx.db.get(eventId);
  if (!event?.organizationId) throw new Error("This event is not attached to an organization.");
  const workspace = await ctx.db.query("slack_workspaces").withIndex("by_organization", (q) => q.eq("organizationId", event.organizationId)).unique();
  const binding = await ctx.db.query("slack_channel_bindings").withIndex("by_event", (q) => q.eq("eventId", eventId)).unique();
  const orgRole = userId ? await ctx.db.query("organizers").withIndex("by_org_userId", (q) => q.eq("organizationId", event.organizationId).eq("userId", userId)).unique() : null;
  return { event, workspace, binding, canDisconnectWorkspace: Boolean(orgRole && (orgRole.role === "owner" || orgRole.role === "admin")) };
}

export const status = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const { workspace, binding, canDisconnectWorkspace } = await contextForEvent(ctx, args.eventId, identity.subject);
    if (!workspace) return { state: "not_connected" as const };
    const base = {
      workspaceId: workspace._id,
      teamId: workspace.slackTeamId,
      teamName: workspace.slackTeamName,
      canDisconnectWorkspace,
      ...(workspace.lastError ? { lastError: workspace.lastError } : {}),
      updatedAt: workspace.updatedAt,
    };
    if (!binding) return { state: "workspace_connected" as const, ...base };
    return {
      state: workspace.status === "error" ? "error" as const : "connected" as const,
      ...base,
      channelId: binding.slackChannelId,
      channelName: binding.slackChannelName,
      isPrivate: binding.isPrivate,
      agentEnabled: binding.agentEnabled,
      notificationsEnabled: binding.notificationsEnabled,
      notificationKinds: binding.notificationKinds,
      updatedAt: Math.max(workspace.updatedAt, binding.updatedAt),
    };
  },
});

export const authorizationContext = internalQuery({
  args: { eventId: v.id("events"), userId: v.string() },
  handler: (ctx, args) => contextForEvent(ctx, args.eventId, args.userId),
});

export const workspaceForEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => contextForEvent(ctx, args.eventId),
});

export const workspaceByTeam = internalQuery({
  args: { slackTeamId: v.string() },
  handler: (ctx, args) => ctx.db.query("slack_workspaces").withIndex("by_team", (q) => q.eq("slackTeamId", args.slackTeamId)).unique(),
});

export const createOAuthState = internalMutation({
  args: { stateHash: v.string(), organizationId: v.id("organizations"), eventId: v.id("events"), userId: v.string(), expiresAt: v.number() },
  handler: (ctx, args) => ctx.db.insert("slack_oauth_states", { ...args, createdAt: Date.now() }),
});

export const consumeOAuthState = internalMutation({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db.query("slack_oauth_states").withIndex("by_state_hash", (q) => q.eq("stateHash", args.stateHash)).unique();
    if (!state) return null;
    await ctx.db.delete(state._id);
    if (state.expiresAt < Date.now()) return null;
    const event = await ctx.db.get(state.eventId);
    const organizer = await ctx.db.query("organizers").withIndex("by_org_userId", (q) => q.eq("organizationId", state.organizationId).eq("userId", state.userId)).unique();
    if (!event || event.organizationId !== state.organizationId || !organizer || (organizer.role !== "owner" && organizer.role !== "admin")) return null;
    return { state, eventSlug: event.slug };
  },
});

export const upsertWorkspace = internalMutation({
  args: { organizationId: v.id("organizations"), slackTeamId: v.string(), slackTeamName: v.string(), botUserId: v.string(), botTokenEnvelope: envelope, scopes: v.array(v.string()), installedByUserId: v.string() },
  handler: async (ctx, args) => {
    const teamOwner = await ctx.db.query("slack_workspaces").withIndex("by_team", (q) => q.eq("slackTeamId", args.slackTeamId)).unique();
    if (teamOwner && teamOwner.organizationId !== args.organizationId) throw new Error("This Slack workspace is already connected to another organization.");
    const existing = await ctx.db.query("slack_workspaces").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).unique();
    const now = Date.now();
    if (existing) {
      if (existing.slackTeamId !== args.slackTeamId) throw new Error("Disconnect the current Slack workspace before connecting another one.");
      await ctx.db.patch(existing._id, { ...args, status: "connected", lastError: undefined, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert("slack_workspaces", { ...args, status: "connected", createdAt: now, updatedAt: now });
  },
});

export const saveBindingInternal = internalMutation({
  args: { eventId: v.id("events"), slackWorkspaceId: v.id("slack_workspaces"), slackChannelId: v.string(), slackChannelName: v.string(), isPrivate: v.boolean(), agentEnabled: v.boolean(), notificationsEnabled: v.boolean(), notificationKinds, userId: v.string() },
  handler: async (ctx, args) => {
    validateCapabilities(args.agentEnabled, args.notificationsEnabled, args.notificationKinds);
    const event = await ctx.db.get(args.eventId);
    const workspace = await ctx.db.get(args.slackWorkspaceId);
    if (!event?.organizationId || !workspace || workspace.organizationId !== event.organizationId || workspace.status !== "connected") throw new Error("Slack is not connected for this organization.");
    const conflict = await ctx.db.query("slack_channel_bindings").withIndex("by_workspace_channel", (q) => q.eq("slackWorkspaceId", args.slackWorkspaceId).eq("slackChannelId", args.slackChannelId)).unique();
    if (conflict && conflict.eventId !== args.eventId) throw new Error("This channel is already connected to another Namos event.");
    const existing = await ctx.db.query("slack_channel_bindings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    const now = Date.now();
    const fields = { organizationId: event.organizationId, eventId: args.eventId, slackWorkspaceId: args.slackWorkspaceId, slackChannelId: args.slackChannelId, slackChannelName: args.slackChannelName, isPrivate: args.isPrivate, agentEnabled: args.agentEnabled, notificationsEnabled: args.notificationsEnabled, notificationKinds: args.notificationKinds, createdByUserId: existing?.createdByUserId ?? args.userId, updatedAt: now };
    if (existing) { await ctx.db.patch(existing._id, fields); return existing._id; }
    return ctx.db.insert("slack_channel_bindings", { ...fields, createdAt: now });
  },
});

export const updateBinding = mutation({
  args: { eventId: v.id("events"), agentEnabled: v.boolean(), notificationsEnabled: v.boolean(), notificationKinds },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    validateCapabilities(args.agentEnabled, args.notificationsEnabled, args.notificationKinds);
    const binding = await ctx.db.query("slack_channel_bindings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (!binding) throw new Error("Choose a Slack channel first.");
    const updatedAt = Date.now();
    await ctx.db.patch(binding._id, { agentEnabled: args.agentEnabled, notificationsEnabled: args.notificationsEnabled, notificationKinds: args.notificationKinds, updatedAt });
    return { updatedAt };
  },
});

export const removeBinding = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const binding = await ctx.db.query("slack_channel_bindings").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (!binding) return { removed: false };
    const [threads, tokens, outbox] = await Promise.all([
      ctx.db.query("slack_agent_threads").filter((q) => q.eq(q.field("eventId"), args.eventId)).collect(),
      ctx.db.query("slack_link_tokens").filter((q) => q.eq(q.field("eventId"), args.eventId)).collect(),
      ctx.db.query("slack_delivery_outbox").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    for (const row of [...threads, ...tokens, ...outbox]) await ctx.db.delete(row._id);
    await ctx.db.delete(binding._id);
    return { removed: true };
  },
});

export const linkTokenInternal = internalMutation({
  args: { tokenHash: v.string(), slackWorkspaceId: v.id("slack_workspaces"), eventId: v.id("events"), slackUserId: v.string(), expiresAt: v.number() },
  handler: (ctx, args) => ctx.db.insert("slack_link_tokens", { ...args, createdAt: Date.now() }),
});

export const claimLink = mutation({
  args: { eventId: v.id("events"), token: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const tokenHash = await sha256Base64Url(args.token);
    const token = await ctx.db.query("slack_link_tokens").withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash)).unique();
    if (!token || token.eventId !== args.eventId || token.consumedAt || token.expiresAt < Date.now()) throw new Error("This Slack account link is invalid or expired.");
    const workspace = await ctx.db.get(token.slackWorkspaceId);
    const event = await ctx.db.get(args.eventId);
    if (!workspace || !event?.organizationId || workspace.organizationId !== event.organizationId) throw new Error("This Slack account link is invalid or expired.");
    const now = Date.now();
    const existing = await ctx.db.query("slack_user_mappings").withIndex("by_workspace_user", (q) => q.eq("slackWorkspaceId", token.slackWorkspaceId).eq("slackUserId", token.slackUserId)).unique();
    if (existing) await ctx.db.patch(existing._id, { namosUserId: identity.subject, lastVerifiedAt: now });
    else await ctx.db.insert("slack_user_mappings", { organizationId: workspace.organizationId, slackWorkspaceId: workspace._id, slackUserId: token.slackUserId, namosUserId: identity.subject, linkedAt: now, lastVerifiedAt: now });
    await ctx.db.patch(token._id, { consumedAt: now });
    return { linked: true as const, teamName: workspace.slackTeamName };
  },
});

export const deleteWorkspaceInternal = internalMutation({
  args: { workspaceId: v.id("slack_workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) return;
    const bindings = await ctx.db.query("slack_channel_bindings").withIndex("by_workspace", (q) => q.eq("slackWorkspaceId", args.workspaceId)).collect();
    const mappings = await ctx.db.query("slack_user_mappings").filter((q) => q.eq(q.field("slackWorkspaceId"), args.workspaceId)).collect();
    const threads = await ctx.db.query("slack_agent_threads").filter((q) => q.eq(q.field("slackWorkspaceId"), args.workspaceId)).collect();
    const tokens = await ctx.db.query("slack_link_tokens").filter((q) => q.eq(q.field("slackWorkspaceId"), args.workspaceId)).collect();
    for (const binding of bindings) {
      const deliveries = await ctx.db.query("slack_delivery_outbox").withIndex("by_event", (q) => q.eq("eventId", binding.eventId)).collect();
      for (const delivery of deliveries) await ctx.db.delete(delivery._id);
      await ctx.db.delete(binding._id);
    }
    for (const row of [...mappings, ...threads, ...tokens]) await ctx.db.delete(row._id);
    await ctx.db.delete(workspace._id);
  },
});

export const markWorkspaceError = internalMutation({
  args: { workspaceId: v.id("slack_workspaces"), error: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace) await ctx.db.patch(workspace._id, { status: "error", lastError: args.error.slice(0, 300), updatedAt: Date.now() });
  },
});

export const cleanupEphemeral = internalMutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 200)));
    const [states, tokens, receipts] = await Promise.all([
      ctx.db.query("slack_oauth_states").withIndex("by_expiry", (q) => q.lt("expiresAt", now)).take(limit),
      ctx.db.query("slack_link_tokens").withIndex("by_expiry", (q) => q.lt("expiresAt", now)).take(limit),
      ctx.db.query("slack_request_receipts").withIndex("by_expiry", (q) => q.lt("expiresAt", now)).take(limit),
    ]);
    for (const row of [...states, ...tokens, ...receipts]) await ctx.db.delete(row._id);
    return { removed: states.length + tokens.length + receipts.length };
  },
});
