import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mutation, query, assertEventOrganizerAccess } from "./functions";

const provider = v.union(v.literal("resend"), v.literal("ses"));

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeMessageId = (value: string | undefined) => value?.trim().replace(/^<|>$/g, "") || undefined;

export const list = query({
  args: { eventId: v.id("events"), status: v.optional(v.union(v.literal("matched"), v.literal("unmatched"), v.literal("resolved"))) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const rows = await ctx.db.query("inbound_messages").withIndex("by_event_receivedAt", (q) => q.eq("eventId", args.eventId)).collect();
    return rows.filter((row) => !args.status || row.triageStatus === args.status).sort((a, b) => b.receivedAt - a.receivedAt);
  },
});

export const link = mutation({
  args: { eventId: v.id("events"), messageId: v.id("inbound_messages"), speakerId: v.optional(v.id("speakers")), submissionId: v.optional(v.id("submissions")) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const row = await ctx.db.get(args.messageId);
    if (!row || row.eventId !== args.eventId) throw new Error("Inbound message not found.");
    if (args.speakerId) { const speaker = await ctx.db.get(args.speakerId); if (!speaker || speaker.eventId !== args.eventId) throw new Error("Speaker not found."); }
    if (args.submissionId) { const submission = await ctx.db.get(args.submissionId); if (!submission || submission.eventId !== args.eventId) throw new Error("Submission not found."); }
    await ctx.db.patch(args.messageId, { speakerId: args.speakerId, submissionId: args.submissionId, triageStatus: "resolved" });
  },
});

export const saveDomain = mutation({
  args: { eventId: v.id("events"), provider, domain: v.string(), aliasLocalPart: v.string(), mode: v.union(v.literal("managed"), v.literal("custom")), verified: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const domain = args.domain.trim().toLowerCase();
    const aliasLocalPart = args.aliasLocalPart.trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) || !/^[a-z0-9._+-]{1,64}$/i.test(aliasLocalPart)) throw new Error("Enter a valid reply domain and alias.");
    const now = Date.now();
    const existing = await ctx.db.query("inbound_email_domains").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    const match = existing.find((row) => row.provider === args.provider && row.domain === domain && row.aliasLocalPart === aliasLocalPart);
    const values = { eventId: args.eventId, provider: args.provider, domain, aliasLocalPart, mode: args.mode, verifiedAt: args.verified ? now : undefined, updatedAt: now } as const;
    if (match) { await ctx.db.patch(match._id, values); return match._id; }
    return ctx.db.insert("inbound_email_domains", { ...values, createdAt: now });
  },
});

// HTTP/webhook adapters call this server-only mutation only after verifying their provider
// signature. We store plain-text excerpts, never raw MIME bodies or attachments.
export const ingest = internalMutation({
  args: { eventId: v.id("events"), provider, messageId: v.string(), inReplyTo: v.optional(v.string()), references: v.array(v.string()), fromEmail: v.string(), subject: v.string(), text: v.string(), receivedAt: v.number() },
  handler: async (ctx, args) => {
    const messageId = normalizeMessageId(args.messageId);
    if (!messageId) throw new Error("Inbound email needs a Message-ID.");
    const duplicate = await ctx.db.query("inbound_messages").withIndex("by_messageId", (q) => q.eq("messageId", messageId)).unique();
    if (duplicate) return duplicate._id;
    const candidateIds = [args.inReplyTo, ...args.references].map(normalizeMessageId).filter((value): value is string => Boolean(value));
    const logs = await ctx.db.query("comms_log").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    const log = logs.find((item) => item.outboundMessageId && candidateIds.includes(normalizeMessageId(item.outboundMessageId)!))
      ?? logs.filter((item) => normalizeEmail(item.toEmail) === normalizeEmail(args.fromEmail)).sort((a, b) => b.createdAt - a.createdAt)[0];
    const speaker = log?.speakerId ? await ctx.db.get(log.speakerId) : undefined;
    const row = await ctx.db.insert("inbound_messages", {
      eventId: args.eventId, provider: args.provider, messageId, inReplyTo: normalizeMessageId(args.inReplyTo), references: candidateIds,
      fromEmail: normalizeEmail(args.fromEmail), subject: args.subject.trim().slice(0, 500), text: args.text.trim().slice(0, 20_000), receivedAt: args.receivedAt,
      commsLogId: log?._id, speakerId: speaker?.eventId === args.eventId ? speaker._id : undefined, submissionId: log?.submissionId,
      triageStatus: log ? "matched" : "unmatched", createdAt: Date.now(),
    });
    return row;
  },
});
