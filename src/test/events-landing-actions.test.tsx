import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { Event, EventId } from "@/data/types";

// Radix's DropdownMenu trigger relies on the Pointer Events API (hasPointerCapture /
// releasePointerCapture) that jsdom doesn't implement — without these stubs the menu
// never opens in this environment, even though it opens fine in a real browser.
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

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
  it("opens the guarded deletion dialog directly for a manageable draft", async () => {
    renderEvents([draftEvent]);

    const menuTrigger = await screen.findByRole("button", {
      name: "Actions for Takumi Talks Draft",
    });
    fireEvent.pointerDown(menuTrigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(menuTrigger);

    const deleteItem = await screen.findByRole("menuitem", { name: "Delete" });
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();

    fireEvent.click(deleteItem);

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

    const menuTrigger = await screen.findByRole("button", {
      name: "Actions for Published Talks",
    });
    fireEvent.pointerDown(menuTrigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(menuTrigger);

    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeVisible(),
    );
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });
});
