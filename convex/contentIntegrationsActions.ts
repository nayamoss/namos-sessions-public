"use node";

// Per-event content-source integrations (Notion and Airtable today; Sanity lands as a sibling that
// reuse this module and `content_integrations`). Mirrors `emailIntegrationsActions.ts`'s
// structure exactly: a Convex Node action per user-facing operation, auth via
// `assertEventOrganizerAction`, credentials only ever stored AES-256-GCM encrypted and never
// returned to the browser.

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertEventOrganizerAction } from "./emailDelivery";
import { decrypt, encrypt, type CredentialEnvelope } from "./credentialEncryption";
import {
  mapNotionPageToSpeaker,
  mapNotionPageToSubmission,
  listNotionDatabases,
  queryNotionDatabase,
  verifyNotionDatabase,
  verifyNotionToken,
} from "./notionSync";
import {
  mapAirtableRecordToSpeaker,
  mapAirtableRecordToSubmission,
  queryAirtableTable,
  verifyAirtableConnection,
  listAirtableBases,
  listAirtableTables,
} from "./airtableSync";
import {
  buildSanitySessionDocument,
  buildSanitySpeakerDocument,
  publishSanityBatch,
  verifySanityConnection,
  type SanityPublishDocument,
  type SanityPublishFailure,
} from "./sanitySync";

function integrationKey() {
  const configured = process.env.CONTENT_INTEGRATION_ENCRYPTION_KEY;
  if (!configured) throw new Error("CONTENT_INTEGRATION_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("CONTENT_INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return configured;
}

function encryptToken(token: string): CredentialEnvelope {
  return encrypt(token, integrationKey());
}

function decryptToken(envelope: CredentialEnvelope): string {
  if (!envelope || envelope.version !== 1) throw new Error("Content integration credentials are unavailable.");
  return decrypt(envelope, integrationKey());
}

type OAuthCredentials = { accessToken: string; refreshToken?: string; expiresAt?: number };
const stateHash = (state: string) => createHash("sha256").update(state).digest("hex");
const publicAppOrigin = () => {
  const origin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin) throw new Error("PUBLIC_APP_ORIGIN is not configured.");
  return origin.replace(/\/$/, "");
};
const oauthRedirectUri = (provider: "notion" | "airtable") => `${process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ?? publicAppOrigin()}/oauth/${provider}/callback`;
const encryptOAuth = (credentials: OAuthCredentials) => encrypt(JSON.stringify(credentials), integrationKey());
const decryptOAuth = (envelope: CredentialEnvelope): OAuthCredentials => {
  const parsed = JSON.parse(decryptToken(envelope)) as OAuthCredentials;
  if (!parsed.accessToken) throw new Error("OAuth credentials are unavailable.");
  return parsed;
};
const oauthHint = (provider: "notion" | "airtable") => `${provider === "notion" ? "Notion" : "Airtable"} OAuth`;

function notionConfig() {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Notion OAuth is not configured.");
  return { clientId, clientSecret };
}
function airtableConfig() {
  const clientId = process.env.AIRTABLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.AIRTABLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Airtable OAuth is not configured.");
  return { clientId, clientSecret };
}

async function exchangeCode(provider: "notion" | "airtable", code: string, verifier?: string): Promise<OAuthCredentials> {
  const redirectUri = oauthRedirectUri(provider);
  if (provider === "notion") {
    const { clientId, clientSecret } = notionConfig();
    const response = await fetch("https://api.notion.com/v1/oauth/token", { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "content-type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
    if (!response.ok) throw new Error("Notion OAuth authorization could not be completed.");
    const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error("Notion OAuth did not return an access token.");
    return { accessToken: body.access_token, ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}), ...(body.expires_in ? { expiresAt: Date.now() + body.expires_in * 1000 } : {}) };
  }
  const { clientId, clientSecret } = airtableConfig();
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, ...(verifier ? { code_verifier: verifier } : {}) });
  const response = await fetch("https://airtable.com/oauth2/v1/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${airtableBasicAuth(clientId, clientSecret)}` }, body });
  if (!response.ok) throw new Error(`Airtable OAuth authorization could not be completed: ${await response.text()}`);
  const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error("Airtable OAuth did not return an access token.");
  return { accessToken: result.access_token, ...(result.refresh_token ? { refreshToken: result.refresh_token } : {}), ...(result.expires_in ? { expiresAt: Date.now() + result.expires_in * 1000 } : {}) };
}

