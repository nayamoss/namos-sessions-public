import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmbedRenderer } from "@/components/embeds/EmbedRenderer";
import type { EmbedView, PublicEmbedView } from "@/data/types";

function embed(view: EmbedView): PublicEmbedView {
  return {
    name: "Website program",
    view,
    theme: "system",
    primaryColor: "#E56B5D",
    dateFormat: "weekday_long",
    timeFormat: "12_hour",
    event: { name: "Namos Live", timezone: "UTC" },
    tracks: [{ key: "track-0", name: "AI" }, { key: "track-1", name: "Web" }],
    sessions: [
      { key: "session-0", title: "Agent systems", startTime: Date.UTC(2026, 7, 17, 14), endTime: Date.UTC(2026, 7, 17, 15), roomName: "Main", trackKey: "track-0", trackName: "AI", speakerNames: ["Ada Lovelace"] },
      { key: "session-1", title: "Browser craft", startTime: Date.UTC(2026, 7, 17, 16), roomName: "Studio", trackKey: "track-1", trackName: "Web" },
    ],
    speakers: [{ key: "speaker-0", name: "Ada Lovelace", bio: "Computing pioneer", links: [{ label: "Website", url: "https://example.test" }], sessions: [{ title: "Agent systems", startTime: Date.UTC(2026, 7, 17, 14), roomName: "Main" }] }],
  };
}

describe("saved embed renderer", () => {
  it.each<EmbedView>(["agenda", "schedule_itinerary", "schedule_grid", "session_list", "speaker_gallery", "speaker_list"])("renders %s with Namos branding", (view) => {
    render(<EmbedRenderer embed={embed(view)} />);
    expect(screen.getByText("Namos Live")).toBeInTheDocument();
    expect(screen.getByText("Powered by Namos Sessions")).toBeInTheDocument();
  });

  it("lays the schedule grid out as rooms-by-time with sessions placed in their cell", () => {
    render(<EmbedRenderer embed={embed("schedule_grid")} />);
    expect(screen.getByRole("columnheader", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Studio" })).toBeInTheDocument();
    expect(screen.getByText("Agent systems")).toBeInTheDocument();
    expect(screen.getByText("Browser craft")).toBeInTheDocument();
  });

  it("filters sessions locally with search and the styled track listbox", () => {
    render(<EmbedRenderer embed={embed("session_list")} />);
    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "Browser" } });
    expect(screen.queryByText("Agent systems")).not.toBeInTheDocument();
    expect(screen.getByText("Browser craft")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by track" })).toBeInTheDocument();
    expect(document.querySelector("select")).toBeNull();
  });

  it("expands speaker details with an accessible button", () => {
    render(<EmbedRenderer embed={embed("speaker_gallery")} />);
    const speaker = screen.getByRole("button", { name: /Ada Lovelace/ });
    expect(speaker).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(speaker);
    expect(speaker).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Computing pioneer")).toBeInTheDocument();
  });
});
