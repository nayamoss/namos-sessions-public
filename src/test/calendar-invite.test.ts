import { describe, expect, it } from "vitest";
import { calendarInvite } from "@/lib/calendar-invite";
import { calendarAttachment } from "@/lib/calendar-invite-core.mjs";

const input = {
  uid: "session-1",
  title: "Reliable agents, safely",
  startTime: Date.UTC(2026, 9, 12, 17),
  endTime: Date.UTC(2026, 9, 12, 18),
  location: "Main Hall; New York",
  description: "Speaker portal: https://example.test/portal",
  dtstamp: Date.UTC(2026, 7, 10, 12),
};

describe("calendar invite", () => {
  it("emits a structurally complete UTC event without a METHOD field", () => {
    const content = calendarInvite(input);
    expect(content).toContain("BEGIN:VCALENDAR\r\n");
    expect(content).toContain("BEGIN:VEVENT\r\n");
    expect(content).toContain("DTSTART:20261012T170000Z\r\n");
    expect(content).toContain("DTEND:20261012T180000Z\r\n");
    expect(content).not.toMatch(/(?:^|\r\n)METHOD:/);
    expect(content.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(content.match(/END:VCALENDAR/g)).toHaveLength(1);
    expect(content.endsWith("\r\n")).toBe(true);
  });

  it("balances every calendar component and folds physical lines to 75 bytes", () => {
    const content = calendarInvite({ ...input, description: `Speaker portal: https://example.test/portal/${"session/".repeat(20)}` });
    const stack: string[] = [];
    for (const line of content.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      if (line.startsWith("BEGIN:")) stack.push(line.slice(6));
      if (line.startsWith("END:")) expect(stack.pop()).toBe(line.slice(4));
    }
    expect(stack).toEqual([]);
  });

  it("places event properties before its alarm so Outlook retains LOCATION", () => {
    const content = calendarInvite(input);
    expect(content.indexOf("LOCATION:Main Hall\\; New York")).toBeLessThan(content.indexOf("BEGIN:VALARM"));
    expect(content.indexOf("DTEND:")).toBeLessThan(content.indexOf("BEGIN:VALARM"));
  });

  it("puts method=REQUEST on the one Resend calendar attachment MIME type", () => {
    const attachment = calendarAttachment(input);
    const decoded = decodeURIComponent(escape(atob(attachment.content)));
    expect(attachment.contentType).toBe("text/calendar; charset=utf-8; method=REQUEST");
    expect(attachment.filename).toBe("Reliable-agents-safely.ics");
    expect(decoded).toBe(calendarInvite(input));
    expect(decoded).not.toContain("METHOD:REQUEST");
  });

  it("preserves the stable uid while incrementing sequence and adding a meeting URL", () => {
    const content = calendarInvite({ ...input, sequence: 3, url: "https://meet.example.test/session-a" });
    expect(content).toContain("UID:session-1\r\n");
    expect(content).toContain("SEQUENCE:3\r\n");
    expect(content).toContain("URL:https://meet.example.test/session-a\r\n");
  });

  it("rejects invalid sequence values", () => {
    expect(() => calendarInvite({ ...input, sequence: -1 })).toThrow(/non-negative integer/);
  });
});
