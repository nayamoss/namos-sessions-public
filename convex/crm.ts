import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, assertOrganizerOf, assertEventOrganizerAccess, assertOrganizationCrmAccess } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const stage = v.union(
  v.literal("prospect"), v.literal("contacted"), v.literal("qualified"), v.literal("invited"),
  v.literal("negotiating"), v.literal("confirmed"), v.literal("declined"), v.literal("archived"),
);
const confirmation = v.union(v.literal("awaiting"), v.literal("confirmed"), v.literal("declined"));

function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error("Enter a valid email address.");
  return email;
}

function text(value: string, name: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) throw new Error(`${name} is required and must be 200 characters or fewer.`);
  return trimmed;
}

function score(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("Score must be an integer from 0 to 100.");
  return value;
}

// A merge tombstones its source contact but deliberately never changes its stored email --
// preflight/audit displays keep showing what the record used to be. That means the
// `by_org_email` index can hold a tombstoned row alongside its live target with the same
// (organizationId, email) pair, so every lookup that resolves "the" contact for an email must
// filter merged rows out itself rather than call `.unique()`, which throws on more than one
// match (#268 T005/T006).
export async function findActiveContactByEmail(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  email: string,
): Promise<Doc<"crm_contacts"> | null> {
  const matches = await ctx.db.query("crm_contacts")
    .withIndex("by_org_email", (q) => q.eq("organizationId", organizationId).eq("email", email))
    .collect();
  return matches.find((contact) => !contact.mergedIntoContactId) ?? null;
}

// Follows `mergedIntoContactId` forward to the current canonical contact. A contact can only be
// merged once (mergeExactEmail refuses a source that already has mergedIntoContactId set), so
// this is normally a single hop, but the cycle guard keeps a corrupted/dangling pointer from
// looping forever -- it stops at the last contact it could resolve rather than throwing, since
// callers (import sync) must never resurrect a tombstone but also must never hard-fail an entire
// sync run over one bad pointer (#268 T006).
export async function resolveCanonicalContact(ctx: QueryCtx | MutationCtx, contact: Doc<"crm_contacts">): Promise<Doc<"crm_contacts">> {
  let current = contact;
  const seen = new Set<string>([current._id]);
  while (current.mergedIntoContactId) {
    const next = await ctx.db.get(current.mergedIntoContactId);
    if (!next || seen.has(next._id)) break;
    seen.add(next._id);
    current = next;
  }
  return current;
}

async function collectMergeReferences(ctx: QueryCtx | MutationCtx, sourceContactId: Id<"crm_contacts">) {
  const [memberships, speakers, sourceRecords, history] = await Promise.all([
    ctx.db.query("crm_event_contacts").withIndex("by_contact", (q) => q.eq("contactId", sourceContactId)).collect(),
    ctx.db.query("speakers").withIndex("by_contact", (q) => q.eq("contactId", sourceContactId)).collect(),
    ctx.db.query("crm_source_records").withIndex("by_contact", (q) => q.eq("contactId", sourceContactId)).collect(),
    ctx.db.query("crm_stage_history").withIndex("by_contact_createdAt", (q) => q.eq("contactId", sourceContactId)).collect(),
  ]);
  return { memberships, speakers, sourceRecords, history };
}

// Binds a merge confirmation to the exact preview the caller reviewed: which two contacts, their
// current emails, and how many references would move. mergeExactEmail recomputes this from
// current state and requires it to match, so confirming a stale preflight (references changed
// underneath it -- e.g. a new event membership landed between preview and confirm) fails closed
// and forces a fresh preflight rather than silently merging a different reality than what was
// shown (#268 T005). Not a security boundary by itself -- assertOrganizerOf is -- just a
// stale-preview guard, so a fast non-cryptographic digest is enough here.
async function computeMergeConfirmationHash(args: {
  organizationId: Id<"organizations">;
  sourceContactId: Id<"crm_contacts">;
  targetContactId: Id<"crm_contacts">;
  sourceEmail: string;
  targetEmail: string;
  affected: { memberships: number; speakers: number; sourceRecords: number; stageHistory: number };
}): Promise<string> {
  const payload = JSON.stringify(args);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const list = query({
  args: { organizationId: v.id("organizations"), stage: v.optional(stage), minScore: v.optional(v.number()), maxScore: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    const contacts = await ctx.db.query("crm_contacts").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).collect();
    return contacts.filter((contact) =>
      (!args.stage || contact.stage === args.stage)
      && (args.minScore === undefined || contact.score >= args.minScore)
      && (args.maxScore === undefined || contact.score <= args.maxScore),
    );
  },
});

