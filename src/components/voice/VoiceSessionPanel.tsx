import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { ChevronDown, Mic, MicOff, PhoneOff } from "lucide-react";
import { makeFunctionReference } from "convex/server";
import { useAction } from "convex/react";
import type { EventId } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { VoiceOrb, type VoiceOrbState } from "@/components/voice/VoiceOrb";

const createSession = makeFunctionReference<"action", { eventId: string }, { signedUrl: string; agentId: string } | { unavailable: true; reason: string }>("voice:createSession");
type Turn = { role: "user" | "assistant"; content: string };

function SessionContents({ eventId, onClose }: { eventId: EventId; onClose: () => void }) {
  const startSession = useAction(createSession);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const startedRef = useRef(false);
  const conversation = useConversation({
    onMessage: ({ message, source }) => setTurns((current) => [...current, { role: source === "user" ? "user" : "assistant", content: message }]),
    onError: (message) => setError(typeof message === "string" ? message : "Connection lost — try again."),
    onDisconnect: () => setStarting(false),
  });
  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await startSession({ eventId });
      if ("unavailable" in result) {
        setError(result.reason);
        return;
      }
      await conversation.startSession({ signedUrl: result.signedUrl });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection lost — try again.");
    } finally {
      setStarting(false);
    }
  }, [conversation, eventId, startSession]);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
    return () => conversation.endSession();
  }, [conversation, start]);
  const close = () => {
    conversation.endSession();
    onClose();
  };
  const status = error
    ? "Connection issue"
    : starting || conversation.status === "connecting"
      ? "Connecting…"
      : conversation.isSpeaking
        ? "Operations Agent is speaking"
        : conversation.isMuted
          ? "Microphone muted"
          : "Listening";
  const orbState: VoiceOrbState = error
    ? "idle"
    : starting || conversation.status === "connecting"
      ? "connecting"
      : conversation.isSpeaking
        ? "talking"
        : conversation.isMuted
          ? "idle"
          : "listening";
  const microphoneUnavailable = Boolean(error) || starting || conversation.status !== "connected";

  return (
    <Card
      className="flex h-full min-h-[22rem] w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-xl"
      aria-label="Voice chat session"
    >
      <div className="flex items-start justify-between px-4 pb-2 pt-4">
        <div>
          <p className="text-sm font-medium">Voice agent</p>
          <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
            {status}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Close voice chat"
          className="compact-hit-target h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4 py-4">
        <VoiceOrb
          state={orbState}
          className={cn("transition-[width] duration-200", showTranscript ? "w-24" : "w-44")}
        />
        {error ? (
          <div className="max-w-64 space-y-2 text-center">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void start()}>
              Try again
            </Button>
          </div>
        ) : !showTranscript ? (
          <p className="max-w-56 text-center text-xs text-muted-foreground">
            Speak naturally. The orb moves faster while the agent responds.
          </p>
        ) : (
          <div className="max-h-48 w-full space-y-2 overflow-y-auto" aria-label="Voice transcript">
            {turns.length ? turns.map((turn, index) => (
              <div
                key={`${turn.role}-${index}`}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  turn.role === "user" ? "ml-6 bg-muted" : "mr-6 bg-primary/10",
                )}
              >
                <p className="mb-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {turn.role === "user" ? "You" : "Operations Agent"}
                </p>
                {turn.content}
              </div>
            )) : (
              <p className="text-center text-xs text-muted-foreground">No transcript yet.</p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 pb-4 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => conversation.setMuted(!conversation.isMuted)}
          disabled={microphoneUnavailable}
          className="gap-2 rounded-lg px-2.5 text-xs font-medium disabled:opacity-40"
        >
          {conversation.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {conversation.isMuted ? "Unmute" : "Mute"}
        </Button>
        {turns.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-lg px-2.5 text-xs font-medium"
            aria-expanded={showTranscript}
            onClick={() => setShowTranscript((shown) => !shown)}
          >
            {showTranscript ? "Hide transcript" : "Show transcript"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showTranscript && "rotate-180")} />
          </Button>
        )}
      </div>
    </Card>
  );
}

export function VoiceSessionPanel({ eventId, onClose }: { eventId: EventId; onClose: () => void }) {
  return <ConversationProvider><SessionContents eventId={eventId} onClose={onClose} /></ConversationProvider>;
}
