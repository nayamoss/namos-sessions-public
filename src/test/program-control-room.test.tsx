import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProgramControlRoom } from "@/components/dashboard/ProgramControlRoom";
import type { ControlRoomState } from "@/data/types";

const state: ControlRoomState = {
  generatedAt: 1,
  categories: {
    decisions: [{ id: "submission-1", kind: "decisions", title: "Designing for trust", detail: "A program decision is still required.", href: "/events/demo/program/abstracts?selected=submission-1", severity: "attention" }],
    reviews: [],
    acceptance_emails: [],
    overdue_tasks: [],
    missing_assets: [],
    unscheduled: [],
    conflicts: [],
    recording_coverage: [],
    publication_blockers: [],
  },
  walkthrough: [
    { id: "submit", label: "Submit through the conditional CFP", complete: true, href: "/submit/demo/form-1" },
    { id: "review", label: "Score it as a reviewer", complete: false, href: "/events/demo/program/evaluation?assignment=assignment-1" },
  ],
};

describe("Program Control Room", () => {
  it("renders every operational category and exact record links", () => {
    render(<MemoryRouter><ProgramControlRoom state={state} loading={false} /></MemoryRouter>);

    for (const heading of ["Decisions waiting", "Incomplete reviews", "Unsent acceptance emails", "Overdue speaker tasks", "Missing headshots or slides", "Unscheduled accepted sessions", "Room or speaker conflicts", "Post-session recording coverage", "Publication blockers"])
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();

    expect(screen.getByRole("link", { name: /Designing for trust/ })).toHaveAttribute("href", "/events/demo/program/abstracts?selected=submission-1");
    expect(screen.getByText("1 / 2")).toBeVisible();
    expect(screen.getByRole("link", { name: /Step 2: Score it as a reviewer/ })).toHaveAttribute("href", "/events/demo/program/evaluation?assignment=assignment-1");
    expect(screen.getAllByText("All clear")).toHaveLength(8);
  });

  it("renders an actionable failure instead of an indefinite skeleton", () => {
    render(<MemoryRouter><ProgramControlRoom loading={false} error="Connection lost" /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
