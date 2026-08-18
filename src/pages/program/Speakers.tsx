import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Columns3,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { DetailPane } from "@/components/shared/DetailPane";
import { ActivityTimeline, type SpeakerTimelineEvent } from "@/components/speakers/ActivityTimeline";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Comm,
  CommPreview,
  Event,
  OnboardingTask,
  Speaker,
  SpeakerConfirmationStatus,
  SpeakerId,
  SpeakerNote,
  Submission,
  TaskId,
} from "@/data/types";
import {
  confirmationLabels,
  filterSpeakerOperationsRows,
  parseSpeakerOperationsView,
  profileLabels,
  projectSpeakerOperationsRows,
  type SpeakerOperationsRow,
  type SpeakerOperationsView,
} from "@/lib/speaker-operations";

const viewLabels: Record<SpeakerOperationsView, string> = {
  all: "All speakers",
  "needs-attention": "Needs attention",
  overdue: "Overdue tasks",
  awaiting: "Awaiting response",
  "profile-incomplete": "Profile incomplete",
};

const taskStatusLabels: Record<OnboardingTask["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

type SpeakerColumnKey =
  | "firstName"
  | "lastName"
  | "email"
  | "confirmation"
  | "tasks"
  | "profile"
  | "sessions";
type SpeakerSortKey = SpeakerColumnKey;
const speakerColumnKeys: SpeakerColumnKey[] = [
  "firstName",
  "lastName",
  "email",
  "confirmation",
  "tasks",
  "profile",
  "sessions",
];
const speakerSortKeys = new Set<SpeakerSortKey>(speakerColumnKeys);
const columnLabels: Record<SpeakerColumnKey, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  confirmation: "Confirmation",
  tasks: "Open tasks",
  profile: "Profile",
  sessions: "Sessions",
};

function readableDate(timestamp?: number) {
  return timestamp
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(timestamp)
    : undefined;
}

