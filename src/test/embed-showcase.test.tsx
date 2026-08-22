import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { EmbedId, EmbedView, PublicEmbedShowcase } from "@/data/types";
import { embedViews } from "@/lib/public-embed";
import EmbedShowcasePage from "@/pages/public/EmbedShowcasePage";

const names: Record<EmbedView, string> = {
  agenda: "Main event agenda",
  schedule_itinerary: "Schedule itinerary",
  schedule_grid: "Schedule grid",
  session_list: "Session list",
  speaker_gallery: "Speaker gallery",
  speaker_list: "Speaker list",
};

function renderShowcase() {
  const showcase: PublicEmbedShowcase = {
    eventName: "AI.Engineer Sandbox Event — NYC",
    eventSlug: "ai-engineer-sandbox-event",
    embeds: embedViews.map((view, index) => ({
      id: `embed-${index}` as EmbedId,
      name: names[view],
      view,
    })),
  };
  const listShowcase = vi.fn().mockResolvedValue(showcase);
  const repo = { publicEmbeds: { listShowcase } } as unknown as Repository;

  render(
    <MemoryRouter>
      <RepoContext.Provider value={repo}>
        <EmbedShowcasePage />
      </RepoContext.Provider>
    </MemoryRouter>,
  );
  return { listShowcase };
}

describe("public embed showcase", () => {
  it("renders every live view with its actual iframe and snippet", async () => {
    const { listShowcase } = renderShowcase();

    expect(await screen.findByRole("heading", { name: "Put your programme on any event website." })).toBeVisible();
    expect(listShowcase).toHaveBeenCalledWith("ai-engineer-sandbox-event");
    expect(screen.getAllByTitle(/live example — Namos Sessions/)).toHaveLength(6);
    expect(screen.getByText(/\/embed\/embed-0/)).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Copy code" })).toHaveLength(6);
  });
});
