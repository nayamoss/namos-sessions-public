import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventId } from "@/data/types";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
  endSession: vi.fn(),
  setMuted: vi.fn(),
  callbacks: undefined as undefined | {
    onMessage: (message: { message: string; source: string }) => void;
  },
  conversation: {
    status: "connected",
    isSpeaking: false,
    isMuted: false,
  },
}));

vi.mock("convex/react", () => ({
  useAction: () => mocks.createSession,
}));

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: ReactNode }) => children,
  useConversation: (callbacks: typeof mocks.callbacks) => {
    mocks.callbacks = callbacks;
    return {
      ...mocks.conversation,
      startSession: mocks.startSession,
      endSession: mocks.endSession,
      setMuted: mocks.setMuted,
    };
  },
}));

const { VoiceSessionPanel } = await import("@/components/voice/VoiceSessionPanel");

beforeEach(() => {
  mocks.createSession.mockReset().mockResolvedValue({ signedUrl: "wss://voice.example.test", agentId: "agent-1" });
  mocks.startSession.mockReset().mockResolvedValue(undefined);
  mocks.endSession.mockReset();
  mocks.setMuted.mockReset();
  mocks.callbacks = undefined;
  mocks.conversation.status = "connected";
  mocks.conversation.isSpeaking = false;
  mocks.conversation.isMuted = false;
});

describe("VoiceSessionPanel", () => {
  it("uses the Imori-style orb as the default voice interface", async () => {
    render(<VoiceSessionPanel eventId={"event-1" as EventId} onClose={vi.fn()} />);

    const session = screen.getByLabelText("Voice chat session");
    const orb = session.querySelector(".namos-voice-orb");

    expect(orb).toBeInTheDocument();
    await waitFor(() => expect(orb).toHaveAttribute("data-state", "listening"));
    expect(screen.getByText(/Speak naturally/)).toBeVisible();
    expect(screen.queryByLabelText("Voice transcript")).not.toBeInTheDocument();
    expect(mocks.createSession).toHaveBeenCalledWith({ eventId: "event-1" });
    expect(mocks.startSession).toHaveBeenCalledWith({ signedUrl: "wss://voice.example.test" });
  });

  it("keeps mute, transcript, and close controls available around the orb", async () => {
    const onClose = vi.fn();
    render(<VoiceSessionPanel eventId={"event-1" as EventId} onClose={onClose} />);
    await waitFor(() => expect(mocks.callbacks).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(mocks.setMuted).toHaveBeenCalledWith(true);

    act(() => {
      mocks.callbacks?.onMessage({ message: "Review the outstanding submissions.", source: "ai" });
    });
    fireEvent.click(screen.getByRole("button", { name: /Show transcript/ }));
    expect(screen.getByLabelText("Voice transcript")).toHaveTextContent("Review the outstanding submissions.");

    fireEvent.click(screen.getByRole("button", { name: "Close voice chat" }));
    expect(mocks.endSession).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call the microphone API before the conversation connects", () => {
    mocks.conversation.status = "connecting";
    render(<VoiceSessionPanel eventId={"event-1" as EventId} onClose={vi.fn()} />);

    const mute = screen.getByRole("button", { name: "Mute" });
    expect(mute).toBeDisabled();
    fireEvent.click(mute);
    expect(mocks.setMuted).not.toHaveBeenCalled();
  });
});
