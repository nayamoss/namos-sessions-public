import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { assertEventAccess, assertEventOrganizerAccess, getEventMembership, isOrganizer, requireIdentity } from "./functions";
import {
  EVENT_TEAM_MEMBER_LIMIT,
  isEventTeamEmail,
  isLastConfirmedEventOrganizer,
  isPendingEventTeamMember,
  normalizeEventTeamEmail,
} from "../src/lib/event-team";

const role = v.union(v.literal("organizer"), v.literal("reviewer"));

// Action-callable equivalent of `assertEventAccess`: Convex actions have no `ctx.db`, so
// `assertEventAccessAction` (convex/emailDelivery.ts) has to reach this through `ctx.runQuery`
// instead of calling the query-context helper directly. Same fail-closed rule: org-wide
// organizers pass, everyone else needs an explicit `event_members` row for this event.
export const hasAccess = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (await isOrganizer(ctx, identity)) return true;
    return Boolean(await getEventMembership(ctx, args.eventId, identity));
  },
});

export const hasOrganizerAccess = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (await isOrganizer(ctx, identity)) return true;
    return (await getEventMembership(ctx, args.eventId, identity))?.role === "organizer";
  },
});

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db.query("event_members").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), email: v.string(), role, userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const email = normalizeEventTeamEmail(args.email);
    if (!isEventTeamEmail(email)) throw new Error("Enter a valid email address.");
    const existing = await ctx.db.query("event_members").withIndex("by_event_email", (q) => q.eq("eventId", args.eventId).eq("email", email)).unique();
    const userId = args.userId?.trim() || existing?.userId || `pending:${email}`;
    if (existing) {
      await ctx.db.patch(existing._id, { userId, role: args.role });
      return existing._id;
    }
    const members = await ctx.db.query("event_members").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    if (members.length >= EVENT_TEAM_MEMBER_LIMIT) throw new Error(`This event team is limited to ${EVENT_TEAM_MEMBER_LIMIT} people.`);
    const now = Date.now();
    return ctx.db.insert("event_members", { eventId: args.eventId, userId, email, role: args.role, invitedByUserId: identity.subject, invitedAt: now, createdAt: now });
  },
});

// The invitation action calls this transaction before contacting Clerk or the email provider.
// Saving the pending row first means a provider outage never loses the organizer's invite.
export const prepareInvite = internalMutation({
  args: { eventId: v.id("events"), email: v.string(), role },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const email = normalizeEventTeamEmail(args.email);
    if (!isEventTeamEmail(email)) throw new Error("Enter a valid email address.");
    if (typeof identity.email === "string" && normalizeEventTeamEmail(identity.email) === email) {
      throw new Error("You already have access to this event.");
    }
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const existing = await ctx.db.query("event_members").withIndex("by_event_email", (q) => q.eq("eventId", args.eventId).eq("email", email)).unique();
    if (existing && !existing.userId.startsWith("pending:")) throw new Error("This person is already an event member.");
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        invitedByUserId: identity.subject,
        inviteEmailStatus: "pending",
        inviteError: undefined,
        invitedAt: now,
      });
      return {
        memberId: existing._id,
        eventName: event.name,
        eventSlug: event.slug,
        previousClerkInvitationId: existing.clerkInvitationId,
      };
    }
    const members = await ctx.db.query("event_members").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    if (members.length >= EVENT_TEAM_MEMBER_LIMIT) throw new Error(`This event team is limited to ${EVENT_TEAM_MEMBER_LIMIT} people.`);
    const memberId = await ctx.db.insert("event_members", {
      eventId: args.eventId,
      userId: `pending:${email}`,
      email,
      role: args.role,
      invitedByUserId: identity.subject,
      inviteEmailStatus: "pending",
      invitedAt: now,
      createdAt: now,
    });
    return { memberId, eventName: event.name, eventSlug: event.slug };
  },
});

export const getPendingForResend = internalQuery({
  args: { eventId: v.id("events"), memberId: v.id("event_members") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.eventId !== args.eventId) throw new Error("Event invitation not found.");
    if (!member.userId.startsWith("pending:")) throw new Error("Only pending invitations can be resent.");
    return { email: member.email, role: member.role };
  },
});

export const getRemovalTarget = internalQuery({
  args: { eventId: v.id("events"), memberId: v.id("event_members") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.eventId !== args.eventId) throw new Error("Event team member not found.");
    return {
      pending: member.userId.startsWith("pending:"),
      clerkInvitationId: member.clerkInvitationId,
    };
  },
});

export const activateInvite = internalMutation({
  args: { memberId: v.id("event_members"), userId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new Error("Event invitation no longer exists.");
    await ctx.db.patch(args.memberId, { userId: args.userId });
  },
});

export const recordInviteOutcome = internalMutation({
  args: {
    memberId: v.id("event_members"),
    clerkInvitationId: v.optional(v.string()),
    emailStatus: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.memberId))) return;
    await ctx.db.patch(args.memberId, {
      clerkInvitationId: args.clerkInvitationId,
      inviteEmailStatus: args.emailStatus,
      inviteError: args.error?.slice(0, 500),
    });
  },
});

export const removeAfterClerkRevoke = internalMutation({
  args: {
    eventId: v.id("events"),
    memberId: v.id("event_members"),
    expectedClerkInvitationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const existing = await ctx.db.get(args.memberId);
    if (!existing || existing.eventId !== args.eventId) return;
    if (existing.clerkInvitationId !== args.expectedClerkInvitationId) {
      throw new Error("This invitation changed while it was being removed. Refresh and try again.");
    }
    if (existing.role === "organizer" && !isPendingEventTeamMember(existing)) {
      const members = await ctx.db
        .query("event_members")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();
      if (isLastConfirmedEventOrganizer(existing, members)) {
        throw new Error("You cannot remove the event's last organizer.");
      }
    }
    await ctx.db.delete(existing._id);
  },
});

// Run once after every Clerk sign-in. Email-based access already fails closed to an exact,
// normalized match; this mutation replaces the pending marker with the durable Clerk subject.
export const claimPending = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const email = typeof identity.email === "string" ? normalizeEventTeamEmail(identity.email) : "";
    if (!email) return 0;
    const matches = await ctx.db.query("event_members").withIndex("by_email", (q) => q.eq("email", email)).collect();
    const pending = matches.filter((member) => member.userId.startsWith("pending:"));
    for (const member of pending) await ctx.db.patch(member._id, { userId: identity.subject });
    return pending.length;
  },
});