// Airtable requires HTTP Basic auth (client_id + client_secret) for confidential clients on
// /oauth2/v1/token — client_id/client_secret in the body is rejected. See
// https://airtable.com/developers/web/api/oauth-reference. Found live 2026-08-17: the request
// was sending them as body params ("could not be completed"), then base64url-encoded once
// switched to a header — Airtable's own error confirmed it wants standard padded base64
// ("text after \"Basic \" is not valid base64: length must be a multiple of 4"), not base64url.
function airtableBasicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function refreshAirtable(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (!credentials.refreshToken || !credentials.expiresAt || credentials.expiresAt > Date.now() + 60_000) return credentials;
  const { clientId, clientSecret } = airtableConfig();
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: credentials.refreshToken });
  const response = await fetch("https://airtable.com/oauth2/v1/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${airtableBasicAuth(clientId, clientSecret)}` }, body });
  if (!response.ok) throw new Error("Airtable OAuth token expired. Reconnect Airtable to continue importing.");
  const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error("Airtable OAuth token refresh failed.");
  return { accessToken: result.access_token, refreshToken: result.refresh_token ?? credentials.refreshToken, ...(result.expires_in ? { expiresAt: Date.now() + result.expires_in * 1000 } : {}) };
}

export const startOAuth = action({ args: { eventId: v.id("events"), provider: v.union(v.literal("notion"), v.literal("airtable")), target: v.union(v.literal("speakers"), v.literal("submissions")) }, handler: async (ctx, args) => {
  const identity = await assertEventOrganizerAction(ctx, args.eventId);
  const state = randomBytes(32).toString("base64url");
  const verifier = args.provider === "airtable" ? randomBytes(48).toString("base64url") : undefined;
  await ctx.runMutation(internal.contentIntegrations.createOAuthStateInternal, { stateHash: stateHash(state), provider: args.provider, eventId: args.eventId, userId: identity.subject, target: args.target, ...(verifier ? { verifierEnvelope: encryptToken(verifier) } : {}), expiresAt: Date.now() + 10 * 60_000 });
  const redirectUri = oauthRedirectUri(args.provider);
  if (args.provider === "notion") { const { clientId } = notionConfig(); const url = new URL("https://api.notion.com/v1/oauth/authorize"); url.search = new URLSearchParams({ client_id: clientId, response_type: "code", owner: "user", redirect_uri: redirectUri, state }).toString(); return { url: url.toString() }; }
  const { clientId } = airtableConfig(); const challenge = createHash("sha256").update(verifier!).digest("base64url"); const url = new URL("https://airtable.com/oauth2/v1/authorize"); url.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, scope: "data.records:read schema.bases:read", state, code_challenge: challenge, code_challenge_method: "S256" }).toString(); return { url: url.toString() };
} });

export const completeOAuthCallback = internalAction({ args: { provider: v.union(v.literal("notion"), v.literal("airtable")), state: v.string(), code: v.string() }, handler: async (ctx, args) => {
  const state = await ctx.runMutation(internal.contentIntegrations.consumeOAuthStateInternal, { stateHash: stateHash(args.state) });
  if (!state || state.provider !== args.provider) throw new Error("OAuth state is invalid or expired.");
  const verifier = state.verifierEnvelope ? decryptToken(state.verifierEnvelope) : undefined;
  const credentials = await exchangeCode(args.provider, args.code, verifier);
  const pendingId = randomUUID();
  await ctx.runMutation(internal.contentIntegrations.createOAuthPendingInternal, { pendingId, provider: args.provider, eventId: state.eventId, userId: state.userId, target: state.target, credentialEnvelope: encryptOAuth(credentials), oauthExpiresAt: credentials.expiresAt, expiresAt: Date.now() + 15 * 60_000 });
  const eventSlug = await ctx.runQuery(internal.events.getSlugInternal, { eventId: state.eventId });
  return { pendingId, eventSlug };
} });

