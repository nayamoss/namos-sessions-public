import { describe, expect, it } from "vitest";
import { findAgendaConflicts } from "@/lib/agenda-conflicts";
describe("agenda conflicts", () => it("finds overlapping room and speaker assignments", () => expect(findAgendaConflicts([{ id: "a", roomId: "main", speakerIds: ["ada"], startTime: 0, endTime: 60 }, { id: "b", roomId: "main", speakerIds: ["ada"], startTime: 30, endTime: 90 }])).toEqual([{ type: "room", firstId: "a", secondId: "b" }, { type: "speaker", firstId: "a", secondId: "b" }])));

describe("agenda track conflicts", () => it("reports an overlapping shared track without requiring a room or speaker collision", () => expect(findAgendaConflicts([{ id: "a", roomId: "main", trackId: "engineering", speakerIds: ["ada"], startTime: 0, endTime: 60 }, { id: "b", roomId: "studio", trackId: "engineering", speakerIds: ["grace"], startTime: 30, endTime: 90 }])).toEqual([{ type: "track", firstId: "a", secondId: "b" }])));

describe("agenda track conflict boundaries", () => {
  it("does not report adjacent sessions in the same track", () => expect(findAgendaConflicts([{ id: "a", trackId: "engineering", speakerIds: [], startTime: 0, endTime: 60 }, { id: "b", trackId: "engineering", speakerIds: [], startTime: 60, endTime: 90 }])).toEqual([]));
  it("does not report overlapping sessions in different tracks", () => expect(findAgendaConflicts([{ id: "a", trackId: "engineering", speakerIds: [], startTime: 0, endTime: 60 }, { id: "b", trackId: "product", speakerIds: [], startTime: 30, endTime: 90 }])).toEqual([]));
  it("does not treat two unassigned sessions as a shared track", () => expect(findAgendaConflicts([{ id: "a", speakerIds: [], startTime: 0, endTime: 60 }, { id: "b", speakerIds: [], startTime: 30, endTime: 90 }])).toEqual([]));
});
