import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { assertEventAccess } from "./functions";
import { findActiveContactByEmail, resolveCanonicalContact } from "./crm";

const provider = v.union(v.literal("notion"), v.literal("airtable"));
const envelope = v.object({ version: v.literal(1), iv: v.string(), ciphertext: v.string(), tag: v.string() });
const config = v.object({
  notionDatabaseId: v.optional(v.string()), airtableBaseId: v.optional(v.string()), airtableTableName: v.optional(v.string()),
  emailField: v.string(), fullNameField: v.optional(v.string()), firstNameField: v.optional(v.string()), lastNameField: v.optional(v.string()),
});

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const sources = await ctx.db.query("crm_sources").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return sources.map(({ credentialEnvelope: _secret, updatedByUserId: _actor, ...source }) => source);
  },
});

export const getInternal = internalQuery({
  args: { eventId: v.id("events"), provider },
  handler: (ctx, args) => ctx.db.query("crm_sources").withIndex("by_event_provider", (q) => q.eq("eventId", args.eventId).eq("provider", args.provider)).unique(),
});

export const listConnectedInternal = internalQuery({
  args: {},
  handler: (ctx) => ctx.db.query("crm_sources").filter((q) => q.eq(q.field("status"), "connected")).collect(),
});

export const upsertInternal = internalMutation({
  args: { eventId: v.id("events"), provider, config, credentialHint: v.string(), credentialEnvelope: envelope, oauthExpiresAt: v.optional(v.number()), updatedByUserId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("crm_sources").withIndex("by_event_provider", (q) => q.eq("eventId", args.eventId).eq("provider", args.provider)).unique();
    const now = Date.now();
    const value = { ...args, status: "connected" as const, lastError: undefined, updatedAt: now };
    if (existing) { await ctx.db.patch(existing._id, value); return existing._id; }
    return ctx.db.insert("crm_sources", { ...value, createdAt: now });
  },
});

export const updateOAuthCredentialInternal = internalMutation({
  args: { sourceId: v.id("crm_sources"), credentialEnvelope: envelope, oauthExpiresAt: v.optional(v.number()) },
  handler: async (ctx, args) => ctx.db.patch(args.sourceId, { credentialEnvelope: args.credentialEnvelope, oauthExpiresAt: args.oauthExpiresAt, updatedAt: Date.now() }),
});

export const markRunInternal = internalMutation({
  args: { sourceId: v.id("crm_sources"), created: v.number(), updated: v.number(), skipped: v.number(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, args.error
      ? { status: "error", lastError: args.error.slice(0, 500), updatedAt: Date.now() }
      : { status: "connected", lastError: undefined, lastSyncedAt: Date.now(), lastRun: { created: args.created, updated: args.updated, skipped: args.skipped }, updatedAt: Date.now() });
  },
});

export const createOAuthStateInternal = internalMutation({
  args: { stateHash: v.string(), provider, eventId: v.id("events"), userId: v.string(), verifierEnvelope: v.optional(envelope), expiresAt: v.number() },
  handler: (ctx, args) => ctx.db.insert("crm_oauth_states", { ...args, createdAt: Date.now() }),
});

export const consumeOAuthStateInternal = internalMutation({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db.query("crm_oauth_states").withIndex("by_stateHash", (q) => q.eq("stateHash", args.stateHash)).unique();
    if (!state || state.expiresAt < Date.now()) { if (state) await ctx.db.delete(state._id); return null; }
    await ctx.db.delete(state._id); return state;
  },
});

export const createOAuthPendingInternal = internalMutation({
  args: { pendingId: v.string(), provider, eventId: v.id("events"), userId: v.string(), credentialEnvelope: envelope, oauthExpiresAt: v.optional(v.number()), expiresAt: v.number() },
  handler: (ctx, args) => ctx.db.insert("crm_oauth_pending", { ...args, createdAt: Date.now() }),
});

export const getOAuthPendingInternal = internalQuery({
  args: { pendingId: v.string(), provider, userId: v.string() },
  handler: async (ctx, args) => {
    const pending = await ctx.db.query("crm_oauth_pending").withIndex("by_pendingId", (q) => q.eq("pendingId", args.pendingId)).unique();
    if (!pending || pending.provider !== args.provider || pending.userId !== args.userId || pending.expiresAt < Date.now()) return null;
    return pending;
  },
});

export const consumeOAuthPendingInternal = internalMutation({
  args: { pendingId: v.string(), provider, userId: v.string() },
  handler: async (ctx, args) => {
    const pending = await ctx.db.query("crm_oauth_pending").withIndex("by_pendingId", (q) => q.eq("pendingId", args.pendingId)).unique();
    if (!pending || pending.provider !== args.provider || pending.userId !== args.userId || pending.expiresAt < Date.now()) { if (pending && pending.expiresAt < Date.now()) await ctx.db.delete(pending._id); return null; }
    await ctx.db.delete(pending._id); return pending;
  },
});

// Idempotent source upsert. Imports change identity fields only; CRM stage, score, segment
// membership and already-linked events are deliberately never overwritten. Respects canonical/
// merged identity (#268 T006): a previously mapped contact that has since been merged into
// another one is resolved forward to that canonical contact rather than resurrected with fresh
// import data, and a by-email fallback lookup never resolves to a tombstoned contact even though
// a merge deliberately leaves the tombstone's email unchanged for audit display.
export const upsertIdentityInternal = internalMutation({
  args: { sourceId: v.id("crm_sources"), providerRecordId: v.string(), email: v.string(), firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) throw new Error("CRM source not found.");
    const event = await ctx.db.get(source.eventId);
    if (!event) throw new Error("Event not found.");
    const email = args.email.trim().toLowerCase();
    const now = Date.now();
    const mapped = await ctx.db.query("crm_source_records").withIndex("by_source_record", (q) => q.eq("sourceId", args.sourceId).eq("providerRecordId", args.providerRecordId)).unique();
    let contact = mapped ? await ctx.db.get(mapped.contactId) : null;
    if (contact?.mergedIntoContactId) contact = await resolveCanonicalContact(ctx, contact);
    if (!contact) contact = await findActiveContactByEmail(ctx, event.organizationId, email);
    const created = !contact;
    if (contact) await ctx.db.patch(contact._id, { email, firstName: args.firstName, lastName: args.lastName, updatedAt: now });
    else {
      const contactId = await ctx.db.insert("crm_contacts", { organizationId: event.organizationId, email, firstName: args.firstName, lastName: args.lastName, stage: "prospect", score: 0, createdAt: now, updatedAt: now });
      contact = await ctx.db.get(contactId);
    }
    if (!contact) throw new Error("CRM contact could not be created.");
    const membership = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", source.eventId).eq("contactId", contact!._id)).first();
    if (!membership) await ctx.db.insert("crm_event_contacts", { eventId: source.eventId, contactId: contact._id, createdAt: now, updatedAt: now });
    if (mapped) await ctx.db.patch(mapped._id, { contactId: contact._id, normalizedEmail: email, updatedAt: now });
    else await ctx.db.insert("crm_source_records", { sourceId: source._id, providerRecordId: args.providerRecordId, contactId: contact._id, normalizedEmail: email, createdAt: now, updatedAt: now });
    return { created, updated: !created };
  },
});