/**
 * Shows the exact references a reviewed merge would affect. Contacts can only be
 * merged after the organizer explicitly chooses both records; no name matching is
 * performed, and equal normalized emails are the sole eligibility criterion.
 */
export const mergePreflight = query({
  args: {
    organizationId: v.id("organizations"),
    sourceContactId: v.id("crm_contacts"),
    targetContactId: v.id("crm_contacts"),
  },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    if (args.sourceContactId === args.targetContactId) throw new Error("Choose two different contacts to merge.");
    const [source, target] = await Promise.all([ctx.db.get(args.sourceContactId), ctx.db.get(args.targetContactId)]);
    if (!source || !target || source.organizationId !== args.organizationId || target.organizationId !== args.organizationId)
      throw new Error("Both contacts must belong to this organization.");
    if (normalizedEmail(source.email) !== normalizedEmail(target.email))
      throw new Error("Only contacts with the exact same email address can be merged.");
    const [{ memberships, speakers, sourceRecords, history }, existingMerge] = await Promise.all([
      collectMergeReferences(ctx, source._id),
      ctx.db.query("crm_contact_merges").withIndex("by_source", (q) => q.eq("sourceContactId", source._id)).first(),
    ]);
    const affected = { memberships: memberships.length, speakers: speakers.length, sourceRecords: sourceRecords.length, stageHistory: history.length };
    const confirmationHash = await computeMergeConfirmationHash({
      organizationId: args.organizationId,
      sourceContactId: source._id,
      targetContactId: target._id,
      sourceEmail: source.email,
      targetEmail: target.email,
      affected,
    });
    return {
      source: { id: source._id, email: source.email, name: `${source.firstName} ${source.lastName}` },
      target: { id: target._id, email: target.email, name: `${target.firstName} ${target.lastName}` },
      affected,
      confirmationHash,
      ...(existingMerge && !existingMerge.reversedAt ? { alreadyMergedAt: existingMerge.mergedAt } : {}),
    };
  },
});

/**
 * Repoints all source-owned references in one transaction while retaining an audit tombstone.
 * Requires the `confirmationHash` from a fresh `mergePreflight` call (#268 T005) so a merge can
 * only be confirmed against the exact preview the caller reviewed. Idempotent: retrying an
 * already-applied merge (same source, still pointing at that same target) is a no-op that
 * returns the existing audit row rather than merging again -- checked BEFORE the hash is
 * validated, since a retry's affected counts are no longer what the original preflight saw (they
 * are already zero; everything moved the first time).
 */
