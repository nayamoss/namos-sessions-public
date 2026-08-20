import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { sha256Hex, verifySlackRequestWeb } from "./slackRequestVerification";

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: jsonHeaders });

async function verifiedBody(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !(await verifySlackRequestWeb({ rawBody, timestamp: request.headers.get("x-slack-request-timestamp"), signature: request.headers.get("x-slack-signature"), signingSecret: secret }))) return null;
  return rawBody;
}

async function receipt(ctx: ActionCtx, input: { rawBody: string; kind: "event" | "command" | "interaction"; teamId?: string; timestamp: string; eventId?: string }) {
  const dedupeKey = input.eventId ? `event:${input.eventId}` : `${input.kind}:${await sha256Hex(`${input.kind}:${input.teamId ?? ""}:${input.timestamp}:${input.rawBody}`)}`;
  return ctx.runMutation(internal.slackInbound.claimReceipt, { dedupeKey, kind: input.kind, ...(input.teamId ? { slackTeamId: input.teamId } : {}), expiresAt: Date.now() + 7 * 24 * 60 * 60_000 });
}

export const slackOAuthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return new Response("Slack authorization state is missing.", { status: 400 });
  try {
    const result = await ctx.runAction(internal.slackIntegrationsActions.completeOAuthCallback, { state, ...(url.searchParams.get("code") ? { code: url.searchParams.get("code")! } : {}), ...(url.searchParams.get("error") ? { error: url.searchParams.get("error")! } : {}) });
    const origin = process.env.PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
    if (!origin) return new Response("Slack callback is not configured.", { status: 500 });
    const destination = new URL(`/events/${encodeURIComponent(result.eventSlug)}/settings/integrations`, origin);
    destination.searchParams.set("slack", result.connected ? "connected" : "error");
    if (!result.connected) destination.searchParams.set("reason", result.reason);
    return Response.redirect(destination, 302);
  } catch { return new Response("Slack authorization is invalid or expired.", { status: 400 }); }
});

export const slackEvents = httpAction(async (ctx, request) => {
  const rawBody = await verifiedBody(request);
  if (rawBody === null) return json({ error: "invalid_signature" }, 401);
  let body: { type?: unknown; challenge?: unknown; team_id?: unknown; event_id?: unknown; event?: Record<string, unknown> };
  try { body = JSON.parse(rawBody) as typeof body; } catch { return json({ error: "invalid_request" }, 400); }
  if (body.type === "url_verification" && typeof body.challenge === "string") return json({ challenge: body.challenge });
  if (body.type !== "event_callback" || typeof body.team_id !== "string" || typeof body.event_id !== "string" || !body.event || typeof body.event !== "object") return json({ accepted: true });
  const event = body.event;
  if ((event.type !== "app_mention" && event.type !== "message") || typeof event.channel !== "string" || typeof event.ts !== "string") return json({ accepted: true });
  const claimed = await receipt(ctx, { rawBody, kind: "event", teamId: body.team_id, timestamp: request.headers.get("x-slack-request-timestamp")!, eventId: body.event_id });
  if (!claimed.claimed) return json({ accepted: false, duplicate: true });
  if (typeof event.user !== "string") { await ctx.runMutation(internal.slackInbound.markReceipt, { receiptId: claimed.receiptId, status: "processed" }); return json({ accepted: true }); }
  await ctx.scheduler.runAfter(0, internal.slackInboundActions.processEvent, { receiptId: claimed.receiptId, envelope: { teamId: body.team_id, eventId: body.event_id, type: event.type, userId: event.user, channelId: event.channel, text: typeof event.text === "string" ? event.text : "", ts: event.ts, ...(typeof event.thread_ts === "string" ? { threadTs: event.thread_ts } : {}), ...(typeof event.channel_type === "string" ? { channelType: event.channel_type } : {}), ...(typeof event.bot_id === "string" ? { botId: event.bot_id } : {}), ...(typeof event.subtype === "string" ? { subtype: event.subtype } : {}) } });
  return json({ accepted: true });
});

export const slackCommands = httpAction(async (ctx, request) => {
  const rawBody = await verifiedBody(request);
  if (rawBody === null) return json({ error: "invalid_signature" }, 401);
  const form = new URLSearchParams(rawBody);
  const command = form.get("command"); const text = (form.get("text") ?? "").trim(); const teamId = form.get("team_id"); const channelId = form.get("channel_id"); const userId = form.get("user_id"); const responseUrl = form.get("response_url");
  if (command !== "/namos" || !teamId || !channelId || !userId || !responseUrl) return json({ response_type: "ephemeral", text: "Use /namos help, /namos status, or /namos ask <objective>." });
  const [subcommand = "help", ...rest] = text.split(/\s+/); const objective = rest.join(" ").trim();
  if (!new Set(["help", "status", "ask"]).has(subcommand) || (subcommand === "ask" && (!objective || objective.length > 4000))) return json({ response_type: "ephemeral", text: subcommand === "ask" && objective.length > 4000 ? "Objectives are limited to 4,000 characters." : "Use /namos help, /namos status, or /namos ask <objective>." });
  const claimed = await receipt(ctx, { rawBody, kind: "command", teamId, timestamp: request.headers.get("x-slack-request-timestamp")! });
  if (!claimed.claimed) return json({ response_type: "ephemeral", text: "Namos already received that request." });
  await ctx.scheduler.runAfter(0, internal.slackInboundActions.processCommand, { receiptId: claimed.receiptId, envelope: { teamId, channelId, userId, subcommand, ...(objective ? { objective } : {}), responseUrl } });
  return json({ response_type: "ephemeral", text: subcommand === "help" ? "Use /namos status or /namos ask <objective>. Mention @Namos in a thread to continue a run." : "Namos is working on that…" });
});

export const slackInteractions = httpAction(async (ctx, request) => {
  const rawBody = await verifiedBody(request);
  if (rawBody === null) return json({ error: "invalid_signature" }, 401);
  const payloadRaw = new URLSearchParams(rawBody).get("payload");
  let payload: { type?: unknown; team?: { id?: unknown }; user?: { id?: unknown }; channel?: { id?: unknown }; message?: { ts?: unknown; thread_ts?: unknown }; actions?: Array<{ action_id?: unknown; value?: unknown }> } | null;
  try { payload = payloadRaw ? JSON.parse(payloadRaw) as NonNullable<typeof payload> : null; } catch { return json({ error: "invalid_request" }, 400); }
  const action = payload?.actions?.[0];
  if (payload?.type !== "block_actions" || typeof payload.team?.id !== "string" || typeof payload.user?.id !== "string" || typeof payload.channel?.id !== "string" || typeof payload.message?.ts !== "string" || (action?.action_id !== "namos_proposal_approve" && action?.action_id !== "namos_proposal_reject") || typeof action.value !== "string") return json({ error: "invalid_request" }, 400);
  const claimed = await receipt(ctx, { rawBody, kind: "interaction", teamId: payload.team.id, timestamp: request.headers.get("x-slack-request-timestamp")! });
  if (!claimed.claimed) return new Response(null, { status: 200 });
  await ctx.scheduler.runAfter(0, internal.slackInboundActions.processInteraction, { receiptId: claimed.receiptId, envelope: { teamId: payload.team.id, userId: payload.user.id, channelId: payload.channel.id, messageTs: payload.message.ts, ...(typeof payload.message.thread_ts === "string" ? { threadTs: payload.message.thread_ts } : {}), actionId: action.action_id, value: action.value } });
  return new Response(null, { status: 200 });
});
