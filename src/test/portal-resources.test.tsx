import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalResources from "@/pages/portal/PortalResources";

const listPublished = vi.fn();
const repo = { portalResources: { listPublished } };

vi.mock("@/data/repo", () => ({ useRepo: () => repo }));
vi.mock("@/pages/portal/PortalIdentity", () => ({ usePortalIdentity: () => ({ eventId: "event-1", selectedSpeaker: { id: "speaker-1", name: "Ada Lovelace" } }) }));

describe("speaker portal resources", () => {
  beforeEach(() => listPublished.mockReset());

  it("renders published rich text through the sanitizer", async () => {
    listPublished.mockResolvedValue([{ id: "resource-1", eventId: "event-1", title: "Speaker handbook", slug: "speaker-handbook", bodyHtml: '<p>Enter by the east door.</p><img src=x onerror="alert(1)"><script>alert(1)</script>', status: "published", sortOrder: 0, createdAt: 1, updatedAt: 1 }]);
    const { container } = render(<PortalResources />);
    expect(await screen.findByRole("heading", { name: "Speaker handbook" })).toBeInTheDocument();
    expect(screen.getByText("Enter by the east door.")).toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("[onerror]")).not.toBeInTheDocument();
    expect(listPublished).toHaveBeenCalledWith({ eventId: "event-1", speakerId: "speaker-1" });
  });

  it("shows the honest empty state", async () => {
    listPublished.mockResolvedValue([]);
    render(<PortalResources />);
    await waitFor(() => expect(screen.getByText("No resources have been published")).toBeInTheDocument());
  });
});
