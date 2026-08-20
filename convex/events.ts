import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { UserIdentity } from "convex/server";
import { internalQuery } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  assertAnyOrganizer,
  assertEventAccess,
  assertEventOrganizerAccess,
  organizationIdsForUser,
  requireIdentity,
} from "./functions";
import { assertEventSchedule } from "./eventValidation";
import {
  EVENT_TEAM_MEMBER_LIMIT,
  normalizeEventTeamEmail,
} from "../src/lib/event-team";
import { ensureSpeakerStarterTemplates } from "./taskTemplates";

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
  scheduleStartTime: v.optional(v.string()),
  scheduleEndTime: v.optional(v.string()),
  theme: v.optional(v.string()),
  logoStorageKey: v.optional(v.string()),
  accentColor: v.optional(v.string()),
  readinessCategories: v.optional(v.array(v.union(v.literal("agenda_conflicts"), v.literal("speaker_confirmations"), v.literal("onboarding_tasks"), v.literal("proposal_decisions"), v.literal("comms_delivery")))),
  backgroundStorageKey: v.optional(v.string()),
  industry: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(),
  sponsorsEnabled: v.boolean(),
  defaultOnboardingTemplateId: v.optional(v.id("task_templates")),
  status: v.union(
    v.literal("draft"),
    v.literal("published"),
    v.literal("archived"),
  ),
};

// Events of the organizations this caller organizes. Never the whole table — an organizers row
// is scoped to one tenant and grants nothing outside it.
async function organizationEvents(
  ctx: QueryCtx,
  organizationIds: Id<"organizations">[],
) {
  const perOrg = await Promise.all(
    organizationIds.map((organizationId) =>
      ctx.db
        .query("events")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId),
        )
        .collect(),
    ),
  );
  return perOrg.flat();
}

async function eventMembershipEvents(ctx: QueryCtx, identity: UserIdentity) {
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
  const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return docs.filter((event): event is Doc<"events"> => event !== null);
}

function dedupeEvents(events: Doc<"events">[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event._id)) return false;
    seen.add(event._id);
    return true;
  });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { organizationIds } = await assertAnyOrganizer(ctx);
    return organizationEvents(ctx, organizationIds);
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const organizationIds = await organizationIdsForUser(ctx, identity);
    const [orgEvents, memberEvents] = await Promise.all([
      organizationEvents(ctx, organizationIds),
      eventMembershipEvents(ctx, identity),
    ]);
    return dedupeEvents([...orgEvents, ...memberEvents]);
  },
});

// The speaker/reviewer portal. Previously this returned every published event in the database
// to anyone signed in, which is how a stranger's signup could see another tenant's conferences.
// A portal user only ever belongs to events via event_members, so scope it the same way.
export const listForPortal = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const organizationIds = await organizationIdsForUser(ctx, identity);
    const [orgEvents, memberEvents] = await Promise.all([
      organizationEvents(ctx, organizationIds),
      eventMembershipEvents(ctx, identity),
    ]);
    return dedupeEvents([...orgEvents, ...memberEvents]).filter(
      (event) => event.status === "published",
    );
  },
});

// Resolves which event this portal session is actually a speaker on, server-side.
//
// The client used to take `listForPortal()[0]` and ask only that single event for a speaker
// record. That broke two ways, both reported live as "No speaker profile found" despite a real
// record existing:
//   1. Position — a speaker whose record lived on any event other than the first was never
//      looked up at all. Organizers see every event in their org here, so [0] is arbitrary.
//   2. Draft events — listForPortal filters to `published`, so a speaker invited to an event
//      that hasn't been published yet had their event excluded from the candidate list entirely.
// Scanning every reachable event and matching the caller's own verified email keeps the same
// trust model as speakers.getMine (a verified email match is the portal credential) while no
// longer depending on ordering or publication state.
export const portalSpeakerIdentity = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const organizationIds = await organizationIdsForUser(ctx, identity);
    const [orgEvents, memberEvents] = await Promise.all([
      organizationEvents(ctx, organizationIds),
      eventMembershipEvents(ctx, identity),
    ]);
    const reachable = dedupeEvents([...orgEvents, ...memberEvents]);
    const published = reachable.filter((event) => event.status === "published");
    const email =
      typeof identity.email === "string" && identity.emailVerified === true
        ? identity.email.trim().toLowerCase()
        : undefined;
    if (email) {
      const directSpeaker = await ctx.db
        .query("speakers")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (directSpeaker) {
        const directEvent = await ctx.db.get(directSpeaker.eventId);
        if (directEvent)
          return {
            event: directEvent,
            speaker: directSpeaker,
            publishedEvents:
              directEvent.status === "published" ? [directEvent] : [],
          };
      }
      for (const event of reachable) {
        // Compare lowercased rather than using the by_event_email index directly: stored
        // addresses are not normalized, so an index equality check would miss "Naya@..."
        // records. Mirrors speakers.getMine exactly.
        const speakers = await ctx.db
          .query("speakers")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();
        const speaker = speakers.find(
          (row) => row.email.trim().toLowerCase() === email,
        );
        if (speaker) return { event, speaker, publishedEvents: published };
      }
    }
    return { event: null, speaker: null, publishedEvents: published };
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
// API keys are issued per-event (convex/apiKeys.ts). This used to ignore that entirely and
// return every event in the database to any valid key; it now returns only the key's own
// event. The caller in convex/http.ts passes the eventId off the authenticated key, never off
// the request.
export const listForApi = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    return event ? [event] : [];
  },
});
// Scoped for the public REST API: a token is minted for exactly one event, so the API must
// never hand back every event in the deployment (see convex/http.ts's #178 security note).
export const getForApi = internalQuery({
  args: { eventId: v.id("events") },
  handler: (ctx, args) => ctx.db.get(args.eventId),
});