export const mergeExactEmail = mutation({
  args: {
    organizationId: v.id("organizations"),
    sourceContactId: v.id("crm_contacts"),
    targetContactId: v.id("crm_contacts"),
    confirmationHash: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await assertOrganizerOf(ctx, args.organizationId);
    if (args.sourceContactId === args.targetContactId) throw new Error("Choose two different contacts to merge.");
    const [source, target] = await Promise.all([ctx.db.get(args.sourceContactId), ctx.db.get(args.targetContactId)]);
    if (!source || !target || source.organizationId !== args.organizationId || target.organizationId !== args.organizationId)
      throw new Error("Both contacts must belong to this organization.");

    if (source.mergedIntoContactId) {
      const existingMerge = await ctx.db.query("crm_contact_merges").withIndex("by_source", (q) => q.eq("sourceContactId", source._id)).first();
      if (source.mergedIntoContactId === target._id && existingMerge && !existingMerge.reversedAt)
        return { mergeId: existingMerge._id, alreadyMerged: true };
      throw new Error("This contact has already been merged.");
    }
    if (normalizedEmail(source.email) !== normalizedEmail(target.email))
      throw new Error("Only contacts with the exact same email address can be merged.");

    const { memberships, speakers, sourceRecords, history } = await collectMergeReferences(ctx, source._id);
    const affected = { memberships: memberships.length, speakers: speakers.length, sourceRecords: sourceRecords.length, stageHistory: history.length };
    const expectedHash = await computeMergeConfirmationHash({
      organizationId: args.organizationId,
      sourceContactId: source._id,
      targetContactId: target._id,
      sourceEmail: source.email,
      targetEmail: target.email,
      affected,
    });
    if (expectedHash !== args.confirmationHash)
      throw new Error("This merge preview is out of date. Review the contacts again before confirming.");

    const now = Date.now();
    const droppedMemberships: Array<{ eventId: Id<"events">; targetMembershipId: Id<"crm_event_contacts">; transferredSpeakerId?: Id<"speakers"> }> = [];
    for (const membership of memberships) {
      const targetMembership = await ctx.db.query("crm_event_contacts")
        .withIndex("by_event_contact", (q) => q.eq("eventId", membership.eventId).eq("contactId", target._id))
        .unique();
      if (targetMembership) {
        let transferredSpeakerId: Id<"speakers"> | undefined;
        if (!targetMembership.speakerId && membership.speakerId) {
          transferredSpeakerId = membership.speakerId;
          await ctx.db.patch(targetMembership._id, { speakerId: membership.speakerId, updatedAt: now });
        }
        droppedMemberships.push({ eventId: membership.eventId, targetMembershipId: targetMembership._id, transferredSpeakerId });
        await ctx.db.delete(membership._id);
      } else {
        await ctx.db.patch(membership._id, { contactId: target._id, updatedAt: now });
      }
    }
    await Promise.all([
      ...speakers.map((speaker) => ctx.db.patch(speaker._id, { contactId: target._id, updatedAt: now })),
      ...sourceRecords.map((record) => ctx.db.patch(record._id, { contactId: target._id, updatedAt: now })),
      ...history.map((entry) => ctx.db.patch(entry._id, { contactId: target._id })),
    ]);
    await ctx.db.patch(source._id, { mergedIntoContactId: target._id, updatedAt: now });
    const mergeId = await ctx.db.insert("crm_contact_merges", {
      organizationId: args.organizationId,
      sourceContactId: source._id,
      targetContactId: target._id,
      sourceSnapshot: {
        email: source.email,
        firstName: source.firstName,
        lastName: source.lastName,
        stage: source.stage,
        score: source.score,
        membershipIds: memberships.map((membership) => membership._id),
        speakerIds: speakers.map((speaker) => speaker._id),
        sourceRecordIds: sourceRecords.map((record) => record._id),
        stageHistoryIds: history.map((entry) => entry._id),
      },
      confirmationHash: expectedHash,
      droppedMemberships,
      mergedByUserId: identity.subject,
      mergedAt: now,
    });
    return { mergeId, alreadyMerged: false };
  },
});

/**
 * Reverses a merge, but only when nothing has changed underneath it since -- every reference the
 * merge captured must still point exactly where the merge left it (#268 T005). Idempotent:
 * reversing an already-reversed merge is a no-op. Rows the merge deleted (because the target
 * already had its own membership for that event) are recreated rather than left gone, and any
 * speakerId the merge transferred onto the target's membership is handed back only if it is
 * still exactly what the merge put there; if the target's membership changed since, reversal
 * refuses rather than guessing and silently dropping a speaker link.
 */
