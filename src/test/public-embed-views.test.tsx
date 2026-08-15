import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RepoContext, type Repository } from "@/data/repo";
import type { PublicEmbed, PublicEmbedAgendaItem } from "@/data/types";
import EmbedPage from "@/pages/public/EmbedPage";

const timezone = "UTC";
const day1 = Date.UTC(2026, 8, 15, 14);
const day2 = Date.UTC(2026, 8, 16, 14);

function item(partial: Partial<PublicEmbedAgendaItem> & { title: string; startTime: number }): PublicEmbedAgendaItem {
  return { endTime: partial.startTime + 3_600_000, roomName: "Main Hall", speakerNames: [], ...partial };
}

const published: PublicEmbed = {
  eventName: "Test Conf",
  eventTimezone: timezone,
  // Exactly what `publicEmbeds.get` projects: published items and accepted speakers only.
  agenda: [
    item({ title: "Zebra opener", startTime: day1, trackName: "Platforms", speakerNames: ["Ada Lovelace"] }),
    item({ title: "Agents deep dive", startTime: day1 + 3_600_000, trackName: "Agents" }),
    item({ title: "Closing notes", startTime: day2, trackName: "Platforms" }),
  ],
  speakers: [{ name: "Ada Lovelace", bio: "<p>First programmer &amp; computing pioneer.</p>", links: [] }],
};

const empty: PublicEmbed = { eventName: "Test Conf", eventTimezone: timezone, agenda: [], speakers: [] };

let root: Root | undefined;
let container: HTMLDivElement | undefined;

/** Mounts the public embed route for one feed and returns the rendered DOM. */
async function renderFeed(feed: string, embed: PublicEmbed, getLegacy = vi.fn(async () => embed)) {
  const repo = { publicEmbeds: { getLegacy }, agenda: { list: vi.fn() }, speakers: { list: vi.fn() } } as unknown as Repository;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <RepoContext.Provider value={repo}>
        <MemoryRouter initialEntries={[`/e/test-conf/${feed}`]}>
          <Routes><Route path="/e/:eventSlug/:feed" element={<EmbedPage />} /><Route path="/" element={<p>home</p>} /></Routes>
        </MemoryRouter>
      </RepoContext.Provider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return { element: container, repo };
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function headings(element: HTMLElement, selector: string) {
  return [...element.querySelectorAll(selector)].map(node => node.textContent?.trim());
}

describe("list of sessions embed", () => {
  it("groups by track and never by day", async () => {
    const { element } = await renderFeed("sessions", published);
    expect(element.querySelector("h1")?.textContent).toBe("Sessions");
    expect(headings(element, "h2")).toEqual(["Agents", "Platforms"]);
    expect(element.textContent).not.toContain("September 15");
    expect(element.textContent).not.toContain("September 16");
  });

  it("renders only what the shared public query returned", async () => {
    const { element, repo } = await renderFeed("sessions", published);
    expect(element.querySelectorAll("article")).toHaveLength(3);
    expect(element.textContent).toContain("Ada Lovelace");
    // The public page never reaches for organizer-scoped data to fill in the rest.
    expect(repo.agenda.list).not.toHaveBeenCalled();
    expect(repo.speakers.list).not.toHaveBeenCalled();
  });

  it("shows its own empty state", async () => {
    const { element } = await renderFeed("sessions", empty);
    expect(element.textContent).toContain("The session catalog has not been published yet.");
  });
});

describe("schedule itinerary embed", () => {
  it("is a flat chronological list per day with no track sub-grouping", async () => {
    const { element } = await renderFeed("itinerary", published);
    expect(element.querySelector("h1")?.textContent).toBe("Schedule itinerary");
    expect(headings(element, "h2")).toEqual(["Tuesday, September 15", "Wednesday, September 16"]);
    expect(element.querySelectorAll("h3")).toHaveLength(0);
    const lists = element.querySelectorAll("ol");
    expect(lists).toHaveLength(2);
    expect([...lists[0].querySelectorAll("li")].map(node => node.querySelector("p:nth-of-type(1)")?.textContent)).toEqual(["2:00 PM – 3:00 PM", "3:00 PM – 4:00 PM"]);
  });

  it("renders only what the shared public query returned", async () => {
    const { element, repo } = await renderFeed("itinerary", published);
    expect(element.querySelectorAll("li")).toHaveLength(3);
    expect(repo.agenda.list).not.toHaveBeenCalled();
    expect(repo.speakers.list).not.toHaveBeenCalled();
  });

  it("shows its own empty state", async () => {
    const { element } = await renderFeed("itinerary", empty);
    expect(element.textContent).toContain("The itinerary will appear once the schedule is published.");
  });
});

describe("embed feed routing", () => {
  it("still serves agenda and speakers, and keeps unknown feeds on a public not-found page", async () => {
    const agenda = await renderFeed("agenda", published);
    expect(agenda.element.querySelector("h1")?.textContent).toBe("Agenda");
    expect(agenda.element.textContent).toContain("Powered by Namos Sessions");
    expect(agenda.element.textContent).not.toContain("Sessionboard");
    if (root) act(() => root!.unmount());
    container?.remove();

    const unknown = await renderFeed("exhibitors", published);
    expect(unknown.element.textContent).toContain("Page not found");
    expect(unknown.element.textContent).not.toContain("home");
  });

  it("renders stored rich-text biographies without exposing HTML markup", async () => {
    const { element } = await renderFeed("speakers", published);
    expect(element.textContent).toContain("First programmer & computing pioneer.");
    expect(element.textContent).not.toContain("<p>");
  });
});
