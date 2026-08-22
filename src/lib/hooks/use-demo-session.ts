import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

type DemoRole = "organizer" | "reviewer" | "speaker";
type DemoSession = { isDemo: boolean; activeRole: DemoRole | null };

const emptySession: DemoSession = { isDemo: false, activeRole: null };

// The demo cookie is `__Host-` prefixed, which forces `Path=/` at the browser level, so it is
// technically readable on every route once a demo session has ever started in this browser —
// including a real, authenticated user's own real events. This must never disable real write
// controls or show real data as read-only. Match the workspace's own event slug (same approach
// as DemoWorkspaceBar, which had the identical bug — see 66c05f53 / #280) rather than trusting
// cookie presence alone: a real event's slug never equals a demo workspace's `demo-{id}` slug,
// so this can't false-positive on a real user's own event no matter how stale the cookie is.
function inThisDemo(pathname: string, eventSlug: string): boolean {
  return (
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    pathname.startsWith(`/events/${eventSlug}`)
  );
}

export function useDemoSession(): DemoSession {
  const location = useLocation();
  const [session, setSession] = useState<DemoSession>(emptySession);

  useEffect(() => {
    let active = true;
    void fetch("/api/demo/workspaces/current", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return emptySession;
        const payload = await response.json() as { workspace?: { activeRole?: DemoRole; eventSlug?: string } };
        const workspace = payload.workspace;
        if (!workspace?.activeRole || !workspace.eventSlug || !inThisDemo(location.pathname, workspace.eventSlug))
          return emptySession;
        return { isDemo: true, activeRole: workspace.activeRole };
      })
      .then((next) => { if (active) setSession(next); })
      .catch(() => { if (active) setSession(emptySession); });
    return () => { active = false; };
  }, [location.pathname]);

  return session;
}
