import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "@/App";
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

    // A real Clerk session never loads against the test key, so SignedOut always wins:
    // RedirectToSignIn should navigate away before any organizer chrome mounts.
    expect(container.querySelector("aside")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("Good afternoon");
    expect(container.textContent).not.toContain("Claim owner access");
  });
});