function statusBadge(status: SpeakerConfirmationStatus) {
  const dotClassName =
    status === "confirmed"
      ? "bg-success"
      : status === "declined"
        ? "bg-destructive"
        : "bg-warning";
  return (
    <span className="inline-flex items-center gap-2 text-xs text-foreground">
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotClassName}`}
        aria-hidden="true"
      />
      {confirmationLabels[status]}
    </span>
  );
}

export function AddSpeakerPane({
  event,
  onClose,
  onCreated,
}: {
  event: Event;
  onClose: () => void;
  onCreated: (speaker: Speaker) => void;
}) {
  const repo = useRepo();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmationStatus, setConfirmationStatus] =
    useState<SpeakerConfirmationStatus>("awaiting");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const createSpeaker = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedFirstName || !normalizedLastName) {
      setError("Enter the speaker’s first and last name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const id = await repo.speakers.create({
        eventId: event.id,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        email: normalizedEmail,
        confirmationStatus,
      });
      onCreated({
        id,
        eventId: event.id,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        name: `${normalizedFirstName} ${normalizedLastName}`,
        email: normalizedEmail,
        confirmationStatus,
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not add the speaker.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailPane title="Add speaker" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(submitEvent) => void createSpeaker(submitEvent)}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-speaker-first-name">First name</Label>
            <Input
              id="new-speaker-first-name"
              value={firstName}
              onChange={(inputEvent) => setFirstName(inputEvent.target.value)}
              autoComplete="given-name"
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-speaker-last-name">Last name</Label>
            <Input
              id="new-speaker-last-name"
              value={lastName}
              onChange={(inputEvent) => setLastName(inputEvent.target.value)}
              autoComplete="family-name"
              disabled={saving}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-speaker-email">Email</Label>
          <Input
            id="new-speaker-email"
            type="email"
            value={email}
            onChange={(inputEvent) => setEmail(inputEvent.target.value)}
            autoComplete="email"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-speaker-confirmation">Confirmation</Label>
          <Select
            value={confirmationStatus}
            onValueChange={(value) =>
              setConfirmationStatus(value as SpeakerConfirmationStatus)
            }
            disabled={saving}
          >
            <SelectTrigger id="new-speaker-confirmation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="awaiting">Awaiting response</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add speaker"}
          </Button>
        </div>
      </form>
    </DetailPane>
  );
}

export function SpeakerDetail({
  row,
  event,
  onClose,
  onConfirmationSaved,
  onTaskCreated,
  onTaskStatusChanged,
  comms = [],
}: {
  row: SpeakerOperationsRow;
  event: Event;
  onClose: () => void;
  onConfirmationSaved: (status: SpeakerConfirmationStatus) => void;
  onTaskCreated: (task: OnboardingTask) => void;
  onTaskStatusChanged: (
    taskId: string,
    status: OnboardingTask["status"],
  ) => void;
  comms?: Comm[];
}) {
  const repo = useRepo();
  const [confirmation, setConfirmation] = useState<SpeakerConfirmationStatus>(
    row.confirmationStatus,
  );
  const [savingConfirmation, setSavingConfirmation] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string>();
  const [addOpen, setAddOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [message, setMessage] = useState<{
    tone: "status" | "error";
    text: string;
  }>();
  const [sendingReminder, setSendingReminder] = useState(false);
  const [preparingReminder, setPreparingReminder] = useState(false);
  const [reminderPreview, setReminderPreview] = useState<CommPreview>();
  const [consolidatedPreview, setConsolidatedPreview] = useState<CommPreview>();
  const [sendingConsolidated, setSendingConsolidated] = useState(false);
  const [notes, setNotes] = useState<SpeakerNote[]>();
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const currentSpeakerId = useRef(row.id);

  useEffect(() => {
    setConfirmation(row.confirmationStatus);
    if (currentSpeakerId.current === row.id) return;
    currentSpeakerId.current = row.id;
    setMessage(undefined);
    setAddOpen(false);
    setTaskTitle("");
    setDueDate("");
    setReminderPreview(undefined);
    setConsolidatedPreview(undefined);
    setNotes(undefined);
    setNoteBody("");
  }, [row.id, row.confirmationStatus]);

  useEffect(() => {
    let current = true;
    void repo.speakerNotes.list({ eventId: event.id, speakerId: row.speaker.id })
      .then((items) => { if (current) setNotes(items); })
      .catch((error) => { if (current) setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not load notes." }); });
    return () => { current = false; };
  }, [event.id, repo.speakerNotes, row.speaker.id]);

  const saveNote = async () => {
    const body = noteBody.trim();
    if (!body) return;
    setSavingNote(true); setMessage(undefined);
    try {
      const id = await repo.speakerNotes.create({ eventId: event.id, speakerId: row.speaker.id, body });
      setNotes((items) => [{ id, eventId: event.id, speakerId: row.speaker.id, authorId: "", body, createdAt: Date.now(), updatedAt: Date.now() }, ...(items ?? [])]);
      setNoteBody(""); setMessage({ tone: "status", text: "Note saved." });
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save note." }); }
    finally { setSavingNote(false); }
  };

  const deleteNote = async (noteId: string) => {
    setMessage(undefined);
    try { await repo.speakerNotes.remove({ eventId: event.id, noteId }); setNotes((items) => items?.filter((note) => note.id !== noteId) ?? []); setMessage({ tone: "status", text: "Note deleted." }); }
    catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not delete note." }); }
  };

  const timelineEvents = useMemo<SpeakerTimelineEvent[]>(() => [
    ...(notes ?? []).map((note) => ({ id: `note-${note.id}`, type: "note" as const, timestamp: note.createdAt, title: "Added note", body: note.body })),
    ...row.tasks.map((task) => ({ id: `task-${task.id}`, type: "task" as const, timestamp: task.completedAt ?? task.updatedAt ?? task.createdAt ?? task.dueDate ?? row.speaker.updatedAt ?? Date.now(), title: task.title, body: "", status: taskStatusLabels[task.status], isDone: task.status === "completed" })),
    ...comms.filter((comm) => comm.speakerId === row.speaker.id).map((comm) => ({ id: `email-${comm.id}`, type: "email" as const, timestamp: comm.sentAt ?? comm.createdAt ?? Date.now(), title: comm.type === "reminder" ? "Sent reminder" : "Sent email", body: "", status: comm.status })),
    ...(row.speaker.updatedAt ? [{ id: `status-${row.speaker.id}`, type: "status" as const, timestamp: row.speaker.updatedAt, title: "Confirmation status updated", body: "", status: confirmationLabels[row.confirmationStatus] }] : []),
  ], [comms, notes, row.speaker.id, row.speaker.updatedAt, row.confirmationStatus, row.tasks]);

  const saveConfirmation = async () => {
    setSavingConfirmation(true);
    setMessage(undefined);
    try {
      await repo.speakers.setConfirmationStatus({
        eventId: event.id,
        speakerId: row.speaker.id,
        status: confirmation,
      });
      onConfirmationSaved(confirmation);
      setMessage({ tone: "status", text: "Confirmation status saved." });
    } catch (error) {
      setConfirmation(row.confirmationStatus);
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save confirmation status.",
      });
    } finally {
      setSavingConfirmation(false);
    }
  };

  const createTask = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const title = taskTitle.trim();
    if (!title) {
      setMessage({ tone: "error", text: "Enter a task title." });
      return;
    }
    setCreatingTask(true);
    setMessage(undefined);
    try {
      const parsedDueDate = dueDate
        ? new Date(`${dueDate}T12:00:00`).getTime()
        : undefined;
      const id = await repo.tasks.create({
        eventId: event.id,
        speakerId: row.speaker.id,
        title,
        targetType: "contact",
        dueDate: parsedDueDate,
      });
      onTaskCreated({
        id: id as TaskId,
        eventId: event.id,
        speakerId: row.speaker.id,
        title,
        targetType: "contact",
        source: "manual",
        status: "pending",
        dueDate: parsedDueDate,
      });
      setTaskTitle("");
      setDueDate("");
      setAddOpen(false);
      setMessage({ tone: "status", text: "Onboarding task created." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Could not create the task.",
      });
    } finally {
      setCreatingTask(false);
    }
  };

  const prepareReminder = async () => {
    setPreparingReminder(true); setMessage(undefined); setReminderPreview(undefined);
    try { setReminderPreview(await repo.comms.previewReminder({ eventId: event.id, speakerId: row.speaker.id })); }
    catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "The reminder preview could not be prepared." }); }
    finally { setPreparingReminder(false); }
  };

  const sendReminder = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email ?? "")) { setMessage({ tone: "error", text: "This speaker has no valid email on file." }); return; }
    setSendingReminder(true);
    setMessage(undefined);
    try {
      const outcome = await repo.comms.sendReminder({ eventId: event.id, speakerId: row.speaker.id });
      if (outcome.status === "sent") { setMessage({ tone: "status", text: `Reminder sent to ${outcome.sent} recipient.` }); setReminderPreview(undefined); return; }
      const problem = outcome.results.find(result => result.error || result.reason);
      setMessage({ tone: "error", text: problem?.error ?? problem?.reason ?? "The reminder could not be sent." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "The reminder could not be sent." });
    } finally {
      setSendingReminder(false);
    }
  };

  const prepareConsolidated = async () => {
    setMessage(undefined); setConsolidatedPreview(undefined);
    try { setConsolidatedPreview(await repo.comms.previewConsolidatedDecision({ eventId: event.id, speakerId: row.speaker.id })); }
    catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "A combined decision email could not be prepared." }); }
  };

  const sendConsolidated = async () => {
    setSendingConsolidated(true); setMessage(undefined);
    try {
      const outcome = await repo.comms.sendConsolidatedDecision({ eventId: event.id, speakerId: row.speaker.id });
      if (outcome.status === "sent") { setMessage({ tone: "status", text: "Combined decision email sent." }); setConsolidatedPreview(undefined); return; }
      const problem = outcome.results.find(result => result.error || result.reason);
      setMessage({ tone: "error", text: problem?.error ?? problem?.reason ?? "The combined decision email could not be sent." });
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "The combined decision email could not be sent." }); }
    finally { setSendingConsolidated(false); }
  };

  const updateTask = async (
    task: OnboardingTask,
    status: OnboardingTask["status"],
  ) => {
    const previousStatus = task.status;
    setUpdatingTaskId(task.id);
    setMessage(undefined);
    onTaskStatusChanged(task.id, status);
    try {
      await repo.tasks.setStatus(task.id, status);
      setMessage({
        tone: "status",
        text: `Task moved to ${taskStatusLabels[status].toLocaleLowerCase()}.`,
      });
    } catch (error) {
      onTaskStatusChanged(task.id, previousStatus);
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Could not update the task.",
      });
    } finally {
      setUpdatingTaskId(undefined);
    }
  };

  return (
    <DetailPane title={row.name} onClose={onClose}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-mt-3 w-fit lg:hidden"
        onClick={onClose}
      >
        <ArrowLeft className="h-4 w-4" /> Back to speakers
      </Button>

      <section className="space-y-2" aria-labelledby="speaker-contact-heading">
        <h3 id="speaker-contact-heading" className="text-sm font-semibold">Contact</h3>
        <p className="text-sm text-muted-foreground">{row.email || "No email on file"}</p>
        {row.lastContactAt && <p className="text-xs text-muted-foreground">Last contacted {readableDate(row.lastContactAt)}</p>}
        <Button type="button" variant="outline" size="sm" disabled={preparingReminder || sendingReminder || !row.email} onClick={() => void prepareReminder()}>
          {preparingReminder ? "Preparing…" : "Send reminder"}
        </Button>
        {reminderPreview && <div className="space-y-3 rounded-lg bg-background p-3"><div><p className="text-sm font-medium">Review reminder</p><p className="mt-1 text-xs text-muted-foreground">{reminderPreview.templateName ? `Using “${reminderPreview.templateName}”.` : "Using the built-in branded template."}</p></div><div><p className="text-sm font-medium">{reminderPreview.subject}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{reminderPreview.body}</p></div><p className="text-xs text-muted-foreground">To {reminderPreview.recipients[0]?.name} · {reminderPreview.recipients[0]?.email || "No email on file"}</p><p className="text-xs text-muted-foreground">{reminderPreview.calendarAttached ? `Calendar invite attached${reminderPreview.scheduleTime ? ` for ${reminderPreview.scheduleTime}` : ""}.` : "No scheduled session is available, so no calendar invite will be attached."}</p><div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setReminderPreview(undefined)} disabled={sendingReminder}>Cancel</Button><Button type="button" size="sm" onClick={() => void sendReminder()} disabled={sendingReminder || !reminderPreview.recipients[0]?.email}>{sendingReminder ? "Sending…" : "Confirm send"}</Button></div></div>}
      </section>

      <section
        className="space-y-3"
        aria-labelledby="speaker-confirmation-heading"
      >
        <div>
          <h3
            id="speaker-confirmation-heading"
            className="text-sm font-semibold"
          >
            Confirmation
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Record the speaker’s explicit response. Email delivery does not
            change this status.
          </p>
        </div>
        <Select
          value={confirmation}
          onValueChange={(value) =>
            setConfirmation(value as SpeakerConfirmationStatus)
          }
          disabled={savingConfirmation}
        >
          <SelectTrigger aria-label="Confirmation status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="awaiting">Awaiting response</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          onClick={() => void saveConfirmation()}
          disabled={
            savingConfirmation || confirmation === row.confirmationStatus
          }
        >
          {savingConfirmation ? "Saving…" : "Save confirmation"}
        </Button>
      </section>

      <section className="space-y-3" aria-labelledby="speaker-sessions-heading">
        <h3 id="speaker-sessions-heading" className="text-sm font-semibold">
          Accepted sessions
        </h3>
        <ul className="space-y-2">
          {row.submissions.map((submission) => (
            <li key={submission.id}>
              <Link
                className="text-sm font-medium hover:underline"
                to={event.slug ? `/events/${event.slug}/program/abstracts?selected=${encodeURIComponent(submission.id)}` : `/program/abstracts?selected=${encodeURIComponent(submission.id)}`}
              >
                {submission.title}
              </Link>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" onClick={() => void prepareConsolidated()} disabled={!row.email || sendingConsolidated}>Prepare combined decisions</Button>
        {consolidatedPreview && <div className="space-y-3 rounded-lg bg-background p-3"><div><p className="text-sm font-medium">Review combined decision email</p><p className="mt-1 text-xs text-muted-foreground">{consolidatedPreview.templateName ? `Using “${consolidatedPreview.templateName}”.` : "Using the built-in branded template."}</p></div><div><p className="text-sm font-medium">{consolidatedPreview.subject}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{consolidatedPreview.body}</p></div><p className="text-xs text-muted-foreground">{consolidatedPreview.attachmentCount ? `${consolidatedPreview.attachmentCount} calendar invite${consolidatedPreview.attachmentCount === 1 ? "" : "s"} attached for accepted sessions.` : "No calendar invites will be attached."}</p><div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setConsolidatedPreview(undefined)} disabled={sendingConsolidated}>Cancel</Button><Button type="button" size="sm" onClick={() => void sendConsolidated()} disabled={sendingConsolidated}>{sendingConsolidated ? "Sending…" : "Confirm send"}</Button></div></div>}
      </section>

      <section className="space-y-3" aria-labelledby="speaker-profile-heading">
        <div>
          <h3 id="speaker-profile-heading" className="text-sm font-semibold">
            Profile readiness
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Speakers maintain these fields in their portal.
          </p>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <Check
              className={
                row.speaker.bio?.trim()
                  ? "h-4 w-4 text-success"
                  : "h-4 w-4 text-muted-foreground"
              }
            />{" "}
            Biography {row.speaker.bio?.trim() ? "received" : "missing"}
          </li>
          <li className="flex items-center gap-2">
            <Check
              className={
                row.speaker.headshotStorageKey
                  ? "h-4 w-4 text-success"
                  : "h-4 w-4 text-muted-foreground"
              }
            />{" "}
            Headshot {row.speaker.headshotStorageKey ? "received" : "missing"}
          </li>
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="speaker-tasks-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="speaker-tasks-heading" className="text-sm font-semibold">
              Onboarding tasks
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.openTaskCount} open · {row.overdueTaskCount} overdue
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddOpen((open) => !open)}
            aria-expanded={addOpen}
          >
            Add task
          </Button>
        </div>

        {addOpen && (
          <form
            className="space-y-3 rounded-lg bg-background p-3"
            onSubmit={(event) => void createTask(event)}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`task-title-${row.id}`}>Task title</Label>
              <Input
                id={`task-title-${row.id}`}
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="e.g. Upload final slides"
                disabled={creatingTask}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`task-due-${row.id}`}>
                Due date{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`task-due-${row.id}`}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={creatingTask}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAddOpen(false)}
                disabled={creatingTask}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={creatingTask}>
                {creatingTask ? "Creating…" : "Create task"}
              </Button>
            </div>
          </form>
        )}

        {row.tasks.length ? (
          <ul className="space-y-2">
            {row.tasks.map((task) => (
              <li
                key={task.id}
                className="space-y-2 rounded-lg bg-background p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.dueDate && (
                      <p
                        className={
                          task.status !== "completed" &&
                          task.dueDate < Date.now()
                            ? "mt-1 text-xs text-destructive"
                            : "mt-1 text-xs text-muted-foreground"
                        }
                      >
                        Due {readableDate(task.dueDate)}
                      </p>
                    )}
                  </div>
                  {task.status === "completed" && (
                    <Check
                      className="h-4 w-4 shrink-0 text-success"
                      aria-label="Completed"
                    />
                  )}
                </div>
                <Select
                  value={task.status}
                  onValueChange={(value) =>
                    void updateTask(task, value as OnboardingTask["status"])
                  }
                  disabled={updatingTaskId === task.id}
                >
                  <SelectTrigger
                    className="h-8"
                    aria-label={`Status for ${task.title}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-background px-3 py-6 text-center text-sm text-muted-foreground">
            No onboarding tasks assigned.
          </p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="speaker-notes-heading">
        <div><h3 id="speaker-notes-heading" className="text-sm font-semibold">Notes</h3><p className="mt-1 text-xs text-muted-foreground">Private organizer context for this speaker.</p></div>
        <div className="space-y-2 rounded-lg bg-background p-3"><Textarea aria-label="New note" value={noteBody} onChange={(inputEvent) => setNoteBody(inputEvent.target.value)} onKeyDown={(keyEvent) => { if ((keyEvent.metaKey || keyEvent.ctrlKey) && keyEvent.key === "Enter") { keyEvent.preventDefault(); void saveNote(); } }} placeholder="Add a note…" disabled={savingNote} /><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">⌘/Ctrl + Enter to save</p><Button type="button" size="sm" onClick={() => void saveNote()} disabled={savingNote || !noteBody.trim()}>{savingNote ? "Saving…" : "Save note"}</Button></div></div>
        {notes === undefined ? <p className="text-sm text-muted-foreground">Loading notes…</p> : notes.length === 0 ? <p className="rounded-lg bg-background px-3 py-6 text-center text-sm text-muted-foreground">No notes yet.</p> : <div className="space-y-2">{notes.map((note) => <article key={note.id} className="group rounded-lg bg-background p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="whitespace-pre-wrap break-words text-sm">{note.body}</p><p className="mt-1 text-xs text-muted-foreground">{readableDate(note.createdAt)}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => void deleteNote(note.id)} className="h-6 w-6 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" title="Delete note"><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Delete note</span></Button></div></article>)}</div>}
      </section>

      <section className="space-y-3" aria-labelledby="speaker-activity-heading">
        <div><h3 id="speaker-activity-heading" className="text-sm font-semibold">Activity</h3><p className="mt-1 text-xs text-muted-foreground">Notes, tasks, and delivery history in one record.</p></div>
        <ActivityTimeline events={timelineEvents} loading={notes === undefined} />
      </section>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "text-sm text-destructive"
              : "text-sm text-success"
          }
        >
          {message.text}
        </p>
      )}
    </DetailPane>
  );
}

