import { describe, expect, it } from "vitest";
import type { AgendaItem, AgendaItemId, EventId, SpeakerId } from "@/data/types";
import { publishedAgendaForSpeaker } from "@/lib/portal-schedule";

const eventId = "event-one" as EventId;
const speakerId = "speaker-one" as SpeakerId;

function agendaItem(id: string, overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: id as AgendaItemId,
    eventId,
    title: id,
    roomId: "main-hall",
    speakerIds: [speakerId],
    startTime: 100,
    endTime: 200,
    isPublished: true,
    ...overrides,
  };
}

describe("portal schedule", () => {
  it("shows only published items assigned to the current speaker", () => {
    const otherSpeaker = "speaker-two" as SpeakerId;
    const visible = publishedAgendaForSpeaker([
      agendaItem("published-later", { startTime: 300, endTime: 400 }),
      agendaItem("unpublished", { isPublished: false }),
      agendaItem("someone-elses", { speakerIds: [otherSpeaker] }),
      agendaItem("published-first", { startTime: 0, endTime: 50 }),
    ], speakerId);

    expect(visible.map((item) => item.id)).toEqual(["published-first", "published-later"]);
  });
});
