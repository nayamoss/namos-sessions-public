import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type {
  AgendaConflict,
  AgendaItem,
  Comm,
  Event,
  OnboardingTask,
  Speaker,
  Submission,
  RecordingManagerRow,
} from "@/data/types";
import {
  filterReadinessGroupsByDay,
  projectReadinessGroups,
  type ReadinessCategory,
} from "@/lib/readiness";
import { projectSpeakerOperationsRows } from "@/lib/speaker-operations";
import { agendaEventDays } from "./Agenda";

const categoryLabels: Record<ReadinessCategory, string> = {
  agenda_conflicts: "Schedule",
  speaker_confirmations: "Speakers",
  onboarding_tasks: "Tasks",
  proposal_decisions: "Abstracts",
  comms_delivery: "Communications",
  recording_coverage: "Recordings",
};
type ReadinessData = {
  event?: Event;
  agenda: AgendaItem[];
  conflicts: AgendaConflict[];
  speakers: Speaker[];
  submissions: Submission[];
  tasks: OnboardingTask[];
  comms: Comm[];
  recordings: RecordingManagerRow[];
  errors: Partial<Record<ReadinessCategory, string>>;
};
const emptyData: ReadinessData = {
  agenda: [],
  conflicts: [],
  speakers: [],
  submissions: [],
  tasks: [],
  comms: [],
  recordings: [],
  errors: {},
};
type ReadinessRow = {
  id: string;
  category: string;
  title: string;
  detail?: string;
  eventDate?: string;
  to: string;
};
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not load this readiness signal.";
}

