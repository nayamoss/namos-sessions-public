import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Loader2, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { makeFunctionReference } from "convex/server";
import { useAction } from "convex/react";
import type { EventId } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const createSession = makeFunctionReference<"action", { eventId: string }, { signedUrl: string; agentId: string } | { unavailable: true; reason: string }>("voice:createSession");
type Turn = { role: "user" | "assistant"; content: string };

function SessionContents({ eventId, onClose }: { eventId: EventId; onClose: () => void }) {
  const startSession = useAction(createSession);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
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
      conversation.startSession({ signedUrl: result.signedUrl });
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
  const close = () => { conversation.endSession(); onClose(); };
  const status = error ? "Connection issue" : starting || conversation.status === "connecting" ? "Connecting…" : conversation.isSpeaking ? "Operations Agent is speaking" : "Listening";
  return (
    <Card className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl" aria-label="Voice chat session">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full bg-primary", (starting || conversation.isSpeaking) && "animate-pulse")} /><div><p className="text-sm font-medium">Voice chat</p><p className="text-xs text-muted-foreground">{status}</p></div></div>
        <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close voice chat" className="compact-hit-target h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"><PhoneOff className="h-4 w-4" /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : turns.length ? turns.map((turn, index) => <div key={`${turn.role}-${index}`} className={cn("rounded-lg px-3 py-2 text-sm", turn.role === "user" ? "ml-6 bg-muted" : "mr-6 bg-primary/10")}><p className="mb-0.5 text-[10px] font-medium uppercase text-muted-foreground">{turn.role === "user" ? "You" : "Operations Agent"}</p>{turn.content}</div>) : <p className="text-sm text-muted-foreground">Start speaking when connected. Your live conversation will appear here.</p>}
      </div>
      <div className="flex items-center justify-between px-4 pb-3 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => conversation.setMuted(!conversation.isMuted)} disabled={Boolean(error)} className="gap-2 rounded-lg px-2.5 text-xs font-medium disabled:opacity-40">{conversation.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{conversation.isMuted ? "Unmute" : "Mute"}</Button>
        {starting ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-muted-foreground" />}
      </div>
    </Card>
  );
}

export function VoiceSessionPanel({ eventId, onClose }: { eventId: EventId; onClose: () => void }) {
  return <ConversationProvider><SessionContents eventId={eventId} onClose={onClose} /></ConversationProvider>;
}