export const reverseMerge = mutation({
  args: { organizationId: v.id("organizations"), mergeId: v.id("crm_contact_merges") },
  handler: async (ctx, args) => {
    const identity = await assertOrganizerOf(ctx, args.organizationId);
    const merge = await ctx.db.get(args.mergeId);
    if (!merge || merge.organizationId !== args.organizationId) throw new Error("Merge record not found.");
    if (merge.reversedAt) return { reversed: false, alreadyReversed: true };

    const source = await ctx.db.get(merge.sourceContactId);
    if (!source) throw new Error("The merged contact no longer exists and cannot be restored automatically.");
    if (source.mergedIntoContactId !== merge.targetContactId)
      throw new Error("This merge no longer matches the current contact state and cannot be reversed automatically.");

    const [memberships, speakers, sourceRecords, history] = await Promise.all([
      Promise.all(merge.sourceSnapshot.membershipIds.map((id) => ctx.db.get(id))),
      Promise.all(merge.sourceSnapshot.speakerIds.map((id) => ctx.db.get(id))),
      Promise.all(merge.sourceSnapshot.sourceRecordIds.map((id) => ctx.db.get(id))),
      Promise.all(merge.sourceSnapshot.stageHistoryIds.map((id) => ctx.db.get(id))),
    ]);
    // Every reference that still exists must still point at the target the merge moved it to --
    // a later, independent change (e.g. another merge touched the same speaker) means an
    // automatic reversal can no longer be trusted to put things back correctly.
    const stillOnTarget = (rows: Array<{ contactId?: Id<"crm_contacts"> } | null>) =>
      rows.every((row) => row === null || row.contactId === merge.targetContactId);
    if (!stillOnTarget(memberships) || !stillOnTarget(speakers) || !stillOnTarget(sourceRecords) || !stillOnTarget(history))
      throw new Error("References have changed since this merge and it can no longer be reversed automatically.");

    const dropped = merge.droppedMemberships ?? [];
    for (const drop of dropped) {
      const targetMembership = await ctx.db.get(drop.targetMembershipId);
      if (drop.transferredSpeakerId && targetMembership?.speakerId !== drop.transferredSpeakerId)
        throw new Error("References have changed since this merge and it can no longer be reversed automatically.");
    }

    const now = Date.now();
    for (const id of merge.sourceSnapshot.membershipIds) {
      const membership = await ctx.db.get(id);
      if (membership) await ctx.db.patch(id, { contactId: merge.sourceContactId, updatedAt: now });
    }
    await Promise.all([
      ...merge.sourceSnapshot.speakerIds.map(async (id) => { const row = await ctx.db.get(id); if (row) await ctx.db.patch(id, { contactId: merge.sourceContactId, updatedAt: now }); }),
      ...merge.sourceSnapshot.sourceRecordIds.map(async (id) => { const row = await ctx.db.get(id); if (row) await ctx.db.patch(id, { contactId: merge.sourceContactId, updatedAt: now }); }),
      ...merge.sourceSnapshot.stageHistoryIds.map(async (id) => { const row = await ctx.db.get(id); if (row) await ctx.db.patch(id, { contactId: merge.sourceContactId }); }),
    ]);
    for (const drop of dropped) {
      await ctx.db.insert("crm_event_contacts", {
        eventId: drop.eventId,
        contactId: merge.sourceContactId,
        speakerId: drop.transferredSpeakerId,
        createdAt: now,
        updatedAt: now,
      });
      if (drop.transferredSpeakerId) await ctx.db.patch(drop.targetMembershipId, { speakerId: undefined, updatedAt: now });
    }
    await ctx.db.patch(merge.sourceContactId, {
      mergedIntoContactId: undefined,
      stage: merge.sourceSnapshot.stage,
      score: merge.sourceSnapshot.score,
      updatedAt: now,
    });
    await ctx.db.patch(args.mergeId, { reversedByUserId: identity.subject, reversedAt: now });
    return { reversed: true, alreadyReversed: false };
  },
});

function matchesDirectoryFilters(contact: Doc<"crm_contacts">, args: { stage?: typeof contact.stage; minScore?: number; maxScore?: number }) {
  return (!args.stage || contact.stage === args.stage)
    && (args.minScore === undefined || contact.score >= args.minScore)
    && (args.maxScore === undefined || contact.score <= args.maxScore);
}

// Paginates a computed (non-index-backed) contact array the same shape .paginate() returns, for
// the event-limited branch below where the authorized set comes from event membership rather
// than a single ordered index scan.
function paginateContacts(contacts: Doc<"crm_contacts">[], paginationOpts: { numItems: number; cursor: string | null }) {
  const sorted = [...contacts].sort((a, b) => b.createdAt - a.createdAt);
  const start = paginationOpts.cursor ? sorted.findIndex((contact) => contact._id === paginationOpts.cursor) + 1 : 0;
  const page = sorted.slice(start, start + paginationOpts.numItems);
  const isDone = start + page.length >= sorted.length;
  return { page, isDone, continueCursor: isDone ? "" : (page[page.length - 1]?._id ?? "") };
}

/**
 * Organization-wide, cross-event contact directory (#268 T003). An owner/admin gets an
 * index-scoped page straight off `crm_contacts.by_organization` -- O(page size) reads regardless
 * of organization size, satisfying the 10k-contact pagination requirement. An event-limited
 * caller (see assertOrganizationCrmAccess) never touches that index at all: their authorized
 * contact set is resolved from their own event memberships first (bounded by the events they
 * were actually given, not organization size) and paginated in memory. Merged (tombstoned)
 * contacts are always excluded.
 */
