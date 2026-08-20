import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { getAnalyticsConsent, setAnalyticsConsent, subscribeToAnalyticsConsent, track, trackPageView, updateReplay } from "@/lib/analytics";

const serverSnapshot = () => "unknown" as const;
const marketingSiteUrl = (import.meta.env.VITE_MARKETING_SITE_URL || "https://namos-sessions.xyz").replace(/\/$/, "");

export function AnalyticsRuntime() {
  const location = useLocation();
  const consent = useSyncExternalStore(subscribeToAnalyticsConsent, getAnalyticsConsent, serverSnapshot);
  useEffect(() => {
    if (consent !== "accepted" || location.pathname.startsWith("/embed/")) return;
    trackPageView(location.pathname);
    updateReplay(location.pathname);
  }, [consent, location.pathname]);
  return location.pathname.startsWith("/embed/") ? null : <AnalyticsConsentBanner />;
}

export function AnalyticsConsentBanner() {
  const consent = useSyncExternalStore(subscribeToAnalyticsConsent, getAnalyticsConsent, serverSnapshot);
  if (consent !== "unknown") return null;
  return (
    <section role="region" aria-label="Analytics preference" className={cardSurfaceClasses("default", "fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg p-3")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
          Optional analytics never capture form entries or workspace content.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => { setAnalyticsConsent("accepted"); track("analytics_consent_updated", { consented: true }); }}>Accept</Button>
          <Button variant="outline" size="sm" onClick={() => setAnalyticsConsent("rejected")}>Decline</Button>
          <a className="text-xs font-medium underline underline-offset-4" href={`${marketingSiteUrl}/privacy`} onClick={() => track("help_opened", { destination: "privacy" })}>Privacy</a>
        </div>
      </div>
    </section>
  );
}

export function AnalyticsPreferences() {
  const consent = useSyncExternalStore(subscribeToAnalyticsConsent, getAnalyticsConsent, serverSnapshot);
  const status = consent === "accepted" ? "enabled" : consent === "rejected" ? "disabled" : "not decided";
  return (
    <section aria-labelledby="analytics-preference-title" className={cardSurfaceClasses("default", "space-y-3 p-4")}>
      <div>
        <h3 id="analytics-preference-title" className="text-sm font-medium">Analytics</h3>
        <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">Optional product and website analytics are {status}.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={consent === "accepted" ? "outline" : "default"} disabled={consent === "accepted"} onClick={() => { setAnalyticsConsent("accepted"); track("analytics_consent_updated", { consented: true }); }}>Enable analytics</Button>
        <Button type="button" size="sm" variant="secondary" disabled={consent === "rejected"} onClick={() => { track("analytics_consent_updated", { consented: false }); setAnalyticsConsent("rejected"); }}>Disable analytics</Button>
        <a className="self-center text-sm font-medium underline underline-offset-4" href={`${marketingSiteUrl}/privacy`} onClick={() => track("help_opened", { destination: "privacy" })}>Privacy details</a>
      </div>
    </section>
  );
}
