import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarCheck, ClipboardCheck, Mic2, RotateCcw, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { cardSurfaceClasses } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { consumeDemoTicket } from "@/lib/demo-ticket";

type DemoRole = "organizer" | "reviewer" | "speaker";
type DemoWorkspace = { workspaceId: string; eventId: string; activeRole: DemoRole; expiresAt: number; absoluteExpiresAt: number };
type DemoResponse = { workspace: DemoWorkspace; csrf?: string; signInUrl?: string };

const roles = [
  { role: "organizer" as const, label: "Organizer", description: "Run the Control Room, decide sessions, resolve conflicts, and publish.", icon: CalendarCheck },
  { role: "reviewer" as const, label: "Reviewer", description: "Open the assigned proposal and complete the seeded scorecard.", icon: ClipboardCheck },
  { role: "speaker" as const, label: "Speaker", description: "Complete a portal task, upload a file, and read event resources.", icon: Mic2 },
];

const proofDestinations: Record<string, { role: DemoRole; label: string }> = {
  "control-room": { role: "organizer", label: "Program Control Room" },
  walkthrough: { role: "organizer", label: "five-minute walkthrough" },
  "operations-agent": { role: "organizer", label: "Operations Agent" },
  resources: { role: "speaker", label: "Resources/Wiki" },
  inbox: { role: "organizer", label: "demo inbox" },
  publication: { role: "organizer", label: "publication workflow" },
  reset: { role: "organizer", label: "resettable workspace" },
};

async function readJson(response: Response): Promise<DemoResponse> {
  const payload = await response.json().catch(() => ({})) as DemoResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error === "rate_limited" ? "Demo capacity is busy. Please try again shortly." : "The live demo is temporarily unavailable.");
  return payload;
}