export const listNotionOAuthDatabases = action({ args: { eventId: v.id("events"), pendingId: v.string() }, handler: async (ctx, args) => {
  const identity = await assertEventOrganizerAction(ctx, args.eventId);
  const pending = await ctx.runQuery(internal.contentIntegrations.getOAuthPendingInternal, { pendingId: args.pendingId, userId: identity.subject, provider: "notion" });
  if (!pending || pending.eventId !== args.eventId) throw new Error("Notion authorization is invalid or expired. Connect again.");
  return listNotionDatabases(decryptOAuth(pending.credentialEnvelope).accessToken);
} });

export const listAirtableOAuthBases = action({ args: { eventId: v.id("events"), pendingId: v.string() }, handler: async (ctx, args) => {
  const identity = await assertEventOrganizerAction(ctx, args.eventId);
  const pending = await ctx.runQuery(internal.contentIntegrations.getOAuthPendingInternal, { pendingId: args.pendingId, userId: identity.subject, provider: "airtable" });
  if (!pending || pending.eventId !== args.eventId) throw new Error("Airtable authorization is invalid or expired. Connect again.");
  return listAirtableBases((await refreshAirtable(decryptOAuth(pending.credentialEnvelope))).accessToken);
} });

export const listAirtableOAuthTables = action({ args: { eventId: v.id("events"), pendingId: v.string(), baseId: v.string() }, handler: async (ctx, args) => {
  const identity = await assertEventOrganizerAction(ctx, args.eventId);
  const pending = await ctx.runQuery(internal.contentIntegrations.getOAuthPendingInternal, { pendingId: args.pendingId, userId: identity.subject, provider: "airtable" });
  if (!pending || pending.eventId !== args.eventId) throw new Error("Airtable authorization is invalid or expired. Connect again.");
  return listAirtableTables((await refreshAirtable(decryptOAuth(pending.credentialEnvelope))).accessToken, args.baseId);
} });

async function finishOAuth(ctx: ActionCtx, args: { eventId: Id<"events">; pendingId: string; provider: "notion" | "airtable"; config: Record<string, string> }) {
  const identity = await assertEventOrganizerAction(ctx, args.eventId);
  const pending = await ctx.runMutation(internal.contentIntegrations.consumeOAuthPendingInternal, { pendingId: args.pendingId, userId: identity.subject, provider: args.provider });
  if (!pending || pending.eventId !== args.eventId) throw new Error(`${args.provider === "notion" ? "Notion" : "Airtable"} authorization is invalid or expired. Connect again.`);
  await ctx.runMutation(internal.contentIntegrations.upsertInternal, { eventId: args.eventId, provider: args.provider, authMethod: args.provider === "notion" ? "notion_oauth" : "airtable_oauth", direction: "pull", target: pending.target, config: args.config, credentialHint: oauthHint(args.provider), credentialEnvelope: pending.credentialEnvelope, oauthExpiresAt: pending.oauthExpiresAt, status: "connected", updatedByUserId: identity.subject });
  return { status: "connected" as const };
}
export const finishNotionOAuth = action({ args: { eventId: v.id("events"), pendingId: v.string(), databaseId: v.string() }, handler: (ctx, args) => finishOAuth(ctx as never, { ...args, provider: "notion", config: { notionDatabaseId: args.databaseId } }) });
export const finishAirtableOAuth = action({ args: { eventId: v.id("events"), pendingId: v.string(), baseId: v.string(), tableName: v.string() }, handler: (ctx, args) => finishOAuth(ctx as never, { ...args, provider: "airtable", config: { airtableBaseId: args.baseId, airtableTableName: args.tableName } }) });

function tokenHint(token: string) {
  const trimmed = token.trim();
  return trimmed.length > 4 ? `secret_...${trimmed.slice(-4)}` : "Configured";
}

