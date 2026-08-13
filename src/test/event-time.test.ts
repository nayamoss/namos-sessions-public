import { describe, expect, it } from "vitest";
import { eventDateTime, eventDateTimeToEpoch, utcCalendarDate } from "@/lib/event-time";

describe("event-local agenda times", () => {
  it("round-trips a New York wall-clock time without using the browser timezone", () => {
    const epoch = eventDateTimeToEpoch("2026-09-15", "09:30", "America/New_York");
    expect(epoch).toBe(Date.UTC(2026, 8, 15, 13, 30));
    expect(eventDateTime(epoch!, "America/New_York")).toEqual({ date: "2026-09-15", time: "09:30" });
  });

  it("rejects a nonexistent DST wall-clock time and preserves stored UTC calendar dates", () => {
    expect(eventDateTimeToEpoch("2026-03-08", "02:30", "America/New_York")).toBeUndefined();
    expect(utcCalendarDate(Date.UTC(2026, 8, 15))).toBe("2026-09-15");
  });
});
