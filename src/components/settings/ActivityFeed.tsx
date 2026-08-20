import { useMemo, useState } from "react";
import { Bell, Bot, Calendar, KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cardSurfaceClasses } from "@/components/ui/card";
import type { ActivityCategory, ActivityEntry } from "@/data/types";

type CategoryFilter = "all" | ActivityCategory;

const labels: Record<ActivityCategory, string> = {
  agenda: "Agenda",
  api: "API",
  agent: "Agent",
  comms: "Comms",
  notification: "Notifications",
};
const filters: Array<{ id: CategoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "agenda", label: labels.agenda },
  { id: "comms", label: labels.comms },
  { id: "agent", label: labels.agent },
  { id: "notification", label: labels.notification },
  { id: "api", label: labels.api },
];

const formatTime = (value: number) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDateHeader = (value: number) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function categoryIcon(category: ActivityCategory) {
  if (category === "agenda") return <Calendar className="h-3.5 w-3.5" />;
  if (category === "comms") return <Mail className="h-3.5 w-3.5" />;
  if (category === "agent") return <Bot className="h-3.5 w-3.5" />;
  if (category === "api") return <KeyRound className="h-3.5 w-3.5" />;
  return <Bell className="h-3.5 w-3.5" />;
}

function statusClass(status?: ActivityEntry["status"]) {
  if (status === "success") return "text-success";
  if (status === "error") return "text-destructive";
  if (status === "warning") return "text-amber-600";
  return "text-muted-foreground";
}

export function ActivityFeed({ entries, loading = false }: { entries: ActivityEntry[]; loading?: boolean }) {
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const counts = useMemo(
    () =>
      entries.reduce<Record<CategoryFilter, number>>(
        (next, entry) => ({ ...next, all: next.all + 1, [entry.category]: next[entry.category] + 1 }),
        { all: 0, agenda: 0, api: 0, agent: 0, comms: 0, notification: 0 },
      ),
    [entries],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    entries
      .filter((entry) => activeFilter === "all" || entry.category === activeFilter)
      .forEach((entry) => {
        const date = formatDateHeader(entry.createdAt);
        map.set(date, [...(map.get(date) ?? []), entry]);
      });
    return [...map.entries()]
      .map(([date, items]) => ({ date, items: items.sort((a, b) => b.createdAt - a.createdAt) }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeFilter, entries]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" aria-label="Activity filters">
        {filters.map((filter) => (
          <Button
            key={filter.id}
            type="button"
            variant={activeFilter === filter.id ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setActiveFilter(filter.id)}
          >
            {filter.label}
            <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] leading-none dark:bg-white/10">{counts[filter.id]}</span>
          </Button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      ) : grouped.length === 0 ? (
        <EmptyState compact icon={Bell} title={entries.length ? "No activity matches this filter" : "No activity yet"} />
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <section key={group.date} className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">{group.date}</h3>
              <div className="space-y-2">
                {group.items.map((entry) => (
                  <article key={entry.id} className={cardSurfaceClasses("muted", "p-3")}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 shrink-0 ${statusClass(entry.status)}`}>{categoryIcon(entry.category)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{entry.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {labels[entry.category]}
                          {entry.actorLabel ? ` · ${entry.actorLabel}` : ""}
                        </p>
                        {entry.detail && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{entry.detail}</p>}
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground">{formatTime(entry.createdAt)}</time>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
