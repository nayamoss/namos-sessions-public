import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DynamicFormRenderer, isFieldVisible, type DynamicField } from "@/components/shared/DynamicFormRenderer";
import { ErrorList } from "@/components/shared/ErrorList";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRepo, type SubmissionEditView } from "@/data/repo";
import type { SubmissionId } from "@/data/types";
import { evaluateCrossFieldLimits } from "@/lib/form-validation";
import { formatPortalDate, lockDetailCopy, relativeEditTime } from "@/lib/submission-editing";
import { PortalAccessRequired } from "./PortalPages";
import { SubmissionStatusBadge } from "@/components/shared/SubmissionStatusBadge";
import { usePortalIdentity } from "./PortalIdentity";
import { backendUnavailable } from "@/lib/backend";

const fieldType = (type: string): DynamicField["type"] => type === "wysiwyg" ? "textarea" : type === "dropdown" || type === "multiselect" ? "select" : type === "email" || type === "number" ? type : "text";

function ReadOnlyAnswers({ view, titleFieldId }: { view: SubmissionEditView; titleFieldId?: string }) {
  const values = [
    { key: "title", label: "Title", value: view.submission.title ?? "—" },
    ...view.archivedAnswers.map((answer) => ({ key: `archived-${answer.key}`, label: `Archived answer · ${answer.label}`, value: answer.value || "—" })),
    ...view.form.fields.filter((field) => field.id !== titleFieldId).map((field) => ({ key: field.id, label: field.label, value: view.answers[field.id] || "—" })),
  ];
  return <dl className="space-y-3">{values.map((item) => <div key={item.key} className="grid grid-cols-[10rem_1fr] gap-3 text-sm"><dt className="text-muted-foreground">{item.label}</dt><dd className="whitespace-pre-wrap text-foreground">{item.value}</dd></div>)}</dl>;
}

