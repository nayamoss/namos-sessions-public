"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertEventOrganizerAction } from "./emailDelivery";
import { decrypt, encrypt, type CredentialEnvelope } from "./credentialEncryption";
import { queryAirtableTable, verifyAirtableConnection, type AirtableRecord } from "./airtableSync";
import { queryNotionDatabase, verifyNotionDatabase, verifyNotionToken, type NotionPage } from "./notionSync";
import { createHash, randomBytes, randomUUID } from "node:crypto";

type Provider = "notion" | "airtable";
type Mapping = { notionDatabaseId?: string; airtableBaseId?: string; airtableTableName?: string; emailField: string; fullNameField?: string; firstNameField?: string; lastNameField?: string };
type Source = { _id: string; eventId: string; provider: Provider; config: Mapping; credentialEnvelope: CredentialEnvelope; oauthExpiresAt?: number };

function key() {
  const value = process.env.CONTENT_INTEGRATION_ENCRYPTION_KEY;
  if (!value) throw new Error("CONTENT_INTEGRATION_ENCRYPTION_KEY is not configured.");
  return value;
}
function tokenHint(token: string) { const value = token.trim(); return value.length > 4 ? `Configured · ${value.slice(-4)}` : "Configured"; }
type OAuthCredentials = { accessToken: string; refreshToken?: string; expiresAt?: number };
const stateHash = (state: string) => createHash("sha256").update(state).digest("hex");
const appOrigin = () => {
  const origin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin) throw new Error("PUBLIC_APP_ORIGIN is not configured.");
  return origin.replace(/\/$/, "");
};
const oauthRedirectUri = (provider: Provider) => `${process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ?? appOrigin()}/oauth/crm/${provider}/callback`;
const encryptOAuth = (credentials: OAuthCredentials) => encrypt(JSON.stringify(credentials), key());
const decryptOAuth = (envelope: CredentialEnvelope) => {
  const parsed = JSON.parse(decrypt(envelope, key())) as OAuthCredentials;
  if (!parsed.accessToken) throw new Error("CRM OAuth credentials are unavailable.");
  return parsed;
};
function notionOAuthConfig() { const clientId = process.env.NOTION_OAUTH_CLIENT_ID; const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET; if (!clientId || !clientSecret) throw new Error("Notion OAuth is not configured."); return { clientId, clientSecret }; }
function airtableOAuthConfig() { const clientId = process.env.AIRTABLE_OAUTH_CLIENT_ID; const clientSecret = process.env.AIRTABLE_OAUTH_CLIENT_SECRET; if (!clientId || !clientSecret) throw new Error("Airtable OAuth is not configured."); return { clientId, clientSecret }; }
async function exchangeOAuthCode(provider: Provider, code: string, verifier?: string): Promise<OAuthCredentials> {
  const redirectUri = oauthRedirectUri(provider);
  if (provider === "notion") {
    const { clientId, clientSecret } = notionOAuthConfig();
    const response = await fetch("https://api.notion.com/v1/oauth/token", { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "content-type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
    if (!response.ok) throw new Error("Notion OAuth authorization could not be completed.");
    const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error("Notion OAuth did not return an access token.");
    return { accessToken: body.access_token, ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}), ...(body.expires_in ? { expiresAt: Date.now() + body.expires_in * 1000 } : {}) };
  }
  const { clientId, clientSecret } = airtableOAuthConfig();
  const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, ...(verifier ? { code_verifier: verifier } : {}) });
  const response = await fetch("https://airtable.com/oauth2/v1/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }, body: form });
  if (!response.ok) throw new Error("Airtable OAuth authorization could not be completed.");
  const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Airtable OAuth did not return an access token.");
  return { accessToken: body.access_token, ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}), ...(body.expires_in ? { expiresAt: Date.now() + body.expires_in * 1000 } : {}) };
}
async function refreshAirtable(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (!credentials.refreshToken || !credentials.expiresAt || credentials.expiresAt > Date.now() + 60_000) return credentials;
  const { clientId, clientSecret } = airtableOAuthConfig();
  const response = await fetch("https://airtable.com/oauth2/v1/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: credentials.refreshToken }) });
  if (!response.ok) throw new Error("Airtable OAuth expired. Reconnect the CRM source.");
  const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Airtable OAuth refresh failed.");
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? credentials.refreshToken, ...(body.expires_in ? { expiresAt: Date.now() + body.expires_in * 1000 } : {}) };
}
function normalize(value: string) { return value.trim().toLowerCase(); }
function validMapping(mapping: Mapping) {
  if (!mapping.emailField.trim()) throw new Error("Map a source email field before connecting.");
  if (!mapping.fullNameField?.trim() && !(mapping.firstNameField?.trim() && mapping.lastNameField?.trim())) throw new Error("Map either a full name field or first and last name fields.");
}
function scalar(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter((part): part is string => typeof part === "string").join(", ").trim();
  return "";
}
function splitName(fullName: string) { const [firstName = "", ...rest] = fullName.trim().split(/\s+/).filter(Boolean); return { firstName, lastName: rest.join(" ") }; }
function notionValue(page: NotionPage, field: string) {
  const property = page.properties[field] as unknown as { type?: string; email?: string | null; title?: Array<{ plain_text?: string }>; rich_text?: Array<{ plain_text?: string }> } | undefined;
  if (!property) return "";
  if (property.type === "email") return property.email?.trim() ?? "";
  if (property.type === "title") return (property.title ?? []).map((item) => item.plain_text ?? "").join("").trim();
  if (property.type === "rich_text") return (property.rich_text ?? []).map((item) => item.plain_text ?? "").join("").trim();
  return "";
}
function mapRecord(provider: Provider, row: AirtableRecord | NotionPage, mapping: Mapping) {
  const get = (field: string | undefined) => !field ? "" : provider === "airtable" ? scalar((row as AirtableRecord).fields[field]) : notionValue(row as NotionPage, field);
  const email = normalize(get(mapping.emailField));
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;
  const full = get(mapping.fullNameField);
  const parts = splitName(full);
  const firstName = get(mapping.firstNameField) || parts.firstName;
  const lastName = get(mapping.lastNameField) || parts.lastName;
  if (!firstName || !lastName) return null;
  return { providerRecordId: provider === "airtable" ? (row as AirtableRecord).id : (row as NotionPage).id, email, firstName, lastName };
}