// Used by the content-integration OAuth callback (convex/http.ts) to redirect back to the
// right event's settings page — the callback only has eventId from the OAuth state, not a slug.
export const getSlugInternal = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => (await ctx.db.get(args.eventId))?.slug ?? null,
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
    const creatorEmail =
      typeof creator?.email === "string"
        ? normalizeEventTeamEmail(creator.email)
        : "";
    if (!creator || !creatorEmail)
      throw new Error(
        "Your account needs an email address before it can create an event.",
      );
    // An event must belong to a tenant from the moment it exists — an unstamped event would be
    // invisible to its own creator, since every guard treats a missing organizationId as deny.
    const [organizationId] = await organizationIdsForUser(ctx, creator);
    if (!organizationId)
      throw new Error(
        "You need an organization before you can create an event.",
      );
    const newEventId = await ctx.db.insert("events", {
      ...fields,
      billingOwnerUserId: creator?.subject,
      organizationId,
      createdAt: now,
      updatedAt: now,
    });
    await ensureSpeakerStarterTemplates(ctx, newEventId, now);
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
        (member) =>
          member.userId !== creator.subject &&
          normalizeEventTeamEmail(member.email) !== creatorEmail,
      );
      if (copiedMembers.length + 1 > EVENT_TEAM_MEMBER_LIMIT)
        throw new Error(
          `This event team is limited to ${EVENT_TEAM_MEMBER_LIMIT} people.`,
        );
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
    const creatorEmail =
      typeof creator.email === "string"
        ? normalizeEventTeamEmail(creator.email)
        : "";
    if (!creatorEmail)
      throw new Error(
        "Your account needs an email address before it can create an event.",
      );
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
      billingOwnerUserId: creator.subject,
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
      (member) =>
        member.userId !== creator.subject &&
        normalizeEventTeamEmail(member.email) !== creatorEmail,
    );
    if (copiedMembers.length + 1 > EVENT_TEAM_MEMBER_LIMIT)
      throw new Error(
        `This event team is limited to ${EVENT_TEAM_MEMBER_LIMIT} people.`,
      );
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

/**
 * Permanently delete an event. This is intentionally limited to drafts: published
 * programs should be archived so their operational record remains available.
 */
export const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (event.status !== "draft")
      throw new Error(
        "Only draft events can be deleted. Archive this event instead.",
      );

    const [
      forms,
      formResponses,
      speakers,
      submissions,
      evaluations,
      evaluationPlans,
      evaluationAssignments,
      sponsorTiers,
      sponsors,
      sponsorContacts,
      tasks,
      taskTemplates,
      availability,
      embeds,
      agendaItems,
      agendaAudit,
      commsTemplates,
      commsLog,
      emailIntegrations,
      eventMembers,
      rooms,
      tracks,
      tags,
      agentRuns,
      agentUsage,
      agentRunEvents,
      agentSettings,
    ] = await Promise.all([
      ctx.db
        .query("submission_forms")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("form_responses")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("speakers")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("submissions")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("evaluations")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("evaluation_plans")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("evaluation_assignments")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("sponsor_tiers")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("sponsors")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("sponsor_contacts")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("onboarding_tasks")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("task_templates")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("speaker_availability")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("embeds")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("agenda_items")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("agenda_items_audit")
        .withIndex("by_event_createdAt", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("comms_templates")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("comms_log")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("email_integrations")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("event_members")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("rooms")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("tracks")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("tags")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("agent_runs")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("agent_usage_records")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("agent_run_events")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("agent_provider_settings")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
    ]);
    const [confirmationRequests, proposals] = await Promise.all([
      ctx.db
        .query("submission_confirmation_requests")
        .filter((q) => q.eq(q.field("eventId"), args.eventId))
        .collect(),
      ctx.db
        .query("agent_action_proposals")
        .filter((q) => q.eq(q.field("eventId"), args.eventId))
        .collect(),
    ]);
    const documents = (
      await Promise.all(
        submissions.map((submission) =>
          ctx.db
            .query("speaker_documents")
            .withIndex("by_submission", (q) =>
              q.eq("submissionId", submission._id),
            )
            .collect(),
        ),
      )
    ).flat();

    await Promise.all([
      ...documents.map(async (document) => {
        await ctx.db.delete(document._id);
        await ctx.storage.delete(document.fileUrl as Id<"_storage">);
      }),
      ...speakers.flatMap((speaker) =>
        speaker.headshotStorageKey
          ? [ctx.storage.delete(speaker.headshotStorageKey as Id<"_storage">)]
          : [],
      ),
      ...[
        formResponses,
        evaluations,
        evaluationAssignments,
        evaluationPlans,
        sponsorContacts,
        sponsors,
        sponsorTiers,
        tasks,
        taskTemplates,
        availability,
        embeds,
        agendaItems,
        agendaAudit,
        commsTemplates,
        commsLog,
        emailIntegrations,
        confirmationRequests,
        proposals,
        agentUsage,
        agentRunEvents,
        agentSettings,
        agentRuns,
        forms,
        submissions,
        speakers,
        eventMembers,
        rooms,
        tracks,
        tags,
      ]
        .flat()
        .map((row) => ctx.db.delete(row._id)),
    ]);
    await ctx.db.delete(args.eventId);
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
