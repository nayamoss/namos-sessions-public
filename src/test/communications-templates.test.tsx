import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Communications from "@/pages/program/Communications";
import { RepoContext } from "@/data/repo";
import { createRepository, type DataTransport } from "@/data/transport";
import type { EventId } from "@/data/types";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

const eventId = "event-a" as EventId;

describe("Communications template management", () => {
  it("saves a new event-scoped template through the repository", async () => {
    const write = vi.fn().mockResolvedValue("template-new");
    const transport: DataTransport = {
      read: vi.fn(async (operation) => {
        if (operation === "events.list") return [{ id: eventId, name: "Summit", slug: "summit", timezone: "America/New_York", startDate: 1, endDate: 2, exhibitorsEnabled: false, sponsorsEnabled: false, status: "draft" }];
        return [];
      }) as DataTransport["read"],
      write,
    };

    render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter initialEntries={["/program/communications"]}>
          <RepoContext.Provider value={createRepository(transport)}>
            <Communications />
          </RepoContext.Provider>
        </MemoryRouter>
      </ClerkProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Template library" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Speaker reminder" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Your tasks are due" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Please finish your portal tasks." } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => expect(write).toHaveBeenCalledWith("comms.templates.save", {
      eventId,
      name: "Speaker reminder",
      kind: "custom",
      subject: "Your tasks are due",
      body: "Please finish your portal tasks.",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Template saved.");
  });
});
