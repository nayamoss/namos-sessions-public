"use node";

// Per-event content-source integrations (Notion and Airtable today; Sanity lands as a sibling that
// reuse this module and `content_integrations`). Mirrors `emailIntegrationsActions.ts`'s
// structure exactly: a Convex Node action per user-facing operation, auth via
// `assertEventOrganizerAction`, credentials only ever stored AES-256-GCM encrypted and never
// returned to the browser.

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertEventOrganizerAction } from "./emailDelivery";
import { decrypt, encrypt, type CredentialEnvelope } from "./credentialEncryption";
import {
  mapNotionPageToSpeaker,
  mapNotionPageToSubmission,
  queryNotionDatabase,
  verifyNotionDatabase,
  verifyNotionToken,
} from "./notionSync";
import {
  mapAirtableRecordToSpeaker,
  mapAirtableRecordToSubmission,
  queryAirtableTable,
  verifyAirtableConnection,
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
    const token = decryptToken(stored.credentialEnvelope);
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
    const personalAccessToken = decryptToken(stored.credentialEnvelope);
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
        credentialEnvelope: stored.credentialEnvelope,
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
      credentialEnvelope: stored.credentialEnvelope,
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
