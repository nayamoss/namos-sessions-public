import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Inbox, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/clerk-react";
import { consumeDemoTicket } from "@/lib/demo-ticket";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type DemoRole = "organizer" | "reviewer" | "speaker";
type WorkspaceState = {
  workspace: { activeRole: DemoRole; expiresAt: number };
  csrf: string;
};

const roles: DemoRole[] = ["organizer", "reviewer", "speaker"];

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "This demo workspace has expired."
        : "The demo workspace could not be updated.",
    );
  return response.json() as Promise<WorkspaceState & { signInUrl?: string }>;
}

export function DemoWorkspaceBar() {
  const { signOut } = useClerk();
  const location = useLocation();
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void request("/api/demo/workspaces/current")
      .then(setState)
      .catch(() => setState(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [location.pathname, refresh]);

  useEffect(() => {
    if (!state || location.pathname === "/demo") return;
    document.body.classList.add("demo-workspace-active");
    return () => document.body.classList.remove("demo-workspace-active");
  }, [location.pathname, state]);

  const expires = useMemo(
    () =>
      state
        ? new Date(state.workspace.expiresAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : "",
    [state],
  );
  if (!state || location.pathname === "/demo") return null;

  const mutate = async (path: string, body?: object) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await request(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-demo-csrf": state.csrf,
        },
        body: JSON.stringify(body ?? {}),
      });
      if (result.signInUrl) await consumeDemoTicket(signOut, result.signInUrl);
      else refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "The demo workspace could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label="Demo workspace toolbar"
      className={cardSurfaceClasses(
        "default",
        "fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl bg-background/95 p-3 shadow-lg backdrop-blur sm:inset-x-6",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Demo workspace
          </p>
          <p className="text-xs text-muted-foreground">
            Active until {expires}
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1 rounded-md bg-muted p-1"
          aria-label="Switch demo role"
        >
          {roles.map((role) => (
            <Button
              key={role}
              type="button"
              size="sm"
              variant={
                state.workspace.activeRole === role ? "default" : "ghost"
              }
              disabled={busy}
              aria-pressed={state.workspace.activeRole === role}
              onClick={() =>
                void mutate("/api/demo/workspaces/current/role", { role })
              }
            >
              {role[0].toUpperCase() + role.slice(1)}
            </Button>
          ))}
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/demo/inbox">
            <Inbox aria-hidden="true" />
            Demo inbox
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={busy}>
              <RotateCcw aria-hidden="true" />
              Reset
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset this demo event?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes all walkthrough progress and restores the original
                seeded submissions, tasks, conflicts, and drafts. Other demo
                visitors are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep progress</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                onClick={() =>
                  void mutate("/api/demo/workspaces/current/reset")
                }
              >
                Reset event
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Link
          to="/demo/proof"
          className="ml-auto text-xs font-medium text-primary hover:underline"
        >
          Proof
        </Link>
      </div>
      {message && (
        <p
          role="alert"
          className={cn(
            "mt-2 text-xs",
            message.includes("expired")
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {message}
        </p>
      )}
    </aside>
  );
}
