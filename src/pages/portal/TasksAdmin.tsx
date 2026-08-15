import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Plus, Search } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { StatusTabs } from "@/components/shared/StatusTabs";
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
  EventId,
  OnboardingTask as StoredOnboardingTask,
  Sponsor,
  Submission,
  SubmissionForm,
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
type PortalForm = SubmissionForm & {
  kind?: "contact" | "group" | "submission_task";
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
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [tab, setTab] = useState<"all" | TaskTarget>("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [eventId, setEventId] = useState<EventId>();
  const [newTitle, setNewTitle] = useState("");
  const [newTarget, setNewTarget] = useState<TaskTarget>("submission");
  const [portalForms, setPortalForms] = useState<PortalForm[]>([]);
  const [linkedFormId, setLinkedFormId] = useState("none");
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [copyTemplateId, setCopyTemplateId] = useState("");
  const [copySubmissionId, setCopySubmissionId] = useState("");
  const [copyResult, setCopyResult] = useState<string>();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsorId, setSponsorId] = useState("none");

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
      setEventId(event?.id);
      if (!event) {
        setTasks([]);
        setPortalForms([]);
        return;
      }
      const [eventTasks, forms, nextTemplates, nextSubmissions, nextSponsors] =
        await Promise.all([
          repo.tasks.list({ eventId: event.id }),
          repo.forms.list({ eventId: event.id }),
          repo.taskTemplates.list({ eventId: event.id }),
          repo.submissions.list({ eventId: event.id }),
          repo.sponsors.list({ eventId: event.id }),
        ]);
      setSponsors(nextSponsors);
      setTasks(eventTasks.map((task) => taskForDisplay(task, nextSponsors)));
      setPortalForms(
        (forms as PortalForm[]).filter(
          (form) =>
            form.kind === "contact" ||
            form.kind === "group" ||
            form.kind === "submission_task",
        ),
      );
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

  const createTask = async () => {
    const title = newTitle.trim();
    if (!eventId) {
      setLoadError("Configure an event before creating onboarding tasks.");
      return;
    }
    if (!title) {
      setLoadError("Enter a title for the task.");
      return;
    }
    setSaving(true);
    setLoadError(undefined);
    try {
      if (newTarget === "sponsor" && sponsorId === "none") {
        setLoadError("Select a sponsor for this task.");
        setSaving(false);
        return;
      }
      await repo.tasks.create({
        eventId,
        title,
        targetType: newTarget,
        sponsorId: newTarget === "sponsor" ? (sponsorId as never) : undefined,
        linkedFormId:
          newTarget !== "sponsor" && linkedFormId !== "none"
            ? (linkedFormId as never)
            : undefined,
      });
      setNewTitle("");
      setNewTarget("submission");
      setLinkedFormId("none");
      setSponsorId("none");
      setAddOpen(false);
      await loadTasks();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not create this task.",
      );
    } finally {
      setSaving(false);
    }
  };
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

  return (
    <AppLayout title="Tasks">
      <div className="space-y-3">
        {copyOpen && (
          <section
            className={cardSurfaceClasses("default", "p-5")}
            aria-label="Copy from template"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Copy from template</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a saved checklist to a submission.
                </p>
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
        {addOpen && (
          <section
            className={cardSurfaceClasses("default", "p-5")}
            aria-label="Add onboarding task"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Add task</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a manual onboarding task for this event.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(false)}
              >
                Close
              </Button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_14rem_auto] lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="task-title">Task title</Label>
                <Input
                  id="task-title"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="e.g. Upload speaker headshot"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-target">Target type</Label>
                <Select
                  value={newTarget}
                  onValueChange={(value) => {
                    setNewTarget(value as TaskTarget);
                    setSponsorId("none");
                  }}
                  disabled={saving}
                >
                  <SelectTrigger id="task-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="submission">Submission</SelectItem>
                    <SelectItem value="sponsor">Sponsor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newTarget === "sponsor" ? (
                <div className="space-y-2">
                  <Label htmlFor="task-sponsor">Sponsor</Label>
                  <Select
                    value={sponsorId}
                    onValueChange={setSponsorId}
                    disabled={saving}
                  >
                    <SelectTrigger id="task-sponsor">
                      <SelectValue placeholder="Choose sponsor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choose sponsor</SelectItem>
                      {sponsors.map((sponsor) => (
                        <SelectItem key={sponsor.id} value={sponsor.id}>
                          {sponsor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="task-portal-form">
                    Linked portal form{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Select
                    value={linkedFormId}
                    onValueChange={setLinkedFormId}
                    disabled={saving}
                  >
                    <SelectTrigger id="task-portal-form">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No form linked</SelectItem>
                      {portalForms.map((form) => (
                        <SelectItem key={form.id} value={form.id}>
                          {form.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void createTask()}
                disabled={saving || !eventId}
              >
                {saving ? "Creating…" : "Create task"}
              </Button>
            </div>
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
          utilities={
            <StatusTabs
              ariaLabel="Task types"
              value={tab}
              onValueChange={(value) => setTab(value as "all" | TaskTarget)}
              tabs={[
                { value: "all", label: "All Tasks", count: counts.all },
                { value: "contact", label: "Contact Tasks", count: counts.contact },
                { value: "group", label: "Group Tasks", count: counts.group },
                {
                  value: "submission",
                  label: "Submission Tasks",
                  count: counts.submission,
                },
                { value: "sponsor", label: "Sponsor Tasks", count: counts.sponsor },
              ]}
            />
          }
          primaryAction={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCopyOpen((open) => !open);
                  setAddOpen(false);
                }}
              >
                Copy from…
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => {
                  setAddOpen((open) => !open);
                  setCopyOpen(false);
                }}
              >
                <Plus /> Add
              </Button>
            </>
          }
        />

        <section className="grid gap-3" aria-live="polite">
          {loading ? (
            <SkeletonList rows={4} label="Loading onboarding tasks…" />
          ) : visibleTasks.length ? (
            visibleTasks.map((task) => (
              <article
                key={task.id}
                id={`task-${task.id}`}
                className={cardSurfaceClasses("default", "flex flex-wrap items-center justify-between gap-4 p-5")}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{task.title}</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {task.source === "agent" ? "Operations Agent" : task.source === "manual" ? "Manual" : "Automatic"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-1">
                      {targetLabels[task.target]}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-1">
                      {task.targetLabel}
                    </span>
                    {task.dueLabel && (
                      <span className="px-1 py-1">{task.dueLabel}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                    {statusLabels[task.status]}
                  </span>
                  {task.status !== "completed" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void advance(task.id)}
                    >
                      {task.status === "in_progress" ? (
                        <>
                          <Check /> Mark done
                        </>
                      ) : (
                        "Start task"
                      )}
                    </Button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className={cardSurfaceClasses("default", "px-6 py-12 text-center")}>
              <ClipboardList className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">
                No tasks match this view
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try another task type or clear the search.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