export default function Speakers() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [params, setParams] = useSearchParams();
  const [event, setEvent] = useState<Event>();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const searchRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const rowToRestoreFocus = useRef<string>();

  const query = params.get("q") ?? "";
  const view = parseSpeakerOperationsView(params.get("view"));
  const shouldFocusSearch = params.get("focus") === "search";
  const selectedId = params.get("selected");
  const addingSpeaker = params.get("mode") === "add";
  const requestedSort = params.get("sort");
  const sortKey: SpeakerSortKey =
    requestedSort && speakerSortKeys.has(requestedSort as SpeakerSortKey)
      ? (requestedSort as SpeakerSortKey)
      : "lastName";
  const sortDirection = params.get("direction") === "desc" ? "desc" : "asc";
  const hiddenColumns = useMemo(
    () =>
      new Set(
        (params.get("hidden") ?? "")
          .split(",")
          .filter((key): key is SpeakerColumnKey =>
            speakerSortKeys.has(key as SpeakerSortKey),
          ),
      ),
    [params],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const nextEvent = activeEvent;
      setEvent(nextEvent);
      if (!nextEvent) {
        setSpeakers([]);
        setSubmissions([]);
        setTasks([]);
        setComms([]);
        return;
      }
      const scope = { eventId: nextEvent.id };
      const [nextSpeakers, nextSubmissions, nextTasks, nextComms] =
        await Promise.all([
          repo.speakers.list(scope),
          repo.submissions.list(scope),
          repo.tasks.list(scope),
          repo.comms.list(scope),
        ]);
      setSpeakers(nextSpeakers);
      setSubmissions(nextSubmissions);
      setTasks(nextTasks);
      setComms(nextComms);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load speakers.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      projectSpeakerOperationsRows({
        speakers,
        submissions,
        tasks,
        comms,
        now: Date.now(),
      }),
    [comms, speakers, submissions, tasks],
  );
  const visibleRows = useMemo(() => {
    const filtered = filterSpeakerOperationsRows(rows, query, view);
    const direction = sortDirection === "asc" ? 1 : -1;
    const text = (value: string | undefined) => value?.trim() || "";
    return [...filtered].sort((left, right) => {
      let result = 0;
      if (sortKey === "firstName")
        result = text(left.speaker.firstName).localeCompare(
          text(right.speaker.firstName),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      if (sortKey === "lastName")
        result = text(left.speaker.lastName).localeCompare(
          text(right.speaker.lastName),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      if (sortKey === "email")
        result = text(left.email).localeCompare(text(right.email), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      if (sortKey === "confirmation")
        result = confirmationLabels[left.confirmationStatus].localeCompare(
          confirmationLabels[right.confirmationStatus],
        );
      if (sortKey === "tasks")
        result = left.openTaskCount - right.openTaskCount;
      if (sortKey === "profile")
        result = profileLabels[left.profileState].localeCompare(
          profileLabels[right.profileState],
        );
      if (sortKey === "sessions")
        result = left.submissions.length - right.submissions.length;
      return (
        result * direction ||
        text(left.speaker.lastName).localeCompare(
          text(right.speaker.lastName),
          undefined,
          { numeric: true, sensitivity: "base" },
        ) ||
        text(left.speaker.firstName).localeCompare(
          text(right.speaker.firstName),
          undefined,
          { numeric: true, sensitivity: "base" },
        )
      );
    });
  }, [query, rows, sortDirection, sortKey, view]);
  const selectedRow = rows.find((row) => row.id === selectedId);

  useEffect(() => {
    if (
      !selectedId ||
      loading ||
      visibleRows.some((row) => row.id === selectedId)
    )
      return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("selected");
        return next;
      },
      { replace: true },
    );
    searchRef.current?.focus();
  }, [loading, selectedId, setParams, visibleRows]);

  useEffect(() => {
    if (selectedId || !rowToRestoreFocus.current) return;
    const rowId = rowToRestoreFocus.current;
    const frame = requestAnimationFrame(() => {
      rowRefs.current.get(rowId)?.focus();
      rowToRestoreFocus.current = undefined;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId]);

  useEffect(() => {
    if (!shouldFocusSearch || loading) return;
    searchRef.current?.focus();
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("focus");
      return next;
    }, { replace: true });
  }, [loading, setParams, shouldFocusSearch]);

  const setParam = (key: string, value?: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (!value || (key === "view" && value === "all")) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: key !== "selected" },
    );
  };

  const closeDetail = () => {
    rowToRestoreFocus.current = selectedId ?? undefined;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("selected");
      return next;
    });
  };

  const openAddSpeaker = () => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("selected");
      next.set("mode", "add");
      return next;
    });
  };

  const closeAddSpeaker = () => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("mode");
      return next;
    });
    requestAnimationFrame(() => addButtonRef.current?.focus());
  };

  const toggleColumn = (key: SpeakerColumnKey, visible: boolean) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        const hidden = new Set(
          (next.get("hidden") ?? "").split(",").filter(Boolean),
        );
        if (visible) hidden.delete(key);
        else hidden.add(key);
        const serialized = speakerColumnKeys
          .filter((column) => hidden.has(column))
          .join(",");
        if (serialized) next.set("hidden", serialized);
        else next.delete("hidden");
        return next;
      },
      { replace: true },
    );
  };

  const changeSort = useCallback(
    (key: SpeakerSortKey) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const nextDirection =
            sortKey === key && sortDirection === "asc" ? "desc" : "asc";
          next.set("sort", key);
          next.set("direction", nextDirection);
          return next;
        },
        { replace: true },
      );
    },
    [setParams, sortDirection, sortKey],
  );

  const columns = useMemo<DataGridColumn<SpeakerOperationsRow>[]>(() => {
    const allColumns: DataGridColumn<SpeakerOperationsRow>[] = [
      {
        key: "firstName",
        header: "First name",
        width: "112px",
        sortDirection: sortKey === "firstName" ? sortDirection : undefined,
        onSort: () => changeSort("firstName"),
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {row.speaker.firstName?.trim().charAt(0).toLocaleUpperCase() ||
                row.name.trim().charAt(0).toLocaleUpperCase() ||
                "?"}
            </span>
            <span className="truncate font-medium text-foreground">
              {row.speaker.firstName || "—"}
            </span>
          </div>
        ),
      },
      {
        key: "lastName",
        header: "Last name",
        width: "108px",
        sortDirection: sortKey === "lastName" ? sortDirection : undefined,
        onSort: () => changeSort("lastName"),
        cell: (row) => (
          <span className="truncate font-medium text-foreground">
            {row.speaker.lastName || "—"}
          </span>
        ),
      },
      {
        key: "email",
        header: "Email",
        width: "190px",
        sortDirection: sortKey === "email" ? sortDirection : undefined,
        onSort: () => changeSort("email"),
        cell: (row) => (
          <span className="truncate text-muted-foreground">
            {row.email || "—"}
          </span>
        ),
      },
      {
        key: "confirmation",
        header: "Confirmation",
        width: "145px",
        sortDirection: sortKey === "confirmation" ? sortDirection : undefined,
        onSort: () => changeSort("confirmation"),
        cell: (row) => statusBadge(row.confirmationStatus),
      },
      {
        key: "tasks",
        header: "Open tasks",
        width: "102px",
        sortDirection: sortKey === "tasks" ? sortDirection : undefined,
        onSort: () => changeSort("tasks"),
        cell: (row) => (
          <span
            className={
              row.overdueTaskCount
                ? "font-medium text-destructive"
                : "tabular-nums text-muted-foreground"
            }
          >
            {row.openTaskCount || "—"}
            {row.overdueTaskCount ? ` · ${row.overdueTaskCount} overdue` : ""}
          </span>
        ),
      },
      {
        key: "profile",
        header: "Profile",
        width: "145px",
        sortDirection: sortKey === "profile" ? sortDirection : undefined,
        onSort: () => changeSort("profile"),
        cell: (row) => (
          <span
            className={
              row.profileState === "complete"
                ? "text-success"
                : "text-muted-foreground"
            }
          >
            {profileLabels[row.profileState]}
          </span>
        ),
      },
      {
        key: "sessions",
        header: "Sessions",
        width: "78px",
        align: "right",
        sortDirection: sortKey === "sessions" ? sortDirection : undefined,
        onSort: () => changeSort("sessions"),
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">
            {row.submissions.length}
          </span>
        ),
      },
    ];
    return allColumns.filter(
      (column) => !hiddenColumns.has(column.key as SpeakerColumnKey),
    );
  }, [changeSort, hiddenColumns, sortDirection, sortKey]);

  const detail =
    addingSpeaker && event ? (
      <AddSpeakerPane
        event={event}
        onClose={closeAddSpeaker}
        onCreated={(speaker) => {
          setSpeakers((items) => [...items, speaker]);
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("mode");
            next.set("selected", speaker.id);
            return next;
          });
        }}
      />
    ) : selectedRow && event ? (
      <SpeakerDetail
        row={selectedRow}
        event={event}
        onClose={closeDetail}
        onConfirmationSaved={(status) =>
          setSpeakers((items) =>
            items.map((speaker) =>
              speaker.id === selectedRow.id
                ? { ...speaker, confirmationStatus: status }
                : speaker,
            ),
          )
        }
        onTaskCreated={(task) => setTasks((items) => [...items, task])}
        onTaskStatusChanged={(taskId, status) =>
          setTasks((items) =>
            items.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    status,
                    completedAt:
                      status === "completed" ? Date.now() : undefined,
                  }
                : task,
            ),
          )
        }
        comms={comms}
      />
    ) : undefined;

  return (
    <AppLayout title="Speakers" detail={detail}>
      <div
        className={
          selectedRow || addingSpeaker
            ? "hidden space-y-3 lg:block"
            : "space-y-3"
        }
      >
        {loadError ? (
          <section
            className="flex min-h-48 flex-col items-center justify-center gap-3 text-center"
            role="alert"
          >
            <CircleAlert className="h-6 w-6 text-destructive" />
            <div>
              <p className="text-sm font-medium">Could not load speakers</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {loadError}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
            >
              Retry
            </Button>
          </section>
        ) : !loading && !event ? (
          <section className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <UserRoundCheck className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Configure an event first</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Speaker operations are scoped to the active event.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/events/${activeEvent.slug}/settings/event`}>Open event settings</Link>
            </Button>
          </section>
        ) : (
          <section className={cardSurfaceClasses("default", "overflow-hidden")}>
            <div className="px-3 pb-3 pt-2.5">
              <ContentToolbar
                ariaLabel="Speaker controls"
                search={
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => setParam("q", event.target.value)}
                      className="h-9 pl-9 md:max-w-sm"
                      placeholder="Search speakers"
                      aria-label="Search speakers"
                      disabled={loading}
                    />
                  </div>
                }
                utilities={
                  <>
                    <Select
                      value={view}
                      onValueChange={(value) => setParam("view", value)}
                      disabled={loading}
                    >
                      <SelectTrigger
                        className="h-9 w-[11.5rem]"
                        aria-label="Speaker view"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(viewLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9"
                          disabled={loading}
                        >
                          <Columns3 className="h-4 w-4" /> Columns
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {speakerColumnKeys.map((key) => {
                          const visible = !hiddenColumns.has(key);
                          const visibleCount =
                            speakerColumnKeys.length - hiddenColumns.size;
                          return (
                            <DropdownMenuCheckboxItem
                              key={key}
                              checked={visible}
                              disabled={visible && visibleCount === 1}
                              onCheckedChange={(checked) =>
                                toggleColumn(key, checked === true)
                              }
                            >
                              {columnLabels[key]}
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                }
                primaryAction={
                  <Button
                    ref={addButtonRef}
                    type="button"
                    size="sm"
                    className="h-9"
                    onClick={openAddSpeaker}
                    disabled={loading || !event}
                  >
                    Add speaker
                  </Button>
                }
              />
            </div>

            {loading ? (
              <DataGrid
                rows={[]}
                columns={columns}
                empty=""
                loading
                skeletonRows={6}
                appearance="embedded"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={UserRoundCheck}
                title="No speakers yet"
                message="Add a speaker manually or accept an abstract."
                action={<Button type="button" variant="accent" size="sm" onClick={openAddSpeaker}><Plus /> Add speaker</Button>}
              />
            ) : visibleRows.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No speakers match this view"
                message="Clear the search and filters to see every speaker."
                action={<Button type="button" variant="outline" size="sm" onClick={() => setParams(new URLSearchParams())}>Clear filters</Button>}
              />
            ) : (
              <DataGrid
                rows={visibleRows}
                columns={columns}
                empty="No accepted speakers match this view."
                paginated
                appearance="embedded"
                itemLabel="speakers"
                minWidth={columns.reduce(
                  (total, column) =>
                    total + Number.parseInt(column.width ?? "140", 10),
                  0,
                )}
                getRowLabel={(row) => `Open details for ${row.name}`}
                onRowActivated={(row) => setParam("selected", row.id)}
                onRowRef={(row, element) => {
                  if (element) rowRefs.current.set(row.id, element);
                  else rowRefs.current.delete(row.id);
                }}
              />
            )}
          </section>
        )}
      </div>
      {selectedRow && !event && (
        <p role="alert" className="text-sm text-destructive">
          The selected speaker’s event could not be loaded.
        </p>
      )}
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
