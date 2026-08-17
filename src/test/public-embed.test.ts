import { describe, expect, it } from "vitest";
import type { QueryCtx } from "../../convex/_generated/server";
import { get, publicAgendaSpeakers, publicSpeakerReferences } from "../../convex/publicEmbeds";
import type { PublicEmbed, PublicEmbedAgendaItem } from "@/data/types";
import {
  agendaDayTrackGroups,
  isEmbedFeed,
  itineraryDayGroups,
  publicEmbedUrl,
  sessionTrackGroups,
} from "@/lib/public-embed";

const timezone = "America/New_York";

function item(partial: Partial<PublicEmbedAgendaItem> & { title: string; startTime: number }): PublicEmbedAgendaItem {
  return { sessionKey: partial.title.toLowerCase().replace(/\s/g, "-"), endTime: partial.startTime + 3_600_000, roomName: "Main Hall", speakers: [], ...partial };
}

/** Two days, two tracks, deliberately out of alphabetical order. */
function embed(agenda: PublicEmbedAgendaItem[]): PublicEmbed {
  return { eventName: "Test Conf", eventTimezone: timezone, eventStartDate: day1, eventEndDate: day2, lastUpdatedAt: day1, roomNames: ["Main Hall"], trackNames: ["Agents", "Platforms", "Uncategorized"], agenda, speakers: [] };
}

const day1 = Date.UTC(2026, 8, 15, 14);
const day2 = Date.UTC(2026, 8, 16, 14);
const sample = embed([
  item({ title: "Zebra opener", startTime: day1, trackName: "Platforms" }),
  item({ title: "Agents deep dive", startTime: day1 + 3_600_000, trackName: "Agents" }),
  item({ title: "Closing notes", startTime: day2, trackName: "Platforms" }),
  item({ title: "Hallway track", startTime: day2 + 3_600_000 }),
]);

type Row = Record<string, unknown> & { _id: string };

function publicQueryCtx() {
  const tables: Record<string, Row[]> = {
    events: [{
      _id: "event-1", slug: "test-conf", name: "Test Conf", status: "published",
      timezone: "UTC", startDate: day1, endDate: day2, updatedAt: day1,
    }],
    rooms: [{ _id: "room-1", eventId: "event-1", name: "Main Hall" }],
    tracks: [{ _id: "track-1", eventId: "event-1", name: "Privacy" }],
    submissions: [
      { _id: "submission-accepted", eventId: "event-1", status: "accepted", speakerId: "speaker-primary", answers: { abstract: "Accepted abstract" } },
      { _id: "submission-declined", eventId: "event-1", status: "declined", speakerId: "speaker-primary", answers: { abstract: "Declined private abstract" } },
      { _id: "submission-other", eventId: "event-1", status: "accepted", speakerId: "speaker-manual", answers: { abstract: "Another accepted proposal" } },
    ],
    speakers: [
      { _id: "speaker-primary", eventId: "event-1", firstName: "Ada", lastName: "Lovelace" },
      { _id: "speaker-manual", eventId: "event-1", firstName: "Grace", lastName: "Hopper" },
    ],
    agenda_items: [
      {
        _id: "agenda-accepted", eventId: "event-1", submissionId: "submission-accepted",
        title: "Accepted session", roomId: "room-1", trackId: "track-1",
        startTime: day1, endTime: day1 + 3_600_000,
        speakerIds: ["speaker-primary", "speaker-manual"], isPublished: true, updatedAt: day1,
      },
      {
        _id: "agenda-declined", eventId: "event-1", submissionId: "submission-declined",
        title: "Declined session", roomId: "room-1", trackId: "track-1",
        startTime: day1 + 3_600_000, endTime: day1 + 7_200_000,
        speakerIds: ["speaker-primary"], isPublished: true, updatedAt: day1,
      },
    ],
  };

  return {
    db: {
      query: (table: string) => {
        const conditions: Array<[string, unknown]> = [];
        const matching = () => (tables[table] ?? []).filter((row) => conditions.every(([field, value]) => row[field] === value));
        const builder = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return builder; } };
        const result = { first: async () => matching()[0] ?? null, collect: async () => matching() };
        return { ...result, withIndex: (_index: string, apply?: (query: typeof builder) => typeof builder) => { apply?.(builder); return result; } };
      },
    },
    storage: { getUrl: async () => null },
  } as unknown as QueryCtx;
}

const publicQueryHandler = (get as unknown as {
  _handler: (ctx: QueryCtx, args: { eventSlug: string }) => Promise<PublicEmbed | null>;
})._handler;