export const listOrganizationDirectory = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    stage: v.optional(stage),
    minScore: v.optional(v.number()),
    maxScore: v.optional(v.number()),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    const access = await assertOrganizationCrmAccess(ctx, args.organizationId);
    if (access.scope === "events" && args.eventId && !access.eventIds.includes(args.eventId))
      throw new Error("Forbidden: event access required.");

    if (access.scope === "organization" && !args.eventId) {
      const result = await ctx.db.query("crm_contacts")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .order("desc")
        .paginate(args.paginationOpts);
      return { ...result, page: result.page.filter((contact) => !contact.mergedIntoContactId && matchesDirectoryFilters(contact, args)) };
    }

    // Either an event-limited caller, or an org admin filtering to one event: resolve the
    // authorized contact set from event membership (one batched query per authorized event,
    // never one per directory row), then paginate that bounded set.
    const eventIds = args.eventId ? [args.eventId] : access.scope === "events" ? access.eventIds : [];
    const membershipLists = await Promise.all(
      eventIds.map((eventId) => ctx.db.query("crm_event_contacts").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()),
    );
    const contactIds = [...new Set(membershipLists.flat().map((membership) => membership.contactId))];
    const contacts = await Promise.all(contactIds.map((contactId) => ctx.db.get(contactId)));
    const authorized = contacts.filter((contact): contact is Doc<"crm_contacts"> =>
      Boolean(contact) && contact!.organizationId === args.organizationId && !contact!.mergedIntoContactId && matchesDirectoryFilters(contact!, args));
    return paginateContacts(authorized, args.paginationOpts);
  },
});

/**
 * Cross-event detail projection for one organization contact (#268 T003). An owner/admin
 * receives every authorized field: full event participation, speaker links, org-wide stage/score
 * history, and imported-source provenance. An event-limited caller receives identity plus only
 * the event participation/speaker links for events they were explicitly given -- and, since
 * stage/score history and source provenance are organization-wide (not tied to any one event),
 * those are conservatively withheld rather than leaked alongside a shared-event contact. A
 * contact with zero authorized memberships reads as not-found, never as a permission error, so
 * an event-limited caller cannot use this to confirm a contact exists elsewhere in the org.
 */
export const getOrganizationContact = query({
  args: { organizationId: v.id("organizations"), contactId: v.id("crm_contacts") },
  handler: async (ctx, args) => {
    const access = await assertOrganizationCrmAccess(ctx, args.organizationId);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) throw new Error("Contact not found.");

    const memberships = await ctx.db.query("crm_event_contacts").withIndex("by_contact", (q) => q.eq("contactId", contact._id)).collect();
    const authorizedMemberships = access.scope === "organization"
      ? memberships
      : memberships.filter((membership) => access.eventIds.includes(membership.eventId));
    if (access.scope === "events" && authorizedMemberships.length === 0) throw new Error("Contact not found.");

    const events = await Promise.all(authorizedMemberships.map((membership) => ctx.db.get(membership.eventId)));
    const eventParticipation = events.flatMap((event, index) =>
      event ? [{ event, membershipId: authorizedMemberships[index]!._id, speakerId: authorizedMemberships[index]!.speakerId }] : []);

    if (access.scope === "events") {
      const speakerIds = [...new Set(authorizedMemberships.flatMap((membership) => membership.speakerId ? [membership.speakerId] : []))];
      const speakers = await Promise.all(speakerIds.map((speakerId) => ctx.db.get(speakerId)));
      return {
        contact: { _id: contact._id, email: contact.email, firstName: contact.firstName, lastName: contact.lastName, stage: contact.stage, score: contact.score },
        events: eventParticipation,
        speakers: speakers.filter((speaker): speaker is NonNullable<typeof speaker> => Boolean(speaker)),
        history: [] as Doc<"crm_stage_history">[],
        sources: [] as Doc<"crm_source_records">[],
      };
    }

    const [speakers, sourceRecords, history] = await Promise.all([
      ctx.db.query("speakers").withIndex("by_contact", (q) => q.eq("contactId", contact._id)).collect(),
      ctx.db.query("crm_source_records").withIndex("by_contact", (q) => q.eq("contactId", contact._id)).collect(),
      ctx.db.query("crm_stage_history").withIndex("by_contact_createdAt", (q) => q.eq("contactId", contact._id)).collect(),
    ]);
    return { contact, events: eventParticipation, speakers, history, sources: sourceRecords };
  },
});

/**
 * Assigns an organization contact to an event's CRM roster (#268 T004). Uses the same
 * organization/event-scoped auth as the directory/detail projections above: an owner/admin may
 * assign to any event in the organization, an event-limited organizer only to events they were
 * explicitly given. Never creates or mutates the underlying contact -- only the join row, so
 * assignment/unlink can never lose the contact's cross-event history.
 */
