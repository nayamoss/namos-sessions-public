import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { EventId, TaskTemplate } from "@/data/types";

vi.mock("@/components/EventContext", () => {
  const event = { id: "event-1", slug: "demo-event" };
  return { useCurrentEvent: () => ({ event }) };
});

import TaskTemplates from "@/pages/settings/TaskTemplates";

const starterTemplates: TaskTemplate[] = [
  "Standard Speaker Onboarding",
  "Keynote Speaker",
  "Workshop Facilitator",
  "Panelist",
  "Virtual/Remote Speaker",
  "Sponsor-Nominated Speaker",
].map((name, index) => ({
  id: `template-${index + 1}`,
  eventId: "event-1" as EventId,
  name,
  items: [{ title: "Confirm details", targetType: "submission" }],
  isSeeded: true,
}));

describe("task template defaults", () => {
  it("backfills and displays the persisted starter templates for an older event", async () => {
    const ensureStarters = vi.fn().mockResolvedValue({ created: 6 });
    const list = vi.fn().mockResolvedValue(starterTemplates);
    const repo = {
      taskTemplates: { ensureStarters, list },
      forms: { list: vi.fn().mockResolvedValue([]) },
    } as unknown as Repository;

    render(
      <MemoryRouter>
        <RepoContext.Provider value={repo}>
          <TaskTemplates />
        </RepoContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(ensureStarters).toHaveBeenCalledWith({ eventId: "event-1" }));
    await waitFor(() => expect(screen.getByText("Standard Speaker Onboarding")).toBeInTheDocument());
    expect(screen.getByText("Keynote Speaker")).toBeInTheDocument();
    expect(screen.getByText("Workshop Facilitator")).toBeInTheDocument();
    expect(screen.getByText("Panelist")).toBeInTheDocument();
    expect(screen.getByText("Virtual/Remote Speaker")).toBeInTheDocument();
    expect(screen.getByText("Sponsor-Nominated Speaker")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ eventId: "event-1" });
    expect(ensureStarters.mock.invocationCallOrder[0]).toBeLessThan(list.mock.invocationCallOrder[0]);
    expect(screen.queryByText("No task templates yet")).not.toBeInTheDocument();
  });
});
