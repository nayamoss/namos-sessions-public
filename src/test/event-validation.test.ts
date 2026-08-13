import { describe, expect, it } from "vitest";
import { assertEventSchedule } from "../../convex/eventValidation";

describe("event schedule validation", () => {
  it("accepts an ordered event in an IANA timezone", () => expect(() => assertEventSchedule("America/New_York", 1, 2)).not.toThrow());
  it("rejects inverted dates and invalid timezones", () => {
    expect(() => assertEventSchedule("America/New_York", 2, 1)).toThrow("end after it starts");
    expect(() => assertEventSchedule("Not/AZone", 1, 2)).toThrow("valid IANA timezone");
  });
});
