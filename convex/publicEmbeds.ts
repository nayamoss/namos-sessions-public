import { v } from "convex/values";
import { query } from "./functions";
import type { Id } from "./_generated/dataModel";

function publicUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function publicHeadshotUrl(ctx: { storage: { getUrl: (storageId: Id<"_storage">) => Promise<string | null> } }, storageKey: string | undefined) {
  if (!storageKey) return undefined;
  // Older demo records used placeholder paths, not Convex storage ids. They are deliberately
  // omitted rather than exposing the backing key or making the public query fail.
  try {
    return (await ctx.storage.getUrl(storageKey as Id<"_storage">)) ?? undefined;
  } catch {
    return undefined;
  }
}

// Public embeds must receive a projection, rather than a client-side filter over
// organizer data. In particular, no ids, emails, submission answers, statuses,
// or unpublished agenda items cross this boundary.
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

    const acceptedSpeakerIds = new Set(submissions.filter((submission) => submission.status === "accepted" && submission.speakerId).map((submission) => submission.speakerId));
    const roomNames = new Map(rooms.map((room) => [room._id, room.name]));
    const trackNames = new Map(tracks.map((track) => [track._id, track.name]));
    const acceptedSpeakers = speakers.filter((speaker) => acceptedSpeakerIds.has(speaker._id));
    const speakerNames = new Map(acceptedSpeakers.map((speaker) => [speaker._id, `${speaker.firstName} ${speaker.lastName}`.trim()]));
    const publicSpeakers = await Promise.all(acceptedSpeakers.map(async (speaker) => {
      const headshotUrl = await publicHeadshotUrl(ctx, speaker.headshotStorageKey);
      return {
        name: `${speaker.firstName} ${speaker.lastName}`.trim(),
        ...(speaker.bio ? { bio: speaker.bio } : {}),
        ...(headshotUrl ? { headshotUrl } : {}),
        links: [
          ["LinkedIn", speaker.linkedinUrl],
          ["X", speaker.xUrl],
          ["Facebook", speaker.facebookUrl],
          ["Website", speaker.websiteUrl],
        ].flatMap(([label, value]) => {
          const url = publicUrl(value);
          return url ? [{ label: label as "LinkedIn" | "X" | "Facebook" | "Website", url }] : [];
        }),
      };
    }));

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
          speakerNames: item.speakerIds.map((speakerId) => speakerNames.get(speakerId)).filter((name): name is string => Boolean(name)),
        })),
      speakers: publicSpeakers.sort((left, right) => left.name.localeCompare(right.name)),
    };
  },
});