export const assignOrganizationContactToEvent = mutation({
  args: { organizationId: v.id("organizations"), contactId: v.id("crm_contacts"), eventId: v.id("events") },
  handler: async (ctx, args) => {
    const access = await assertOrganizationCrmAccess(ctx, args.organizationId);
    if (access.scope === "events" && !access.eventIds.includes(args.eventId)) throw new Error("Forbidden: event access required.");
    const [contact, event] = await Promise.all([ctx.db.get(args.contactId), ctx.db.get(args.eventId)]);
    if (!contact || contact.organizationId !== args.organizationId) throw new Error("Contact not found.");
    if (contact.mergedIntoContactId) throw new Error("This contact has been merged. Assign the retained contact instead.");
    if (!event || event.organizationId !== args.organizationId) throw new Error("Event does not belong to this organization.");
    const existing = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", args.contactId)).unique();
    if (existing) return { membershipId: existing._id, created: false };
    const now = Date.now();
    const speaker = await ctx.db.query("speakers").withIndex("by_event_email", (q) => q.eq("eventId", args.eventId).eq("email", contact.email)).unique();
    const membershipId = await ctx.db.insert("crm_event_contacts", { eventId: args.eventId, contactId: args.contactId, speakerId: speaker?._id, createdAt: now, updatedAt: now });
    return { membershipId, created: true };
  },
});

/**
 * Unlinks an organization contact from one event's CRM roster (#268 T004). Deletes only the
 * join row -- the organization contact and any speaker record are never touched, so unlinking
 * from one event never loses the contact's history on any other event. Blocked when a speaker is
 * still attached, matching the existing event-scoped unlinkFromEvent: archive instead so speaker
 * and portal history is not orphaned.
 */
export const unlinkOrganizationContactFromEvent = mutation({
  args: { organizationId: v.id("organizations"), contactId: v.id("crm_contacts"), eventId: v.id("events") },
  handler: async (ctx, args) => {
    const access = await assertOrganizationCrmAccess(ctx, args.organizationId);
    if (access.scope === "events" && !access.eventIds.includes(args.eventId)) throw new Error("Forbidden: event access required.");
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) throw new Error("Contact not found.");
    const membership = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", args.contactId)).unique();
    if (!membership) return { unlinked: false };
    if (membership.speakerId) throw new Error("This contact is linked to a speaker and must remain attached to preserve speaker and portal history. Archive it instead.");
    await ctx.db.delete(membership._id);
    return { unlinked: true };
  },
});

/** Event-scoped CRM projection for the organizer UI; never returns contacts from another event. */
export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await assertEventOrganizerAccess(ctx, eventId);
    const memberships = await ctx.db.query("crm_event_contacts").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const contacts = await Promise.all(memberships.map((membership) => ctx.db.get(membership.contactId)));
    return contacts.flatMap((contact, index) => contact ? [{ ...contact, eventId, speakerId: memberships[index]?.speakerId }] : []);
  },
});

export const listSegmentsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await assertEventOrganizerAccess(ctx, eventId);
    const event = await ctx.db.get(eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const segments = await ctx.db.query("crm_segments").withIndex("by_organization", (q) => q.eq("organizationId", event.organizationId!)).collect();
    return segments.filter((segment) => segment.eventId === eventId);
  },
});

export const saveSegmentForEvent = mutation({
  args: { eventId: v.id("events"), id: v.optional(v.id("crm_segments")), name: v.string(), stage: v.optional(stage), minScore: v.optional(v.number()), maxScore: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const name = text(args.name, "Segment name");
    if (args.minScore !== undefined) score(args.minScore);
    if (args.maxScore !== undefined) score(args.maxScore);
    if (args.minScore !== undefined && args.maxScore !== undefined && args.minScore > args.maxScore) throw new Error("Minimum score must not exceed maximum score.");
    const now = Date.now(); const values = { organizationId: event.organizationId, name, stage: args.stage, minScore: args.minScore, maxScore: args.maxScore, eventId: args.eventId, updatedAt: now };
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.organizationId !== event.organizationId || existing.eventId !== args.eventId) throw new Error("Segment not found.");
      await ctx.db.patch(args.id, values);
      return args.id;
    }
    return ctx.db.insert("crm_segments", { ...values, createdAt: now });
  },
});