export const connect = action({
  args: { eventId: v.id("events"), provider: v.union(v.literal("notion"), v.literal("airtable")), token: v.string(), config: v.object({ notionDatabaseId: v.optional(v.string()), airtableBaseId: v.optional(v.string()), airtableTableName: v.optional(v.string()), emailField: v.string(), fullNameField: v.optional(v.string()), firstNameField: v.optional(v.string()), lastNameField: v.optional(v.string()) }) },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    validMapping(args.config);
    const token = args.token.trim();
    if (!token) throw new Error("A source credential is required.");
    if (args.provider === "notion") {
      if (!args.config.notionDatabaseId?.trim()) throw new Error("Choose a Notion database.");
      await verifyNotionToken(token); await verifyNotionDatabase(token, args.config.notionDatabaseId);
    } else {
      if (!args.config.airtableBaseId?.trim() || !args.config.airtableTableName?.trim()) throw new Error("Choose an Airtable base and table.");
      await verifyAirtableConnection(token, args.config.airtableBaseId, args.config.airtableTableName);
    }
    await ctx.runMutation(internal.crmSources.upsertInternal, { eventId: args.eventId, provider: args.provider, config: args.config, credentialHint: tokenHint(token), credentialEnvelope: encrypt(token, key()), updatedByUserId: identity.subject });
    return { status: "connected" as const };
  },
});

