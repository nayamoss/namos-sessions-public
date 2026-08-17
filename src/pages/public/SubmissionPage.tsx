import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { DynamicFormRenderer, isFieldVisible, type DynamicField } from "@/components/shared/DynamicFormRenderer";
import { ErrorList } from "@/components/shared/ErrorList";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { RichText } from "@/components/shared/RichText";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRepo } from "@/data/repo";
import type { PublicSubmissionFormConfig } from "@/data/types";
import { evaluateCrossFieldLimits } from "@/lib/form-validation";
import { storePortalHandoffSpeaker } from "@/lib/portal-handoff";
import { AvailabilityEditor, type AvailabilityDraft } from "@/components/availability/AvailabilityEditor";
import { publicSubmissionErrorMessage } from "@/lib/public-submission-error";
import { fieldBlocksSubmission } from "@/lib/field-answerable";
import { emailEditable, CfpEmailVerificationPanel, useCfpEmailVerification } from "@/pages/public/CfpEmailVerification";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { preloadTurnstile } from "@/lib/turnstile";
import { track } from "@/lib/analytics";

// Visual language deliberately mirrors /onboarding (OnboardingWizard.tsx): one focused question
// per screen, a thin top progress bar instead of a step-name tracker, a big heading, and pill
// buttons. Naya asked for the submission page to look like onboarding rather than the boxed,
// small-step-tracker card it shipped with — this is that redesign. All step logic, validation,
// and data shape below are unchanged from the current shipped version; only the shell changed.
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

function Wordmark({ eventName }: { eventName: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-foreground">
      <span className="text-sm font-semibold">{eventName}</span>
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
    </span>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const percent = ((step + 1) / total) * 100;
  return (
    <div className="fixed inset-x-0 top-0 z-10 h-1 bg-background">
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%` }}
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Step ${step + 1} of ${total}`}
      />
    </div>
  );
}

