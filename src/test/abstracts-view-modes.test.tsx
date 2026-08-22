import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { EventId, FormId, SpeakerId, SubmissionId } from "@/data/types";

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/components/EventContext", () => {
  const event = { id: "event-1" as EventId, slug: "demo-event" };
  return { useCurrentEvent: () => ({ event }) };
});

import Abstracts from "@/pages/program/Abstracts";

const repo = {
  submissions: {
    list: vi.fn().mockResolvedValue([
      {
        id: "submission-1" as SubmissionId,
        eventId: "event-1" as EventId,
        formId: "form-1" as FormId,
        speakerIds: ["speaker-1" as SpeakerId],
        tagIds: [],
        status: "accepted",
        title: "Reliable systems",
        answers: { description: "Building systems that recover gracefully.", track: "Engineering" },
      },
      {
        id: "submission-2" as SubmissionId,
        eventId: "event-1" as EventId,
        formId: "form-1" as FormId,
        speakerIds: ["speaker-2" as SpeakerId],
        tagIds: [],
        status: "pending",
        title: "Designing for trust",
        answers: { description: "Practical trust-centered design.", track: "Design" },
      },
    ]),
    decide: vi.fn(),
    setStatus: vi.fn(),
  },
  speakers: {
    list: vi.fn().mockResolvedValue([
      { id: "speaker-1" as SpeakerId, name: "Ada Lovelace" },
      { id: "speaker-2" as SpeakerId, name: "Grace Hopper" },
    ]),
  },
  evaluations: { list: vi.fn().mockResolvedValue([]) },
  forms: {
    list: vi.fn().mockResolvedValue([
      { id: "form-1" as FormId, name: "Main CFP", sections: [] },
    ]),
    listFields: vi.fn().mockResolvedValue([]),
  },
  comms: { list: vi.fn().mockResolvedValue([]) },
  tags: { list: vi.fn().mockResolvedValue([]) },
} as unknown as Repository;

function renderAbstracts() {
  return render(
    <MemoryRouter initialEntries={["/events/demo-event/program/abstracts"]}>
      <RepoContext.Provider value={repo}>
        <Routes>
          <Route
            path="/events/:eventSlug/program/abstracts"
            element={<Abstracts />}
          />
          <Route
            path="/events/:eventSlug/program/abstracts/:abstractId/edit"
            element={<Abstracts />}
          />
        </Routes>
      </RepoContext.Provider>
    </MemoryRouter>,
  );
}

describe("Submissions view modes", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("switches between the same filtered rows and persists the selected view", async () => {
    renderAbstracts();

    await screen.findByText("Reliable systems");
    expect(screen.getByRole("table")).toHaveTextContent("Reliable systems");
    expect(screen.getByRole("radio", { name: "Table view" })).toHaveAttribute(
      "data-state",
      "on",
    );

    fireEvent.click(screen.getByRole("radio", { name: "Kanban view" }));
    const board = await screen.findByLabelText("Submissions kanban board");
    expect(board).toHaveTextContent("Reliable systems");
    expect(board).toHaveTextContent("Designing for trust");
    expect(window.localStorage.getItem("namos-submissions-view-mode")).toBe(
      "kanban",
    );

    fireEvent.change(screen.getByPlaceholderText("Search submissions"), {
      target: { value: "trust" },
    });
    expect(board).not.toHaveTextContent("Reliable systems");
    expect(board).toHaveTextContent("Designing for trust");

    fireEvent.click(screen.getByRole("radio", { name: "Grid view" }));
    const grid = await screen.findByLabelText("Submissions grid");
    expect(grid).not.toHaveTextContent("Reliable systems");
    expect(grid).toHaveTextContent("Designing for trust");
    expect(window.localStorage.getItem("namos-submissions-view-mode")).toBe(
      "grid",
    );
  });

  it("restores a saved card view and opens a submission from its card", async () => {
    window.localStorage.setItem("namos-submissions-view-mode", "grid");
    renderAbstracts();

    expect(await screen.findByLabelText("Submissions grid")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Reliable systems" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Reliable systems",
      ),
    );
  });
});
