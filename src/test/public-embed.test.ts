import { describe, expect, it } from "vitest";
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
  return { endTime: partial.startTime + 3_600_000, roomName: "Main Hall", speakerNames: [], ...partial };
}

/** Two days, two tracks, deliberately out of alphabetical order. */
function embed(agenda: PublicEmbedAgendaItem[]): PublicEmbed {
  return { eventName: "Test Conf", eventTimezone: timezone, agenda, speakers: [] };
}

const day1 = Date.UTC(2026, 8, 15, 14);
const day2 = Date.UTC(2026, 8, 16, 14);
const sample = embed([
  item({ title: "Zebra opener", startTime: day1, trackName: "Platforms" }),
  item({ title: "Agents deep dive", startTime: day1 + 3_600_000, trackName: "Agents" }),
  item({ title: "Closing notes", startTime: day2, trackName: "Platforms" }),
  item({ title: "Hallway track", startTime: day2 + 3_600_000 }),
]);

describe("public embeds", () => {
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
