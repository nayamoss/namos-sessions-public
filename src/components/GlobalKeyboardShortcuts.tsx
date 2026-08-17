import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GO_TO_SEQUENCES,
  SHORTCUT_HELP,
  SHORTCUTS,
  VOICE_TOGGLE_EVENT,
  isKeyboardShortcutBlocked,
  matchesPrimaryShortcut,
  matchesShortcut,
} from "@/lib/shortcuts";
import { useOptionalCurrentEvent } from "@/components/EventContext";

const keyClassName = "min-w-5 rounded bg-muted px-1.5 py-0.5 text-center font-mono text-[10px] text-muted-foreground";

export function GlobalKeyboardShortcuts({
  onOpenCommandPalette,
}: {
  onOpenCommandPalette: () => void;
}) {
  const navigate = useNavigate();
  const eventSlug = useOptionalCurrentEvent()?.event.slug;
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingGoTo = useRef(false);
  const pendingTimer = useRef<number | null>(null);

  // Alt+V gets its own capture-phase listener on `window`, exactly matching
  // Imori's imori:toggle-voice pattern (app/dashboard/layout-client.tsx),
  // rather than living inside the shared bubble-phase `document` handler
  // below. The shared handler only sees a keydown if nothing between the
  // focused element and `document` calls stopPropagation() on it first —
  // several things in this app do (popovers, cmdk, rich-text editors), which
  // is exactly why the first version of this shortcut silently never fired
  // for a real user despite passing every test that dispatched the toggle
  // event directly instead of a real keypress. Capture-phase on `window`
  // runs before any of that, same as Imori's own binding.
  useEffect(() => {
    const handleVoiceKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (matchesShortcut(event, SHORTCUTS.voice) && !isTypingTarget) {
        event.preventDefault();
        window.dispatchEvent(new Event(VOICE_TOGGLE_EVENT));
      }
    };
    window.addEventListener("keydown", handleVoiceKeyDown, true);
    return () => window.removeEventListener("keydown", handleVoiceKeyDown, true);
  }, []);

  useEffect(() => {
    const clearPendingGoTo = () => {
      pendingGoTo.current = false;
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isKeyboardShortcutBlocked(document)) {
        clearPendingGoTo();
        return;
      }

      if (event.repeat) return;

      if (matchesPrimaryShortcut(event, SHORTCUTS.palette)) {
        event.preventDefault();
        clearPendingGoTo();
        onOpenCommandPalette();
        return;
      }

      if (matchesShortcut(event, SHORTCUTS.help)) {
        event.preventDefault();
        clearPendingGoTo();
        setHelpOpen(true);
        return;
      }

      if (pendingGoTo.current) {
        const hasModifier = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
        const destination = hasModifier
          ? undefined
          : GO_TO_SEQUENCES.find((item) => item.code === event.code);
        clearPendingGoTo();
        if (destination) {
          event.preventDefault();
          navigate(eventSlug ? `/events/${eventSlug}${destination.to}` : "/events");
        }
        return;
      }

      if (
        event.code === "KeyG"
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !event.shiftKey
      ) {
        pendingGoTo.current = true;
        pendingTimer.current = window.setTimeout(clearPendingGoTo, 1000);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearPendingGoTo();
    };
  }, [eventSlug, navigate, onOpenCommandPalette]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-[30rem] rounded-[12px] border-0 bg-card p-6 shadow-none">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press ? any time to bring this back.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {SHORTCUT_HELP.map((group) => (
            <section key={group.group} aria-labelledby={`shortcut-group-${group.group.toLowerCase().replaceAll(" ", "-")}`}>
              <h2
                id={`shortcut-group-${group.group.toLowerCase().replaceAll(" ", "-")}`}
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {group.group}
              </h2>
              <div className="mt-1">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4 py-1.5">
                    <span className="text-sm">{item.label}</span>
                    <span className="flex items-center gap-1">
                      {item.keys.map((key, index) => (
                        <kbd key={`${key}-${index}`} className={keyClassName}>{key}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
