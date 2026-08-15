import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DynamicFormRenderer, isFieldVisible, type DynamicField } from "@/components/shared/DynamicFormRenderer";
import { ErrorList } from "@/components/shared/ErrorList";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRepo } from "@/data/repo";
import type { PublicSubmissionFormConfig } from "@/data/types";
import { evaluateCrossFieldLimits } from "@/lib/form-validation";
import { storePortalHandoffSpeaker } from "@/lib/portal-handoff";
import { AvailabilityEditor, type AvailabilityDraft } from "@/components/availability/AvailabilityEditor";
import { PublicLayout } from "@/components/PublicLayout";
import { publicSubmissionErrorMessage } from "@/lib/public-submission-error";
import { CfpEmailVerificationPanel, useCfpEmailVerification } from "@/pages/public/CfpEmailVerification";

const steps = ["Welcome", "Account", "Submission", "Participant", "Review"];
type Participant = { role: string; answers: Record<string, string>; availability: AvailabilityDraft };

function dynamicType(type: string): DynamicField["type"] {
  if (type === "wysiwyg") return "textarea";
  if (type === "dropdown" || type === "multiselect") return "select";
  if (type === "email" || type === "number") return type;
  return "text";
}

function dynamicFields(config: PublicSubmissionFormConfig | null, section: "abstract" | "participant") {
  if (!config) return [];
  const keys = config.form.sections.find((item) => item.key === section)?.fieldKeys ?? [];
  const byKey = new Map(config.form.fields.map((field) => [field.key, field]));
  return keys.flatMap((key) => {
    const field = byKey.get(key);
    return field ? [{ id: field.key, label: field.label, type: dynamicType(field.type), required: field.required, ...(field.maxChars !== undefined ? { maxChars: field.maxChars } : {}), ...(field.options ? { options: field.options } : {}), ...(field.showIf ? { showIf: { fieldId: field.showIf.fieldKey, equals: field.showIf.equals } } : {}) }] : [];
  }) satisfies DynamicField[];
}

