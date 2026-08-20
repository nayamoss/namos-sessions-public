import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { FilterMenu } from "@/components/shared/StatusTabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  OnboardingTask as StoredOnboardingTask,
  Sponsor,
  Submission,
  TaskTemplate,
} from "@/data/types";
import { canTransitionTask, type TaskStatus } from "@/lib/task-status";

type TaskTarget = "contact" | "group" | "submission" | "sponsor";

type OnboardingTask = {
  id: string;
  title: string;
  target: TaskTarget;
  targetLabel: string;
  source: "manual" | "auto" | "agent";
  status: TaskStatus;
  dueLabel?: string;
};
const targetLabels: Record<TaskTarget, string> = {
  contact: "Contact Tasks",
  group: "Group Tasks",
  submission: "Submission Tasks",
  sponsor: "Sponsor Tasks",
};

const statusLabels: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Done",
  blocked: "Blocked",
};

function nextStatus(status: TaskStatus): TaskStatus | null {
  const candidate: TaskStatus[] = ["in_progress", "completed", "pending"];
  return candidate.find((value) => canTransitionTask(status, value)) ?? null;
}

function dueLabel(dueDate?: number) {
  return dueDate
    ? `Due ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dueDate)}`
    : undefined;
}

function taskForDisplay(
  task: StoredOnboardingTask,
  sponsors: Sponsor[],
): OnboardingTask {
  return {
    id: task.id,
    title: task.title,
    target: task.targetType,
    targetLabel:
      task.targetType === "contact"
        ? "Contact"
        : task.targetType === "group"
          ? "Group"
          : task.targetType === "sponsor"
            ? (sponsors.find((sponsor) => sponsor.id === task.sponsorId)
                ?.name ?? "Sponsor")
            : "Submission",
    source: task.source,
    status: task.status,
    dueLabel: dueLabel(task.dueDate),
  };
}

