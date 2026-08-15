import { v } from "convex/values";
import { assertEventOrganizerAccess, mutation, query } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const embedView = v.union(
  v.literal("agenda"),
  v.literal("schedule_itinerary"),
  v.literal("schedule_grid"),
  v.literal("session_list"),
  v.literal("speaker_gallery"),
  v.literal("speaker_list"),
);
const theme = v.union(v.literal("light"), v.literal("dark"), v.literal("system"));
const dateFormat = v.union(
  v.literal("weekday_long"),
  v.literal("weekday_short"),
  v.literal("numeric"),
);
const timeFormat = v.union(v.literal("12_hour"), v.literal("24_hour"));
const fields = v.object({
  agenda: v.object({
    title: v.boolean(),
    time: v.boolean(),
    room: v.boolean(),
    track: v.boolean(),
    speakers: v.boolean(),
  }),
  session: v.object({
    title: v.boolean(),
    time: v.boolean(),
    room: v.boolean(),
    track: v.boolean(),
    speakers: v.boolean(),
  }),
  speaker: v.object({
    name: v.boolean(),
    headshot: v.boolean(),
    bio: v.boolean(),
    links: v.boolean(),
    sessions: v.boolean(),
  }),
});

const writeArgs = {
  eventId: v.id("events"),
  name: v.string(),
  format: v.literal("styled_html"),
  view: embedView,
  enabled: v.boolean(),
  theme,
  primaryColor: v.string(),
  dateFormat,
  timeFormat,
  trackIds: v.array(v.id("tracks")),
  fields,
};

type EmbedConfig = Pick<
  Doc<"embeds">,
  | "name"
  | "view"
  | "theme"
  | "primaryColor"
  | "dateFormat"
  | "timeFormat"
  | "trackIds"
  | "fields"
>;
type WriteInput = EmbedConfig & {
  id?: Id<"embeds">;
  eventId: Id<"events">;
  format: "styled_html";
  enabled: boolean;
};
type DatabaseCtx = QueryCtx | MutationCtx;

function safePublicUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

async function safeHeadshotUrl(
  ctx: QueryCtx,
  storageKey: string | undefined,
): Promise<string | undefined> {
  if (!storageKey) return undefined;
  try {
    return (await ctx.storage.getUrl(storageKey as Id<"_storage">)) ?? undefined;
  } catch {
    return undefined;
  }
}

function normalizeFields(input: Doc<"embeds">["fields"]): Doc<"embeds">["fields"] {
  return {
    agenda: { ...input.agenda, title: true, time: true, room: true },
    session: { ...input.session, title: true },
    speaker: { ...input.speaker, name: true },
  };
}

async function validateWrite(ctx: DatabaseCtx, input: WriteInput) {
  await assertEventOrganizerAccess(ctx, input.eventId);
  const event = await ctx.db.get(input.eventId);
  if (!event) throw new Error("Event not found.");

  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error("Embed name must be between 1 and 80 characters.");
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.primaryColor)) {
    throw new Error("Use a six-digit hex color such as #E56B5D.");
  }

  const uniqueTrackIds = new Set(input.trackIds);
  if (uniqueTrackIds.size !== input.trackIds.length) {
    throw new Error("Embed tracks must not contain duplicates.");
  }
  const selectedTracks = await Promise.all(input.trackIds.map((trackId) => ctx.db.get(trackId)));
  if (selectedTracks.some((track) => !track || track.eventId !== input.eventId)) {
    throw new Error("Every embed track must belong to this event.");
  }

  if (input.id) {
    const existing = await ctx.db.get(input.id);
    if (!existing || existing.eventId !== input.eventId) {
      throw new Error("Embed not found for this event.");
    }
  }

  return { name, fields: normalizeFields(input.fields) };
}

