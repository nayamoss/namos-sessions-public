import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CommTemplateEditor from "@/pages/program/CommTemplateEditor";
import { RepoContext } from "@/data/repo";
import { createRepository, type DataTransport } from "@/data/transport";
import type { EventId } from "@/data/types";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

vi.mock("@/components/editor/RichTextEditor", () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabelledBy,
  }: {
    value: string;
    onChange: (value: string) => void;
    ariaLabelledBy?: string;
  }) => (
    <textarea
      aria-labelledby={ariaLabelledBy}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

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
        <MemoryRouter initialEntries={["/program/communications/templates/new/edit"]}>
          <RepoContext.Provider value={createRepository(transport)}>
            <Routes>
              <Route
                path="/program/communications/templates/:id/edit"
                element={<CommTemplateEditor />}
              />
            </Routes>
          </RepoContext.Provider>
        </MemoryRouter>
      </ClerkProvider>,
    );

    expect(await screen.findByLabelText("Template name")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Speaker reminder" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Your tasks are due" } });
    // The real body field is a tiptap/ProseMirror rich-text editor — mocked above to a plain
    // textarea, since ProseMirror doesn't react to jsdom's limited contentEditable support.
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