export default function TasksAdmin() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [tab, setTab] = useState<"all" | TaskTarget>("all");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [copyTemplateId, setCopyTemplateId] = useState("");
  const [copySubmissionId, setCopySubmissionId] = useState("");
  const [copyResult, setCopyResult] = useState<string>();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const listPath = activeEvent ? `/events/${activeEvent.slug}/portals/tasks` : "";

  const counts = useMemo(
    () => ({
      all: tasks.length,
      contact: tasks.filter((task) => task.target === "contact").length,
      group: tasks.filter((task) => task.target === "group").length,
      submission: tasks.filter((task) => task.target === "submission").length,
      sponsor: tasks.filter((task) => task.target === "sponsor").length,
    }),
    [tasks],
  );
  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesTarget = tab === "all" || task.target === tab;
        const haystack = `${task.title} ${task.targetLabel}`.toLowerCase();
        return matchesTarget && haystack.includes(query.trim().toLowerCase());
      }),
    [query, tab, tasks],
  );

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const event = activeEvent;
      if (!event) {
        setTasks([]);
        return;
      }
      const [eventTasks, nextTemplates, nextSubmissions, nextSponsors] =
        await Promise.all([
          repo.tasks.list({ eventId: event.id }),
          repo.taskTemplates.list({ eventId: event.id }),
          repo.submissions.list({ eventId: event.id }),
          repo.sponsors.list({ eventId: event.id }),
        ]);
      setSponsors(nextSponsors);
      setTasks(eventTasks.map((task) => taskForDisplay(task, nextSponsors)));
      setTemplates(nextTemplates);
      setSubmissions(
        nextSubmissions.filter((submission) => submission.speakerIds.length),
      );
    } catch (error) {
      setTasks([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load onboarding tasks.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const applyTemplate = async () => {
    if (!copyTemplateId || !copySubmissionId) return;
    setSaving(true);
    try {
      const result = await repo.taskTemplates.applyToSubmission({
        templateId: copyTemplateId,
        submissionId: copySubmissionId as never,
      });
      setCopyResult(
        `Added ${result.created} tasks (${result.skipped} already existed and were skipped).`,
      );
      await loadTasks();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not apply template.",
      );
    } finally {
      setSaving(false);
    }
  };

  const advance = async (id: string) => {
    const current = tasks.find((task) => task.id === id);
    const status = current ? nextStatus(current.status) : null;
    if (!current || !status || status === "blocked") return;
    setTasks((items) =>
      items.map((task) => (task.id === id ? { ...task, status } : task)),
    );
    try {
      await repo.tasks.setStatus(id, status);
    } catch (error) {
      setTasks((items) =>
        items.map((task) => (task.id === id ? current : task)),
      );
      setLoadError(
        error instanceof Error ? error.message : "Could not update this task.",
      );
    }
  };
  const columns: DataGridColumn<OnboardingTask>[] = [
    {
      key: "task",
      header: "Task",
      kind: "row-header",
      cell: (task) => (
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-w-0 justify-start p-0 text-left hover:bg-transparent"
          onClick={() => navigate(`${listPath}/${task.id}/edit`)}
        >
          <p className="truncate font-semibold text-foreground">{task.title}</p>
          <p className="mt-0.5 text-xs font-normal text-muted-foreground">
            {task.source === "agent" ? "Operations Agent" : task.source === "manual" ? "Manual" : "Automatic"}
          </p>
        </Button>
      ),
    },
    { key: "target", header: "Assigned to", width: "14rem", cell: (task) => <span className="text-muted-foreground">{task.targetLabel}</span> },
    { key: "due", header: "Due", width: "9rem", cell: (task) => <span className="text-muted-foreground">{task.dueLabel ?? "No due date"}</span> },
    { key: "status", header: "Status", width: "9rem", cell: (task) => <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{statusLabels[task.status]}</span> },
    {
      key: "actions",
      header: "",
      headerLabel: "Actions",
      width: "10rem",
      align: "right",
      cell: (task) => task.status === "completed" ? <span className="text-sm text-muted-foreground">Complete</span> : (
        <Button type="button" variant="outline" size="sm" onClick={() => void advance(task.id)}>
          {task.status === "in_progress" ? <><Check /> Mark done</> : "Start task"}
        </Button>
      ),
    },
  ];

  return (
    <AppLayout title="Speaker tasks">
      <div className="space-y-3">
        {copyOpen && (
          <section
            className={cardSurfaceClasses("default", "p-5")}
            aria-label="Copy from template"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Copy from template</h2>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCopyOpen(false)}
              >
                Close
              </Button>
            </div>
            {templates.length ? (
              <div className="mt-4 grid gap-4 md:grid-cols-3 md:items-end">
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select
                    value={copyTemplateId}
                    onValueChange={setCopyTemplateId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} ({template.items.length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Submission</Label>
                  <Select
                    value={copySubmissionId}
                    onValueChange={setCopySubmissionId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose submission" />
                    </SelectTrigger>
                    <SelectContent>
                      {submissions.map((submission) => (
                        <SelectItem key={submission.id} value={submission.id}>
                          {submission.title ?? submission.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={saving || !copyTemplateId || !copySubmissionId}
                  onClick={() => void applyTemplate()}
                >
                  {saving ? "Applying…" : "Apply template"}
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No templates yet — create one in Event Settings.
              </p>
            )}
            {copyResult && (
              <p className="mt-3 text-sm text-muted-foreground">{copyResult}</p>
            )}
          </section>
        )}
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}

        <ContentToolbar
          ariaLabel="Task controls"
          search={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 pl-9"
                placeholder="Search tasks"
                aria-label="Search tasks"
              />
            </div>
          }
          utilities={<>
            <FilterMenu
              ariaLabel="Task types"
              value={tab}
              onValueChange={(value) => setTab(value as "all" | TaskTarget)}
              tabs={[
                { value: "all", label: "All Tasks", count: counts.all },
                { value: "contact", label: "Contact Tasks", count: counts.contact },
                { value: "group", label: "Group Tasks", count: counts.group },
                { value: "submission", label: "Submission Tasks", count: counts.submission },
                { value: "sponsor", label: "Sponsor Tasks", count: counts.sponsor },
              ]}
            />
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCopyOpen((open) => !open);
                }}
              >
                Copy from…
              </Button>
          </>}
          primaryAction={
            <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => navigate(`${listPath}/new`)}
                disabled={!activeEvent}
              >
                Add
              </Button>
          }
        />

        <DataGrid
          rows={visibleTasks}
          columns={columns}
          empty={
            <EmptyState
              compact
              icon={ClipboardList}
              title={tasks.length ? "No tasks match this view" : "No tasks yet"}
              message={tasks.length ? "Clear the search or choose another task type." : "Add a task when onboarding work is ready."}
              action={tasks.length ? <Button variant="outline" size="sm" onClick={() => { setQuery(""); setTab("all"); }}>Clear filters</Button> : <Button variant="accent" size="sm" onClick={() => navigate(`${listPath}/new`)}>Add task</Button>}
            />
          }
          loading={loading}
          skeletonRows={4}
          getRowLabel={(task) => task.title}
          ariaLabel="Onboarding tasks"
          minWidth={760}
        />
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
