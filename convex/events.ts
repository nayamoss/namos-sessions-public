import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  assertEventAccess,
  assertEventOrganizerAccess,
  assertOrganizer,
  isOrganizer,
  requireIdentity,
} from "./functions";
import { assertEventSchedule } from "./eventValidation";
import { EVENT_TEAM_MEMBER_LIMIT, normalizeEventTeamEmail } from "../src/lib/event-team";

const eventFields = {
  name: v.string(),
  slug: v.string(),
  type: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),
  location: v.optional(v.string()),
  timezone: v.string(),
  startDate: v.number(),
  endDate: v.number(),
  description: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  logoFileId: v.optional(v.string()),
  programPublishedAt: v.optional(v.number()),
  theme: v.optional(v.string()),
  logoStorageKey: v.optional(v.string()),
  backgroundStorageKey: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(),
  sponsorsEnabled: v.boolean(),
  defaultOnboardingTemplateId: v.optional(v.id("task_templates")),
  status: v.union(
    v.literal("draft"),
    v.literal("published"),
    v.literal("archived"),
  ),
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    await assertOrganizer(ctx);
    return ctx.db.query("events").collect();
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    if (await isOrganizer(ctx, identity))
      return ctx.db.query("events").collect();
    const email =
      typeof identity.email === "string"
        ? identity.email.trim().toLowerCase()
        : undefined;
    const [byUser, byEmail] = await Promise.all([
      ctx.db
        .query("event_members")
        .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
        .collect(),
      email
        ? ctx.db
            .query("event_members")
            .withIndex("by_email", (q) => q.eq("email", email))
            .collect()
        : Promise.resolve([]),
    ]);
    const ids = [
      ...new Set([...byUser, ...byEmail].map((member) => member.eventId)),
    ];
    return (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter(
      (event) => event !== null,
    );
  },
});

export const listForPortal = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    const events = await ctx.db.query("events").collect();
    return events.filter((event) => event.status === "published");
  },
});
export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db.get(args.eventId);
  },
});
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (event) await assertEventAccess(ctx, event._id);
    return event;
  },
});
export const listForApi = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("events").collect(),
});

