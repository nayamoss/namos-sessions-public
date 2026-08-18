import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { Event, EventId } from "@/data/types";

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ title, children, detail }: { title: string; children: ReactNode; detail?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
      {detail}
    </main>
  ),
}));

import EventsLanding from "@/pages/events/EventsLanding";

const draftEvent: Event = {
  id: "event-1" as EventId,
  name: "Takumi Talks Draft",
  slug: "takumi-talks-draft",
  timezone: "UTC",
  startDate: Date.UTC(2027, 0, 9),
  endDate: Date.UTC(2027, 0, 10),
  exhibitorsEnabled: false,
  sponsorsEnabled: false,
  status: "draft",
};

function renderEvents(events: Event[]) {
  const repo = {
    events: {
      listMine: vi.fn().mockResolvedValue(events),
      remove: vi.fn(),
    },
    eventMembers: {
      canManage: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Repository;

  render(
    <MemoryRouter>
      <RepoContext.Provider value={repo}>
        <EventsLanding />
      </RepoContext.Provider>
    </MemoryRouter>,
  );

  return repo;
}

describe("event row actions", () => {
  it("filters events with a dropdown instead of status toggles", async () => {
    renderEvents([
      draftEvent,
      {
        ...draftEvent,
        id: "event-2" as EventId,
        name: "Published Talks",
        slug: "published-talks",
        status: "published",
      },
    ]);

    const statusFilter = await screen.findByRole("combobox", {
      name: "Filter events by status",
    });
    expect(statusFilter).toHaveTextContent("All events");
    expect(screen.queryByRole("radiogroup", { name: "Event status" })).not.toBeInTheDocument();

    fireEvent.keyDown(statusFilter, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Published" }));

    expect(statusFilter).toHaveTextContent("Published");
    expect(screen.getByRole("rowheader", { name: "Published Talks" })).toBeVisible();
    expect(screen.queryByRole("rowheader", { name: "Takumi Talks Draft" })).not.toBeInTheDocument();
  });

  it("sorts the Events table by its declared columns", async () => {
    renderEvents([
      draftEvent,
      {
        ...draftEvent,
        id: "event-2" as EventId,
        name: "Alpha Conference",
        slug: "alpha-conference",
        startDate: Date.UTC(2026, 0, 9),
        endDate: Date.UTC(2026, 0, 10),
        status: "published",
      },
    ]);

    const eventSort = await screen.findByRole("button", { name: "Sort by Event, currently not sorted" });
    const rowNames = () =>
      Array.from(screen.getByRole("table", { name: "Events" }).querySelectorAll("tbody th")).map(
        (cell) => cell.textContent,
      );

    expect(rowNames()).toEqual(["Takumi Talks Draft", "Alpha Conference"]);
    fireEvent.click(eventSort);
    expect(rowNames()).toEqual(["Alpha Conference", "Takumi Talks Draft"]);
    expect(eventSort.closest("th")).toHaveAttribute("aria-sort", "ascending");
  });

  it("opens the guarded deletion dialog directly for a manageable draft", async () => {
    renderEvents([draftEvent]);

    const deleteButton = await screen.findByRole("button", {
      name: "Delete Takumi Talks Draft",
    });
    const table = screen.getByRole("table", { name: "Events" });
    const eventRow = screen.getByRole("rowheader", { name: "Takumi Talks Draft" }).closest("tr");

    const actionsHeader = screen.getByRole("columnheader", { name: "Actions" });
    expect(actionsHeader.querySelector(".sr-only")).toHaveTextContent("Actions");
    expect(eventRow?.querySelector('td[data-label="Actions"]')).toContainElement(deleteButton);
    expect(screen.getByRole("button", { name: "Duplicate Takumi Talks Draft" })).toBeVisible();
    expect(table).toContainElement(eventRow);

    fireEvent.click(deleteButton);

    expect(await screen.findByRole("alertdialog")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Delete Takumi Talks Draft?" })).toBeVisible();
    const confirmation = screen.getByLabelText(/Type Takumi Talks Draft to confirm/);
    const confirmButton = screen.getByRole("button", { name: "Delete event" });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(confirmation, { target: { value: "Takumi Talks Draft" } });
    expect(confirmButton).toBeEnabled();
  });

  it("does not offer deletion for a published event", async () => {
    renderEvents([{ ...draftEvent, status: "published", name: "Published Talks" }]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Duplicate Published Talks" })).toBeVisible(),
    );
    expect(screen.queryByRole("button", { name: "Delete Published Talks" })).not.toBeInTheDocument();
  });
});
