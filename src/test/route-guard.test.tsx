import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ClerkProvider } from "@clerk/clerk-react";
import App, { resolveAuthReturnTo } from "@/App";
import { resolveOnboardingStatus } from "@/lib/onboarding-status";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

// App owns its own BrowserRouter, so route-guard coverage drives it via real browser
// history (pushState) rather than wrapping it in a MemoryRouter.
const ORGANIZER_ROUTES = [
  "/dashboard",
  "/dashboard/speakers",
  "/program/forms",
  "/program/abstracts",
  "/program/evaluation",
  "/program/agenda",
  "/program/availability",
  "/program/communications",
  "/program/speakers",
  "/settings/email",
  "/portals/forms",
  "/portals/tasks",
  "/settings/event",
  "/settings/library",
  // Speaker-facing, not organizer-only — included here only to confirm RequireAuth still
  // gates it. It must never be nested inside RequireOnboarding (see the onboarding route
  // guard test below): a signed-in speaker has no `organizers` row and must not be bounced
  // into organizer onboarding.
  "/portal",
];

describe("organizer route guard", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    container = null;
    root = null;
    sessionStorage.clear();
  });

  it.each(ORGANIZER_ROUTES)("redirects %s to sign-in when signed out", async (path) => {
    window.history.pushState({}, "", path);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
          <App />
        </ClerkProvider>,
      );
    });

    // A signed-out visitor gets a clean auth URL; the protected destination is kept out of
    // Clerk's query string and restored after authentication by /auth/complete.
    expect(container.querySelector("aside")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("Good afternoon");
    expect(container.textContent).not.toContain("Claim owner access");
  });

  it("accepts only safe app-local post-auth destinations", () => {
    expect(resolveAuthReturnTo("/events/conf/dashboard?view=ready#top")).toBe("/events/conf/dashboard?view=ready#top");
    expect(resolveAuthReturnTo("https://example.com/steal-session")).toBe("/");
    expect(resolveAuthReturnTo("//example.com/steal-session")).toBe("/");
    expect(resolveAuthReturnTo("/sign-in?redirect_url=https://example.com")).toBe("/");
    expect(resolveAuthReturnTo("/auth/complete")).toBe("/");
  });
});

describe("onboarding status", () => {
  it("does not send invited admins through owner onboarding", () => {
    expect(resolveOnboardingStatus({ role: "admin" }, 0)).toBe("complete");
  });

  it("still requires an incomplete owner to finish setup", () => {
    expect(resolveOnboardingStatus({ role: "owner" }, 0)).toBe("incomplete");
    expect(
      resolveOnboardingStatus(
        { role: "owner", onboardingCompletedAt: Date.now() },
        0,
      ),
    ).toBe("complete");
  });

  it("allows event-only members with an accessible event", () => {
    expect(resolveOnboardingStatus(null, 1)).toBe("complete");
    expect(resolveOnboardingStatus(null, 0)).toBe("incomplete");
  });
});
