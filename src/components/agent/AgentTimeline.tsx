import { Bot, CircleAlert, Search, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { AgentRunEvent } from "@/data/types";
import { EmptyState } from "@/components/shared/EmptyState";

export function AgentTimeline({ events, isLoading }: { events: AgentRunEvent[]; isLoading: boolean }) {
  if (isLoading) return <div aria-label="Loading run timeline" className="space-y-3">{[1, 2, 3].map((row) => <div key={row} className={cardSurfaceClasses("default", "h-16 animate-pulse bg-muted")} />)}</div>;
  if (!events.length) return <EmptyState icon={Bot} title="Ask about this event" message="Check readiness, investigate blockers, or prepare follow-up tasks." />;
  return <ol className="space-y-3" aria-label="Agent run timeline">{events.map((event) => {
    const Icon = event.type === "error" ? CircleAlert : event.type.startsWith("tool") ? Wrench : event.type === "progress" ? Search : Bot;
    const surface = event.type === "user_message" || event.type === "assistant_message" || event.type === "clarification";
    return <li key={event.id} className={surface ? cardSurfaceClasses("default", "bg-muted/60 p-4") : "flex gap-3 text-sm"}><Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{event.type.replace(/_/g, " ")}{event.toolName ? ` · ${event.toolName.replace(/_/g, " ")}` : ""}{event.durationMs !== undefined ? ` · ${event.durationMs}ms` : ""}</p>{event.type === "assistant_message" ? <div className="prose prose-sm mt-1 max-w-none dark:prose-invert"><ReactMarkdown>{event.message}</ReactMarkdown></div> : <p className="mt-1 whitespace-pre-wrap text-sm">{event.message}</p>}</div></li>;
  })}</ol>;
}
import { cardSurfaceClasses } from "@/components/ui/card";
