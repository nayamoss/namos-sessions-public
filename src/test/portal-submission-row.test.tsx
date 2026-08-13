import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PortalSubmissionRow } from "@/pages/portal/PortalPages";
import type { EventId, FormId, Submission, SubmissionId } from "@/data/types";

function submission(status: Submission["status"]): Submission {
  return { id: "submission-a" as SubmissionId, eventId: "event-a" as EventId, formId: "form-a" as FormId, speakerIds: [], tagIds: [], status, title: "Reliable agents", updatedAt: Date.UTC(2026, 7, 11) };
}

describe("portal submission row", () => {
  it("renders an accessible edit link for an editable proposal", () => {
    render(<MemoryRouter><PortalSubmissionRow submission={submission("pending")} timezone="America/New_York" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Edit Reliable agents" })).toHaveAttribute("href", "/portal/submissions/submission-a/edit");
  });

  it("renders lock copy and no edit link once review starts", () => {
    render(<MemoryRouter><PortalSubmissionRow submission={submission("accept_queue")} timezone="America/New_York" /></MemoryRouter>);
    expect(screen.getByText("Locked · under review")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Edit Reliable agents/ })).not.toBeInTheDocument();
  });

  it("renders the backend close-date verdict instead of an edit link", () => {
    const closed = { ...submission("pending"), editability: { editable: false as const, reason: "submissions_closed" as const, closedAt: Date.UTC(2026, 7, 1) } };
    render(<MemoryRouter><PortalSubmissionRow submission={closed} timezone="America/New_York" /></MemoryRouter>);
    expect(screen.getByText("Locked · submissions closed")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Edit Reliable agents/ })).not.toBeInTheDocument();
  });
});
