import { AlertTriangle, CalendarClock, Check, Circle, ClipboardCheck, ClipboardList, FileWarning, MailWarning, Send, ShieldCheck, UserRoundX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, cardSurfaceClasses } from "@/components/ui/card";
import type { ControlRoomCategoryKind, ControlRoomState } from "@/data/types";
import { cn } from "@/lib/utils";
import { useDemoSession } from "@/lib/hooks/use-demo-session";

const definitions: Array<{ kind: ControlRoomCategoryKind; label: string; icon: typeof ClipboardList }> = [
  { kind: "decisions", label: "Decisions waiting", icon: ClipboardList },
  { kind: "reviews", label: "Incomplete reviews", icon: ClipboardCheck },
  { kind: "acceptance_emails", label: "Unsent acceptance emails", icon: Send },
  { kind: "overdue_tasks", label: "Overdue speaker tasks", icon: CalendarClock },
  { kind: "missing_assets", label: "Missing headshots or slides", icon: UserRoundX },
  { kind: "unscheduled", label: "Unscheduled accepted sessions", icon: CalendarClock },
  { kind: "conflicts", label: "Room or speaker conflicts", icon: AlertTriangle },
  { kind: "publication_blockers", label: "Publication blockers", icon: FileWarning },
];

function LoadingControlRoom() {
  return <div className="grid gap-3 md:grid-cols-2" aria-label="Loading Program Control Room">
    {definitions.map(({ kind }) => <Card key={kind} variant="muted" className="h-32 animate-pulse" />)}
  </div>;
}

export function ProgramControlRoom({ state, loading, error }: { state?: ControlRoomState; loading: boolean; error?: string }) {
  const { isDemo } = useDemoSession();
  if (error) return <Card variant="muted" className="rounded-xl p-6" role="alert">
    <p className="text-sm font-semibold">The Program Control Room could not load.</p>
    <p className="mt-1 text-xs text-muted-foreground">{error}</p>
    <Button type="button" size="sm" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
  </Card>;
  if (loading || !state) return <LoadingControlRoom />;
  const completed = state.walkthrough.filter((step) => step.complete).length;
  const nextStep = state.walkthrough.find((step) => !step.complete);

  return <div className="space-y-4">
    {isDemo && <Card variant="muted" className="flex items-center gap-2 rounded-xl p-4 text-sm"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />You're viewing a read-only demo — actions are disabled.</Card>}
    <Card variant="muted" className="rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Five-minute walkthrough</p>
          <p className="mt-1 text-xs text-muted-foreground">Progress follows real event state, so each completed step is demonstrable.</p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">{completed} / {state.walkthrough.length}</p>
      </div>
      <ol className="mt-4 grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
        {state.walkthrough.map((step, index) => <li key={step.id}>
          <Link to={step.href} className={cn("flex min-h-12 items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors hover:bg-background", step === nextStep && "bg-background") } aria-label={`Step ${index + 1}: ${step.label}${step.complete ? ", complete" : ""}`}>
            {step.complete ? <Check className="h-4 w-4 shrink-0 text-success" /> : <Circle className={cn("h-4 w-4 shrink-0", step === nextStep ? "text-foreground" : "text-muted-foreground")} />}
            <span className={cn("font-medium", step.complete ? "text-muted-foreground line-through" : "text-foreground")}>{step.label}</span>
          </Link>
        </li>)}
      </ol>
    </Card>

    <div className="grid gap-3 md:grid-cols-2">
      {definitions.map(({ kind, label, icon: Icon }) => {
        const items = state.categories[kind];
        return <section key={kind} className={cardSurfaceClasses("default", "overflow-hidden")} aria-labelledby={`control-room-${kind}`}>
          <div className="flex items-center gap-2 px-4 py-3">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <h2 id={`control-room-${kind}`} className="min-w-0 flex-1 text-sm font-semibold">{label}</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums", items.length ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>{items.length}</span>
          </div>
          {items.length ? <ul className="max-h-64 overflow-y-auto">
            {items.map((item) => <li key={item.id}>
              <Link to={item.href} className="group flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted">
                {item.severity === "blocking" ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /> : <MailWarning className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                </span>
              </Link>
            </li>)}
          </ul> : <div className="flex min-h-16 items-center gap-2 px-4 text-xs text-muted-foreground"><Check className="h-4 w-4 text-success" /> All clear</div>}
        </section>;
      })}
    </div>
  </div>;
}