function airtableTokenHint(token: string) {
  const trimmed = token.trim();
  return trimmed.length >= 4 ? trimmed.slice(-4) : "Configured";
}

function sanityTokenHint(token: string) {
  const trimmed = token.trim();
  return trimmed.length >= 4 ? trimmed.slice(-4) : "Configured";
}

export const connectNotion = action({
  args: {
    eventId: v.id("events"),
    notionToken: v.string(),
    notionDatabaseId: v.string(),
    target: v.union(v.literal("speakers"), v.literal("submissions")),
  },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    const token = args.notionToken.trim();
    const databaseId = args.notionDatabaseId.trim();
    if (!token) throw new Error("An internal integration token is required.");
    if (!databaseId) throw new Error("A database ID is required.");

    // Validated live against Notion before any row is written — no "connected" state is ever
    // stored for a connection that doesn't actually work.
    await verifyNotionToken(token);
    await verifyNotionDatabase(token, databaseId);

    await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
      eventId: args.eventId,
      provider: "notion",
      authMethod: "notion_internal_token",
      direction: "pull",
      target: args.target,
      config: { notionDatabaseId: databaseId },
      credentialHint: tokenHint(token),
      credentialEnvelope: encryptToken(token),
      status: "connected",
      updatedByUserId: identity.subject,
    });
    return { status: "connected" as const };
  },
});

export const importNotion = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    const stored = await ctx.runQuery(internal.contentIntegrations.getInternal, { eventId: args.eventId, provider: "notion" });
    if (!stored) throw new Error("No Notion connection for this event.");
    // Paste-token connections store a bare secret; OAuth connections store an encrypted
    // {accessToken, refreshToken, expiresAt} envelope (see completeOAuthCallback). Using
    // decryptToken unconditionally here sent that whole JSON blob to Notion as the bearer
    // token, which Notion correctly rejected as invalid — this branch was missing even
    // though importAirtable already has the equivalent check for airtable_oauth.
    const token = stored.authMethod === "notion_oauth" ? decryptOAuth(stored.credentialEnvelope).accessToken : decryptToken(stored.credentialEnvelope);
    const databaseId = stored.config.notionDatabaseId;
    if (!databaseId) throw new Error("No Notion connection for this event.");

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let hasMore = false;
    let nextCursor: string | undefined;
    let importFormId: string | undefined;

    try {
      let cursor = stored.lastSyncCursor ?? undefined;
      // Up to 2 pages (200 rows) per run — `hasMore` in the return value tells the UI to prompt
      // another "Import now" click rather than silently truncating a large database.
      for (let page = 0; page < 2; page += 1) {
        const result = await queryNotionDatabase(token, databaseId, cursor);
        for (const row of result.results) {
          if (stored.target === "speakers") {
            const mapped = mapNotionPageToSpeaker(row);
            if (!mapped) { skipped += 1; continue; }
            const outcome = await ctx.runMutation(internal.speakers.upsertBySourceRef, {
              eventId: args.eventId,
              sourceRef: mapped.sourceRef,
              firstName: mapped.firstName,
              lastName: mapped.lastName,
              email: mapped.email,
              bio: mapped.bio,
              linkedinUrl: mapped.linkedinUrl,
              websiteUrl: mapped.websiteUrl,
            });
            if (outcome.created) created += 1; else updated += 1;
          } else {
            const mapped = mapNotionPageToSubmission(row);
            if (!mapped) { skipped += 1; continue; }
            if (!importFormId) {
              importFormId = await ctx.runMutation(internal.formTemplates.ensureImportForm, {
                eventId: args.eventId,
                internalName: "Notion Import",
              });
            }
            const outcome = await ctx.runMutation(internal.submissions.upsertBySourceRef, {
              eventId: args.eventId,
              formId: importFormId as never,
              sourceRef: mapped.sourceRef,
              title: mapped.title,
              status: mapped.status,
              answers: { notes: mapped.notes ?? "" },
            });
            if (outcome.created) created += 1; else updated += 1;
          }
        }
        hasMore = result.has_more;
        nextCursor = result.next_cursor ?? undefined;
        cursor = nextCursor;
        if (!hasMore) break;
      }
    } catch (cause) {
      await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
        eventId: args.eventId,
        provider: "notion",
        authMethod: stored.authMethod,
        direction: stored.direction,
        target: stored.target,
        config: stored.config,
        credentialHint: stored.credentialHint,
        credentialEnvelope: stored.credentialEnvelope,
        status: "error",
        lastError: cause instanceof Error ? cause.message.slice(0, 500) : "Notion import failed.",
        lastSyncedAt: stored.lastSyncedAt,
        lastSyncCursor: stored.lastSyncCursor,
        updatedByUserId: identity.subject,
      });
      throw cause;
    }

    // Clearing the cursor when Notion reports no more pages means the next run starts over,
    // picking up edits to already-seen rows instead of only ever scanning forward.
    await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
      eventId: args.eventId,
      provider: "notion",
      authMethod: stored.authMethod,
      direction: stored.direction,
      target: stored.target,
      config: stored.config,
      credentialHint: stored.credentialHint,
      credentialEnvelope: stored.credentialEnvelope,
      status: "connected",
      lastSyncedAt: Date.now(),
      lastSyncCursor: hasMore ? nextCursor : undefined,
      updatedByUserId: identity.subject,
    });

    return { created, updated, skipped, hasMore };
  },
});