export default function PortalSubmissionEdit() {
  const { submissionId } = useParams();
  const repo = useRepo();
  const navigate = useNavigate();
  const { eventId, event, selectedSpeaker } = usePortalIdentity();
  const speakerId = selectedSpeaker?.id;
  const [view, setView] = useState<SubmissionEditView>();
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState("/portal/submissions");

  const load = useCallback(async () => {
    if (!eventId || !speakerId || !submissionId) { setLoading(false); return; }
    setLoading(true); setNotAvailable(false); setUnsupported(false); setErrors([]);
    try {
      const result = await repo.submissions.getForSpeaker({ eventId, submissionId: submissionId as SubmissionId, speakerId });
      setView(result); setTitle(result.submission.title ?? ""); setAnswers(result.answers); setDirty(false);
    } catch (cause) {
      if (backendUnavailable(cause)) setUnsupported(true);
      else if (cause instanceof Error && cause.message.includes("not available on your portal")) setNotAvailable(true);
      else setErrors([cause instanceof Error ? cause.message : "Could not load your submission."]);
    } finally { setLoading(false); }
  }, [eventId, repo, speakerId, submissionId]);
  useEffect(() => { void load(); }, [load]);

  const fields = useMemo(() => (view?.form.fields ?? []).map((field) => ({ id: field.id, label: field.label, type: fieldType(field.type), required: field.required, maxChars: field.maxChars, options: field.options, showIf: field.showIf })) satisfies DynamicField[], [view]);
  const titleField = fields.find((field) => /title|session/i.test(field.label)) ?? fields[0];
  const rendererFields = titleField ? fields.filter((field) => field.id !== titleField.id) : fields;
  const limits = useMemo(() => evaluateCrossFieldLimits(answers, view?.form.crossFieldLimits ?? []), [answers, view]);
  const timezone = event?.timezone ?? "UTC";

  const changeTitle = (value: string) => {
    setTitle(value);
    if (titleField) setAnswers((current) => ({ ...current, [titleField.id]: value }));
    setDirty(true); setErrors([]); setSaved(false);
  };
  const changeAnswer = (id: string, value: string) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setDirty(true); setErrors([]); setSaved(false);
  };

  const clientErrors = (submit: boolean) => {
    if (!view) return [];
    const requireRequired = view.submission.status !== "draft" || submit;
    const next: string[] = [];
    if (requireRequired && !title.trim()) next.push("A submission title is required.");
    for (const field of rendererFields) {
      const value = answers[field.id] ?? "";
      if (requireRequired && isFieldVisible(field, answers) && field.required && !value.trim()) next.push(`${field.label} is required.`);
      if (field.maxChars !== undefined && value.length > field.maxChars) next.push(`${field.label} exceeds its character limit.`);
    }
    limits.filter((limit) => !limit.valid).forEach((limit) => next.push(`${limit.label} must be ${limit.maxCombinedChars.toLocaleString()} characters or fewer.`));
    return [...new Set(next)];
  };

  const save = async (submit: boolean) => {
    if (!view || !eventId || !speakerId || !submissionId) return;
    const nextErrors = clientErrors(submit);
    if (nextErrors.length) { setErrors(nextErrors); return; }
    setSaving(true); setErrors([]); setSaved(false);
    try {
      const result = await repo.submissions.updateBySpeaker({ eventId, submissionId: submissionId as SubmissionId, speakerId, title, answers, submit });
      setView((current) => current ? { ...current, submission: { ...current.submission, title: title.trim(), status: result.status, updatedAt: result.updatedAt, lastSpeakerEditAt: result.lastSpeakerEditAt, speakerEditCount: result.speakerEditCount }, editability: { editable: true, mode: result.status === "draft" ? "draft" : "submitted" } } : current);
      setDirty(false); setSaved(true);
    } catch (cause) {
      setErrors([cause instanceof Error ? cause.message : "Could not save your submission."]);
    } finally { setSaving(false); }
  };

  const requestLeave = (path: string) => {
    if (!dirty) { navigate(path); return; }
    setPendingPath(path); setDiscardOpen(true);
  };
  useEffect(() => {
    if (!dirty) return;
    const guardPortalLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target || event.defaultPrevented) return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin || next.pathname === window.location.pathname) return;
      event.preventDefault(); setPendingPath(`${next.pathname}${next.search}${next.hash}`); setDiscardOpen(true);
    };
    document.addEventListener("click", guardPortalLink, true);
    return () => document.removeEventListener("click", guardPortalLink, true);
  }, [dirty]);

  if (!eventId || !selectedSpeaker) return <PortalAccessRequired />;
  if (notAvailable) return <div className="space-y-4"><section className="rounded-lg bg-card p-8 text-center"><p className="font-medium">That submission is not available on your portal.</p><Button asChild variant="ghost" size="sm" className="mt-3"><Link to="/portal/submissions">Back to my submissions</Link></Button></section></div>;

  const readOnly = unsupported || (view ? !view.editability.editable : false);
  const context = view ? <div className="min-w-0"><p className="truncate text-sm font-medium">{view.submission.title}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><SubmissionStatusBadge status={view.submission.status} />{view.submission.updatedAt && <span>Updated {formatPortalDate(view.submission.updatedAt, timezone)}</span>}{view.submission.lastSpeakerEditAt && <span>· Edited {relativeEditTime(view.submission.lastSpeakerEditAt)}</span>}</div></div> : <span />;
  const toolbar = <ContentToolbar ariaLabel="Submission editing actions" search={context} utilities={!loading && !readOnly ? <><Button type="button" variant="ghost" size="sm" onClick={() => requestLeave("/portal/submissions")}>Cancel</Button>{view?.editability.editable && view.editability.mode === "draft" && <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void save(false)}>Save draft</Button>}</> : undefined} primaryAction={!loading && (readOnly ? <Button asChild variant="ghost" size="sm"><Link to="/portal/submissions">Back to my submissions</Link></Button> : view ? <Button type="button" variant="accent" size="sm" disabled={saving} onClick={() => void save(view.editability.editable && view.editability.mode === "draft")}>{saving ? "Saving…" : view.editability.editable && view.editability.mode === "draft" ? "Submit proposal" : "Save changes"}</Button> : undefined)} />;

  const lockedEditability = view?.editability && "reason" in view.editability ? view.editability : undefined;
  return <div className="space-y-4">{toolbar}{saved && <p role="status" className="rounded-md bg-muted px-4 py-3 text-sm">Your changes were saved.</p>}{unsupported && <p className="rounded-md bg-muted px-4 py-3 text-sm">Editing is not available on this backend. You can still read your submission here.</p>}{lockedEditability && <p className="rounded-md bg-muted px-4 py-3 text-sm">{lockDetailCopy(lockedEditability, timezone)}</p>}{loading ? <SkeletonList rows={4} label="Loading your submission…" /> : view ? <section className="space-y-5 rounded-lg bg-card p-6"><div><h2 className="text-base font-semibold">{view.form.sectionTitle}</h2>{view.form.description && <p className="mt-1 text-sm text-muted-foreground">{view.form.description.replace(/<[^>]*>/g, "")}</p>}</div>{readOnly ? <ReadOnlyAnswers view={{ ...view, submission: { ...view.submission, title }, answers }} titleFieldId={titleField?.id} /> : <><div className="space-y-2"><Label htmlFor="submission-title">Title <span aria-hidden="true">*</span></Label><Input id="submission-title" value={title} maxLength={titleField?.maxChars} onChange={(event) => changeTitle(event.target.value)} />{titleField?.maxChars !== undefined && <p className="text-right text-xs text-muted-foreground">{title.length} / {titleField.maxChars}</p>}</div>{view.archivedAnswers.length > 0 && <div className="rounded-md bg-muted p-4"><p className="text-sm font-medium">Archived answers</p><dl className="mt-3 space-y-3">{view.archivedAnswers.map((answer) => <div key={answer.key} className="grid grid-cols-[10rem_1fr] gap-3 text-sm"><dt className="text-muted-foreground">{answer.label}</dt><dd className="whitespace-pre-wrap">{answer.value || "—"}</dd></div>)}</dl></div>}<DynamicFormRenderer fields={rendererFields} values={answers} onChange={changeAnswer} />{limits.map((limit) => <p key={limit.id} className={limit.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{limit.label}: {limit.count.toLocaleString()} / {limit.maxCombinedChars.toLocaleString()} characters ({Math.max(0, limit.remaining).toLocaleString()} remaining)</p>)}{view.submission.status === "withdrawn" && <p className="rounded-md bg-muted p-3 text-sm">This proposal is withdrawn. Editing it does not resubmit it.</p>}</>}<p className="text-sm text-muted-foreground">Co-presenters and availability are managed on their own portal pages. Update your <Link to="/portal/profile" className="underline underline-offset-4">profile</Link> or <Link to="/portal/availability" className="underline underline-offset-4">availability</Link>.</p>{lockedEditability?.reason === "decision_recorded" && <p className="text-sm text-muted-foreground">Continue with your <Link to="/portal/profile" className="underline underline-offset-4">speaker profile</Link> or <Link to="/portal/tasks" className="underline underline-offset-4">speaker tasks</Link>.</p>}{errors.length > 0 && <ErrorList errors={errors} />}</section> : unsupported ? <section className="rounded-lg bg-card p-8 text-center"><p className="font-medium">Editing is not available on this backend.</p></section> : errors.length > 0 ? <ErrorList errors={errors} /> : null}<AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard your changes?</AlertDialogTitle><AlertDialogDescription>You have unsaved edits to this proposal.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className={buttonVariants({ variant: "ghost" })}>Keep editing</AlertDialogCancel><AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => { setDirty(false); setDiscardOpen(false); navigate(pendingPath); }}>Discard</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