export const save = mutation({
  args: { id: v.optional(v.id("crm_contacts")), organizationId: v.id("organizations"), firstName: v.string(), lastName: v.string(), email: v.string(), stage, score: v.number() },
  handler: async (ctx, args) => {
    const identity = await assertOrganizerOf(ctx, args.organizationId);
    const email = normalizedEmail(args.email);
    const firstName = text(args.firstName, "First name");
    const lastName = text(args.lastName, "Last name");
    const nextScore = score(args.score);
    const now = Date.now();
    const duplicate = await findActiveContactByEmail(ctx, args.organizationId, email);
    if (duplicate && duplicate._id !== args.id) throw new Error("A contact with this email already exists in this organization.");
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.organizationId !== args.organizationId) throw new Error("Contact not found.");
      await ctx.db.patch(args.id, { email, firstName, lastName, stage: args.stage, score: nextScore, updatedAt: now });
      if (existing.stage !== args.stage || existing.score !== nextScore) await ctx.db.insert("crm_stage_history", { organizationId: args.organizationId, contactId: args.id, stage: args.stage, score: nextScore, changedByUserId: identity.subject, createdAt: now });
      return args.id;
    }
    const id = await ctx.db.insert("crm_contacts", { organizationId: args.organizationId, email, firstName, lastName, stage: args.stage, score: nextScore, createdAt: now, updatedAt: now });
    await ctx.db.insert("crm_stage_history", { organizationId: args.organizationId, contactId: id, stage: args.stage, score: nextScore, changedByUserId: identity.subject, createdAt: now });
    return id;
  },
});

export const saveForEvent = mutation({
  args: { eventId: v.id("events"), id: v.optional(v.id("crm_contacts")), firstName: v.string(), lastName: v.string(), email: v.string(), stage, score: v.number() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const email = normalizedEmail(args.email); const firstName = text(args.firstName, "First name"); const lastName = text(args.lastName, "Last name"); const nextScore = score(args.score); const now = Date.now();
    const duplicate = await findActiveContactByEmail(ctx, event.organizationId, email);
    if (duplicate && duplicate._id !== args.id) throw new Error("A contact with this email already exists in this organization.");
    let id = args.id;
    if (id) {
      const current = await ctx.db.get(id);
      if (!current || current.organizationId !== event.organizationId) throw new Error("Contact not found.");
      await ctx.db.patch(id, { email, firstName, lastName, stage: args.stage, score: nextScore, updatedAt: now });
      if (current.stage !== args.stage || current.score !== nextScore) {
        await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId: id, stage: args.stage, score: nextScore, changedByUserId: identity.subject, createdAt: now });
      }
    } else {
      id = await ctx.db.insert("crm_contacts", { organizationId: event.organizationId, email, firstName, lastName, stage: args.stage, score: nextScore, createdAt: now, updatedAt: now });
      await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId: id, stage: args.stage, score: nextScore, changedByUserId: identity.subject, createdAt: now });
    }
    const membership = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", id)).unique();
    if (!membership) await ctx.db.insert("crm_event_contacts", { eventId: args.eventId, contactId: id, createdAt: now, updatedAt: now });
    return id;
  },
});

/** Archive rather than delete, keeping speaker, portal, and event-history references intact. */
export const archiveForEvent = mutation({
  args: { eventId: v.id("events"), contactIds: v.array(v.id("crm_contacts")) },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const uniqueIds = [...new Set(args.contactIds)];
    if (uniqueIds.length === 0) return { archived: 0 };
    const now = Date.now();
    let archived = 0;
    for (const contactId of uniqueIds) {
      const [contact, membership] = await Promise.all([
        ctx.db.get(contactId),
        ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", contactId)).unique(),
      ]);
      if (!contact || contact.organizationId !== event.organizationId || !membership) throw new Error("Contact not found for this event.");
      if (contact.stage === "archived") continue;
      await ctx.db.patch(contactId, { stage: "archived", updatedAt: now });
      await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId, stage: "archived", score: contact.score, changedByUserId: identity.subject, createdAt: now });
      archived += 1;
    }
    return { archived };
  },
});

export const bulkStageForEvent = mutation({
  args: { eventId: v.id("events"), contactIds: v.array(v.id("crm_contacts")), stage },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM access.");
    const uniqueIds = [...new Set(args.contactIds)];
    if (uniqueIds.length === 0) return { updated: 0 };
    const now = Date.now();
    let updated = 0;
    for (const contactId of uniqueIds) {
      const [contact, membership] = await Promise.all([
        ctx.db.get(contactId),
        ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", contactId)).unique(),
      ]);
      if (!contact || contact.organizationId !== event.organizationId || !membership) throw new Error("Contact not found for this event.");
      if (contact.stage === args.stage) continue;
      await ctx.db.patch(contactId, { stage: args.stage, updatedAt: now });
      await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId, stage: args.stage, score: contact.score, changedByUserId: identity.subject, createdAt: now });
      updated += 1;
    }
    return { updated };
  },
});