export const save = mutation({
  args: {
    eventId: v.optional(v.id("events")),
    pullTeamFromEventId: v.optional(v.id("events")),
    ...eventFields,
  },
  handler: async (ctx, args) => {
    const creator = args.eventId ? undefined : await requireIdentity(ctx);
    if (args.eventId) await assertEventOrganizerAccess(ctx, args.eventId);
    if (args.eventId && args.pullTeamFromEventId)
      throw new Error("A team can only be copied while creating an event.");
    if (args.pullTeamFromEventId)
      await assertEventOrganizerAccess(ctx, args.pullTeamFromEventId);
    assertEventSchedule(args.timezone, args.startDate, args.endDate);
    const existing = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing && existing._id !== args.eventId)
      throw new Error("That event slug is already in use.");
    const now = Date.now();
    const { eventId, pullTeamFromEventId, ...fields } = args;
    if (eventId) {
      await ctx.db.patch(eventId, { ...fields, updatedAt: now });
      return eventId;
    }
    const newEventId = await ctx.db.insert("events", {
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
    const creatorEmail = typeof creator?.email === "string" ? normalizeEventTeamEmail(creator.email) : "";
    if (!creator || !creatorEmail) throw new Error("Your account needs an email address before it can create an event.");
    await ctx.db.insert("event_members", {
      eventId: newEventId,
      userId: creator.subject,
      email: creatorEmail,
      role: "organizer",
      invitedByUserId: creator.subject,
      invitedAt: now,
      createdAt: now,
    });
    if (pullTeamFromEventId) {
      const source = await ctx.db.get(pullTeamFromEventId);
      if (!source)
        throw new Error("The selected source event no longer exists.");
      const members = await ctx.db
        .query("event_members")
        .withIndex("by_event", (q) => q.eq("eventId", pullTeamFromEventId))
        .collect();
      const copiedMembers = members.filter(
        (member) => member.userId !== creator.subject && normalizeEventTeamEmail(member.email) !== creatorEmail,
      );
      if (copiedMembers.length + 1 > EVENT_TEAM_MEMBER_LIMIT)
        throw new Error(`This event team is limited to ${EVENT_TEAM_MEMBER_LIMIT} people.`);
      for (const member of copiedMembers) {
        await ctx.db.insert("event_members", {
          eventId: newEventId,
          userId: member.userId,
          email: member.email,
          role: member.role,
          invitedByUserId: creator.subject,
          createdAt: now,
        });
      }
    }
    return newEventId;
  },
});

export const duplicate = mutation({
  args: {
    sourceEventId: v.id("events"),
    name: v.string(),
    slug: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    pullTeamFrom: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const creator = await assertEventOrganizerAccess(ctx, args.sourceEventId);
    const source = await ctx.db.get(args.sourceEventId);
    if (!source) throw new Error("Source event not found.");
    const creatorEmail = typeof creator.email === "string" ? normalizeEventTeamEmail(creator.email) : "";
    if (!creatorEmail) throw new Error("Your account needs an email address before it can create an event.");
    assertEventSchedule(source.timezone, args.startDate, args.endDate);
    if (
      await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .unique()
    )
      throw new Error("That event slug is already in use.");
    const now = Date.now();
    const {
      _id: _sourceId,
      _creationTime: _sourceCreated,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      defaultOnboardingTemplateId: _defaultTemplate,
      ...sourceFields
    } = source;
    const eventId = await ctx.db.insert("events", {
      ...sourceFields,
      name: args.name.trim(),
      slug: args.slug.trim(),
      startDate: args.startDate,
      endDate: args.endDate,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    const [forms, tracks, templates, members] = await Promise.all([
      ctx.db
        .query("submission_forms")
        .withIndex("by_event", (q) => q.eq("eventId", args.sourceEventId))
        .collect(),
      ctx.db
        .query("tracks")
        .withIndex("by_event", (q) => q.eq("eventId", args.sourceEventId))
        .collect(),
      ctx.db
        .query("comms_templates")
        .withIndex("by_event", (q) => q.eq("eventId", args.sourceEventId))
        .collect(),
      args.pullTeamFrom
        ? ctx.db
            .query("event_members")
            .withIndex("by_event", (q) => q.eq("eventId", args.sourceEventId))
            .collect()
        : Promise.resolve([]),
    ]);
    const copiedMembers = members.filter(
      (member) => member.userId !== creator.subject && normalizeEventTeamEmail(member.email) !== creatorEmail,
    );
    if (copiedMembers.length + 1 > EVENT_TEAM_MEMBER_LIMIT)
      throw new Error(`This event team is limited to ${EVENT_TEAM_MEMBER_LIMIT} people.`);
    await ctx.db.insert("event_members", {
      eventId,
      userId: creator.subject,
      email: creatorEmail,
      role: "organizer",
      invitedByUserId: creator.subject,
      invitedAt: now,
      createdAt: now,
    });
    for (const member of copiedMembers) {
      await ctx.db.insert("event_members", {
        eventId,
        userId: member.userId,
        email: member.email,
        role: member.role,
        invitedByUserId: creator.subject,
        createdAt: now,
      });
    }
    const copy = async <
      T extends { _id: unknown; _creationTime: unknown; eventId: unknown },
    >(
      table: "comms_templates",
      rows: T[],
    ) =>
      Promise.all(
        rows.map((row) => {
          const { _id: _id, _creationTime: _creationTime, ...fields } = row;
          return ctx.db.insert(table, { ...fields, eventId } as never);
        }),
      );

    // Tracks must be copied before forms so routing rules can point at the new event's
    // track ids. Tag and sponsor assignments are intentionally cleared because those
    // records are instance data and are not part of an event duplicate.
    const trackIds = new Map<string, Id<"tracks">>();
    for (const track of tracks) {
      const { _id, _creationTime, ...fields } = track;
      const copiedId = await ctx.db.insert("tracks", { ...fields, eventId });
      trackIds.set(_id, copiedId);
    }
    for (const form of forms) {
      const { _id: _formId, _creationTime, ...fields } = form;
      const routingRules = fields.routingRules?.map((rule) => ({
        ...rule,
        assignTagIds: undefined,
        assignSponsorId: undefined,
        assignTrackId: rule.assignTrackId
          ? trackIds.get(rule.assignTrackId)
          : undefined,
      }));
      await ctx.db.insert("submission_forms", {
        ...fields,
        eventId,
        routingRules,
      });
    }
    await copy("comms_templates", templates);
    return eventId;
  },
});

export const listRooms = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db
      .query("rooms")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});
export const saveRoom = mutation({
  args: {
    id: v.optional(v.id("rooms")),
    eventId: v.id("events"),
    name: v.string(),
    capacity: v.optional(v.number()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const { id, ...fields } = args;
    if (id) {
      await ctx.db.patch(id, fields);
      return id;
    }
    return ctx.db.insert("rooms", fields);
  },
});
export const removeRoom = mutation({
  args: { eventId: v.id("events"), id: v.id("rooms") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const room = await ctx.db.get(args.id);
    if (!room || room.eventId !== args.eventId)
      throw new Error("Room not found for this event.");
    await ctx.db.delete(args.id);
  },
});
export const listTracks = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db
      .query("tracks")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});
export const saveTrack = mutation({
  args: {
    id: v.optional(v.id("tracks")),
    eventId: v.id("events"),
    name: v.string(),
    color: v.optional(v.string()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const { id, ...fields } = args;
    if (id) {
      await ctx.db.patch(id, fields);
      return id;
    }
    return ctx.db.insert("tracks", fields);
  },
});
export const removeTrack = mutation({
  args: { eventId: v.id("events"), id: v.id("tracks") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const track = await ctx.db.get(args.id);
    if (!track || track.eventId !== args.eventId)
      throw new Error("Track not found for this event.");
    await ctx.db.delete(args.id);
  },
});
