import { useEffect, useRef, useState } from "react";
import { loadTurnstile } from "@/lib/turnstile";

export function TurnstileWidget({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [status, setStatus] = useState("Loading submission verification…");
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    let active = true;
    if (!sitekey || !container.current) {
      setStatus("Submission verification is unavailable.");
      onToken(null);
      return;
    }
    loadTurnstile().then((turnstile) => {
      if (!active || !container.current) return;
      widgetId.current = turnstile.render(container.current, {
        sitekey,
        action: "cfp-submit",
        theme: "auto",
        callback: (token) => { if (active) { onToken(token); setStatus("Submission verification complete."); } },
        "expired-callback": () => { if (active) { onToken(null); setStatus("Submission verification expired. Please try again."); } },
        "error-callback": () => { if (active) { onToken(null); setStatus("Submission verification failed. Please try again."); } },
      });
    }).catch(() => {
      if (active) { onToken(null); setStatus("Submission verification is unavailable."); }
    });
    return () => {
      active = false;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [onToken, sitekey]);

  useEffect(() => {
    if (widgetId.current && window.turnstile) {
      onToken(null);
      setStatus("Complete submission verification.");
      window.turnstile.reset(widgetId.current);
    }
  }, [onToken, resetKey]);

  return <div className="space-y-2"><div ref={container} aria-label="Submission verification" /><p className="text-xs text-muted-foreground" aria-live="polite">{status}</p></div>;
}
