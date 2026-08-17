import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import { RepoContext, type Repository } from "@/data/repo";
import type { PublicEmbed } from "@/data/types";
import { attendeeScheduleStorageKey } from "@/lib/attendee-site";
import AttendeeSite from "@/pages/public/AttendeeSite";

const day1 = Date.UTC(2026, 8, 15, 14);
const day2 = Date.UTC(2026, 8, 16, 14);
const published: PublicEmbed = {
  eventName: "Test Conf",
  eventTimezone: "UTC",
  eventStartDate: day1,
  eventEndDate: day2,
  eventLocation: "Pier 57, New York",
  eventDescription: "Two days for people building dependable software.",
  eventWebsiteUrl: "https://example.test/conf",
  lastUpdatedAt: day1 - 60_000,
  roomNames: ["Main Hall", "Studio"],
  trackNames: ["Agents", "Platforms"],
  agenda: [
    {
      sessionKey: "opening-keynote",
      title: "Opening keynote",
      description: "<p>A practical opening for the conference.</p>",
      startTime: day1,
      endTime: day1 + 3_600_000,
      roomName: "Main Hall",
      trackName: "Platforms",
      speakers: [{ speakerKey: "speaker-ada", name: "Ada Lovelace" }],
    },
    {
      sessionKey: "agents-deep-dive",
      title: "Agents deep dive",
      startTime: day1 + 3_600_000,
      endTime: day1 + 7_200_000,
      roomName: "Studio",
      trackName: "Agents",
      speakers: [{ speakerKey: "speaker-grace", name: "Grace Hopper" }],
    },
    {
      sessionKey: "closing-notes",
      title: "Closing notes",
      startTime: day2,
      endTime: day2 + 3_600_000,
      roomName: "Main Hall",
      trackName: "Platforms",
      speakers: [{ speakerKey: "speaker-ada", name: "Ada Lovelace" }],
    },
  ],
  speakers: [
    { speakerKey: "speaker-ada", name: "Ada Lovelace", bio: "<p>Computing pioneer.</p>", links: [{ label: "Website", url: "https://example.test/ada" }] },
    { speakerKey: "speaker-grace", name: "Grace Hopper", bio: "Computer scientist and naval officer.", links: [] },
  ],
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function NavigationCapture({ capture }: { capture: (navigate: NavigateFunction) => void }) {
  capture(useNavigate());
  return null;
}

async function renderAttendeeSite(
  initialEntry = "/e/test-conf",
  value: PublicEmbed | null | ((eventSlug: string) => Promise<PublicEmbed | null>) = published,
) {
  const get = vi.fn(async (eventSlug: string) => typeof value === "function" ? value(eventSlug) : value);
  let navigate: NavigateFunction | undefined;
  const repo = {
    publicEmbeds: { getLegacy: get },
    agenda: { list: vi.fn() },
    speakers: { list: vi.fn() },
    events: { list: vi.fn() },
  } as unknown as Repository;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <RepoContext.Provider value={repo}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <NavigationCapture capture={next => { navigate = next; }} />
          <Routes>
            <Route path="/e/:eventSlug" element={<AttendeeSite />} />
            <Route path="/e/:eventSlug/:feed" element={<p>embed feed</p>} />
          </Routes>
        </MemoryRouter>
      </RepoContext.Provider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return {
    element: container,
    repo,
    get,
    navigate: async (to: string) => {
      await act(async () => { navigate?.(to); });
      await act(async () => { await Promise.resolve(); });
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(day1 + 30 * 60_000));
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.useRealTimers();
});

describe("attendee site route", () => {
  it("renders the event, active day, controls, live state, and speaker profiles from only the public projection", async () => {
    const { element, repo, get } = await renderAttendeeSite();

    expect(get).toHaveBeenCalledWith("test-conf");
    expect(element.querySelector("h1")?.textContent).toBe("Test Conf");
    expect(element.textContent).toContain("Pier 57, New York");
    expect(element.textContent).toContain("Tuesday, September 15");
    expect(element.textContent).toContain("Wednesday, September 16");
    expect(element.textContent).toContain("Opening keynote");
    expect(element.textContent).not.toContain("Closing notes");
    expect(element.textContent).toContain("Now");
    expect(element.querySelector('[aria-label="Filter by track"]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Filter by room"]')).not.toBeNull();
    expect(element.querySelector("#speaker-ada")?.textContent).toContain("Computing pioneer.");
    expect(repo.agenda.list).not.toHaveBeenCalled();
    expect(repo.speakers.list).not.toHaveBeenCalled();
    expect(repo.events.list).not.toHaveBeenCalled();
  });

  it("switches days and searches session titles and speaker names client-side", async () => {
    const { element } = await renderAttendeeSite();
    const dayButton = [...element.querySelectorAll("button")].find(button => button.textContent === "Wednesday, September 16");
    expect(dayButton).toBeTruthy();
    act(() => dayButton!.click());
    expect(element.textContent).toContain("Closing notes");
    expect(element.textContent).not.toContain("Agents deep dive");

    const search = element.querySelector('[aria-label="Search sessions and speakers"]') as HTMLInputElement;
    act(() => fireEvent.change(search, { target: { value: "Ada Lovelace" } }));
    expect(element.textContent).toContain("Closing notes");
    expect(element.textContent).not.toContain("No sessions match these filters.");
  });

  it("opens a session from a direct shareable URL and provides a safe calendar link", async () => {
    const { element } = await renderAttendeeSite("/e/test-conf?session=opening-keynote");
    const detail = element.querySelector('[aria-label="Session details: Opening keynote"]');
    expect(detail).not.toBeNull();
    expect(detail?.textContent).toContain("A practical opening for the conference.");
    expect(detail?.textContent).not.toContain("<p>");
    const calendar = detail?.querySelector('a[href^="https://calendar.google.com/calendar/render"]') as HTMLAnchorElement;
    expect(calendar).not.toBeNull();
    const calendarUrl = new URL(calendar.href);
    expect(calendarUrl.searchParams.get("text")).toBe("Opening keynote");
    expect(calendarUrl.searchParams.get("dates")).toBe("20260915T140000Z/20260915T150000Z");
    expect(calendarUrl.searchParams.get("location")).toContain("Main Hall");
  });

  it("shows the deep-linked session's actual day in the schedule", async () => {
    const { element } = await renderAttendeeSite("/e/test-conf?session=closing-notes");

    expect(element.querySelector('[aria-label="Session details: Closing notes"]')).not.toBeNull();
    expect(element.textContent).toContain("Closing notes");
    expect(element.textContent).not.toContain("Opening keynote");
    expect(element.querySelector('button[aria-current="date"]')?.textContent).toBe("Wednesday, September 16");
  });

  it("uses opaque speaker keys for distinct anchors when accepted speakers share a name", async () => {
    const duplicateNames: PublicEmbed = {
      ...published,
      agenda: [{
        ...published.agenda[0],
        speakers: [
          { speakerKey: "speaker-alex-one", name: "Alex Kim" },
          { speakerKey: "speaker-alex-two", name: "Alex Kim" },
        ],
      }],
      speakers: [
        { speakerKey: "speaker-alex-one", name: "Alex Kim", bio: "First Alex", links: [] },
        { speakerKey: "speaker-alex-two", name: "Alex Kim", bio: "Second Alex", links: [] },
      ],
    };
    const { element } = await renderAttendeeSite("/e/test-conf?session=opening-keynote", duplicateNames);

    expect(element.querySelectorAll("#speaker-alex-one")).toHaveLength(1);
    expect(element.querySelectorAll("#speaker-alex-two")).toHaveLength(1);
    const chips = [...element.querySelectorAll('[aria-label="Session details: Opening keynote"] a[href^="#speaker-"]')];
    expect(chips.map((chip) => chip.getAttribute("href"))).toEqual(["#speaker-alex-one", "#speaker-alex-two"]);
    expect(chips.map((chip) => chip.textContent)).toEqual(["Alex Kim", "Alex Kim"]);
  });

  it("saves a personal schedule in event-scoped localStorage and filters to it", async () => {
    const { element } = await renderAttendeeSite();
    const save = element.querySelector('[aria-label="Save to my schedule"]') as HTMLButtonElement;
    act(() => save.click());

    expect(JSON.parse(localStorage.getItem(attendeeScheduleStorageKey("test-conf")) ?? "[]")).toEqual(["opening-keynote"]);
    expect(element.textContent).toContain("My schedule (1)");
    const mySchedule = [...element.querySelectorAll("button")].find(button => button.textContent?.includes("My schedule (1)"));
    act(() => mySchedule!.click());
    expect(element.textContent).toContain("Opening keynote");
    expect(element.textContent).not.toContain("Agents deep dive");
  });

  it("shows a public not-found state for an unpublished or unknown event", async () => {
    const { element } = await renderAttendeeSite("/e/missing", null);
    expect(element.textContent).toContain("Event not found");
    expect(element.textContent).toContain("not published or does not exist");
  });

  it("clears a failed event's error when navigating to a valid slug", async () => {
    const { element, navigate } = await renderAttendeeSite("/e/missing", async eventSlug => {
      if (eventSlug === "missing") throw new Error("Could not load missing event.");
      return published;
    });
    expect(element.querySelector('[role="alert"]')?.textContent).toContain("Could not load missing event.");

    await navigate("/e/test-conf");

    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector("h1")?.textContent).toBe("Test Conf");
  });

  it("resets day, search, and schedule filters when navigating between valid events", async () => {
    const secondEvent = { ...published, eventName: "Second Conf" };
    const { element, navigate } = await renderAttendeeSite("/e/test-conf", async eventSlug => eventSlug === "second-conf" ? secondEvent : published);
    const search = element.querySelector('[aria-label="Search sessions and speakers"]') as HTMLInputElement;
    act(() => fireEvent.change(search, { target: { value: "Closing" } }));
    const dayButton = [...element.querySelectorAll("button")].find(button => button.textContent === "Wednesday, September 16");
    act(() => dayButton!.click());
    const mySchedule = [...element.querySelectorAll("button")].find(button => button.textContent?.includes("My schedule (0)"));
    act(() => mySchedule!.click());

    await navigate("/e/second-conf");

    expect(element.querySelector("h1")?.textContent).toBe("Second Conf");
    expect((element.querySelector('[aria-label="Search sessions and speakers"]') as HTMLInputElement).value).toBe("");
    expect(element.querySelector('button[aria-current="date"]')?.textContent).toBe("Tuesday, September 15");
    expect([...element.querySelectorAll("button")].find(button => button.textContent?.includes("My schedule"))?.getAttribute("aria-pressed")).toBe("false");
    expect(element.textContent).toContain("Opening keynote");
  });
});
