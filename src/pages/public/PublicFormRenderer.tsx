import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { DynamicFormRenderer, isFieldVisible, type DynamicField } from "@/components/shared/DynamicFormRenderer";
import { ErrorList } from "@/components/shared/ErrorList";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { RichText } from "@/components/shared/RichText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicSubmissionFormConfig } from "@/data/types";
import { evaluateCrossFieldLimits } from "@/lib/form-validation";
import { AvailabilityEditor, type AvailabilityDraft } from "@/components/availability/AvailabilityEditor";
import { fieldBlocksSubmission } from "@/lib/field-answerable";
import { contrastForeground, hexToHslTriplet } from "@/lib/color";
import { emailEditable, CfpEmailVerificationPanel, useCfpEmailVerification } from "@/pages/public/CfpEmailVerification";
import { cn } from "@/lib/utils";

// The public CFP/Portal submission flow and the builder's live preview render the exact same
// wizard from the exact same PublicSubmissionFormConfig shape — one component, parameterized by
// `mode`, so the preview can never drift from what a submitter actually sees (the failure mode
// that made the old CfpPreviewPanel's hand-maintained field-type map and step list go stale).
// `mode="public"` drives the real submit, Turnstile, and email verification; `mode="preview"`
// fakes all three so the builder never makes a network call or blocks on a captcha.
export type PublicFormMode = "public" | "preview";
export type Participant = { role: string; answers: Record<string, string>; availability: AvailabilityDraft };
export type Account = { firstName: string; lastName: string; email: string };

export type PublicFormSubmitResult = { speakerId?: string };
export type EmailVerificationController = ReturnType<typeof useCfpEmailVerification>;

function dynamicType(type: string): DynamicField["type"] {
  if (type === "wysiwyg") return "textarea";
  if (type === "dropdown" || type === "multiselect") return "select";
  if (type === "email" || type === "number") return type;
  return "text";
}

function pageFields(config: PublicSubmissionFormConfig, page: PublicSubmissionFormConfig["form"]["pages"][number]) {
  const byKey = new Map(config.form.fields.map((field) => [field.key, field]));
  return page.fieldKeys.flatMap((key) => {
    const field = byKey.get(key);
    return field ? [{ id: field.key, label: field.label, type: dynamicType(field.type), required: field.required, ...(field.maxChars !== undefined ? { maxChars: field.maxChars } : {}), ...(field.options ? { options: field.options } : {}), ...(field.showIf ? { showIf: { fieldId: field.showIf.fieldKey, equals: field.showIf.equals } } : {}) }] : [];
  }) satisfies DynamicField[];
}

function Wordmark({ eventName, logoUrl }: { eventName: string; logoUrl?: string }) {
  if (logoUrl) return <img src={logoUrl} className="max-h-10 max-w-48 object-contain" alt={eventName} />;
  return (
    <span className="inline-flex items-center gap-2 text-foreground">
      <span className="text-sm font-semibold">{eventName}</span>
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
    </span>
  );
}

