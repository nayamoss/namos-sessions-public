import { v } from "convex/values";
import { mutation, query, requireIdentity, assertEventAccess, isOrganizer } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { UserIdentity } from "convex/server";

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
  },
});

function requiredSpeakerText(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > 200) throw new Error(`${label} is too long.`);
  return trimmed;
}

function normalizedSpeakerEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

const importRow = v.object({
  firstName: v.string(), lastName: v.string(), email: v.string(), bio: v.optional(v.string()),
  talkTitle: v.optional(v.string()), talkAbstract: v.optional(v.string()),
});

export const bulkImport = mutation({
  args: { eventId: v.id("events"), rows: v.array(importRow) },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    if (args.rows.length > 500) throw new Error(`This file has ${args.rows.length} rows; the limit is 500. Split it into two files.`);
    if (!await ctx.db.get(args.eventId)) throw new Error("Event not found.");

    const now = Date.now();
    let importedSpeakers = 0;
    let importedTalks = 0;
    const skipped: Array<{ row: number; reason: string }> = [];
    let importFormId: Id<"submission_forms"> | undefined;

    const getImportForm = async () => {
      if (importFormId) return importFormId;
      const forms = await ctx.db.query("submission_forms").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
      const existing = forms.find((form) => form.internalName === "Imported from CSV");
      if (existing) { importFormId = existing._id; return importFormId; }
      importFormId = await ctx.db.insert("submission_forms", {
        eventId: args.eventId, internalName: "Imported from CSV", externalTitle: "Imported from CSV", pageHeading: "Imported from CSV", version: 1,
        kind: "session", collectParticipants: false, showWelcomeMessage: false, sections: [], participantRoles: [], crossFieldLimits: [], routingRules: [],
        allowMultipleDrafts: false, autoRedirectToPortal: false, reminderEmailEnabled: false, adminUserIds: [], notifyAdminsOnNew: [], notifyAdminsOnUpdate: [], sendSubmitterConfirmation: false,
        status: "closed", createdAt: now, updatedAt: now,
      });
      return importFormId;
    };

    for (const [index, row] of args.rows.entries()) {
      let firstName: string;
      let lastName: string;
      let email: string;
      try {
        firstName = requiredSpeakerText(row.firstName, "First name");
        lastName = requiredSpeakerText(row.lastName, "Last name");
        email = normalizedSpeakerEmail(row.email);
      } catch (error) {
        skipped.push({ row: index + 1, reason: error instanceof Error ? error.message : "Invalid speaker row." });
        continue;
      }
      const duplicate = await ctx.db.query("speakers").withIndex("by_event_email", (q) => q.eq("eventId", args.eventId).eq("email", email)).unique();
      if (duplicate) {
        skipped.push({ row: index + 1, reason: "Speaker with this email already exists for this event" });
        continue;
      }
      const speakerId = await ctx.db.insert("speakers", {
        eventId: args.eventId, firstName, lastName, email, bio: row.bio?.trim() || undefined,
        confirmationStatus: "awaiting", status: "active", createdAt: now, updatedAt: now,
      });
      importedSpeakers += 1;
      const title = row.talkTitle?.trim();
      if (title) {
        const formId = await getImportForm();
        await ctx.db.insert("submissions", {
          eventId: args.eventId, formId, speakerId, title, status: "accepted", answers: { abstract: row.talkAbstract?.trim() ?? "" }, submittedAt: now, createdAt: now, updatedAt: now,
        });
        importedTalks += 1;
      }
    }
    return { importedSpeakers, importedTalks, skipped };
  },
});