export default function DemoLandingPage() {
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedProof = searchParams.get("proof") ?? "";
  const autoLaunch = searchParams.get("autolaunch") === "organizer";
  const autoLaunchStarted = useRef(false);
  const destination = proofDestinations[requestedProof];
  const [workspace, setWorkspace] = useState<DemoWorkspace | null>(null);
  const [csrf, setCsrf] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busyRole, setBusyRole] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/demo/workspaces/current", { credentials: "same-origin" }).then(async (response) => {
      if (!active || response.status === 401 || response.status === 404) return;
      const payload = await readJson(response);
      if (active) { setWorkspace(payload.workspace); setCsrf(payload.csrf ?? null); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!autoLaunch || !workspace || !csrf || autoLaunchStarted.current) return;
    autoLaunchStarted.current = true;
    setBusyRole("organizer");
    void (async () => readJson(await fetch("/api/demo/workspaces/current/role", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", "x-demo-csrf": csrf },
      body: JSON.stringify({ role: "organizer", entry: "schedule-studio" }),
    })))().then(async (payload) => {
      if (!payload.signInUrl) throw new Error("The demo sign-in ticket could not be created.");
      await consumeDemoTicket(signOut, payload.signInUrl, isSignedIn === true);
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : "The live demo is temporarily unavailable.");
      setBusyRole(null);
    });
  }, [autoLaunch, csrf, isSignedIn, signOut, workspace]);

  const enter = useCallback(async (role: DemoRole) => {
    setBusyRole(role);
    setError(null);
    try {
      let payload: DemoResponse;
      if (!workspace) {
        if (!turnstileToken) throw new Error("Complete the verification before starting the demo.");
        payload = await readJson(await fetch("/api/demo/workspaces", {
          method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ turnstileToken, proof: requestedProof || undefined }),
        }));
        setWorkspace(payload.workspace);
        setCsrf(payload.csrf ?? null);
        if (role !== "organizer") {
          payload = await readJson(await fetch("/api/demo/workspaces/current/role", {
            method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-demo-csrf": payload.csrf ?? "" }, body: JSON.stringify({ role, proof: requestedProof || undefined }),
          }));
        }
      } else {
        payload = await readJson(await fetch("/api/demo/workspaces/current/role", {
          method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-demo-csrf": csrf ?? "" }, body: JSON.stringify({ role, proof: requestedProof || undefined }),
        }));
      }
      if (!payload.signInUrl) throw new Error("The demo sign-in ticket could not be created.");
      await consumeDemoTicket(signOut, payload.signInUrl, isSignedIn === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The live demo is temporarily unavailable.");
      setResetKey((value) => value + 1);
      setTurnstileToken(null);
    } finally {
      setBusyRole(null);
    }
  }, [csrf, isSignedIn, requestedProof, signOut, turnstileToken, workspace]);

  const expiry = useMemo(() => workspace ? new Date(workspace.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null, [workspace]);

  return (
    <PublicLayout width="wide">
      <header className="py-2">
        <a href="/" className="text-sm font-semibold">Namos Sessions</a>
      </header>
      <section className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] lg:items-start lg:py-14">
        <div>
          <p className="text-sm font-semibold text-primary">Resettable seeded event · no account setup</p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl tracking-[-0.04em] text-balance sm:text-6xl">See the whole conference workflow in five minutes.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Enter as an organizer, reviewer, or speaker. Every role uses the same isolated event, so decisions, reviews, tasks, scheduling, and publication stay connected.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Demo highlights">
            {["Real seeded event state", "Confirmation before agent writes", "No external demo email"].map((item) => <div key={item} className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />{item}</div>)}
          </div>
        </div>
        <aside className={cardSurfaceClasses("muted", "p-5 sm:p-6")} aria-label="Five-minute route">
          <h2 className="text-lg font-semibold">What you’ll demonstrate</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li>1. Submit and review a conditional CFP.</li><li>2. Accept without accidental notification.</li><li>3. Complete speaker work and upload a file.</li><li>4. Schedule, detect, and resolve a conflict.</li><li>5. Send the reviewed acceptance, then publish.</li>
          </ol>
        </aside>
      </section>

      {autoLaunch && <section className={cardSurfaceClasses("muted", "my-8 p-6")} role="status"><h1 className="text-xl font-semibold">Opening your seeded Schedule Studio…</h1><p className="mt-2 text-sm text-muted-foreground">This takes a moment. No login or signup is required.</p></section>}

      {!autoLaunch && <section id="roles" aria-labelledby="roles-title" className="scroll-mt-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="roles-title" className="text-2xl font-semibold">Choose a role</h2><p className="mt-2 text-sm text-muted-foreground">Role switching remains available inside the demo.</p></div>
          {workspace && <p className="text-xs text-muted-foreground">Workspace ready · active until {expiry}</p>}
        </div>
        {destination && <div className={cardSurfaceClasses("muted", "mt-5 flex items-center gap-3 p-4 text-sm")}><ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" /><p>Proof route selected: enter as <strong>{destination.role}</strong> to inspect the {destination.label}.</p></div>}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {roles.map(({ role, label, description, icon: Icon }) => (
            <article key={role} className={cardSurfaceClasses("default", "flex flex-col p-5")}>
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" /><h3 className="mt-5 text-lg font-semibold">{label}</h3><p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
              <Button className="mt-5 w-full" disabled={busyRole !== null || (!workspace && !turnstileToken)} onClick={() => void enter(role)}>{busyRole === role ? "Preparing demo…" : `Enter as ${label}`}</Button>
            </article>
          ))}
        </div>
        {!workspace && <div className={cardSurfaceClasses("muted", "mt-5 p-4")}><TurnstileWidget action="demo-create" label="Demo access verification" onToken={setTurnstileToken} resetKey={resetKey} /></div>}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </section>}

      <section className={cardSurfaceClasses("muted", "my-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between")}>
        <div className="flex items-start gap-3"><RotateCcw className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Safe to explore</h2><p className="mt-1 text-sm text-muted-foreground">Your event is isolated, expires automatically, and can be reset from the demo bar.</p></div></div>
        <Link to="/demo/proof" className="shrink-0 text-sm font-semibold text-primary hover:underline">Inspect every proof route →</Link>
      </section>
    </PublicLayout>
  );
}
