import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

type DemoRole = "organizer" | "reviewer" | "speaker";
type DemoSession = { isDemo: boolean; activeRole: DemoRole | null };

const emptySession: DemoSession = { isDemo: false, activeRole: null };

export function useDemoSession(): DemoSession {
  const location = useLocation();
  const [session, setSession] = useState<DemoSession>(emptySession);

  useEffect(() => {
    let active = true;
    void fetch("/api/demo/workspaces/current", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return emptySession;
        const payload = await response.json() as { workspace?: { activeRole?: DemoRole } };
        return payload.workspace?.activeRole ? { isDemo: true, activeRole: payload.workspace.activeRole } : emptySession;
      })
      .then((next) => { if (active) setSession(next); })
      .catch(() => { if (active) setSession(emptySession); });
    return () => { active = false; };
  }, [location.pathname]);

  return session;
}
