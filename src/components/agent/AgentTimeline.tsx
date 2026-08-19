import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Search,
  Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { AgentRunEvent } from "@/data/types";
import { EmptyState } from "@/components/shared/EmptyState";
import { cardSurfaceClasses } from "@/components/ui/card";

function ActivityItem({ event }: { event: AgentRunEvent }) {
  const Icon =
    event.type === "error"
      ? CircleAlert
      : event.type.startsWith("tool")
        ? Wrench
        : event.type === "progress"
          ? Search
          : Bot;
  return (
    <li className="flex gap-3 py-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          {event.type.replace(/_/g, " ")}
          {event.toolName ? ` · ${event.toolName.replace(/_/g, " ")}` : ""}
          {event.durationMs !== undefined ? ` · ${event.durationMs}ms` : ""}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/80">
          {event.message}
        </p>
      </div>
    </li>
  );
}

export function AgentTimeline({
  events,
  isLoading,
  presentation = "conversation",
}: {
  events: AgentRunEvent[];
  isLoading: boolean;
  presentation?: "conversation" | "run";
}) {
  if (isLoading)
    return (
      <div aria-label="Loading run timeline" className="space-y-3">
        {[1, 2, 3].map((row) => (
          <div
            key={row}
            className={cardSurfaceClasses(
              "default",
              "h-16 animate-pulse bg-muted",
            )}
          />
        ))}
      </div>
    );
  if (!events.length)
    return (
      <EmptyState
        icon={Bot}
        title="Ask about this event"
        message="Check readiness, investigate blockers, or prepare follow-up tasks."
      />
    );
  if (presentation === "run") {
    const request = events.find((event) => event.type === "user_message");
    const response = [...events]
      .reverse()
      .find((event) => event.type === "assistant_message");
    const activity = events.filter(
      (event) =>
        event.type !== "user_message" && event.type !== "assistant_message",
    );
    const completedTools = activity.filter(
      (event) => event.type === "tool_result",
    ).length;
    const activeTools = activity.filter(
      (event) => event.type === "tool_call",
    ).length;
    return (
      <div className="space-y-5" aria-label="Agent run">
        {request && (
          <section className="max-w-3xl">
            <p className="text-sm font-medium text-muted-foreground">
              Your request
            </p>
            <p className="mt-1 text-base font-medium leading-6 text-foreground">
              {request.message}
            </p>
          </section>
        )}
        {response ? (
          <section
            className={cardSurfaceClasses("default", "max-w-4xl p-5 sm:p-6")}
            aria-label="Agent answer"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              Readiness review
            </div>
            <div className="prose prose-sm mt-4 max-w-none text-foreground dark:prose-invert sm:prose-base">
              <ReactMarkdown>{response.message}</ReactMarkdown>
            </div>
          </section>
        ) : (
          <section
            className={cardSurfaceClasses("muted", "max-w-3xl p-5")}
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Search className="h-4 w-4 text-muted-foreground" />
              Review in progress
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              The agent is checking this event’s program data. Results will
              appear here when the review is ready.
            </p>
          </section>
        )}
        {activity.length > 0 && (
          <details className={cardSurfaceClasses("muted", "group max-w-4xl")}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium marker:content-none">
              <span>
                {response
                  ? `Review activity · ${completedTools} checks completed`
                  : `Review activity · ${activeTools || completedTools} checks underway`}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <ol
              className="divide-y divide-black/5 px-4 pb-3 dark:divide-white/10"
              aria-label="Detailed review activity"
            >
              {activity.map((event) => (
                <ActivityItem key={event.id} event={event} />
              ))}
            </ol>
          </details>
        )}
      </div>
    );
  }
  return (
    <ol className="space-y-3" aria-label="Agent run timeline">
      {events.map((event) => {
        const Icon =
          event.type === "error"
            ? CircleAlert
            : event.type.startsWith("tool")
              ? Wrench
              : event.type === "progress"
                ? Search
                : Bot;
        const surface =
          event.type === "user_message" ||
          event.type === "assistant_message" ||
          event.type === "clarification";
        return (
          <li
            key={event.id}
            className={
              surface
                ? cardSurfaceClasses("default", "bg-muted/60 p-4")
                : "flex gap-3 text-sm"
            }
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {event.type.replace(/_/g, " ")}
                {event.toolName
                  ? ` · ${event.toolName.replace(/_/g, " ")}`
                  : ""}
                {event.durationMs !== undefined
                  ? ` · ${event.durationMs}ms`
                  : ""}
              </p>
              {event.type === "assistant_message" ? (
                <div className="prose prose-sm mt-1 max-w-none dark:prose-invert">
                  <ReactMarkdown>{event.message}</ReactMarkdown>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {event.message}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
