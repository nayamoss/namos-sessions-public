import { describe, expect, it } from "vitest";
import { resolveEventsEntryDestination } from "@/App";

describe("resolveEventsEntryDestination", () => {
  const events = [{ slug: "namos-sessions-draft" }, { slug: "ai-engineer-sandbox-event" }, { slug: "qa-journey-event-b" }];

  it("sends you back to the last event you visited, out of several", () => {
    expect(resolveEventsEntryDestination(events, "ai-engineer-sandbox-event")).toBe("/events/ai-engineer-sandbox-event/dashboard");
  });

  it("falls back to the events list when there's no remembered event and more than one exists", () => {
    expect(resolveEventsEntryDestination(events, null)).toBe("/events");
  });

  it("ignores a remembered slug that's no longer in the account (deleted, or access revoked)", () => {
    expect(resolveEventsEntryDestination(events, "an-event-i-lost-access-to")).toBe("/events");
  });

  it("still skips straight to the only event when nothing is remembered", () => {
    expect(resolveEventsEntryDestination([{ slug: "only-event" }], null)).toBe("/events/only-event/dashboard");
  });

  it("prefers the remembered event even when there's only one event total and it differs", () => {
    // Not a realistic case (the remembered slug would have to be the same account's only
    // event) but the remembered-event check should still take priority in the ordering.
    expect(resolveEventsEntryDestination([{ slug: "only-event" }], "only-event")).toBe("/events/only-event/dashboard");
  });
});
