import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DynamicFormRenderer, type DynamicField } from "@/components/shared/DynamicFormRenderer";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/data/repo";
import { usePortalIdentity } from "./PortalIdentity";

const fieldType = (type: string): DynamicField["type"] => type === "wysiwyg" ? "textarea" : type === "dropdown" || type === "multiselect" ? "select" : type === "email" || type === "number" ? type : "text";

export default function PortalTaskFormPage({ formId }: { formId: string }) {
  const repo = useRepo(); const { eventId, selectedSpeaker } = usePortalIdentity(); const [params] = useSearchParams(); const taskId = params.get("task") ?? undefined;
  const [form, setForm] = useState<{ title: string; sectionTitle: string; description?: string; fields: DynamicField[] }>(); const [answers, setAnswers] = useState<Record<string, string>>({}); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string>(); const [error, setError] = useState<string>();
  const load = useCallback(async () => { if (!eventId || !selectedSpeaker) { setLoading(false); return; } setLoading(true); try { const result = await repo.portalForms.get({ eventId, formId, speakerId: selectedSpeaker.id }); setForm({ ...result, fields: result.fields.map(field => ({ id: field.id, label: field.label, type: fieldType(field.type), required: field.required, maxChars: field.maxChars, options: field.options, showIf: field.showIf })) }); setAnswers(result.answers); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this portal form."); } finally { setLoading(false); } }, [eventId, formId, repo, selectedSpeaker]);
  useEffect(() => { void load(); }, [load]);
  // Confirmation email is fired server-side by the submit mutation itself (convex/portalFormResponses.ts
  // schedules convex/portalFormConfirmationActions.ts) — no separate client call needed anymore.
  const submit = async () => { if (!eventId || !selectedSpeaker) return; setSaving(true); setError(undefined); try { await repo.portalForms.submit({ eventId, formId, speakerId: selectedSpeaker.id, taskId, answers }); setMessage(taskId ? "Form saved and task completed." : "Form saved."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this form."); } finally { setSaving(false); } };
  if (!eventId || !selectedSpeaker) return <section className={cardSurfaceClasses("default", "p-6")}><p className="font-semibold">Choose a speaker to continue</p></section>;
  return <div className="space-y-6"><div><Link to="/portal" className="text-sm underline">Back to tasks</Link><h1 className="mt-3 text-2xl font-bold">{form?.title ?? "Portal form"}</h1></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="rounded-md bg-muted p-3 text-sm">{message}</p>}{loading ? <SkeletonList rows={3} label="Loading form…" /> : form && <section className={cardSurfaceClasses("default", "space-y-5 p-6")}><div><h2 className="font-semibold">{form.sectionTitle}</h2>{form.description && <p className="mt-1 text-sm text-muted-foreground">{stripHtmlTags(form.description)}</p>}</div><DynamicFormRenderer fields={form.fields} values={answers} onChange={(id, value) => setAnswers(current => ({ ...current, [id]: value }))} /><div className="flex justify-end"><Button variant="accent" disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : "Save form"}</Button></div></section>}</div>;
}
import { cardSurfaceClasses } from "@/components/ui/card";
import { stripHtmlTags } from "@/lib/strip-html";
