import { describe, expect, it } from "vitest";
import { calendarSchedule } from "@/lib/calendar-schedule";

describe("calendar schedule", () => {
  it("emits one calendar with one correctly timed VEVENT per session", () => {
    const content = calendarSchedule([
      {
        uid: "session-one",
        title: "Opening keynote",
        startTime: Date.UTC(2026, 7, 12, 13),
        endTime: Date.UTC(2026, 7, 12, 14),
        location: "Main Hall",
        dtstamp: Date.UTC(2026, 7, 11, 12),
      },
      {
        uid: "session-two",
        title: "Agent reliability",
        startTime: Date.UTC(2026, 7, 12, 15, 30),
        endTime: Date.UTC(2026, 7, 12, 16, 15),
        location: "Studio",
        dtstamp: Date.UTC(2026, 7, 11, 12),
      },
    ]);

    expect(content).toContain("BEGIN:VCALENDAR\r\n");
    expect(content.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(content).toContain("DTSTART:20260812T130000Z\r\n");
    expect(content).toContain("DTEND:20260812T140000Z\r\n");
    expect(content).toContain("DTSTART:20260812T153000Z\r\n");
    expect(content).toContain("DTEND:20260812T161500Z\r\n");
    expect(content).toContain("LOCATION:Main Hall\r\n");
    expect(content).toContain("LOCATION:Studio\r\n");
    expect(content.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
