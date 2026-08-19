import { useEffect, useRef, useState } from "react";
import { loadTurnstile } from "@/lib/turnstile";

export function TurnstileWidget({ onToken, resetKey, action = "cfp-submit", label = "Submission verification" }: { onToken: (token: string | null) => void; resetKey: number; action?: string; label?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [status, setStatus] = useState("Loading verification…");
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    let active = true;
    if (!sitekey || !container.current) {
      setStatus("Verification is unavailable.");
      onToken(null);
      return;
    }
    loadTurnstile().then((turnstile) => {
      if (!active || !container.current) return;
      widgetId.current = turnstile.render(container.current, {
        sitekey,
        action,
        theme: "auto",
        callback: (token) => { if (active) { onToken(token); setStatus("Verification complete."); } },
        "expired-callback": () => { if (active) { onToken(null); setStatus("Verification expired. Please try again."); } },
        "error-callback": () => { if (active) { onToken(null); setStatus("Verification failed. Please try again."); } },
      });
    }).catch(() => {
      if (active) { onToken(null); setStatus("Verification is unavailable."); }
    });
    return () => {
      active = false;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action, label, onToken, sitekey]);

  useEffect(() => {
    if (widgetId.current && window.turnstile) {
      onToken(null);
      setStatus("Complete verification.");
      window.turnstile.reset(widgetId.current);
    }
  }, [onToken, resetKey]);

  return <div className="space-y-2"><div ref={container} aria-label={label} /><p className="text-xs text-muted-foreground" aria-live="polite">{status}</p></div>;
}
