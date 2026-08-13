import { describe, expect, it } from "vitest";
import { resolveCommTemplate } from "@/lib/comms-template-tokens";

describe("communication template tokens", () => {
  it("resolves the documented speaker, session, task, location, and calendar tokens", () => {
    expect(resolveCommTemplate(
      "Hi {{ speakerName }} — {{sessionTitle}} at {{location}} on {{scheduleTime}}. {{taskTitle}}: {{portalUrl}} {{videoUrl}}",
      { speakerName: "Ada Lovelace", sessionTitle: "Reliable agents", location: "Main Hall", scheduleTime: "October 12 at 1:00 PM", taskTitle: "Upload slides", portalUrl: "https://app.test/portal", videoUrl: "https://meet.test/a" },
    )).toBe("Hi Ada Lovelace — Reliable agents at Main Hall on October 12 at 1:00 PM. Upload slides: https://app.test/portal https://meet.test/a");
  });

  it("turns unavailable documented tokens into empty text without touching unknown braces", () => {
    expect(resolveCommTemplate("{{speakerName}} {{dueDate}} {{unknown}}", {})).toBe("  {{unknown}}");
  });
});