async function project(
  ctx: QueryCtx,
  eventId: Id<"events">,
  config: EmbedConfig,
  requirePublished: boolean,
) {
  const event = await ctx.db.get(eventId);
  if (!event || (requirePublished && event.status !== "published")) return null;

  const [agenda, rooms, tracks, submissions, speakers] = await Promise.all([
    ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("rooms").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("tracks").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect(),
  ]);

  const acceptedSpeakerIds = new Set(
    submissions
      .filter((submission) => submission.status === "accepted" && submission.speakerId)
      .map((submission) => submission.speakerId as Id<"speakers">),
  );
  const acceptedSpeakers = speakers
    .filter((speaker) => acceptedSpeakerIds.has(speaker._id))
    .sort((left, right) =>
      left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName),
    );
  const publicSpeakerNames = new Map(
    acceptedSpeakers.map((speaker) => [speaker._id, `${speaker.firstName} ${speaker.lastName}`.trim()]),
  );
  const roomNames = new Map(rooms.map((room) => [room._id, room.name]));

  const selectedTrackIds = new Set(config.trackIds);
  const publicTracks = tracks
    .filter((track) => selectedTrackIds.size === 0 || selectedTrackIds.has(track._id))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const trackAliases = new Map(
    publicTracks.map((track, index) => [track._id, { key: `track-${index}`, name: track.name }]),
  );

  const sourceSessions = agenda
    .filter(
      (item) =>
        item.isPublished &&
        (selectedTrackIds.size === 0 || (item.trackId ? selectedTrackIds.has(item.trackId) : false)),
    )
    .sort((left, right) => left.startTime - right.startTime || left.title.localeCompare(right.title));
  const sessionFields = config.view === "agenda" ? config.fields.agenda : config.fields.session;
  const sessions = sourceSessions.map((item, index) => {
    const track = item.trackId ? trackAliases.get(item.trackId) : undefined;
    const roomName = roomNames.get(item.roomId);
    const speakerNames = item.speakerIds
      .map((speakerId) => publicSpeakerNames.get(speakerId))
      .filter((name): name is string => Boolean(name));
    return {
      key: `session-${index}`,
      title: item.title,
      ...(sessionFields.time ? { startTime: item.startTime, endTime: item.endTime } : {}),
      ...(sessionFields.room && roomName ? { roomName } : {}),
      ...(sessionFields.track && track ? { trackKey: track.key, trackName: track.name } : {}),
      ...(sessionFields.speakers && speakerNames.length > 0 ? { speakerNames } : {}),
    };
  });

  const visibleSpeakers = selectedTrackIds.size === 0
    ? acceptedSpeakers
    : acceptedSpeakers.filter((speaker) =>
        sourceSessions.some((session) => session.speakerIds.includes(speaker._id)),
      );
  const publicSpeakers = await Promise.all(
    visibleSpeakers.map(async (speaker, index) => {
      const links = [
        ["LinkedIn", speaker.linkedinUrl],
        ["X", speaker.xUrl],
        ["Facebook", speaker.facebookUrl],
        ["Website", speaker.websiteUrl],
      ].flatMap(([label, value]) => {
        const url = safePublicUrl(value);
        return url ? [{ label, url }] : [];
      });
      const speakerSessions = sourceSessions
        .filter((item) => item.speakerIds.includes(speaker._id))
        .map((item) => ({
          title: item.title,
          ...(config.fields.session.time ? { startTime: item.startTime } : {}),
          ...(config.fields.session.room
            ? { roomName: roomNames.get(item.roomId) ?? "TBA" }
            : {}),
        }));
      const headshotUrl = config.fields.speaker.headshot
        ? await safeHeadshotUrl(ctx, speaker.headshotStorageKey)
        : undefined;
      return {
        key: `speaker-${index}`,
        name: `${speaker.firstName} ${speaker.lastName}`.trim(),
        ...(headshotUrl ? { headshotUrl } : {}),
        ...(config.fields.speaker.bio && speaker.bio ? { bio: speaker.bio } : {}),
        ...(config.fields.speaker.links && links.length > 0 ? { links } : {}),
        ...(config.fields.speaker.sessions && speakerSessions.length > 0
          ? { sessions: speakerSessions }
          : {}),
      };
    }),
  );

  return {
    name: config.name,
    view: config.view,
    theme: config.theme,
    primaryColor: config.primaryColor,
    dateFormat: config.dateFormat,
    timeFormat: config.timeFormat,
    event: { name: event.name, timezone: event.timezone },
    tracks: publicTracks.map((track) => trackAliases.get(track._id)!),
    sessions,
    speakers: publicSpeakers,
  };
}

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return (
      await ctx.db.query("embeds").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect()
    ).sort((left, right) => right.createdAt - left.createdAt);
  },
});

export const getAdmin = query({
  args: { eventId: v.id("events"), embedId: v.id("embeds") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const embed = await ctx.db.get(args.embedId);
    return embed?.eventId === args.eventId ? embed : null;
  },
});

export const preview = query({
  args: writeArgs,
  handler: async (ctx, args) => {
    const { name, fields: safeFields } = await validateWrite(ctx, args);
    return project(ctx, args.eventId, { ...args, name, fields: safeFields }, false);
  },
});

