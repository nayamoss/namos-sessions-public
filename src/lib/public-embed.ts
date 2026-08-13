import type { PublicEmbed, PublicEmbedAgendaItem } from "@/data/types";

/** The public embed feeds served by `/e/:eventSlug/:feed`. */
export const embedFeeds = ["agenda", "sessions", "itinerary", "speakers"] as const;
export type EmbedFeed = (typeof embedFeeds)[number];

export function isEmbedFeed(value: string | undefined): value is EmbedFeed {
  return embedFeeds.includes(value as EmbedFeed);
}

export const embedFeedTitles: Record<EmbedFeed, string> = {
  agenda: "Agenda",
  sessions: "Sessions",
  itinerary: "Schedule itinerary",
  speakers: "Speakers",
};

/** Copy shown when the shared public query returns nothing for a feed. */
export const embedFeedEmptyCopy: Record<EmbedFeed, string> = {
  agenda: "The agenda has not been published yet.",
  sessions: "The session catalog has not been published yet.",
  itinerary: "The itinerary will appear once the schedule is published.",
  speakers: "Speakers will appear once accepted.",
};

export function publicEmbedUrl(origin: string, eventSlug: string, view: EmbedFeed) { return new URL(`/e/${encodeURIComponent(eventSlug)}/${view}`, origin).toString(); }

const uncategorized = "Uncategorized";

/**
 * Chronological day buckets. The public query already sorts the agenda by start
 * time, so insertion order is the event's own running order.
 */
function groupByDay(embed: PublicEmbed) {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: embed.eventTimezone });
  const days = new Map<string, PublicEmbedAgendaItem[]>();
  for (const item of embed.agenda) {
    const label = formatter.format(item.startTime);
    days.set(label, [...(days.get(label) ?? []), item]);
  }
  return [...days.entries()].map(([label, items]) => ({ label, items }));
}

/** Agenda embed: day, then track within the day. */
export function agendaDayTrackGroups(embed: PublicEmbed) {
  return groupByDay(embed).map(day => {
    const tracks = new Map<string, PublicEmbedAgendaItem[]>();
    for (const item of day.items) {
      const track = item.trackName ?? uncategorized;
      tracks.set(track, [...(tracks.get(track) ?? []), item]);
    }
    return { label: day.label, tracks: [...tracks.entries()].map(([track, items]) => ({ track, items })) };
  });
}

/**
 * Itinerary embed: one flat, time-ordered run of sessions per day. Deliberately
 * has no track sub-grouping — it reads like a printed run of show.
 */
export function itineraryDayGroups(embed: PublicEmbed) {
  return groupByDay(embed).map(day => ({ label: day.label, items: [...day.items].sort((left, right) => left.startTime - right.startTime || left.title.localeCompare(right.title)) }));
}

/**
 * Sessions embed: a catalog browsed by topic, never by day. Tracks are
 * alphabetical with the untracked bucket last; sessions read alphabetically.
 */
export function sessionTrackGroups(embed: PublicEmbed) {
  const tracks = new Map<string, PublicEmbedAgendaItem[]>();
  for (const item of embed.agenda) {
    const track = item.trackName ?? uncategorized;
    tracks.set(track, [...(tracks.get(track) ?? []), item]);
  }
  return [...tracks.entries()]
    .map(([track, items]) => ({ track, items: [...items].sort((left, right) => left.title.localeCompare(right.title)) }))
    .sort((left, right) => {
      if (left.track === uncategorized) return 1;
      if (right.track === uncategorized) return -1;
      return left.track.localeCompare(right.track);
    });
}