export const connectAirtable = action({
  args: {
    eventId: v.id("events"),
    personalAccessToken: v.string(),
    baseId: v.string(),
    tableName: v.string(),
    target: v.union(v.literal("speakers"), v.literal("submissions")),
  },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    const personalAccessToken = args.personalAccessToken.trim();
    const baseId = args.baseId.trim();
    const tableName = args.tableName.trim();
    if (!personalAccessToken) throw new Error("A personal access token is required.");
    if (!baseId) throw new Error("A base ID is required.");
    if (!tableName) throw new Error("A table name is required.");

    await verifyAirtableConnection(personalAccessToken, baseId, tableName);

    await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
      eventId: args.eventId,
      provider: "airtable",
      authMethod: "airtable_pat",
      direction: "pull",
      target: args.target,
      config: { airtableBaseId: baseId, airtableTableName: tableName },
      credentialHint: airtableTokenHint(personalAccessToken),
      credentialEnvelope: encryptToken(personalAccessToken),
      status: "connected",
      updatedByUserId: identity.subject,
    });
    return { status: "connected" as const };
  },
});

export const importAirtable = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    const stored = await ctx.runQuery(internal.contentIntegrations.getInternal, {
      eventId: args.eventId,
      provider: "airtable",
    });
    if (!stored) throw new Error("No Airtable connection for this event.");
    const refreshedCredentials = stored.authMethod === "airtable_oauth"
      ? await refreshAirtable(decryptOAuth(stored.credentialEnvelope))
      : undefined;
    const personalAccessToken = refreshedCredentials?.accessToken ?? decryptToken(stored.credentialEnvelope);
    const credentialEnvelope = refreshedCredentials ? encryptOAuth(refreshedCredentials) : stored.credentialEnvelope;
    const baseId = stored.config.airtableBaseId;
    const tableName = stored.config.airtableTableName;
    if (!baseId || !tableName) throw new Error("No Airtable connection for this event.");

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let hasMore = false;
    let nextCursor: string | undefined;
    let importFormId: string | undefined;

    try {
      let cursor = stored.lastSyncCursor ?? undefined;
      for (let page = 0; page < 2; page += 1) {
        const result = await queryAirtableTable(personalAccessToken, baseId, tableName, cursor);
        for (const record of result.records) {
          if (stored.target === "speakers") {
            const mapped = mapAirtableRecordToSpeaker(record);
            if (!mapped) { skipped += 1; continue; }
            const outcome = await ctx.runMutation(internal.speakers.upsertBySourceRef, {
              eventId: args.eventId,
              sourceRef: mapped.sourceRef,
              firstName: mapped.firstName,
              lastName: mapped.lastName,
              email: mapped.email,
              bio: mapped.bio,
              linkedinUrl: mapped.linkedinUrl,
              websiteUrl: mapped.websiteUrl,
            });
            if (outcome.created) created += 1; else updated += 1;
          } else {
            const mapped = mapAirtableRecordToSubmission(record);
            if (!mapped) { skipped += 1; continue; }
            if (!importFormId) {
              importFormId = await ctx.runMutation(internal.formTemplates.ensureImportForm, {
                eventId: args.eventId,
                internalName: "Airtable Import",
              });
            }
            const outcome = await ctx.runMutation(internal.submissions.upsertBySourceRef, {
              eventId: args.eventId,
              formId: importFormId as never,
              sourceRef: mapped.sourceRef,
              title: mapped.title,
              status: mapped.status,
              answers: { notes: mapped.notes ?? "" },
            });
            if (outcome.created) created += 1; else updated += 1;
          }
        }
        nextCursor = result.offset;
        hasMore = Boolean(nextCursor);
        cursor = nextCursor;
        if (!hasMore) break;
      }
    } catch (cause) {
      await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
        eventId: args.eventId,
        provider: "airtable",
        authMethod: stored.authMethod,
        direction: stored.direction,
        target: stored.target,
        config: stored.config,
        credentialHint: stored.credentialHint,
        credentialEnvelope,
        oauthExpiresAt: refreshedCredentials?.expiresAt ?? stored.oauthExpiresAt,
        status: "error",
        lastError: cause instanceof Error ? cause.message.slice(0, 500) : "Airtable import failed.",
        lastSyncedAt: stored.lastSyncedAt,
        lastSyncCursor: stored.lastSyncCursor,
        updatedByUserId: identity.subject,
      });
      throw cause;
    }

    await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
      eventId: args.eventId,
      provider: "airtable",
      authMethod: stored.authMethod,
      direction: stored.direction,
      target: stored.target,
      config: stored.config,
      credentialHint: stored.credentialHint,
      credentialEnvelope,
      oauthExpiresAt: refreshedCredentials?.expiresAt ?? stored.oauthExpiresAt,
      status: "connected",
      lastSyncedAt: Date.now(),
      lastSyncCursor: hasMore ? nextCursor : undefined,
      updatedByUserId: identity.subject,
    });

    return { created, updated, skipped, hasMore };
  },
});

