import { useMemo, useState } from "react";
import { Calendar, CheckCircle2, Clipboard, FileText, Mail, Paperclip, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";

type TimelineType = "all" | "email" | "note" | "task" | "meeting" | "document" | "status";

export type SpeakerTimelineEvent = {
  id: string;
  type: Exclude<TimelineType, "all">;
  timestamp: number;
  title: string;
  body: string;
  status?: string;
  isDone?: boolean;
};

type ActivityTimelineProps = {
  events: SpeakerTimelineEvent[];
  loading?: boolean;
  compact?: boolean;
  onOpenEvent?: (event: SpeakerTimelineEvent) => void;
};

const formatDate = (value: number) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDateHeader = (value: number) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const labels: Record<SpeakerTimelineEvent["type"], string> = { email: "Email", note: "Note", task: "Task", meeting: "Meeting", document: "Document", status: "Status" };
const filters: Array<{ id: TimelineType; label: string }> = [
  { id: "all", label: "All" }, { id: "note", label: "Notes" }, { id: "task", label: "Tasks" }, { id: "email", label: "Emails" }, { id: "meeting", label: "Meetings" }, { id: "document", label: "Documents" }, { id: "status", label: "Status" },
];

function typeIcon(type: SpeakerTimelineEvent["type"]) {
  if (type === "email") return <Mail className="h-3.5 w-3.5" />;
  if (type === "meeting") return <Calendar className="h-3.5 w-3.5" />;
  if (type === "task") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (type === "note") return <FileText className="h-3.5 w-3.5" />;
  if (type === "document") return <Paperclip className="h-3.5 w-3.5" />;
  return <CircleDot className="h-3.5 w-3.5" />;
}

export function ActivityTimeline({ events, loading = false, compact = false, onOpenEvent }: ActivityTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<TimelineType>("all");
  const counts = useMemo(() => events.reduce<Record<TimelineType, number>>((next, event) => ({ ...next, all: next.all + 1, [event.type]: next[event.type] + 1 }), { all: 0, email: 0, note: 0, task: 0, meeting: 0, document: 0, status: 0 }), [events]);
  const grouped = useMemo(() => {
    const map = new Map<string, SpeakerTimelineEvent[]>();
    events.filter((event) => activeFilter === "all" || event.type === activeFilter).forEach((event) => {
      const date = formatDateHeader(event.timestamp);
      map.set(date, [...(map.get(date) ?? []), event]);
    });
    return [...map.entries()].map(([date, items]) => ({ date, items: items.sort((a, b) => b.timestamp - a.timestamp) })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeFilter, events]);

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1.5" aria-label="Timeline filters">
      {filters.map((filter) => <Button key={filter.id} type="button" variant={activeFilter === filter.id ? "default" : "outline"} size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setActiveFilter(filter.id)}>
        {filter.label}<span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] leading-none dark:bg-white/10">{counts[filter.id]}</span>
      </Button>)}
    </div>
    {loading ? <p className="text-sm text-muted-foreground">Loading timeline…</p> : grouped.length === 0 ? <div className="rounded-lg bg-background px-3 py-6 text-center"><FileText className="mx-auto mb-2 h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">No timeline activity yet</p><p className="mt-1 text-xs text-muted-foreground">Add a note or create a task to build the speaker record.</p></div> : <div className="space-y-4">{grouped.map((group) => <section key={group.date} className="space-y-2"><h3 className="text-xs font-medium text-muted-foreground">{group.date}</h3><div className="space-y-2">{group.items.map((event) => <article key={event.id} onClick={compact ? () => onOpenEvent?.(event) : undefined} className={`group rounded-lg bg-background p-3 ${compact && onOpenEvent ? "cursor-pointer hover:bg-muted" : ""}`}><div className="flex items-start gap-2"><span className="mt-0.5 shrink-0 text-muted-foreground">{typeIcon(event.type)}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{event.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{labels[event.type]}{event.status ? ` · ${event.status}` : ""}{event.isDone ? " · completed" : ""}</p>{!compact && event.body ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{event.body}</p> : null}</div><time className="shrink-0 text-xs text-muted-foreground">{formatDate(event.timestamp)}</time>{!compact && event.body ? <Button type="button" variant="ghost" size="icon" onClick={() => void navigator.clipboard?.writeText(`${event.title}\n${event.body}`)} className="h-6 w-6 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100" title="Copy activity"><Clipboard className="h-3.5 w-3.5" /><span className="sr-only">Copy activity</span></Button> : null}</div></article>)}</div></section>)}</div>}
  </div>;
}