function ProgressBar({ step, total, sticky = true }: { step: number; total: number; sticky?: boolean }) {
  const percent = ((step + 1) / total) * 100;
  return (
    <div className={sticky ? "fixed inset-x-0 top-0 z-10 h-1 bg-background" : "sticky top-0 z-10 h-1 bg-background"}>
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
function WizardShell({ eventName, logoUrl, step, total, wide, sticky, children }: { eventName: string; logoUrl?: string; step: number; total: number; wide?: boolean; sticky?: boolean; children: ReactNode }) {
  // The real public page takes over the whole viewport (min-h-screen gives the flex column an
  // actual height to distribute, which is what makes `items-center` below center vertically);
  // the builder's preview host instead fills whatever bounded box it's placed in.
  return (
    <div className={cn("relative flex flex-col bg-background text-foreground", sticky ? "min-h-screen" : "h-full min-h-full")}>
      <ProgressBar step={step} total={total} sticky={sticky} />
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Wordmark eventName={eventName} logoUrl={logoUrl} />
        <span className="text-xs font-medium text-muted-foreground">{step + 1} / {total}</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
        <div className={wide ? "w-full max-w-2xl animate-fade-in" : "w-full max-w-lg animate-fade-in"}>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Centered single-message shell for the closed / submitted end states — same visual language, no steps. */
function MessageShell({ eventName, logoUrl, children }: { eventName: string; logoUrl?: string; children: ReactNode }) {
  // Only ever reached in "public" mode (preview never sets submitted=true) — always takes the
  // full viewport, same reasoning as WizardShell's sticky branch above.
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="px-6 py-6 sm:px-10"><Wordmark eventName={eventName} logoUrl={logoUrl} /></header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
        <div className="w-full max-w-lg space-y-4">{children}</div>
      </main>
    </div>
  );
}

// Every group used to sit inside one shared slab with space-y-1 between rows, so Account, the
// proposal and each speaker ran together as one undifferentiated column of text with no way to
// see where one ended and the next began. Each group is now a tab, so only one is on screen at
// a time and the summary stays a fixed, scannable height however much was typed.
function ReviewValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const clampable = value.length > 320;
  return (
    <dd className="mt-1 min-w-0 text-base text-foreground">
      <p className={`whitespace-pre-wrap break-words leading-relaxed${clampable && !expanded ? " line-clamp-6" : ""}`}>{value}</p>
      {clampable && (
        <Button type="button" variant="link" size="sm" onClick={() => setExpanded((current) => !current)} className="mt-1 h-auto px-0 text-sm font-medium text-muted-foreground">
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </dd>
  );
}

function ReviewPanels({ groups }: { groups: Array<{ id: string; label: string; values: Record<string, string> }> }) {
  const [active, setActive] = useState(groups[0]?.id ?? "");
  const current = groups.find((group) => group.id === active) ?? groups[0];
  if (!current) return null;
  return (
    <div className="space-y-3">
      {groups.length > 1 && (
        <SegmentedControl label="Review section" value={current.id} onChange={setActive} options={groups.map((group) => ({ value: group.id, label: group.label }))} />
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

export function usePublicFormState(config: PublicSubmissionFormConfig | null) {
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<Account>({ firstName: "", lastName: "", email: "" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<Participant[]>(
    config?.form.collectParticipants ? config.form.participantRoles.flatMap((role) => Array.from({ length: role.min ?? 0 }, () => ({ role: role.role, answers: {}, availability: { unavailable: [] } }))) : [],
  );
  return { step, setStep, account, setAccount, values, setValues, participants, setParticipants };
}

/**
 * The pages-driven wizard shared by the real public submission page (`mode="public"`) and the
 * builder's live preview (`mode="preview"`). Step 0 is always a fixed Welcome screen (not a
 * `page` — the page model has no slot for it, see design.md); every page after that is one
 * step, rendered by `kind`/`systemRole`. This is the ONLY place field rendering, the progress
 * bar, and the review summary are implemented — the builder's preview and the real page can
 * never structurally drift from each other again.
 */
export function PublicFormRenderer({
  config,
  mode,
  state,
  onSubmit,
  submitting = false,
  submitted = false,
  secondsToRedirect,
  emailVerification,
  turnstileSlot,
  errors: externalErrors,
  loadErrors,
}: {
  config: PublicSubmissionFormConfig;
  mode: PublicFormMode;
  state: ReturnType<typeof usePublicFormState>;
  /** Only called in "public" mode, on the final step's Continue press. */
  onSubmit?: () => Promise<void> | void;
  submitting?: boolean;
  submitted?: boolean;
  secondsToRedirect?: number;
  /** Real Clerk-backed verification in "public" mode; omit in "preview" (email field just stays editable, always "verified"). */
  emailVerification?: EmailVerificationController;
  /** Turnstile widget, rendered on the review step in "public" mode only. */
  turnstileSlot?: ReactNode;
  errors?: string[];
  loadErrors?: string[];
}) {
  const { step, setStep, account, setAccount, values, setValues, participants, setParticipants } = state;
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const errors = externalErrors ?? localErrors;
  const preview = mode === "preview";

  const pages = config.form.pages;
  const totalSteps = 1 + pages.length; // +1 for the fixed Welcome screen
  const activePage = step === 0 ? undefined : pages[step - 1];

  const brandingStyle = useMemo(() => {
    const accentColor = config.event.accentColor;
    const primary = accentColor ? hexToHslTriplet(accentColor) : null;
    return primary && accentColor ? { "--primary": primary, "--primary-foreground": contrastForeground(accentColor) } as CSSProperties : undefined;
  }, [config.event.accentColor]);

  const fieldsForPage = (page: PublicSubmissionFormConfig["form"]["pages"][number]) => pageFields(config, page);
  const activeFields = activePage ? fieldsForPage(activePage) : [];
  const visibleFields = activeFields.filter((field) => isFieldVisible(field, values));
  const visibleParticipantFields = (participantPage: PublicSubmissionFormConfig["form"]["pages"][number], answers: Record<string, string>) => fieldsForPage(participantPage).filter((field) => isFieldVisible(field, answers));
  const limits = useMemo(() => {
    if (!activePage || activePage.kind !== "custom") return [];
    return evaluateCrossFieldLimits(values, config.form.crossFieldLimits.filter((limit) => !limit.perParticipant).map((limit) => ({ id: limit.key, label: limit.label, fieldIds: limit.fieldKeys, maxCombinedChars: limit.maxCombinedChars, perParticipant: limit.perParticipant })));
  }, [activePage, config.form.crossFieldLimits, values]);
  const participantLimits = (participantPage: PublicSubmissionFormConfig["form"]["pages"][number]) => participants.map((participant) => ({ participant, limits: evaluateCrossFieldLimits(participant.answers, config.form.crossFieldLimits.filter((limit) => limit.perParticipant).map((limit) => ({ id: limit.key, label: limit.label, fieldIds: limit.fieldKeys, maxCombinedChars: limit.maxCombinedChars, perParticipant: limit.perParticipant }))), pageFields: fieldsForPage(participantPage) }));

  const emailValid = /^\S+@\S+\.\S+$/.test(account.email);
  const emailVerified = preview || emailVerification?.status === "verified";
  const participantCount = (role: string) => participants.filter((participant) => participant.role === role).length;
  const addParticipant = (role: string) => setParticipants((current) => [...current, { role, answers: {}, availability: { unavailable: [] } }]);
  const removeParticipant = (index: number) => setParticipants((current) => current.filter((_, participantIndex) => participantIndex !== index));
  const update = (id: string, value: string) => { setValues((current) => ({ ...current, [id]: value })); setLocalErrors([]); };
  const updateParticipant = (index: number, id: string, value: string) => { setParticipants((current) => current.map((participant, participantIndex) => participantIndex === index ? { ...participant, answers: { ...participant.answers, [id]: value } } : participant)); setLocalErrors([]); };
  const updateParticipantAvailability = (index: number, availability: AvailabilityDraft) => setParticipants((current) => current.map((participant, participantIndex) => participantIndex === index ? { ...participant, availability } : participant));

  const validate = () => {
    const nextErrors: string[] = [];
    if (activePage?.systemRole === "account") {
      if (!account.firstName.trim() || !account.lastName.trim() || !emailValid) nextErrors.push("Enter your first name, last name, and a valid email address.");
      else if (!preview && emailVerification?.status !== "verified") nextErrors.push("Verify your email address before continuing.");
    }
    if (activePage?.kind === "custom") {
      visibleFields.filter((field) => fieldBlocksSubmission(field, values[field.id])).forEach((field) => nextErrors.push(`${field.label} is required.`));
      limits.filter((limit) => !limit.valid).forEach((limit) => nextErrors.push(`${limit.label} must be ${limit.maxCombinedChars.toLocaleString()} characters or fewer.`));
    }
    if (activePage?.systemRole === "participant" && config.form.collectParticipants) {
      for (const role of config.form.participantRoles) {
        const count = participantCount(role.role);
        if (role.min !== undefined && count < role.min) nextErrors.push(`Add at least ${role.min} ${role.role} participant${role.min === 1 ? "" : "s"}.`);
        if (role.max !== undefined && count > role.max) nextErrors.push(`Add no more than ${role.max} ${role.role} participant${role.max === 1 ? "" : "s"}.`);
      }
      participants.forEach((participant, index) => {
        visibleParticipantFields(activePage, participant.answers).filter((field) => fieldBlocksSubmission(field, participant.answers[field.id])).forEach((field) => nextErrors.push(`${participant.role} ${index + 1}: ${field.label} is required.`));
      });
      participantLimits(activePage).flatMap(({ participant, limits: nextLimits }, index) => nextLimits.filter((limit) => !limit.valid).map((limit) => `${participant.role} ${index + 1}: ${limit.label} must be ${limit.maxCombinedChars.toLocaleString()} characters or fewer.`)).forEach((error) => nextErrors.push(error));
    }
    if (activePage?.systemRole === "review" && !preview && !turnstileSlot) nextErrors.push("Complete submission verification before submitting.");
    setLocalErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const next = async () => {
    if (!validate()) return;
    if (step !== totalSteps - 1) { setStep((value) => value + 1); return; }
    if (preview || !onSubmit) return;
    await onSubmit();
  };
  const back = () => { setLocalErrors([]); setStep((value) => Math.max(0, value - 1)); };

  const eventName = config.event.name;

  if (submitted) {
    return (
      <div style={brandingStyle}><MessageShell eventName={eventName} logoUrl={config.event.logoUrl}>
        <p className="text-sm font-medium text-muted-foreground">Submission received</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Thank you, {account.firstName}.</h1>
        <p className="text-sm text-muted-foreground">{config.form.successPageMessage ?? `We have received your proposal for ${config.event.name}.`}{config.form.confirmationEnabled ? ` A confirmation will be sent to ${account.email}.` : ""}</p>
        {config.form.autoRedirectToPortal && secondsToRedirect !== undefined && <p className="text-sm">Taking you to your speaker portal in {secondsToRedirect} seconds. <Link className="underline" to="/portal">Open the speaker portal now</Link>.</p>}
      </MessageShell></div>
    );
  }

  const wide = Boolean(activePage?.systemRole === "participant" || activePage?.systemRole === "review");
  const heading = step === 0 ? config.form.pageHeading
    : activePage?.systemRole === "account" ? "What should we call you?"
    : activePage?.systemRole === "participant" ? activePage.pageHeading || "Who's presenting?"
    : activePage?.systemRole === "review" ? "Review your proposal"
    : activePage?.pageHeading || "Tell us more";

  return (
    <div style={brandingStyle}><WizardShell eventName={eventName} logoUrl={config.event.logoUrl} step={step} total={totalSteps} wide={wide} sticky={mode === "public"}>
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

      {activePage?.systemRole === "account" && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="first-name">First name</Label><Input id="first-name" autoComplete="given-name" className="h-12 rounded-[10px]" value={account.firstName} onChange={(event) => setAccount((current) => ({ ...current, firstName: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="last-name">Last name</Label><Input id="last-name" autoComplete="family-name" className="h-12 rounded-[10px]" value={account.lastName} onChange={(event) => setAccount((current) => ({ ...current, lastName: event.target.value }))} /></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" className="h-12 rounded-[10px]" disabled={!preview && emailVerification ? !emailEditable(emailVerification.status) : false} value={account.email} onChange={(event) => { setAccount((current) => ({ ...current, email: event.target.value })); emailVerification?.reset(); }} />
            {!preview && <p className="text-xs text-muted-foreground">We&apos;ll send a 6-digit code to confirm this is your email before you submit.</p>}
          </div>
          {!preview && emailVerification && <CfpEmailVerificationPanel verification={emailVerification} emailValid={emailValid} />}
          {preview && <p className="text-xs text-muted-foreground">Email verification runs on the real page — skipped in preview.</p>}
        </div>
      )}

      {activePage?.kind === "custom" && (
        <div className="mt-6 space-y-5">
          <RichText className="text-sm text-muted-foreground" html={activePage.description ?? ""} />
          <DynamicFormRenderer fields={activeFields} values={values} onChange={update} />
          {limits.map((limit) => <p key={limit.id} className={limit.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{limit.label}: {limit.count.toLocaleString()} / {limit.maxCombinedChars.toLocaleString()} characters ({Math.max(0, limit.remaining).toLocaleString()} remaining)</p>)}
        </div>
      )}

      {activePage?.systemRole === "participant" && (
        <div className="mt-6 space-y-5">
          {config.form.collectParticipants ? <>
            {activePage.description?.trim() ? <RichText className="text-sm text-muted-foreground" html={activePage.description} /> : <p className="text-sm text-muted-foreground">Add the people presenting this proposal.</p>}
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
                      <DynamicFormRenderer fields={fieldsForPage(activePage)} values={participant.answers} onChange={(id, value) => updateParticipant(index, id, value)} />
                      <AvailabilityEditor startsAt={config.event.startDate} endsAt={config.event.endDate} timezone={config.event.timezone} value={participant.availability} onChange={(availability) => updateParticipantAvailability(index, availability)} idPrefix={`participant-${index}-availability`} />
                      {(participantLimits(activePage).find((entry) => entry.participant === participant)?.limits ?? []).map((limit) => <p key={limit.id} className={limit.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{limit.label}: {limit.count.toLocaleString()} / {limit.maxCombinedChars.toLocaleString()} characters ({Math.max(0, limit.remaining).toLocaleString()} remaining)</p>)}
                    </div>
                  ))}
                </section>
              );
            })}
            {!config.form.participantRoles.length && <p className="text-sm text-muted-foreground">This form does not define participant roles.</p>}
          </> : <p className="text-sm text-muted-foreground">This form does not collect participants.</p>}
        </div>
      )}

      {activePage?.systemRole === "review" && (() => {
        const submissionPages = pages.filter((page) => page.kind === "custom");
        const participantPage = pages.find((page) => page.systemRole === "participant");
        return (
          <div className="mt-6 space-y-6">
            <ReviewPanels
              groups={[
                { id: "account", label: "Account", values: { "First name": account.firstName, "Last name": account.lastName, Email: account.email } },
                ...submissionPages.map((page) => ({ id: page.id, label: page.label, values: Object.fromEntries(fieldsForPage(page).filter((field) => isFieldVisible(field, values)).map((field) => [field.label, values[field.id] ?? "—"])) })),
                ...(config.form.collectParticipants && participantPage
                  ? participants.map((participant, index) => ({
                      id: `participant-${index}`,
                      label: `${participant.role} ${participants.filter((entry, entryIndex) => entryIndex <= index && entry.role === participant.role).length}`,
                      values: Object.fromEntries(visibleParticipantFields(participantPage, participant.answers).map((field) => [field.label, participant.answers[field.id] ?? "—"])),
                    }))
                  : []),
              ]}
            />
            {turnstileSlot}
          </div>
        );
      })()}

      {(errors.length > 0 || (loadErrors?.length ?? 0) > 0) && <div className="mt-5"><ErrorList errors={[...(loadErrors ?? []), ...errors]} /></div>}

      <div className="mt-8 flex items-center gap-3">
        {step > 0 && <BackButton onClick={back} disabled={submitting} />}
        <PrimaryButton type="button" busy={submitting} disabled={submitting || (activePage?.systemRole === "review" && !preview && !emailVerified)} onClick={() => void next()}>
          {submitting ? "Submitting…" : step === totalSteps - 1 ? (preview ? "Submit (disabled in preview)" : "Submit proposal") : "Continue"}
        </PrimaryButton>
      </div>
    </WizardShell></div>
  );
}