describe("public embeds", () => {
  it("excludes a published agenda speaker without an accepted submission", () => {
    const references = publicSpeakerReferences(
      [
        { status: "accepted", speakerId: "speaker-accepted" },
        { status: "declined", speakerId: "speaker-declined" },
      ],
      [
        { _id: "speaker-accepted", firstName: "Ada", lastName: "Lovelace" },
        { _id: "speaker-declined", firstName: "Private", lastName: "Speaker" },
      ],
    );

    expect([...references.keys()]).toEqual(["speaker-accepted"]);
    expect(publicAgendaSpeakers(
      ["speaker-accepted", "speaker-declined"],
      { status: "accepted", speakerId: "speaker-accepted" },
      references,
    )).toEqual([
      expect.objectContaining({ name: "Ada Lovelace" }),
    ]);
  });

  it("projects descriptions and speaker associations only through each item's own accepted submission", async () => {
    const projection = await publicQueryHandler(publicQueryCtx(), { eventSlug: "test-conf" });
    const accepted = projection?.agenda.find((entry) => entry.title === "Accepted session");
    const declined = projection?.agenda.find((entry) => entry.title === "Declined session");

    expect(accepted).toMatchObject({
      description: "Accepted abstract",
      speakers: [expect.objectContaining({ name: "Ada Lovelace" })],
    });
    expect(accepted?.speakers).not.toContainEqual(expect.objectContaining({ name: "Grace Hopper" }));
    expect(declined).not.toHaveProperty("description");
    expect(declined?.speakers).toEqual([]);
    // Sorted by surname (Hopper before Lovelace), not by insertion/DB-query order.
    expect(projection?.speakers.map((speaker) => speaker.name)).toEqual(["Grace Hopper", "Ada Lovelace"]);
    expect(JSON.stringify(projection)).not.toContain("Declined private abstract");
  });

  it("constructs event-scoped public URLs", () => {
    expect(publicEmbedUrl("https://example.test", "ai engineer", "agenda")).toBe("https://example.test/e/ai%20engineer/agenda");
    expect(publicEmbedUrl("https://example.test", "conf", "itinerary")).toBe("https://example.test/e/conf/itinerary");
  });

  it("accepts exactly the four public feeds", () => {
    expect(["agenda", "speakers", "sessions", "itinerary"].every(isEmbedFeed)).toBe(true);
    expect(isEmbedFeed("exhibitors")).toBe(false);
    expect(isEmbedFeed(undefined)).toBe(false);
  });
});

describe("sessions embed grouping", () => {
  it("groups by track, not by day, with untracked sessions last", () => {
    const groups = sessionTrackGroups(sample);
    expect(groups.map(group => group.track)).toEqual(["Agents", "Platforms", "Uncategorized"]);
    // "Closing notes" and "Zebra opener" are on different days but share a track.
    expect(groups[1].items.map(entry => entry.title)).toEqual(["Closing notes", "Zebra opener"]);
  });

  it("orders sessions within a track alphabetically rather than chronologically", () => {
    const groups = sessionTrackGroups(embed([
      item({ title: "Zeta", startTime: day1, trackName: "Agents" }),
      item({ title: "Alpha", startTime: day1 + 7_200_000, trackName: "Agents" }),
    ]));
    expect(groups[0].items.map(entry => entry.title)).toEqual(["Alpha", "Zeta"]);
  });

  it("renders nothing to group when the shared query returns no published agenda", () => {
    expect(sessionTrackGroups(embed([]))).toEqual([]);
  });
});

describe("itinerary embed grouping", () => {
  it("is flat and chronological within each day, with no track sub-grouping", () => {
    const days = itineraryDayGroups(sample);
    expect(days).toHaveLength(2);
    expect(days[0].items.map(entry => entry.title)).toEqual(["Zebra opener", "Agents deep dive"]);
    expect(days[1].items.map(entry => entry.title)).toEqual(["Closing notes", "Hallway track"]);
    // A flat day carries items directly; only the agenda feed exposes tracks.
    expect(days[0]).not.toHaveProperty("tracks");
  });

  it("keeps interleaved tracks in start-time order", () => {
    const days = itineraryDayGroups(embed([
      item({ title: "First", startTime: day1, trackName: "Platforms" }),
      item({ title: "Second", startTime: day1 + 1_800_000, trackName: "Agents" }),
      item({ title: "Third", startTime: day1 + 3_600_000, trackName: "Platforms" }),
    ]));
    expect(days[0].items.map(entry => entry.title)).toEqual(["First", "Second", "Third"]);
  });

  it("has no days when there is no published agenda", () => {
    expect(itineraryDayGroups(embed([]))).toEqual([]);
  });
});

describe("agenda embed grouping", () => {
  it("still groups by day and then by track", () => {
    const days = agendaDayTrackGroups(sample);
    expect(days).toHaveLength(2);
    expect(days[0].tracks.map(track => track.track)).toEqual(["Platforms", "Agents"]);
    expect(days[1].tracks.map(track => track.track)).toEqual(["Platforms", "Uncategorized"]);
  });
});