export const connectSanity = action({
  args: {
    eventId: v.id("events"),
    projectId: v.string(),
    dataset: v.string(),
    apiToken: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    const projectId = args.projectId.trim();
    const dataset = args.dataset.trim();
    const apiToken = args.apiToken.trim();
    if (!projectId) throw new Error("A project ID is required.");
    if (!dataset) throw new Error("A dataset is required.");
    if (!apiToken) throw new Error("An API token is required.");

    // Both read access and an empty write transaction must succeed before any secret is stored.
    await verifySanityConnection(apiToken, projectId, dataset);

    await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
      eventId: args.eventId,
      provider: "sanity",
      authMethod: "sanity_token",
      direction: "push",
      target: "public_program",
      config: { sanityProjectId: projectId, sanityDataset: dataset },
      credentialHint: sanityTokenHint(apiToken),
      credentialEnvelope: encryptToken(apiToken),
      status: "connected",
      updatedByUserId: identity.subject,
    });
    return { status: "connected" as const };
  },
});

export const publishSanity = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    const stored = await ctx.runQuery(internal.contentIntegrations.getInternal, {
      eventId: args.eventId,
      provider: "sanity",
    });
    if (!stored) throw new Error("No Sanity connection for this event.");
    const apiToken = decryptToken(stored.credentialEnvelope);
    const projectId = stored.config.sanityProjectId;
    const dataset = stored.config.sanityDataset;
    if (!projectId || !dataset) throw new Error("No Sanity connection for this event.");

    const [agendaItems, speakers] = await Promise.all([
      ctx.runQuery(internal.agenda.listPublishedInternal, { eventId: args.eventId }),
      ctx.runQuery(internal.speakers.listConfirmedInternal, { eventId: args.eventId }),
    ]);
    const candidates = [
      ...agendaItems.map((item) => ({ kind: "session" as const, id: item._id, name: item.title, row: item })),
      ...speakers.map((speaker) => ({
        kind: "speaker" as const,
        id: speaker._id,
        name: `${speaker.firstName} ${speaker.lastName}`.trim() || "Unnamed speaker",
        row: speaker,
      })),
    ].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));

    const parsedCursor = Number.parseInt(stored.lastSyncCursor ?? "0", 10);
    const start = Number.isFinite(parsedCursor) && parsedCursor >= 0 && parsedCursor < candidates.length
      ? parsedCursor
      : 0;
    const selected = candidates.slice(start, start + 100);
    const nextOffset = start + selected.length;
    const hasMore = nextOffset < candidates.length;
    const documents: SanityPublishDocument[] = [];
    const sourceByDocumentId = new Map<string, (typeof selected)[number]>();
    const failures: SanityPublishFailure[] = [];

    for (const source of selected) {
      try {
        const document = source.kind === "session"
          ? buildSanitySessionDocument(source.row)
          : buildSanitySpeakerDocument(source.row);
        documents.push({ name: source.name, document });
        sourceByDocumentId.set(document._id, source);
      } catch (cause) {
        failures.push({
          name: source.name,
          reason: cause instanceof Error ? cause.message : "This row could not be published.",
        });
      }
    }

    let published = 0;
    try {
      for (let index = 0; index < documents.length; index += 50) {
        const result = await publishSanityBatch(apiToken, projectId, dataset, documents.slice(index, index + 50));
        failures.push(...result.failures);
        for (const sanityDocId of result.successfulIds) {
          const source = sourceByDocumentId.get(sanityDocId);
          if (!source) continue;
          if (source.kind === "session") {
            await ctx.runMutation(internal.agenda.setSanityDocId, { id: source.id, sanityDocId });
          } else {
            await ctx.runMutation(internal.speakers.setSanityDocId, { id: source.id, sanityDocId });
          }
          published += 1;
        }
      }
    } catch (cause) {
      await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
        eventId: args.eventId,
        provider: "sanity",
        authMethod: stored.authMethod,
        direction: stored.direction,
        target: stored.target,
        config: stored.config,
        credentialHint: stored.credentialHint,
        credentialEnvelope: stored.credentialEnvelope,
        status: "error",
        lastError: cause instanceof Error ? cause.message.slice(0, 500) : "Sanity publish failed.",
        lastSyncedAt: stored.lastSyncedAt,
        lastSyncCursor: stored.lastSyncCursor,
        updatedByUserId: identity.subject,
      });
      throw cause;
    }

    await ctx.runMutation(internal.contentIntegrations.upsertInternal, {
      eventId: args.eventId,
      provider: "sanity",
      authMethod: stored.authMethod,
      direction: stored.direction,
      target: stored.target,
      config: stored.config,
      credentialHint: stored.credentialHint,
      credentialEnvelope: stored.credentialEnvelope,
      status: "connected",
      lastSyncedAt: Date.now(),
      lastSyncCursor: hasMore ? String(nextOffset) : undefined,
      updatedByUserId: identity.subject,
    });

    return {
      published,
      failed: failures.length,
      hasMore,
      failures: failures.slice(0, 10),
    };
  },
});

export const disconnect = action({
  args: { eventId: v.id("events"), provider: v.union(v.literal("notion"), v.literal("airtable"), v.literal("sanity")) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAction(ctx, args.eventId);
    // Does not touch already-imported speakers/submissions or their sourceRef — import never
    // deletes, and disconnecting the source shouldn't retroactively orphan already-created rows.
    await ctx.runMutation(internal.contentIntegrations.removeInternal, { eventId: args.eventId, provider: args.provider });
    return { status: "disconnected" as const };
  },
});