export const startOAuth = action({ args: { eventId: v.id("events"), provider: v.union(v.literal("notion"), v.literal("airtable")) }, handler: async (ctx, args) => {
  const identity = await assertEventOrganizerAction(ctx, args.eventId);
  const state = randomBytes(32).toString("base64url");
  const verifier = args.provider === "airtable" ? randomBytes(48).toString("base64url") : undefined;
  await ctx.runMutation(internal.crmSources.createOAuthStateInternal, { stateHash: stateHash(state), provider: args.provider, eventId: args.eventId, userId: identity.subject, ...(verifier ? { verifierEnvelope: encrypt(verifier, key()) } : {}), expiresAt: Date.now() + 10 * 60_000 });
  const redirectUri = oauthRedirectUri(args.provider);
  if (args.provider === "notion") {
    const { clientId } = notionOAuthConfig(); const url = new URL("https://api.notion.com/v1/oauth/authorize");
    url.search = new URLSearchParams({ client_id: clientId, response_type: "code", owner: "user", redirect_uri: redirectUri, state }).toString(); return { url: url.toString() };
  }
  const { clientId } = airtableOAuthConfig(); const challenge = createHash("sha256").update(verifier!).digest("base64url"); const url = new URL("https://airtable.com/oauth2/v1/authorize");
  url.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, scope: "data.records:read schema.bases:read", state, code_challenge: challenge, code_challenge_method: "S256" }).toString(); return { url: url.toString() };
} });

export const completeOAuthCallback = internalAction({ args: { provider: v.union(v.literal("notion"), v.literal("airtable")), state: v.string(), code: v.string() }, handler: async (ctx, args) => {
  const stored = await ctx.runMutation(internal.crmSources.consumeOAuthStateInternal, { stateHash: stateHash(args.state) });
  if (!stored || stored.provider !== args.provider) throw new Error("CRM OAuth state is invalid or expired.");
  const credentials = await exchangeOAuthCode(args.provider, args.code, stored.verifierEnvelope ? decrypt(stored.verifierEnvelope, key()) : undefined);
  const pendingId = randomUUID();
  await ctx.runMutation(internal.crmSources.createOAuthPendingInternal, { pendingId, provider: args.provider, eventId: stored.eventId, userId: stored.userId, credentialEnvelope: encryptOAuth(credentials), oauthExpiresAt: credentials.expiresAt, expiresAt: Date.now() + 15 * 60_000 });
  const eventSlug = await ctx.runQuery(internal.events.getSlugInternal, { eventId: stored.eventId }) as string | null;
  return { pendingId, eventSlug };
} });

export const finishOAuth = action({ args: { eventId: v.id("events"), provider: v.union(v.literal("notion"), v.literal("airtable")), pendingId: v.string(), config: v.object({ notionDatabaseId: v.optional(v.string()), airtableBaseId: v.optional(v.string()), airtableTableName: v.optional(v.string()), emailField: v.string(), fullNameField: v.optional(v.string()), firstNameField: v.optional(v.string()), lastNameField: v.optional(v.string()) }) }, handler: async (ctx, args) => {
  const identity = await assertEventOrganizerAction(ctx, args.eventId); validMapping(args.config);
  const pending = await ctx.runQuery(internal.crmSources.getOAuthPendingInternal, { pendingId: args.pendingId, provider: args.provider, userId: identity.subject });
  if (!pending || pending.eventId !== args.eventId) throw new Error("CRM OAuth authorization is invalid or expired. Connect again.");
  const credentials = decryptOAuth(pending.credentialEnvelope);
  if (args.provider === "notion") {
    if (!args.config.notionDatabaseId?.trim()) throw new Error("Choose a Notion database.");
    await verifyNotionDatabase(credentials.accessToken, args.config.notionDatabaseId);
  } else {
    if (!args.config.airtableBaseId?.trim() || !args.config.airtableTableName?.trim()) throw new Error("Choose an Airtable base and table.");
    await verifyAirtableConnection(credentials.accessToken, args.config.airtableBaseId, args.config.airtableTableName);
  }
  const consumed = await ctx.runMutation(internal.crmSources.consumeOAuthPendingInternal, { pendingId: args.pendingId, provider: args.provider, userId: identity.subject });
  if (!consumed || consumed.eventId !== args.eventId) throw new Error("CRM OAuth authorization was already used. Connect again.");
  await ctx.runMutation(internal.crmSources.upsertInternal, { eventId: args.eventId, provider: args.provider, config: args.config, credentialHint: `${args.provider === "notion" ? "Notion" : "Airtable"} OAuth`, credentialEnvelope: consumed.credentialEnvelope, oauthExpiresAt: consumed.oauthExpiresAt, updatedByUserId: identity.subject });
  return { status: "connected" as const };
} });

