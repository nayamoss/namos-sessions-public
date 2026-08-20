"use node";

export type SlackBlock = Record<string, unknown>;
export type SlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  isArchived: boolean;
};

export class SlackApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SlackApiError";
  }
}

type SlackResponse = { ok?: boolean; error?: string; [key: string]: unknown };
const permanentCodes = new Set([
  "account_inactive", "channel_not_found", "invalid_auth", "missing_scope",
  "not_authed", "not_in_channel", "token_revoked", "team_disabled",
]);

async function parseResponse(response: Response): Promise<SlackResponse> {
  let body: SlackResponse;
  try {
    body = await response.json() as SlackResponse;
  } catch {
    throw new SlackApiError("Slack returned an invalid response.", "invalid_response", response.status >= 500);
  }
  if (response.ok && body.ok === true) return body;
  const code = typeof body.error === "string" ? body.error : response.status === 429 ? "ratelimited" : "request_failed";
  const retryAfter = Number(response.headers.get("retry-after") ?? "");
  throw new SlackApiError(
    permanentCodes.has(code) ? "Slack access needs attention." : "Slack is temporarily unavailable.",
    code,
    response.status === 429 || response.status >= 500 || code === "ratelimited" || code === "internal_error",
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}

async function slackApi(method: string, token: string, body?: Record<string, unknown>): Promise<SlackResponse> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body ?? {}),
  });
  return parseResponse(response);
}

export async function exchangeOAuthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });
  const body = await parseResponse(response);
  const team = body.team as { id?: unknown; name?: unknown } | undefined;
  const botUserId = body.bot_user_id;
  const accessToken = body.access_token;
  if (!team || typeof team.id !== "string" || typeof team.name !== "string" || typeof botUserId !== "string" || typeof accessToken !== "string") {
    throw new SlackApiError("Slack authorization returned incomplete installation details.", "invalid_oauth_response", false);
  }
  return {
    teamId: team.id,
    teamName: team.name,
    botUserId,
    accessToken,
    scopes: typeof body.scope === "string" ? body.scope.split(",").map((scope) => scope.trim()).filter(Boolean) : [],
  };
}

function channelFrom(value: unknown): SlackChannel | null {
  const channel = value as Record<string, unknown> | null;
  if (!channel || typeof channel.id !== "string" || typeof channel.name !== "string") return null;
  return {
    id: channel.id,
    name: channel.name,
    isPrivate: channel.is_private === true,
    isMember: channel.is_member === true,
    isArchived: channel.is_archived === true,
  };
}

export async function listConversations(token: string, limit = 500): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;
  do {
    const body = await slackApi("conversations.list", token, {
      exclude_archived: true,
      limit: Math.min(200, limit - channels.length),
      types: "public_channel,private_channel",
      ...(cursor ? { cursor } : {}),
    });
    if (!Array.isArray(body.channels)) throw new SlackApiError("Slack returned an invalid channel list.", "invalid_response", false);
    channels.push(...body.channels.map(channelFrom).filter((value): value is SlackChannel => Boolean(value)));
    const next = (body.response_metadata as { next_cursor?: unknown } | undefined)?.next_cursor;
    cursor = typeof next === "string" && next ? next : undefined;
  } while (cursor && channels.length < limit);
  return channels.slice(0, limit).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getConversation(token: string, channelId: string): Promise<SlackChannel> {
  const body = await slackApi("conversations.info", token, { channel: channelId });
  const channel = channelFrom(body.channel);
  if (!channel) throw new SlackApiError("Slack returned invalid channel details.", "invalid_response", false);
  return channel;
}

export async function getUser(token: string, userId: string): Promise<{ id: string; displayName?: string }> {
  const body = await slackApi("users.info", token, { user: userId });
  const user = body.user as { id?: unknown; profile?: { display_name?: unknown; real_name?: unknown } } | undefined;
  if (!user || typeof user.id !== "string") throw new SlackApiError("Slack returned invalid user details.", "invalid_response", false);
  const displayName = typeof user.profile?.display_name === "string" && user.profile.display_name.trim()
    ? user.profile.display_name.trim()
    : typeof user.profile?.real_name === "string" && user.profile.real_name.trim() ? user.profile.real_name.trim() : undefined;
  return { id: user.id, ...(displayName ? { displayName } : {}) };
}

export async function postMessage(token: string, input: { channel: string; text: string; blocks?: SlackBlock[]; threadTs?: string; clientMsgId?: string }) {
  const body = await slackApi("chat.postMessage", token, { channel: input.channel, text: input.text, ...(input.blocks ? { blocks: input.blocks } : {}), ...(input.threadTs ? { thread_ts: input.threadTs } : {}), ...(input.clientMsgId ? { client_msg_id: input.clientMsgId } : {}) });
  if (typeof body.ts !== "string") throw new SlackApiError("Slack did not return a message timestamp.", "invalid_response", false);
  return { ts: body.ts };
}

export async function postEphemeral(token: string, input: { channel: string; user: string; text: string; blocks?: SlackBlock[] }) {
  await slackApi("chat.postEphemeral", token, { channel: input.channel, user: input.user, text: input.text, ...(input.blocks ? { blocks: input.blocks } : {}) });
}

export async function updateMessage(token: string, input: { channel: string; ts: string; text: string; blocks?: SlackBlock[] }) {
  await slackApi("chat.update", token, { channel: input.channel, ts: input.ts, text: input.text, ...(input.blocks ? { blocks: input.blocks } : {}) });
}

export async function revokeToken(token: string): Promise<void> {
  await slackApi("auth.revoke", token);
}