export const create = mutation({
  args: {
    eventId: v.id("events"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    confirmationStatus: v.optional(v.union(v.literal("awaiting"), v.literal("confirmed"), v.literal("declined"))),
  },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const firstName = requiredSpeakerText(args.firstName, "First name");
    const lastName = requiredSpeakerText(args.lastName, "Last name");
    const email = normalizedSpeakerEmail(args.email);
    const duplicate = await ctx.db.query("speakers").withIndex("by_event_email", (q) => q.eq("eventId", args.eventId).eq("email", email)).unique();
    if (duplicate) throw new Error("A speaker with this email already exists for this event.");
    const now = Date.now();
    return ctx.db.insert("speakers", {
      eventId: args.eventId,
      firstName,
      lastName,
      email,
      confirmationStatus: args.confirmationStatus ?? "awaiting",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setConfirmationStatus = mutation({
  args: {
    eventId: v.id("events"),
    speakerId: v.id("speakers"),
    status: v.union(v.literal("awaiting"), v.literal("confirmed"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const speaker = await ctx.db.get(args.speakerId);
    if (!speaker || speaker.eventId !== args.eventId) throw new Error("Speaker not found for this event.");
    await ctx.db.patch(args.speakerId, { confirmationStatus: args.status, updatedAt: Date.now() });
  },
});

// Speaker portal ownership: a signed-in speaker may only read/write their own record and
// documents. We never trust a client-supplied speakerId on its own — the caller's Clerk
// identity.email must match the speaker.email on file.
// Email must be provider-verified (emailVerified === true) — an unverified claim is
// user-controlled and would let anyone type a target speaker's address and hijack their record.
export function assertOwnsSpeaker(identity: UserIdentity, speaker: Doc<"speakers">) {
  if (!identity.email || identity.emailVerified !== true || identity.email.toLowerCase() !== speaker.email.toLowerCase()) {
    throw new Error("Forbidden: this speaker record does not belong to you.");
  }
}

// Some functions are legitimately called by both the organizer dashboard (any speaker) and
// the speaker portal (only their own record) — e.g. availability, onboarding tasks. An
// organizer passes; anyone else must own the speaker record they're touching.
export async function assertOrganizerOrOwnsSpeaker(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, speakerId: Id<"speakers">) {
  const identity = await requireIdentity(ctx);
  if (await isOrganizer(ctx, identity)) return identity;
  const speaker = await ctx.db.get(speakerId);
  if (!speaker || speaker.eventId !== eventId) throw new Error("Speaker not found for this event.");
  assertOwnsSpeaker(identity, speaker);
  return identity;
}

// Resolves the signed-in Clerk account to its speaker record for a given event, by email.
// This is the only supported way for the portal to determine "who am I" — it replaces any
// client-supplied speakerId as the source of truth for identity.
export const getMine = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (!identity.email || identity.emailVerified !== true) return null;
    const email = identity.email.toLowerCase();
    const speakers = await ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return speakers.find((speaker) => speaker.email.toLowerCase() === email) ?? null;
  },
});

async function scopedOwnedSpeaker(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, speakerId: Id<"speakers">) {
  const identity = await requireIdentity(ctx);
  const speaker = await ctx.db.get(speakerId);
  if (!speaker || speaker.eventId !== eventId) throw new Error("Speaker not found for this event.");
  assertOwnsSpeaker(identity, speaker);
  return speaker;
}

const optionalProfileText = v.optional(v.string());

function profileText(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length > 5_000) throw new Error(`${label} is too long.`);
  return trimmed || undefined;
}

function profileUrl(value: string | undefined, label: string) {
  const trimmed = profileText(value, label);
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
    return url.toString();
  } catch {
    throw new Error(`${label} must be a valid http(s) URL.`);
  }
}

export const updateProfile = mutation({
  args: {
    eventId: v.id("events"), speakerId: v.id("speakers"), firstName: v.string(), lastName: v.string(),
    bio: optionalProfileText, salutation: optionalProfileText, honorific: optionalProfileText, pronouns: optionalProfileText, gender: optionalProfileText,
    linkedinUrl: optionalProfileText, xUrl: optionalProfileText, facebookUrl: optionalProfileText, websiteUrl: optionalProfileText,
  },
  handler: async (ctx, args) => {
    await scopedOwnedSpeaker(ctx, args.eventId, args.speakerId);
    const firstName = profileText(args.firstName, "First name");
    const lastName = profileText(args.lastName, "Last name");
    if (!firstName || !lastName) throw new Error("First and last name are required.");
    await ctx.db.patch(args.speakerId, {
      firstName, lastName,
      bio: profileText(args.bio, "Biography"), salutation: profileText(args.salutation, "Salutation"), honorific: profileText(args.honorific, "Honorific"), pronouns: profileText(args.pronouns, "Pronouns"), gender: profileText(args.gender, "Gender"),
      linkedinUrl: profileUrl(args.linkedinUrl, "LinkedIn URL"), xUrl: profileUrl(args.xUrl, "X URL"), facebookUrl: profileUrl(args.facebookUrl, "Facebook URL"), websiteUrl: profileUrl(args.websiteUrl, "Website URL"),
      updatedAt: Date.now(),
    });
  },
});

// The upload URL is issued only after the caller is verified to own this speaker record. The
// follow-up mutation repeats that check and validates the stored object before it becomes a
// profile asset.
export const requestHeadshotUpload = mutation({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    await scopedOwnedSpeaker(ctx, args.eventId, args.speakerId);
    return { uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const saveHeadshot = mutation({
  args: { eventId: v.id("events"), speakerId: v.id("speakers"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const speaker = await scopedOwnedSpeaker(ctx, args.eventId, args.speakerId);
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) throw new Error("The uploaded headshot could not be found.");
    if (!metadata.contentType?.startsWith("image/")) throw new Error("Headshots must be image files.");
    if (metadata.size > 10 * 1024 * 1024) throw new Error("Headshots must be 10 MB or smaller.");

    await ctx.db.patch(args.speakerId, { headshotStorageKey: String(args.storageId), updatedAt: Date.now() });
    if (speaker.headshotStorageKey && speaker.headshotStorageKey !== String(args.storageId)) {
      await ctx.storage.delete(speaker.headshotStorageKey as Id<"_storage">);
    }
  },
});

export const headshotUrl = query({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    const speaker = await scopedOwnedSpeaker(ctx, args.eventId, args.speakerId);
    return speaker.headshotStorageKey ? ctx.storage.getUrl(speaker.headshotStorageKey as Id<"_storage">) : null;
  },
});