export default function Readiness() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [data, setData] = useState<ReadinessData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string | "all">("all");
  const load = useCallback(async () => {
    setLoading(true);
    const scope = { eventId: event.id };
    const results = await Promise.allSettled([
      repo.agenda.list(scope),
      repo.agenda.detectConflicts(scope),
      repo.speakers.list(scope),
      repo.submissions.list(scope),
      repo.tasks.list(scope),
      repo.comms.list(scope),
      repo.recordings.list(scope),
    ]);
    const value = <T,>(index: number): T[] =>
      results[index].status === "fulfilled"
        ? (results[index].value as T[])
        : [];
    const errors: Partial<Record<ReadinessCategory, string>> = {};
    if (results[0].status === "rejected")
      errors.agenda_conflicts = message(results[0].reason);
    else if (results[1].status === "rejected")
      errors.agenda_conflicts = message(results[1].reason);
    if (results[2].status === "rejected")
      errors.speaker_confirmations = message(results[2].reason);
    if (results[3].status === "rejected")
      errors.proposal_decisions = message(results[3].reason);
    if (results[4].status === "rejected")
      errors.onboarding_tasks = message(results[4].reason);
    if (results[5].status === "rejected")
      errors.comms_delivery = message(results[5].reason);
    if (results[6].status === "rejected") errors.recording_coverage = message(results[6].reason);
    setData({
      event,
      agenda: value<AgendaItem>(0),
      conflicts: value<AgendaConflict>(1),
      speakers: value<Speaker>(2),
      submissions: value<Submission>(3),
      tasks: value<OnboardingTask>(4),
      comms: value<Comm>(5),
      recordings: value<RecordingManagerRow>(6),
      errors,
    });
    setLoading(false);
  }, [event, repo]);
  useEffect(() => {
    void load();
  }, [load]);
  const groups = useMemo(
    () =>
      data.event
        ? [...projectReadinessGroups({
            event: data.event,
            agenda: data.agenda,
            agendaConflicts: data.conflicts,
            speakerRows: projectSpeakerOperationsRows({
              speakers: data.speakers,
              submissions: data.submissions,
              tasks: data.tasks,
              comms: data.comms,
              now: Date.now(),
            }),
            submissions: data.submissions,
            tasks: data.tasks,
            comms: data.comms,
            now: Date.now(),
          }), { category: "recording_coverage" as const, label: "Recording coverage", items: data.recordings.filter((recording) => recording.endTime < Date.now() && (!recording.recording || recording.recording.availability === "failed" || recording.recording.availability === "unavailable")).map((recording) => ({ id: recording.id, title: recording.recording?.availability === "failed" ? `Failed recording: ${recording.title}` : recording.recording?.availability === "unavailable" ? `Unavailable recording: ${recording.title}` : `Recording missing: ${recording.title}`, detail: "Open the recordings manager to attach or replace it.", to: `/events/${data.event.slug}/program/recordings?session=${encodeURIComponent(recording.id)}&filter=${recording.recording ? "attention" : "missing"}` })) }]
        : (Object.keys(categoryLabels) as ReadinessCategory[]).map((category) => ({
            category,
            label: categoryLabels[category],
            items: [],
          })),
    [data],
  );
  const enabledCategories = useMemo(
    () => new Set<ReadinessCategory>(event.readinessCategories ?? (Object.keys(categoryLabels) as ReadinessCategory[])),
    [event.readinessCategories],
  );
  const filtered = useMemo(
    () => filterReadinessGroupsByDay(groups.filter((group) => enabledCategories.has(group.category)), day),
    [day, enabledCategories, groups],
  );
  const days = data.event
    ? agendaEventDays(data.event.startDate, data.event.endDate)
    : [];
  const rows = useMemo<ReadinessRow[]>(
    () =>
      filtered.flatMap((group) =>
        group.items.map((item) => ({
          id: `${group.category}:${item.id}`,
          category: group.label,
          title: item.title,
          detail: item.detail,
          eventDate: item.eventDate,
          to: item.to,
        })),
      ),
    [filtered],
  );
  const columns: DataGridColumn<ReadinessRow>[] = [
    {
      key: "category",
      header: "Area",
      width: "10rem",
      cell: (row) => <span className="text-muted-foreground">{row.category}</span>,
    },
    {
      key: "blocker",
      header: "Needs attention",
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: "when",
      header: "Event day",
      width: "10rem",
      cell: (row) => row.eventDate
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            timeZone: data.event?.timezone,
          }).format(new Date(`${row.eventDate}T12:00:00Z`))
        : <span className="text-muted-foreground">Any time</span>,
    },
    {
      key: "action",
      header: "",
      width: "8rem",
      align: "right",
      cell: (row) => (
        <Button asChild variant="ghost" size="sm">
          <Link to={row.to}>Open</Link>
        </Button>
      ),
    },
  ];

  return (
    <AppLayout title="Readiness">
      <div className="space-y-3">
        <ContentToolbar
          ariaLabel="Readiness controls"
          utilities={
            <div className="flex items-center gap-2">
              <Label className="sr-only" htmlFor="readiness-day">Event day</Label>
              <Select value={day} onValueChange={(value) => setDay(value as string | "all")}>
                <SelectTrigger id="readiness-day" className="w-44">
                  <SelectValue placeholder="All event days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All event days</SelectItem>
                  {days.map((value) => (
                    <SelectItem key={value} value={value}>
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: data.event?.timezone,
                      }).format(new Date(`${value}T12:00:00Z`))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          primaryAction={<div className="flex gap-2"><Button asChild type="button" variant="outline" size="sm"><Link to={`/events/${event.slug}/settings/readiness`}>Configure</Link></Button><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" aria-hidden="true" />{loading ? "Checking…" : "Refresh"}</Button></div>}
        />
        {loading ? (
          <div
            className="space-y-3"
            aria-busy="true"
            aria-label="Loading readiness"
          >
            <div className="h-11 animate-pulse rounded-md bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted" />
          </div>
        ) : rows.length === 0 && Object.keys(data.errors).length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No readiness blockers" />
        ) : (
          <>
            {Object.values(data.errors).map((error) => (
              <p key={error} role="alert" className="text-sm text-destructive">{error}</p>
            ))}
            <DataGrid
              rows={rows}
              columns={columns}
              empty={<EmptyState compact icon={CheckCircle2} title="No blockers match this day" action={day !== "all" ? <Button variant="outline" size="sm" onClick={() => setDay("all")}>Show all days</Button> : undefined} />}
              appearance="embedded"
              rowActivation="none"
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
