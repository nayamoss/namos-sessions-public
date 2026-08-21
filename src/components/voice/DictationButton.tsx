import { AudioLines, Loader2 } from "lucide-react";
import type { EventId } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDictation } from "@/lib/voice/use-dictation";
import { cn } from "@/lib/utils";

// Speak-to-type: transcribes into the composer's own text, distinct from VoiceChatButton
// (which opens a full spoken conversation with the agent). Same icon-button footprint so
// the two sit naturally side by side in the composer.
export function DictationButton({ eventId, disabled, onTranscript }: { eventId: EventId; disabled?: boolean; onTranscript: (text: string) => void }) {
  const dictation = useDictation({ eventId, onTranscript });
  if (!dictation.isSupported) return null;
  const label = dictation.isRecording ? "Stop dictation" : dictation.isProcessing ? "Transcribing…" : "Dictate into composer";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => (dictation.isRecording ? void dictation.stop() : void dictation.start())}
          disabled={disabled || dictation.isProcessing}
          aria-label={label}
          aria-pressed={dictation.isRecording}
          className={cn(
            "compact-hit-target h-8 w-8 rounded-lg",
            dictation.isRecording ? "bg-destructive/15 text-destructive hover:bg-destructive/25" : "text-accent-foreground bg-accent/40 hover:bg-accent/70",
            "disabled:cursor-not-allowed disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-40",
          )}
        >
          {dictation.isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent><p className="max-w-64 text-xs">{dictation.error ?? label}</p></TooltipContent>
    </Tooltip>
  );
}
