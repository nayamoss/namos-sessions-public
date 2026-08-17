import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DataGrid } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";

describe("empty-state system", () => {
  it("provides a visual, explanation, and next action", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(
      <EmptyState
        title="Create your first record"
        message="Records make this workflow useful."
        action={<button type="button">Create record</button>}
      />,
    ));

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container).toHaveTextContent("Create your first record");
    expect(container).toHaveTextContent("Records make this workflow useful.");
    expect(container.querySelector("button")).toHaveTextContent("Create record");

    act(() => root.unmount());
    container.remove();
  });

  it("allows data grids to render the same rich empty state", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(
      <MemoryRouter>
        <DataGrid
          rows={[]}
          columns={[{ key: "name", header: "Name", cell: () => null }]}
          empty={<EmptyState compact title="Nothing matches" message="Clear the filters." />}
        />
      </MemoryRouter>,
    ));

    expect(container.querySelector("td[data-empty='true']")).toHaveTextContent("Nothing matches");
    expect(container.querySelector("td[data-empty='true']")).toHaveTextContent("Clear the filters.");

    act(() => root.unmount());
    container.remove();
  });

  it("keeps primary collection routes on the shared empty-state pattern", () => {
    const files = [
      "pages/events/EventsLanding.tsx",
      "pages/program/SubmissionForms.tsx",
      "pages/program/Abstracts.tsx",
      "pages/program/Speakers.tsx",
      "pages/program/Sponsors.tsx",
      "pages/program/Agenda.tsx",
      "pages/program/Availability.tsx",
      "pages/program/Communications.tsx",
      "pages/program/Evaluation.tsx",
      "pages/portal/PortalForms.tsx",
      "pages/portal/TasksAdmin.tsx",
      "pages/portal/PortalPages.tsx",
      "pages/portal/PortalSchedule.tsx",
      "pages/settings/EventTeam.tsx",
      "pages/settings/Library.tsx",
      "pages/settings/TaskTemplates.tsx",
      "pages/settings/ApiKeys.tsx",
      "pages/cms/EmbedsListPage.tsx",
    ];

    const violations = files.filter((file) => {
      const source = readFileSync(join(process.cwd(), "src", file), "utf8");
      return !source.includes("<EmptyState");
    });

    expect(violations).toEqual([]);
  });

  it("renders calls for papers as structured rows without the old helper line", () => {
    const source = readFileSync(
      join(process.cwd(), "src/pages/program/SubmissionForms.tsx"),
      "utf8",
    );

    expect(source).toContain('<AppLayout title="Calls for papers">');
    expect(source).toContain("<DataGrid");
    expect(source).not.toContain("submissions ·");
    expect(source).not.toContain("drafts\n");
  });
});
