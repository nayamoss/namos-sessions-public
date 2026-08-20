import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useCurrentEvent } from "@/components/EventContext";
import { EditorPage } from "@/components/shared/EditorPage";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRepo } from "@/data/repo";
import type { OnboardingTask, Sponsor, SubmissionForm } from "@/data/types";

type Target = OnboardingTask["targetType"];

export default function TaskEditorPage() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const { taskId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const creating = taskId === "new" || location.pathname.endsWith("/new");
  const listPath = `/events/${event.slug}/portals/tasks`;
  const [task, setTask] = useState<OnboardingTask | null>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetType, setTargetType] = useState<Target>("submission");
  const [sponsorId, setSponsorId] = useState("none");
  const [linkedFormId, setLinkedFormId] = useState("none");
  const [dueDate, setDueDate] = useState("");
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [forms, setForms] = useState<SubmissionForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [record, nextSponsors, nextForms] = await Promise.all([
        creating ? Promise.resolve(null) : repo.tasks.get({ eventId: event.id, id: taskId! }),
        repo.sponsors.list({ eventId: event.id }),
        repo.forms.list({ eventId: event.id }),
      ]);
      setTask(record);
      setSponsors(nextSponsors);
      setForms(nextForms.filter((form) => ["contact", "group", "submission_task"].includes((form as SubmissionForm & { kind?: string }).kind ?? "")));
      if (record) {
        setTitle(record.title);
        setDescription(record.description ?? "");
        setTargetType(record.targetType);
        setSponsorId(record.sponsorId ?? "none");
        setLinkedFormId(record.linkedFormId ?? "none");
        setDueDate(record.dueDate ? new Date(record.dueDate).toISOString().slice(0, 10) : "");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this task.");
    } finally {
      setLoading(false);
    }
  }, [creating, event.id, repo, taskId]);
  useEffect(() => { void load(); }, [load]);

  const initial = useMemo(() => JSON.stringify(task ? {
    title: task.title, description: task.description ?? "", targetType: task.targetType,
    sponsorId: task.sponsorId ?? "none", linkedFormId: task.linkedFormId ?? "none",
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "",
  } : { title: "", description: "", targetType: "submission", sponsorId: "none", linkedFormId: "none", dueDate: "" }), [task]);
  const current = JSON.stringify({ title, description, targetType, sponsorId, linkedFormId, dueDate });

  const save = async () => {
    if (!title.trim()) return setError("Enter a task title.");
    if (targetType === "sponsor" && sponsorId === "none") return setError("Select a sponsor.");
    setSaving(true); setError(undefined);
    const input = {
      eventId: event.id,
      title: title.trim(),
      description: description.trim() || undefined,
      targetType,
      speakerId: task?.speakerId,
      submissionId: task?.submissionId,
      sponsorId: targetType === "sponsor" ? sponsorId as never : undefined,
      linkedFormId: targetType !== "sponsor" && linkedFormId !== "none" ? linkedFormId as never : undefined,
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00Z`).getTime() : undefined,
    };
    try {
      if (creating) await repo.tasks.create(input);
      else await repo.tasks.update({ ...input, id: taskId! });
      navigate(listPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this task.");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (creating || !taskId) return;
    setSaving(true);
    try { await repo.tasks.remove({ eventId: event.id, id: taskId }); navigate(listPath); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this task."); setSaving(false); }
  };

  return (
    <EditorPage
      title={creating ? "New task" : "Edit task"}
      backTo={listPath}
      loading={loading}
      notFound={!creating && task === null}
      error={error}
      dirty={!loading && current !== initial}
      saving={saving}
      saveLabel={creating ? "Create task" : "Save task"}
      saveDisabled={!title.trim()}
      onSave={save}
      secondaryAction={!creating ? <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="destructive" size="sm" disabled={saving}>Delete task</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this task?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>Delete task</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : undefined}
    >
      <div className="max-w-3xl space-y-5">
        <FormField label="Task title"><Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></FormField>
        <FormField label="Description (optional)"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Target type">
            <Select value={targetType} onValueChange={(value) => setTargetType(value as Target)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contact">Contact</SelectItem><SelectItem value="group">Group</SelectItem><SelectItem value="submission">Submission</SelectItem><SelectItem value="sponsor">Sponsor</SelectItem></SelectContent></Select>
          </FormField>
          {targetType === "sponsor" ? <FormField label="Sponsor"><Select value={sponsorId} onValueChange={setSponsorId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose sponsor</SelectItem>{sponsors.map((sponsor) => <SelectItem key={sponsor.id} value={sponsor.id}>{sponsor.name}</SelectItem>)}</SelectContent></Select></FormField> : <FormField label="Linked portal form (optional)"><Select value={linkedFormId} onValueChange={setLinkedFormId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No form linked</SelectItem>{forms.map((form) => <SelectItem key={form.id} value={form.id}>{form.name}</SelectItem>)}</SelectContent></Select></FormField>}
        </div>
        <FormField label="Due date (optional)"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></FormField>
      </div>
    </EditorPage>
  );
}