async function syncSource(ctx: Parameters<typeof syncOne>[0], source: Source) {
  const decrypted = decrypt(source.credentialEnvelope, key());
  let token = decrypted;
  if (decrypted.trim().startsWith("{")) {
    const stored = decryptOAuth(source.credentialEnvelope);
    const credentials = source.provider === "airtable" ? await refreshAirtable(stored) : stored;
    token = credentials.accessToken;
    if (credentials.accessToken !== stored.accessToken || credentials.expiresAt !== stored.expiresAt) await ctx.runMutation(internal.crmSources.updateOAuthCredentialInternal, { sourceId: source._id as never, credentialEnvelope: encryptOAuth(credentials), oauthExpiresAt: credentials.expiresAt });
  }
  let created = 0; let updated = 0; let skipped = 0; let cursor: string | undefined;
  do {
    let rows: Array<AirtableRecord | NotionPage>;
    if (source.provider === "airtable") {
      const page = await queryAirtableTable(token, source.config.airtableBaseId!, source.config.airtableTableName!, cursor);
      rows = page.records;
      cursor = page.offset;
    } else {
      const page = await queryNotionDatabase(token, source.config.notionDatabaseId!, cursor);
      rows = page.results;
      cursor = page.next_cursor ?? undefined;
    }
    for (const row of rows) {
      const mapped = mapRecord(source.provider, row as AirtableRecord | NotionPage, source.config);
      if (!mapped) { skipped += 1; continue; }
      const outcome = await ctx.runMutation(internal.crmSources.upsertIdentityInternal, { sourceId: source._id as never, ...mapped });
      if (outcome.created) created += 1; else if (outcome.updated) updated += 1;
    }
  } while (cursor);
  return { created, updated, skipped };
}

async function syncOne(ctx: Pick<ActionCtx, "runQuery" | "runMutation">, source: Source) {
  try {
    const result = await syncSource(ctx, source);
    await ctx.runMutation(internal.crmSources.markRunInternal, { sourceId: source._id as never, ...result });
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "CRM source sync failed.";
    await ctx.runMutation(internal.crmSources.markRunInternal, { sourceId: source._id as never, created: 0, updated: 0, skipped: 0, error });
    throw cause;
  }
}

export const syncNow = action({ args: { eventId: v.id("events"), provider: v.union(v.literal("notion"), v.literal("airtable")) }, handler: async (ctx, args) => {
  await assertEventOrganizerAction(ctx, args.eventId);
  const source = await ctx.runQuery(internal.crmSources.getInternal, args) as Source | null;
  if (!source) throw new Error("Connect this CRM source before syncing.");
  return syncOne(ctx, source);
} });

export const syncAllDaily = internalAction({ args: {}, handler: async (ctx) => {
  const sources = await ctx.runQuery(internal.crmSources.listConnectedInternal, {}) as Source[];
  const results = await Promise.allSettled(sources.map((source) => syncOne(ctx, source)));
  return { attempted: results.length, failed: results.filter((result) => result.status === "rejected").length };
} });
