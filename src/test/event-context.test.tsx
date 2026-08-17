import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { EventProvider, LAST_EVENT_SLUG_KEY, getLastVisitedEventSlug } from "@/components/EventContext";
import { RepoContext, type Repository } from "@/data/repo";
import type { Event } from "@/data/types";

describe("EventContext", () => {
  afterEach(() => {
    window.localStorage.removeItem(LAST_EVENT_SLUG_KEY);
  });

  it("has nothing remembered before any event has ever been visited", () => {
    expect(getLastVisitedEventSlug()).toBeNull();
  });

  it("remembers the event slug once EventProvider resolves it, for EventsEntry to read on the next sign-in", async () => {
    const event = { id: "event-1", slug: "ai-engineer-sandbox-event", name: "AI Engineer Sandbox" } as Event;
    const repo = {
      events: { getBySlug: async () => event },
    } as unknown as Repository;

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/events/ai-engineer-sandbox-event/dashboard"]}>
          <RepoContext.Provider value={repo}>
            <Routes>
              <Route
                path="/events/:eventSlug/dashboard"
                element={
                  <EventProvider>
                    <p>Loaded</p>
                  </EventProvider>
                }
              />
            </Routes>
          </RepoContext.Provider>
        </MemoryRouter>,
      );
    });

    expect(getLastVisitedEventSlug()).toBe("ai-engineer-sandbox-event");
    act(() => root.unmount());
    container.remove();
  });
});
