import { useEffect, useState } from "react";
import { AudioLines, Loader2 } from "lucide-react";
// Every other reactive read in this app goes through the cache-wrapped useQuery from
// convex-helpers, because the app is wrapped in ConvexQueryCacheProvider (see
// src/data/client-providers.tsx). Importing useQuery from the raw "convex/react" package
// instead bypassed that provider's subscription plumbing. That import is fixed, but this
// specific subscription has still been observed to hang indefinitely in production even
// after the fix (voiceStatus:status called directly with a real session token returns
// {available:true} instantly — the backend is fine, something about this one reactive
// subscription itself doesn't reliably resolve). Root cause not fully isolated yet. Until
// it is, a stuck query must not leave the button permanently unusable: see STATUS_TIMEOUT_MS.
import { useQuery } from "convex-helpers/react/cache";
import { makeFunctionReference } from "convex/server";
import type { EventId } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";

const status = makeFunctionReference<"query", { eventId: string }, { available: boolean; reason?: string }>("voiceStatus:status");

// If the status check hasn't resolved by this point, stop blocking the button on it.
// Clicking through opens the panel, which makes its own real request to start a
// session — that request surfaces the actual "not configured" error if there truly is
// one. A wedged status check must never be the reason nobody can ever click this button.
const STATUS_TIMEOUT_MS = 2500;

type VoiceChatButtonProps = { eventId: EventId; disabled?: boolean; onOpen: () => void };

function UnavailableVoiceChatButton() {
  const label = "Voice chat is unavailable because its server configuration could not be checked. Ask an administrator to configure and deploy the voice service.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled
          aria-label={label}
          className="compact-hit-target h-8 w-8 rounded-lg text-muted-foreground opacity-40"
        >
          <AudioLines className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent><p className="max-w-64 text-xs">{label}</p></TooltipContent>
    </Tooltip>
  );
}

function VoiceChatButtonContent({ eventId, disabled, onOpen }: VoiceChatButtonProps) {
  const config = useQuery(status, { eventId });
  const [statusTimedOut, setStatusTimedOut] = useState(false);
  useEffect(() => {
    if (config !== undefined) return;
    const timer = window.setTimeout(() => setStatusTimedOut(true), STATUS_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [config]);

  const stillChecking = config === undefined && !statusTimedOut;
  const unavailable = config !== undefined && !config.available;
  const label = unavailable ? config.reason ?? "Voice chat is unavailable." : "Start voice chat";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onOpen}
          disabled={disabled || stillChecking || unavailable}
          aria-label={label}
          className={cn("compact-hit-target h-8 w-8 rounded-lg text-muted-foreground", "hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40")}
        >
          {stillChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent><p className="max-w-64 text-xs">{label}</p></TooltipContent>
    </Tooltip>
  );
}

// A missing or temporarily unavailable Convex voice deployment must not take
// down the dashboard. The fallback remains disabled and explains the state.
export function VoiceChatButton(props: VoiceChatButtonProps) {
  return <ErrorBoundary fallback={<UnavailableVoiceChatButton />}><VoiceChatButtonContent {...props} /></ErrorBoundary>;
}