function PrimaryButton({ children, onClick, type = "button", busy, disabled }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; busy?: boolean; disabled?: boolean }) {
  return (
    <Button type={type} variant="accent" onClick={onClick} disabled={disabled || busy} className="h-11 gap-2 rounded-[12px] px-6">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
      {!busy && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={disabled} className="h-11 rounded-[12px] px-6">
      Back
    </Button>
  );
}

/** Full-bleed wizard shell shared by every step, matching /onboarding's OnboardingWizard shell. */
function WizardShell({ eventName, step, total, wide, children }: { eventName: string; step: number; total: number; wide?: boolean; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <ProgressBar step={step} total={total} />
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Wordmark eventName={eventName} />
        <span className="text-xs font-medium text-muted-foreground">{step + 1} / {total}</span>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pb-28 pt-6 sm:px-10">
        <div className={wide ? "w-full max-w-2xl animate-fade-in" : "w-full max-w-lg animate-fade-in"}>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Centered single-message shell for the closed / submitted end states — same visual language, no steps. */
function MessageShell({ eventName, children }: { eventName: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="px-6 py-6 sm:px-10"><Wordmark eventName={eventName} /></header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
        <div className="w-full max-w-lg space-y-4">{children}</div>
      </main>
    </div>
  );
}

export default function SubmissionPage() {
  const { eventSlug, formId } = useParams();
  const navigate = useNavigate();
  const repo = useRepo();
  const [config, setConfig] = useState<PublicSubmissionFormConfig | null>();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState({ firstName: "", lastName: "", email: "" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [seconds, setSeconds] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
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
  const handleTurnstileToken = useCallback((token: string | null) => setTurnstileToken(token), []);
  // The organizer controls field labels, so “Abstract” is not a stable machine identifier.
  // Tell the server which public field is the body by its opaque key; prefer rich text and
  // otherwise use the first non-title proposal field.
  const abstractField = abstractFields.find((field) => field.id !== titleField?.id && field.type === "textarea")
    ?? abstractFields.find((field) => field.id !== titleField?.id);

  useEffect(() => {
    void preloadTurnstile().catch(() => undefined);
  }, []);

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
    if (step === 1 && (!account.firstName.trim() || !account.lastName.trim() || !emailValid)) nextErrors.push("Enter your first name, last name, and a valid email address.");
    else if (step === 1 && emailVerification.status !== "verified") nextErrors.push("Verify your email address before continuing.");
    if (step === 2) {
      visibleAbstractFields.filter((field) => fieldBlocksSubmission(field, values[field.id])).forEach((field) => nextErrors.push(`${field.label} is required.`));
      limits.filter((limit) => !limit.valid).forEach((limit) => nextErrors.push(`${limit.label} must be ${limit.maxCombinedChars.toLocaleString()} characters or fewer.`));
    }
    if (step === 3 && config?.form.collectParticipants) {
      for (const role of config.form.participantRoles) {
        const count = participantCount(role.role);
        if (role.min !== undefined && count < role.min) nextErrors.push(`Add at least ${role.min} ${role.role} participant${role.min === 1 ? "" : "s"}.`);
        if (role.max !== undefined && count > role.max) nextErrors.push(`Add no more than ${role.max} ${role.role} participant${role.max === 1 ? "" : "s"}.`);
      }
      participants.forEach((participant, index) => {
        visibleParticipantFields(participant.answers).filter((field) => fieldBlocksSubmission(field, participant.answers[field.id])).forEach((field) => nextErrors.push(`${participant.role} ${index + 1}: ${field.label} is required.`));
      });
      participantLimits.flatMap(({ participant, limits: nextLimits }, index) => nextLimits.filter((limit) => !limit.valid).map((limit) => `${participant.role} ${index + 1}: ${limit.label} must be ${limit.maxCombinedChars.toLocaleString()} characters or fewer.`)).forEach((error) => nextErrors.push(error));
    }
    if (step === 4 && !turnstileToken) nextErrors.push("Complete submission verification before submitting.");
    setErrors(nextErrors);
    return nextErrors.length === 0;
  };
  const next = async () => {
    if (!config || !eventSlug || !formId || !validate()) return;
    if (step !== steps.length - 1) {
      if (step === 0) track("public_submission_started", {});
      setStep((value) => value + 1);
      return;
    }
    setSubmitting(true);
    const title = titleField ? values[titleField.id] ?? "" : "";
    // Use the Clerk-verified email, not the free-text field: a submitter who edited the input
    // after verifying (the field is disabled once verified, but this is the safety net) must
    // never be able to claim an email they didn't actually verify.
    const verifiedEmail = emailVerification.verifiedEmail ?? account.email;
    try {
      const result = await repo.publicForms.submit({ eventSlug, formId, idempotencyKey, firstName: account.firstName.trim(), lastName: account.lastName.trim(), email: verifiedEmail, title, answers: values, ...(abstractField ? { abstractFieldKey: abstractField.id } : {}), participants, turnstileToken: turnstileToken! });
      // Hand the resolved speaker to /portal before the auto-redirect fires, so the
      // speaker lands on their own record instead of a "choose a speaker" dropdown.
      if (result.speakerId) storePortalHandoffSpeaker(result.speakerId);
      setSubmitted(true);
    } catch (error) {
      setErrors([publicSubmissionErrorMessage(error)]);
      setTurnstileToken(null);
      setTurnstileResetKey((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const eventName = config?.event.name ?? "Namos Sessions";

  if (loading) {
    return (
      <MessageShell eventName="Namos Sessions">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-11 w-full rounded-[12px]" />
      </MessageShell>
    );
  }
  if (!config) {
    return (
      <MessageShell eventName="Namos Sessions">
        <h1 className="text-2xl font-semibold sm:text-3xl">Submissions are closed</h1>
        <p className="text-sm text-muted-foreground">This call for proposals is not currently accepting submissions.</p>
        {errors.length > 0 && <ErrorList errors={errors} />}
      </MessageShell>
    );
  }
  if (submitted) {
    return (
      <MessageShell eventName={eventName}>
        <p className="text-sm font-medium text-muted-foreground">Submission received</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Thank you, {account.firstName}.</h1>
        <p className="text-sm text-muted-foreground">{config.form.successPageMessage ?? `We have received your proposal for ${config.event.name}.`}{config.form.confirmationEnabled ? ` A confirmation will be sent to ${account.email}.` : ""}</p>
        {config.form.autoRedirectToPortal && <p className="text-sm">Taking you to your speaker portal in {seconds} seconds. <Link className="underline" to={portalUrl}>Open the speaker portal now</Link>.</p>}
      </MessageShell>
    );
  }

  const abstractSection = config.form.sections.find((section) => section.key === "abstract");
  const participantSection = config.form.sections.find((section) => section.key === "participant");
  const heading = step === 0 ? config.form.pageHeading
    : step === 1 ? "What should we call you?"
    : step === 2 ? abstractSection?.pageHeading ?? "What's your session about?"
    : step === 3 ? participantSection?.pageHeading ?? "Who's presenting?"
    : "Review your proposal";
  const wide = step === 3 || step === 4;
  const back = () => { setErrors([]); setStep((value) => value - 1); };

  return (
    <WizardShell eventName={eventName} step={step} total={steps.length} wide={wide}>
      <h1 className="text-2xl font-semibold sm:text-3xl">{heading}</h1>
      {config.form.closeDate && step === 0 && (
        <p className="mt-3 rounded-[10px] bg-card px-3 py-2 text-sm text-muted-foreground">
          Submissions close {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: config.event.timezone }).format(config.form.closeDate)}{config.form.submissionLimit ? `. Limit: ${config.form.submissionLimit} per user.` : "."}
        </p>
      )}

      {step === 0 && (
        <div className="mt-3 text-sm text-muted-foreground">
          {config.form.showWelcomeMessage && config.form.welcomeMessage?.trim() ? <RichText html={config.form.welcomeMessage} /> : <p>Please prepare your proposal before continuing.</p>}
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="first-name">First name</Label><Input id="first-name" autoComplete="given-name" className="h-12 rounded-[10px]" value={account.firstName} onChange={(event) => setAccount((current) => ({ ...current, firstName: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="last-name">Last name</Label><Input id="last-name" autoComplete="family-name" className="h-12 rounded-[10px]" value={account.lastName} onChange={(event) => setAccount((current) => ({ ...current, lastName: event.target.value }))} /></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" className="h-12 rounded-[10px]" disabled={!emailEditable(emailVerification.status)} value={account.email} onChange={(event) => { setAccount((current) => ({ ...current, email: event.target.value })); emailVerification.reset(); }} />
            <p className="text-xs text-muted-foreground">We'll send a 6-digit code to confirm this is your email before you submit.</p>
          </div>
          <CfpEmailVerificationPanel verification={emailVerification} emailValid={emailValid} />
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 space-y-5">
          <RichText className="text-sm text-muted-foreground" html={abstractSection?.description ?? ""} />
          <DynamicFormRenderer fields={abstractFields} values={values} onChange={update} />
          {limits.map((limit) => <p key={limit.id} className={limit.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{limit.label}: {limit.count.toLocaleString()} / {limit.maxCombinedChars.toLocaleString()} characters ({Math.max(0, limit.remaining).toLocaleString()} remaining)</p>)}
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 space-y-5">
          {config.form.collectParticipants ? <>
            {participantSection?.description?.trim() ? <RichText className="text-sm text-muted-foreground" html={participantSection.description} /> : <p className="text-sm text-muted-foreground">Add the people presenting this proposal.</p>}
            {config.form.participantRoles.map((role) => {
              const count = participantCount(role.role);
              const maxed = role.max !== undefined && count >= role.max;
              return (
                <section key={role.role} className="space-y-3 rounded-[10px] bg-muted/40 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="text-sm font-medium">{role.role}s</h3><p className="text-xs text-muted-foreground">{count}{role.min !== undefined || role.max !== undefined ? ` selected${role.min !== undefined ? ` · min ${role.min}` : ""}${role.max !== undefined ? ` · max ${role.max}` : ""}` : " selected"}</p></div>
                    <Button type="button" variant="outline" size="sm" disabled={maxed} onClick={() => addParticipant(role.role)}>Add {role.role}</Button>
                  </div>
                  {participants.map((participant, index) => participant.role === role.role && (
                    <div key={`${participant.role}-${index}`} className="space-y-4 rounded-[10px] bg-card p-4">
                      <div className="flex items-center justify-between"><p className="text-sm font-medium">{role.role} {participants.filter((entry, entryIndex) => entryIndex <= index && entry.role === role.role).length}</p><Button type="button" variant="ghost" size="sm" disabled={role.min !== undefined && count <= role.min} onClick={() => removeParticipant(index)}>Remove</Button></div>
                      <DynamicFormRenderer fields={participantFields} values={participant.answers} onChange={(id, value) => updateParticipant(index, id, value)} />
                      <AvailabilityEditor startsAt={config.event.startDate} endsAt={config.event.endDate} timezone={config.event.timezone} value={participant.availability} onChange={(availability) => updateParticipantAvailability(index, availability)} idPrefix={`participant-${index}-availability`} />
                      {(participantLimits.find((entry) => entry.participant === participant)?.limits ?? []).map((limit) => <p key={limit.id} className={limit.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{limit.label}: {limit.count.toLocaleString()} / {limit.maxCombinedChars.toLocaleString()} characters ({Math.max(0, limit.remaining).toLocaleString()} remaining)</p>)}
                    </div>
                  ))}
                </section>
              );
            })}
            {!config.form.participantRoles.length && <p className="text-sm text-muted-foreground">This form does not define participant roles.</p>}
          </> : <p className="text-sm text-muted-foreground">This form does not collect participants.</p>}
        </div>
      )}

      {step === 4 && (
        <div className="mt-6 space-y-6">
          <ReviewPanels
            groups={[
              { id: "account", label: "Account", values: { "First name": account.firstName, "Last name": account.lastName, Email: account.email } },
              { id: "submission", label: abstractSection?.title ?? "Submission", values: Object.fromEntries(visibleAbstractFields.map((field) => [field.label, values[field.id] ?? "—"])) },
              ...(config.form.collectParticipants
                ? participants.map((participant, index) => ({
                    id: `participant-${index}`,
                    label: `${participant.role} ${participants.filter((entry, entryIndex) => entryIndex <= index && entry.role === participant.role).length}`,
                    values: Object.fromEntries(visibleParticipantFields(participant.answers).map((field) => [field.label, participant.answers[field.id] ?? "—"])),
                  }))
                : []),
            ]}
          />
          <TurnstileWidget onToken={handleTurnstileToken} resetKey={turnstileResetKey} />
        </div>
      )}

      {errors.length > 0 && <div className="mt-5"><ErrorList errors={errors} /></div>}

      <div className="mt-8 flex items-center gap-3">
        {step > 0 && <BackButton onClick={back} disabled={submitting} />}
        <PrimaryButton type="button" busy={submitting} disabled={submitting || (step === steps.length - 1 && !turnstileToken)} onClick={() => void next()}>
          {submitting ? "Submitting…" : step === steps.length - 1 ? "Submit proposal" : "Continue"}
        </PrimaryButton>
      </div>
    </WizardShell>
  );
}

// The abstract field accepts up to 50,000 characters. Rendered in full on the review step that
// is a wall of text that buries the verification widget and the submit button thousands of
// pixels below the fold, and there is no way to check the rest of the summary without scrolling
// past all of it. Long values are clamped and opened on demand; short ones never show the
// control. whitespace-pre-wrap keeps the paragraph breaks the submitter typed, and break-words
// stops a single long unbroken string from pushing the grid sideways.
function ReviewValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const clampable = value.length > 320;
  return (
    <dd className="mt-1 min-w-0 text-base text-foreground">
      <p className={`whitespace-pre-wrap break-words leading-relaxed${clampable && !expanded ? " line-clamp-6" : ""}`}>{value}</p>
      {clampable && (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 h-auto px-0 text-sm font-medium text-muted-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </dd>
  );
}

// Every group used to sit inside one shared slab with space-y-1 between rows, so Account, the
// proposal and each speaker ran together as one undifferentiated column of text with no way to
// see where one ended and the next began. Each group is now a tab, so only one is on screen at
// a time and the summary stays a fixed, scannable height however much was typed.
//
// Labels sit above their values rather than in a facing column: a two-column grid put eleven
// rems of empty space between "Abstract" and its text and squeezed the paragraph into a narrow
// measure, which is exactly the combination that makes long prose hard to read. Stacked, the
// value gets the full width of the panel, and the value itself is body-sized — the whole step
// used to render at text-sm, so the content being confirmed was set smaller than body copy.
function ReviewPanels({ groups }: { groups: Array<{ id: string; label: string; values: Record<string, string> }> }) {
  const [active, setActive] = useState(groups[0]?.id ?? "");
  const current = groups.find((group) => group.id === active) ?? groups[0];
  if (!current) return null;
  return (
    <div className="space-y-3">
      {groups.length > 1 && (
        <SegmentedControl
          label="Review section"
          value={current.id}
          onChange={setActive}
          options={groups.map((group) => ({ value: group.id, label: group.label }))}
        />
      )}
      <dl className="space-y-5 rounded-[12px] bg-muted/40 p-6">
        {Object.entries(current.values).map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <ReviewValue value={value} />
          </div>
        ))}
      </dl>
    </div>
  );
}
