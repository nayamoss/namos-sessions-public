import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoWorkspaceBar } from "@/components/demo/DemoWorkspaceBar";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

const activeWorkspace = {
  workspace: {
    activeRole: "organizer",
    expiresAt: Date.now() + 60_000,
    eventSlug: "demo-workspace-1",
  },
  csrf: "csrf-token",
};

afterEach(() => {
  cleanup();
  document.body.classList.remove("demo-workspace-active");
  vi.unstubAllGlobals();
});

describe("DemoWorkspaceBar", () => {
  it("renders the active demo controls on the final non-demo route", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(activeWorkspace));
    vi.stubGlobal("fetch", fetch);

    render(
      <MemoryRouter initialEntries={["/events/demo-workspace-1/dashboard"]}>
        <DemoWorkspaceBar />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("complementary", { name: "Demo workspace toolbar" })).toBeVisible();
    expect(fetch).toHaveBeenCalledWith("/api/demo/workspaces/current", {
      credentials: "same-origin",
    });
    expect(screen.getByRole("button", { name: "Organizer" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Reset" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Demo inbox" })).toHaveAttribute("href", "/demo/inbox");
    expect(screen.getByText(/Read-only · Active until/)).toBeVisible();
    expect(document.body).toHaveClass("demo-workspace-active");
  });

  it("keeps the bar hidden only on the exact demo entry route", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(activeWorkspace));
    vi.stubGlobal("fetch", fetch);

    render(
      <MemoryRouter initialEntries={["/demo"]}>
        <DemoWorkspaceBar />
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("complementary", { name: "Demo workspace toolbar" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("demo-workspace-active");
  });

  // Regression test for 66c05f53: a demo cookie is `__Host-` prefixed (forced Path=/), so it
  // is technically readable on every route, including a real organizer's real event pages in
  // the same browser. The bar must never render there even though the cookie-backed fetch
  // still succeeds — only an exact match on the workspace's own event slug counts as "in the
  // demo," never a bare presence of a valid cookie.
  it("never renders on a real event's pages even with a valid demo cookie present", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(activeWorkspace));
    vi.stubGlobal("fetch", fetch);

    render(
      <MemoryRouter initialEntries={["/events/real-conference-2026/dashboard"]}>
        <DemoWorkspaceBar />
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("complementary", { name: "Demo workspace toolbar" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("demo-workspace-active");
  });
});
