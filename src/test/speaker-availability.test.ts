import { describe, expect, it } from "vitest";
import { isSpeakerAvailable, isSpeakerAvailableByDayPart, unavailableDayPartsForRange } from "@/lib/speaker-availability";
describe("speaker availability", () => it("rejects an agenda time that overlaps an unavailable window", () => { expect(isSpeakerAvailable("ada", 30, 60, [{ speakerId: "ada", startTime: 0, endTime: 45 }])).toBe(false); expect(isSpeakerAvailable("ada", 45, 60, [{ speakerId: "ada", startTime: 0, endTime: 45 }])).toBe(true); }));

describe("day-part availability", () => it("uses the event timezone rather than the browser timezone", () => {
  const start = Date.UTC(2026, 8, 15, 14, 30); // 10:30 AM in New York
  const end = Date.UTC(2026, 8, 15, 17, 30); // crosses into afternoon
  expect(unavailableDayPartsForRange(start, end, "America/New_York")).toEqual(new Set([`${Date.UTC(2026, 8, 15)}:morning`, `${Date.UTC(2026, 8, 15)}:afternoon`]));
  expect(isSpeakerAvailableByDayPart("ada", start, end, [{ speakerId: "ada", date: Date.UTC(2026, 8, 15), part: "afternoon" }], "America/New_York")).toBe(false);
  expect(isSpeakerAvailableByDayPart("ada", start, end, [{ speakerId: "ada", date: Date.UTC(2026, 8, 15), hour: 10 }], "America/New_York")).toBe(false);
  expect(isSpeakerAvailableByDayPart("ada", start, end, [{ speakerId: "ada", date: Date.UTC(2026, 8, 15), hour: 9 }], "America/New_York")).toBe(true);
}));
