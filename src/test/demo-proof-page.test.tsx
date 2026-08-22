import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DemoProofPage from "@/pages/public/DemoProofPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("judge demo proof page", () => {
  it("explains missing evidence and routes a signed-out judge through demo setup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(<MemoryRouter><DemoProofPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Verify the judge demo for yourself." })).toBeVisible();
    expect(screen.getByText("90-second recording is not published yet")).toBeVisible();
    expect(screen.getAllByText("Evidence pending")).toHaveLength(8);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No demo workspace yet"));
    const setupLinks = screen.getAllByRole("link", { name: /Start a demo to verify/ });
    expect(setupLinks).toHaveLength(7);
    expect(setupLinks[0]).toHaveAttribute("href", "/demo?proof=control-room");
  });

  it("links directly to a record when the matching demo role is already active", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      workspace: { eventSlug: "demo-workspace-1", activeRole: "organizer" },
    }), { status: 200, headers: { "content-type": "application/json" } })));
    render(<MemoryRouter><DemoProofPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("organizer role active"));
    expect(screen.getByRole("link", { name: /Open Control Room/ })).toHaveAttribute("href", "/events/demo-workspace-1/dashboard");
    expect(screen.getByRole("link", { name: /Open Operations Agent/ })).toHaveAttribute("href", "/events/demo-workspace-1/program/agent");
    expect(screen.getAllByRole("link", { name: /Start a demo to verify/ }).find((link) => link.getAttribute("href") === "/demo?proof=resources")).toBeVisible();
  });
});
