import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDemoSession } from "@/lib/hooks/use-demo-session";

// The demo cookie is `__Host-` prefixed, forcing Path=/, so it's technically readable on every
// route once a demo session has ever started in this browser — including a real, authenticated
// user's own real events (see DemoWorkspaceBar's identical bug, 66c05f53 / #280). This hook
// gates real write controls app-wide, so a false positive here is worse than a cosmetic one:
// it silently disables a real user's ability to act on their own real data.
function mockWorkspaceResponse(eventSlug: string, activeRole = "organizer") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workspace: { activeRole, eventSlug }, csrf: "x" }),
    }),
  );
}

function renderAt(pathname: string) {
  return renderHook(() => useDemoSession(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>,
  });
}

describe("useDemoSession", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("does not report isDemo on a real event's route even with a stale demo cookie present", async () => {
    mockWorkspaceResponse("demo-abc123");
    const { result } = renderAt("/events/morning-health-check-summit/dashboard");
    await waitFor(() => expect(result.current).toEqual({ isDemo: false, activeRole: null }));
  });

  it("does report isDemo on the matching demo event's own route", async () => {
    mockWorkspaceResponse("demo-abc123");
    const { result } = renderAt("/events/demo-abc123/dashboard");
    await waitFor(() => expect(result.current).toEqual({ isDemo: true, activeRole: "organizer" }));
  });

  it("reports isDemo on the bare /demo entry route", async () => {
    mockWorkspaceResponse("demo-abc123");
    const { result } = renderAt("/demo");
    await waitFor(() => expect(result.current).toEqual({ isDemo: true, activeRole: "organizer" }));
  });

  it("does not report isDemo when the workspace request fails (no active session)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { result } = renderAt("/events/morning-health-check-summit/dashboard");
    await waitFor(() => expect(result.current).toEqual({ isDemo: false, activeRole: null }));
  });
});
