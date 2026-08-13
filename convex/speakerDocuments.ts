import { v } from "convex/values";
import { mutation, query, requireIdentity } from "./functions";
import { assertOwnsSpeaker } from "./speakers";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const documentKind = v.union(v.literal("slides"), v.literal("supporting_doc"));
const maxDocumentBytes = 10 * 1024 * 1024;

// A signed-in speaker may only read/write documents on their own submission — the
// client-supplied speakerId is never trusted on its own.
async function requireScope(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  submissionId: Id<"submissions">,
  speakerId: Id<"speakers">,
) {
  const identity = await requireIdentity(ctx);
  const [event, speaker, submission] = await Promise.all([
    ctx.db.get(eventId),
    ctx.db.get(speakerId),
    ctx.db.get(submissionId),
  ]);
  if (!event || !speaker || speaker.eventId !== eventId) {
    throw new Error("Speaker not found for this event.");
  }
  assertOwnsSpeaker(identity, speaker);
  if (!submission || submission.eventId !== eventId || submission.speakerId !== speakerId) {
    throw new Error("Submission not found for this speaker.");
  }
}

export const requestUpload = mutation({
  args: { eventId: v.id("events"), submissionId: v.id("submissions"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    await requireScope(ctx, args.eventId, args.submissionId, args.speakerId);
    return { uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const save = mutation({
  args: {
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    speakerId: v.id("speakers"),
    kind: documentKind,
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireScope(ctx, args.eventId, args.submissionId, args.speakerId);
    const fileName = args.fileName.trim();
    if (!fileName || fileName.length > 255) throw new Error("The uploaded file needs a valid name.");
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) throw new Error("The uploaded document could not be found.");
    if (metadata.size > maxDocumentBytes) throw new Error("Speaker documents must be 10 MB or smaller.");
    return ctx.db.insert("speaker_documents", {
      submissionId: args.submissionId,
      speakerId: args.speakerId,
      kind: args.kind,
      fileUrl: String(args.storageId),
      fileName,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { eventId: v.id("events"), submissionId: v.id("submissions"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    await requireScope(ctx, args.eventId, args.submissionId, args.speakerId);
    const documents = await ctx.db.query("speaker_documents")
      .withIndex("by_submission", (q) => q.eq("submissionId", args.submissionId))
      .collect();
    const resolved = await Promise.all(documents
      .filter((document) => document.speakerId === args.speakerId)
      .map(async (document) => ({
        ...document,
        fileUrl: await ctx.storage.getUrl(document.fileUrl as Id<"_storage">),
      })));
    return resolved.filter((document): document is typeof document & { fileUrl: string } => Boolean(document.fileUrl));
  },
});

export const remove = mutation({
  args: {
    eventId: v.id("events"),
    submissionId: v.id("submissions"),
    speakerId: v.id("speakers"),
    documentId: v.id("speaker_documents"),
  },
  handler: async (ctx, args) => {
    await requireScope(ctx, args.eventId, args.submissionId, args.speakerId);
    const document = await ctx.db.get(args.documentId);
    if (!document || document.submissionId !== args.submissionId || document.speakerId !== args.speakerId) {
      throw new Error("Speaker document not found.");
    }
    await ctx.db.delete(args.documentId);
    await ctx.storage.delete(document.fileUrl as Id<"_storage">);
  },
});
