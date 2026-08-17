import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EventId } from "@/data/types";

const useQueryMock = vi.fn();
// VoiceChatButton reads from convex-helpers' cache-wrapped useQuery, not the raw
// convex/react one (see the component's own comment) — mock the module it actually imports.
vi.mock("convex-helpers/react/cache", () => ({ useQuery: (...args: unknown[]) => useQueryMock(...args) }));

const { VoiceChatButton } = await import("@/components/voice/VoiceChatButton");

const eventId = "event_1" as EventId;

function renderButton(onOpen = vi.fn()) {
  render(
    <TooltipProvider>
      <VoiceChatButton eventId={eventId} onOpen={onOpen} />
    </TooltipProvider>,
  );
  return onOpen;
}

const onCleanup: (() => void)[] = [];

beforeEach(() => {
  useQueryMock.mockReset();
  onCleanup.length = 0;
});

afterEach(() => {
  onCleanup.forEach((fn) => fn());
  vi.restoreAllMocks();
});

describe("VoiceChatButton", () => {
  it("stays disabled while the voice configuration is still loading", () => {
    useQueryMock.mockReturnValue(undefined);
    renderButton();

    expect(screen.getByLabelText("Start voice chat")).toBeDisabled();
  });

  it("opens a session once voice is available", () => {
    useQueryMock.mockReturnValue({ available: true });
    const onOpen = renderButton();

    const button = screen.getByLabelText("Start voice chat");
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // Voice chat needs an ElevenLabs agent configured on the Convex deployment.
  // Until that exists the control has to say why rather than look broken.
  it("explains itself instead of failing silently when voice is unconfigured", () => {
    useQueryMock.mockReturnValue({ available: false, reason: "Voice chat is not configured for this event." });
    const onOpen = renderButton();

    const button = screen.getByLabelText("Voice chat is not configured for this event.");
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("falls back to a disabled control when the status query itself fails", () => {
    // The dashboard must survive a missing or undeployed Convex voice backend.
    // React 18 re-dispatches a caught render error to window.onerror even after
    // the boundary recovers, and jsdom would report that as an unhandled
    // failure — swallow it so the assertion below is what decides this test.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", swallow);
    onCleanup.push(() => window.removeEventListener("error", swallow));
    useQueryMock.mockImplementation(() => { throw new Error("Could not reach Convex"); });
    const onOpen = renderButton();

    const button = screen.getByLabelText(/server configuration could not be checked/i);
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(onOpen).not.toHaveBeenCalled();
  });
});
