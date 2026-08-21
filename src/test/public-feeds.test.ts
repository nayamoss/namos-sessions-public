import { describe, expect, it } from "vitest";
import { renderPublicFeed } from "../../convex/publicFeeds";

const projection = {
  event: { name: "Namos <Conf>", timezone: "UTC" },
  sessions: [{ key: "session-1", title: "Reliable & safe", startTime: Date.UTC(2026, 8, 15, 9), endTime: Date.UTC(2026, 8, 15, 10), roomName: "Hall A", trackName: "Engineering" }],
};

describe("public feeds", () => {
  it("serializes safe JSON, XML, HTML, and iCal projections", () => {
    const json = renderPublicFeed({ format: "json", projection });
    const xml = renderPublicFeed({ format: "xml", projection });
    const html = renderPublicFeed({ format: "html", projection });
    const basicHtml = renderPublicFeed({ format: "basic_html", projection });
    const ical = renderPublicFeed({ format: "ical", projection });
    expect(json.contentType).toContain("application/json");
    expect(JSON.parse(json.body).sessions[0].title).toBe("Reliable & safe");
    expect(xml.body).toContain("Reliable &amp; safe");
    expect(html.body).toContain("Namos &lt;Conf&gt;");
    expect(html.body).toContain("prefers-color-scheme:dark");
    expect(basicHtml.body).not.toContain("<style>");
    expect(ical.body).toContain("BEGIN:VCALENDAR");
    expect(ical.body).toContain("SUMMARY:Reliable & safe");
  });
});