export const assignToEvent = mutation({
  args: { eventId: v.id("events"), contactId: v.id("crm_contacts") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const [event, contact] = await Promise.all([ctx.db.get(args.eventId), ctx.db.get(args.contactId)]);
    if (!event?.organizationId || !contact || contact.organizationId !== event.organizationId) throw new Error("Contact does not belong to this event organization.");
    const existing = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", args.contactId)).unique();
    if (existing) return existing._id;
    const now = Date.now();
    const speaker = await ctx.db.query("speakers").withIndex("by_event_email", (q) => q.eq("eventId", args.eventId).eq("email", contact.email)).unique();
    return ctx.db.insert("crm_event_contacts", { eventId: args.eventId, contactId: args.contactId, speakerId: speaker?._id, createdAt: now, updatedAt: now });
  },
});

export const unlinkFromEvent = mutation({
  args: { eventId: v.id("events"), contactId: v.id("crm_contacts") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const membership = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", args.contactId)).unique();
    if (!membership) return { unlinked: false };
    if (membership.speakerId) throw new Error("This contact is linked to a speaker and must remain attached to preserve speaker and portal history. Archive it instead.");
    await ctx.db.delete(membership._id);
    return { unlinked: true };
  },
});

export const listSegments = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    return ctx.db.query("crm_segments").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).collect();
  },
});

export const saveSegment = mutation({
  args: { id: v.optional(v.id("crm_segments")), organizationId: v.id("organizations"), name: v.string(), stage: v.optional(stage), minScore: v.optional(v.number()), maxScore: v.optional(v.number()), eventId: v.optional(v.id("events")), confirmationStatus: v.optional(confirmation), profileComplete: v.optional(v.boolean()), outstandingTasks: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertOrganizerOf(ctx, args.organizationId);
    const name = text(args.name, "Segment name");
    if (args.minScore !== undefined) score(args.minScore);
    if (args.maxScore !== undefined) score(args.maxScore);
    if (args.minScore !== undefined && args.maxScore !== undefined && args.minScore > args.maxScore) throw new Error("Minimum score must not exceed maximum score.");
    if (args.eventId) { const event = await ctx.db.get(args.eventId); if (!event || event.organizationId !== args.organizationId) throw new Error("Event does not belong to this organization."); }
    const now = Date.now();
    const values = { organizationId: args.organizationId, name, stage: args.stage, minScore: args.minScore, maxScore: args.maxScore, eventId: args.eventId, confirmationStatus: args.confirmationStatus, profileComplete: args.profileComplete, outstandingTasks: args.outstandingTasks, updatedAt: now };
    if (args.id) { const existing = await ctx.db.get(args.id); if (!existing || existing.organizationId !== args.organizationId) throw new Error("Segment not found."); await ctx.db.patch(args.id, values); return args.id; }
    return ctx.db.insert("crm_segments", { ...values, createdAt: now });
  },
});

// Safe, repeatable migration entry point. It only links legacy records and never removes or
// rewrites a speaker's portal/account references.
export const backfillEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event?.organizationId) throw new Error("This event needs an organization before CRM migration.");
    const speakers = await ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    let linked = 0;
    for (const speaker of speakers) {
      const email = normalizedEmail(speaker.email);
      let contactId = speaker.contactId;
      if (!contactId) {
        const existing = await findActiveContactByEmail(ctx, event.organizationId, email);
        const now = Date.now();
        contactId = existing?._id ?? await ctx.db.insert("crm_contacts", { organizationId: event.organizationId, email, firstName: speaker.firstName, lastName: speaker.lastName, stage: speaker.confirmationStatus === "confirmed" ? "confirmed" : speaker.confirmationStatus === "declined" ? "declined" : "invited", score: 0, createdAt: now, updatedAt: now });
        if (!existing) await ctx.db.insert("crm_stage_history", { organizationId: event.organizationId, contactId, stage: speaker.confirmationStatus === "confirmed" ? "confirmed" : speaker.confirmationStatus === "declined" ? "declined" : "invited", score: 0, changedByUserId: identity.subject, createdAt: now });
        await ctx.db.patch(speaker._id, { contactId, updatedAt: now });
      }
      const membership = await ctx.db.query("crm_event_contacts").withIndex("by_event_contact", (q) => q.eq("eventId", args.eventId).eq("contactId", contactId!)).unique();
      if (!membership) { const now = Date.now(); await ctx.db.insert("crm_event_contacts", { eventId: args.eventId, contactId: contactId!, speakerId: speaker._id, createdAt: now, updatedAt: now }); linked += 1; }
    }
    return { linked, total: speakers.length };
  },
});

export type CrmContactId = Id<"crm_contacts">;