export const save = mutation({
  args: { id: v.optional(v.id("embeds")), ...writeArgs },
  handler: async (ctx, args) => {
    const { name, fields: safeFields } = await validateWrite(ctx, args);
    const now = Date.now();
    const { id, eventId, format, view, enabled, theme, primaryColor, dateFormat, timeFormat, trackIds } = args;
    const data = {
      eventId,
      name,
      format,
      view,
      enabled,
      theme,
      primaryColor,
      dateFormat,
      timeFormat,
      trackIds,
      fields: safeFields,
      updatedAt: now,
    };
    if (id) {
      await ctx.db.patch(id, data);
      return id;
    }
    return ctx.db.insert("embeds", { ...data, createdAt: now });
  },
});

export const duplicate = mutation({
  args: { eventId: v.id("events"), embedId: v.id("embeds") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const source = await ctx.db.get(args.embedId);
    if (!source || source.eventId !== args.eventId) {
      throw new Error("Embed not found for this event.");
    }
    const siblings = await ctx.db
      .query("embeds")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const names = new Set(siblings.map((embed) => embed.name.toLocaleLowerCase()));
    const base = `${source.name} copy`.slice(0, 80).trim();
    let name = base;
    let suffix = 2;
    while (names.has(name.toLocaleLowerCase())) {
      const ending = ` ${suffix}`;
      name = `${base.slice(0, 80 - ending.length).trimEnd()}${ending}`;
      suffix += 1;
    }
    const now = Date.now();
    const { _id: _id, _creationTime: _creationTime, ...configuration } = source;
    return ctx.db.insert("embeds", {
      ...configuration,
      name,
      enabled: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), embedId: v.id("embeds") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const embed = await ctx.db.get(args.embedId);
    if (!embed || embed.eventId !== args.eventId) {
      throw new Error("Embed not found for this event.");
    }
    await ctx.db.delete(args.embedId);
    return null;
  },
});

export const getPublic = query({
  args: { embedId: v.string() },
  handler: async (ctx, args) => {
    const embedId = ctx.db.normalizeId("embeds", args.embedId);
    if (!embedId) return null;
    const embed = await ctx.db.get(embedId);
    return !embed || !embed.enabled ? null : project(ctx, embed.eventId, embed, true);
  },
});

// The four `/e/:eventSlug/:feed` URLs remain live until existing customers migrate.
export const get = query({
  args: { eventSlug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", args.eventSlug)).first();
    if (!event || event.status !== "published") return null;
    const [agenda, rooms, tracks, submissions, speakers] = await Promise.all([
      ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect(),
      ctx.db.query("rooms").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect(),
      ctx.db.query("tracks").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect(),
      ctx.db.query("submissions").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect(),
      ctx.db.query("speakers").withIndex("by_event", (q) => q.eq("eventId", event._id)).collect(),
    ]);
    const acceptedIds = new Set(
      submissions
        .filter((submission) => submission.status === "accepted" && submission.speakerId)
        .map((submission) => submission.speakerId as Id<"speakers">),
    );
    const publicSpeakers = speakers.filter((speaker) => acceptedIds.has(speaker._id));
    const speakerNames = new Map(
      publicSpeakers.map((speaker) => [speaker._id, `${speaker.firstName} ${speaker.lastName}`.trim()]),
    );
    const roomNames = new Map(rooms.map((room) => [room._id, room.name]));
    const trackNames = new Map(tracks.map((track) => [track._id, track.name]));
    return {
      eventName: event.name,
      eventTimezone: event.timezone,
      agenda: agenda
        .filter((item) => item.isPublished)
        .sort((left, right) => left.startTime - right.startTime)
        .map((item) => ({
          title: item.title,
          startTime: item.startTime,
          endTime: item.endTime,
          roomName: roomNames.get(item.roomId) ?? "TBA",
          ...(item.trackId ? { trackName: trackNames.get(item.trackId) ?? "Uncategorized" } : {}),
          speakerNames: item.speakerIds
            .map((speakerId) => speakerNames.get(speakerId))
            .filter((name): name is string => Boolean(name)),
        })),
      speakers: (
        await Promise.all(
          publicSpeakers.map(async (speaker) => {
            const headshotUrl = await safeHeadshotUrl(ctx, speaker.headshotStorageKey);
            const links = [
              ["LinkedIn", speaker.linkedinUrl],
              ["X", speaker.xUrl],
              ["Facebook", speaker.facebookUrl],
              ["Website", speaker.websiteUrl],
            ].flatMap(([label, value]) => {
              const url = safePublicUrl(value);
              return url ? [{ label, url }] : [];
            });
            return {
              name: `${speaker.firstName} ${speaker.lastName}`.trim(),
              ...(speaker.bio ? { bio: speaker.bio } : {}),
              ...(headshotUrl ? { headshotUrl } : {}),
              links,
            };
          }),
        )
      ).sort((left, right) => left.name.localeCompare(right.name)),
    };
  },
});