export default function SubmissionPage() {
  const { eventSlug, formId } = useParams();
  const navigate = useNavigate();
  const repo = useRepo();
  const [config, setConfig] = useState<PublicSubmissionFormConfig | null>();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState({ name: "", email: "" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [seconds, setSeconds] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? `submission-${Date.now()}`);
  const loading = config === undefined;
  const portalUrl = "/portal";
  const abstractFields = useMemo(() => dynamicFields(config ?? null, "abstract"), [config]);
  const participantFields = useMemo(() => dynamicFields(config ?? null, "participant"), [config]);
  const visibleAbstractFields = abstractFields.filter((field) => isFieldVisible(field, values));
  const visibleParticipantFields = (answers: Record<string, string>) => participantFields.filter((field) => isFieldVisible(field, answers));
  const limits = useMemo(() => evaluateCrossFieldLimits(values, (config?.form.crossFieldLimits ?? []).filter((limit) => !limit.perParticipant).map((limit) => ({ id: limit.key, label: limit.label, fieldIds: limit.fieldKeys, maxCombinedChars: limit.maxCombinedChars, perParticipant: limit.perParticipant }))), [config, values]);
  const participantLimits = useMemo(() => participants.map((participant) => ({ participant, limits: evaluateCrossFieldLimits(participant.answers, (config?.form.crossFieldLimits ?? []).filter((limit) => limit.perParticipant).map((limit) => ({ id: limit.key, label: limit.label, fieldIds: limit.fieldKeys, maxCombinedChars: limit.maxCombinedChars, perParticipant: limit.perParticipant }))) })), [config, participants]);
  const titleField = abstractFields.find((field) => /title|session/i.test(field.label)) ?? abstractFields[0];
  const emailValid = /^\S+@\S+\.\S+$/.test(account.email);
  const emailVerification = useCfpEmailVerification(account.email);
  // The organizer controls field labels, so “Abstract” is not a stable machine identifier.
  // Tell the server which public field is the body by its opaque key; prefer rich text and
  // otherwise use the first non-title proposal field.
  const abstractField = abstractFields.find((field) => field.id !== titleField?.id && field.type === "textarea")
    ?? abstractFields.find((field) => field.id !== titleField?.id);

  useEffect(() => {
    let active = true;
    if (!eventSlug || !formId) { setConfig(null); return () => { active = false; }; }
    setConfig(undefined);
    setErrors([]);
    repo.publicForms.get(eventSlug, formId).then((next) => {
      if (active) {
        setConfig(next);
        setParticipants(next?.form.collectParticipants ? next.form.participantRoles.flatMap((role) => Array.from({ length: role.min ?? 0 }, () => ({ role: role.role, answers: {}, availability: { unavailable: [] } }))) : []);
      }
    }).catch((error) => {
      if (active) { setConfig(null); setErrors([error instanceof Error ? error.message : "This submission form could not be loaded."]); }
    });
    return () => { active = false; };
  }, [eventSlug, formId, repo]);

  useEffect(() => {
    if (!submitted || !config?.form.autoRedirectToPortal || seconds === 0) return;
    const timeout = window.setTimeout(() => setSeconds((value) => value - 1), 1_000);
    return () => window.clearTimeout(timeout);
  }, [config?.form.autoRedirectToPortal, seconds, submitted]);
  useEffect(() => { if (submitted && config?.form.autoRedirectToPortal && seconds === 0) navigate(portalUrl); }, [config?.form.autoRedirectToPortal, navigate, seconds, submitted]);

  const update = (id: string, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
    setErrors([]);
  };
  const updateParticipant = (index: number, id: string, value: string) => {
    setParticipants((current) => current.map((participant, participantIndex) => participantIndex === index ? { ...participant, answers: { ...participant.answers, [id]: value } } : participant));
    setErrors([]);
  };
  const updateParticipantAvailability = (index: number, availability: AvailabilityDraft) => setParticipants((current) => current.map((participant, participantIndex) => participantIndex === index ? { ...participant, availability } : participant));
  const participantCount = (role: string) => participants.filter((participant) => participant.role === role).length;
  const addParticipant = (role: string) => setParticipants((current) => [...current, { role, answers: {}, availability: { unavailable: [] } }]);
  const removeParticipant = (index: number) => setParticipants((current) => current.filter((_, participantIndex) => participantIndex !== index));
  const validate = () => {
    const nextErrors: string[] = [];
    if (step === 1 && (!account.name.trim() || !emailValid)) nextErrors.push("Enter your name and a valid email address.");
    else if (step === 1 && emailVerification.status !== "verified") nextErrors.push("Verify your email address before continuing.");
    if (step === 2) {
      visibleAbstractFields.filter((field) => field.required && !values[field.id]?.trim()).forEach((field) => nextErrors.push(`${field.label} is required.`));
      limits.filter((limit) => !limit.valid).forEach((limit) => nextErrors.push(`${limit.label} must be ${limit.maxCombinedChars.toLocaleString()} characters or fewer.`));
    }
    if (step === 3 && config?.form.collectParticipants) {
      for (const role of config.form.participantRoles) {
        const count = participantCount(role.role);
        if (role.min !== undefined && count < role.min) nextErrors.push(`Add at least ${role.min} ${role.role} participant${role.min === 1 ? "" : "s"}.`);
        if (role.max !== undefined && count > role.max) nextErrors.push(`Add no more than ${role.max} ${role.role} participant${role.max === 1 ? "" : "s"}.`);
      }
      participants.forEach((participant, index) => {
        visibleParticipantFields(participant.answers).filter((field) => field.required && !participant.answers[field.id]?.trim()).forEach((field) => nextErrors.push(`${participant.role} ${index + 1}: ${field.label} is required.`));
      });
      participantLimits.flatMap(({ participant, limits: nextLimits }, index) => nextLimits.filter((limit) => !limit.valid).map((limit) => `${participant.role} ${index + 1}: ${limit.label} must be ${limit.maxCombinedChars.toLocaleString()} characters or fewer.`)).forEach((error) => nextErrors.push(error));
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  };
  const next = async () => {
    if (!config || !eventSlug || !formId || !validate()) return;
    if (step !== steps.length - 1) { setStep((value) => value + 1); return; }
    setSubmitting(true);
    const title = titleField ? values[titleField.id] ?? "" : "";
    // Use the Clerk-verified email, not the free-text field: a submitter who edited the input
    // after verifying (the field is disabled once verified, but this is the safety net) must
    // never be able to claim an email they didn't actually verify.
    const verifiedEmail = emailVerification.verifiedEmail ?? account.email;
    try {
      const result = await repo.publicForms.submit({ eventSlug, formId, idempotencyKey, name: account.name, email: verifiedEmail, title, answers: values, ...(abstractField ? { abstractFieldKey: abstractField.id } : {}), participants });
      // Hand the resolved speaker to /portal before the auto-redirect fires, so the
      // speaker lands on their own record instead of a "choose a speaker" dropdown.
      if (result.speakerId) storePortalHandoffSpeaker(result.speakerId);
      setSubmitted(true);
    } catch (error) {
      setErrors([publicSubmissionErrorMessage(error)]);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PublicShell eventSlug={eventSlug}><SkeletonList rows={3} label="Loading submission form…" /></PublicShell>;
  if (!config) return <PublicShell eventSlug={eventSlug}><section className={cardSurfaceClasses("default", "p-6")}><h1 className="text-xl font-bold">Submissions are closed</h1><p className="mt-2 text-sm text-muted-foreground">This call for proposals is not currently accepting submissions.</p>{errors.length > 0 && <ErrorList errors={errors} />}</section></PublicShell>;
  if (submitted) return <PublicShell eventSlug={eventSlug}><section className={cardSurfaceClasses("default", "space-y-4 p-6")}><p className="text-sm font-medium text-muted-foreground">Submission received</p><h1 className="text-2xl font-bold">Thank you, {account.name}.</h1><p className="text-sm text-muted-foreground">{config.form.successPageMessage ?? `We have received your proposal for ${config.event.name}.`}{config.form.confirmationEnabled ? ` A confirmation will be sent to ${account.email}.` : ""}</p>{config.form.autoRedirectToPortal && <p className="text-sm">Taking you to your speaker portal in {seconds} seconds. <Link className="underline" to={portalUrl}>Open the speaker portal now</Link>.</p>}</section></PublicShell>;

  const abstractSection = config.form.sections.find((section) => section.key === "abstract");
  const participantSection = config.form.sections.find((section) => section.key === "participant");
  return <PublicShell eventSlug={eventSlug}>
    <header>
      <p className="text-sm text-muted-foreground">{config.event.name}</p><h1 className="mt-1 text-2xl font-bold">{config.form.externalTitle}</h1>
      {config.form.closeDate && <p className="mt-2 rounded-md bg-card px-3 py-2 text-sm text-muted-foreground">Submissions close {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: config.event.timezone }).format(config.form.closeDate)}{config.form.submissionLimit ? `. Limit: ${config.form.submissionLimit} per user.` : "."}</p>}
    </header>
    <ol aria-label="Submission progress" className="grid grid-cols-5 gap-1 text-center text-xs text-muted-foreground">{steps.map((label, index) => <li key={label} className={index === step ? "rounded-md bg-card py-2 text-foreground" : "py-2"}>{index + 1}. {label}</li>)}</ol>
    <section className={cardSurfaceClasses("default", "p-6")}>
      <h2 className="text-lg font-semibold">{step === 2 ? abstractSection?.pageHeading ?? steps[step] : step === 3 ? participantSection?.pageHeading ?? steps[step] : step === 0 ? config.form.pageHeading : steps[step]}</h2>
      {step === 0 && <div className="mt-3 space-y-3 text-sm text-muted-foreground"><p>{config.form.showWelcomeMessage ? config.form.welcomeMessage ?? "Please prepare your proposal before continuing." : "Please prepare your proposal before continuing."}</p></div>}
      {step === 1 && <div className="mt-4 space-y-4"><div className="space-y-2"><Label htmlFor="name">Your name</Label><Input id="name" value={account.name} onChange={(event) => setAccount((current) => ({ ...current, name: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" disabled={emailVerification.status !== "unverified" && emailVerification.status !== "error"} value={account.email} onChange={(event) => { setAccount((current) => ({ ...current, email: event.target.value })); emailVerification.reset(); }} /><p className="text-xs text-muted-foreground">We'll send a 6-digit code to confirm this is your email before you submit.</p></div><CfpEmailVerificationPanel verification={emailVerification} emailValid={emailValid} /></div>}
      {step === 2 && <div className="mt-4 space-y-4"><p className="text-sm text-muted-foreground">{abstractSection?.description}</p><DynamicFormRenderer fields={abstractFields} values={values} onChange={update} />{limits.map((limit) => <p key={limit.id} className={limit.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{limit.label}: {limit.count.toLocaleString()} / {limit.maxCombinedChars.toLocaleString()} characters ({Math.max(0, limit.remaining).toLocaleString()} remaining)</p>)}</div>}
      {step === 3 && <div className="mt-4 space-y-5">{config.form.collectParticipants ? <>
        <p className="text-sm text-muted-foreground">{participantSection?.description ?? "Add the people presenting this proposal."}</p>
        {config.form.participantRoles.map((role) => { const count = participantCount(role.role); const maxed = role.max !== undefined && count >= role.max; return <section key={role.role} className="space-y-3 rounded-md bg-background p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-medium">{role.role}s</h3><p className="text-xs text-muted-foreground">{count}{role.min !== undefined || role.max !== undefined ? ` selected${role.min !== undefined ? ` · min ${role.min}` : ""}${role.max !== undefined ? ` · max ${role.max}` : ""}` : " selected"}</p></div><Button type="button" variant="outline" size="sm" disabled={maxed} onClick={() => addParticipant(role.role)}>Add {role.role}</Button></div>{participants.map((participant, index) => participant.role === role.role && <div key={`${participant.role}-${index}`} className="space-y-4 rounded-md bg-muted/40 p-4"><div className="flex items-center justify-between"><p className="text-sm font-medium">{role.role} {participants.filter((entry, entryIndex) => entryIndex <= index && entry.role === role.role).length}</p><Button type="button" variant="ghost" size="sm" disabled={role.min !== undefined && count <= role.min} onClick={() => removeParticipant(index)}>Remove</Button></div><DynamicFormRenderer fields={participantFields} values={participant.answers} onChange={(id, value) => updateParticipant(index, id, value)} /><AvailabilityEditor startsAt={config.event.startDate} endsAt={config.event.endDate} timezone={config.event.timezone} value={participant.availability} onChange={(availability) => updateParticipantAvailability(index, availability)} idPrefix={`participant-${index}-availability`} />{(participantLimits.find((entry) => entry.participant === participant)?.limits ?? []).map((limit) => <p key={limit.id} className={limit.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{limit.label}: {limit.count.toLocaleString()} / {limit.maxCombinedChars.toLocaleString()} characters ({Math.max(0, limit.remaining).toLocaleString()} remaining)</p>)}</div>)}</section>; })}
        {!config.form.participantRoles.length && <p className="text-sm text-muted-foreground">This form does not define participant roles.</p>}
      </> : <p className="text-sm text-muted-foreground">This form does not collect participants.</p>}</div>}
      {step === 4 && <div className="mt-4 space-y-4 text-sm"><ReviewSection title="Account" values={{ Name: account.name, Email: account.email }} /><ReviewSection title={abstractSection?.title ?? "Submission"} values={Object.fromEntries(visibleAbstractFields.map((field) => [field.label, values[field.id] ?? "—"]))} />{config.form.collectParticipants && participants.map((participant, index) => <ReviewSection key={`${participant.role}-${index}`} title={`${participantSection?.title ?? "Participant"}: ${participant.role} ${participants.filter((entry, entryIndex) => entryIndex <= index && entry.role === participant.role).length}`} values={Object.fromEntries(visibleParticipantFields(participant.answers).map((field) => [field.label, participant.answers[field.id] ?? "—"]))} />)}</div>}
      {errors.length > 0 && <ErrorList errors={errors} />}
    </section>
    <footer className="flex justify-between"><Button variant="outline" size="sm" disabled={step === 0 || submitting} onClick={() => { setErrors([]); setStep((value) => value - 1); }}>Back</Button><Button variant="accent" size="sm" disabled={submitting} onClick={() => void next()}>{submitting ? "Submitting…" : step === steps.length - 1 ? "Submit proposal" : "Continue"}</Button></footer>
  </PublicShell>;
}

function PublicShell({ eventSlug, children }: { eventSlug?: string; children: React.ReactNode }) { return <PublicLayout width="submission" brandHref={`/submit/${eventSlug ?? "event"}/new`}>{children}</PublicLayout>; }
function ReviewSection({ title, values }: { title: string; values: Record<string, string> }) { return <div><h3 className="font-medium">{title}</h3><dl className="mt-2 space-y-1 text-muted-foreground">{Object.entries(values).map(([label, value]) => <div key={label} className="grid grid-cols-[10rem_1fr] gap-3"><dt>{label}</dt><dd className="text-foreground">{value}</dd></div>)}</dl></div>; }
import { cardSurfaceClasses } from "@/components/ui/card";
