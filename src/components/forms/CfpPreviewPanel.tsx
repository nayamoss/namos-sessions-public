import { useEffect, useMemo, useState } from "react";
import { DynamicFormRenderer, isFieldVisible, type DynamicField } from "@/components/shared/DynamicFormRenderer";
import { AvailabilityEditor, type AvailabilityDraft } from "@/components/availability/AvailabilityEditor";
import { RichText } from "@/components/shared/RichText";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateCrossFieldLimits, type CrossFieldLimit } from "@/lib/form-validation";
import { cn } from "@/lib/utils";

// The public submitter walks these five screens (see pages/public/SubmissionPage).
// "Confirmation" is the post-submit screen; it is not a step the submitter navigates
// to, but the organizer edits its copy in the builder so the preview exposes it.
const previewSteps = ["Welcome", "Account", "Submission", "Participant", "Review", "Confirmation"] as const;
export type CfpPreviewStep = (typeof previewSteps)[number];

// Which screen the submitter is looking at while the organizer edits a given wizard
// step. Editing the welcome copy should show the welcome screen; editing routing has
// no submitter-facing surface, so it falls back to the review screen.
const stepForWizard: Record<string, CfpPreviewStep> = {
  setup: "Submission",
  welcome: "Welcome",
  abstract: "Submission",
  participants: "Participant",
  routing: "Review",
  settings: "Confirmation",
  notifications: "Confirmation",
};

export type CfpPreviewField = {
  id: string;
  recordId?: string;
  label: string;
  type: string;
  required: boolean;
  maxChars?: number;
  options?: string[];
  showIf?: { fieldId: string; equals: string };
};

export type CfpPreviewDraft = {
  eventName: string;
  eventStartDate?: number;
  eventEndDate?: number;
  timezone?: string;
  externalTitle: string;
  pageHeading: string;
  welcomeMessage: string;
  showWelcomeMessage: boolean;
  abstractSection: { title: string; pageHeading: string; description?: string };
  participantSection: { title: string; pageHeading: string; description?: string };
  abstractFields: CfpPreviewField[];
  participantFields: CfpPreviewField[];
  collectParticipants: boolean;
  roles: { role: string; min: string; max: string }[];
  closeDate: string;
  submissionLimit: boolean;
  submissionLimitValue: string;
  successMessage: string;
  confirmationEnabled: boolean;
  autoRedirectToPortal: boolean;
  crossFieldLimits: CrossFieldLimit[];
};

// Mirrors dynamicType() in SubmissionPage: the builder's field types are collapsed
// onto the handful the public renderer actually knows how to draw.
function previewType(type: string): DynamicField["type"] {
  if (type === "wysiwyg") return "textarea";
  if (type === "dropdown" || type === "multiselect") return "select";
  if (type === "email" || type === "number") return type;
  return "text";
}

// Fields are keyed by recordId when they have one, matching how the builder stores
// showIf conditions and combined-character-limit selections.
function toDynamicFields(fields: CfpPreviewField[]): DynamicField[] {
  return fields.map((field) => ({
    id: field.recordId ?? field.id,
    label: field.label.trim() || "Untitled field",
    type: previewType(field.type),
    required: field.required,
    ...(field.maxChars !== undefined ? { maxChars: field.maxChars } : {}),
    ...(field.options?.length ? { options: field.options.filter(Boolean) } : {}),
    ...(field.showIf ? { showIf: field.showIf } : {}),
  }));
}

function LimitCounters({ limits }: { limits: ReturnType<typeof evaluateCrossFieldLimits> }) {
  return <>{limits.map((limit) => (
    <p key={limit.id} className={limit.valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
      {limit.label}: {limit.count.toLocaleString()} / {limit.maxCombinedChars.toLocaleString()} characters ({Math.max(0, limit.remaining).toLocaleString()} remaining)
    </p>
  ))}</>;
}

/**
 * Live preview of the public call for proposals, rendered straight from the builder's
 * in-memory draft. Nothing here reads the saved form, so every keystroke in the wizard
 * is reflected immediately — including on a form that has never been saved.
 */
export function CfpPreviewPanel({ draft, wizardStepId }: { draft: CfpPreviewDraft; wizardStepId: string }) {
  const [step, setStep] = useState<CfpPreviewStep>("Welcome");
  const [values, setValues] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<Array<{ role: string; answers: Record<string, string>; availability: AvailabilityDraft }>>([]);
  const [account, setAccount] = useState({ name: "", email: "" });

  // Follow the organizer: moving through the wizard moves the preview to the screen
  // that step controls. They can still click a preview tab to look somewhere else.
  useEffect(() => {
    const next = stepForWizard[wizardStepId];
    if (next) setStep(next);
  }, [wizardStepId]);

  // Match the public CFP's participant model: seed each role's minimum and keep
  // entered answers while the organizer adjusts the draft around it.
  useEffect(() => {
    setParticipants((current) => draft.roles.flatMap((role) => {
      const existing = current.filter((participant) => participant.role === role.role);
      const minimum = Math.max(0, Number(role.min) || 0);
      return [...existing, ...Array.from({ length: Math.max(0, minimum - existing.length) }, () => ({
        role: role.role,
        answers: {},
        availability: { unavailable: [] },
      }))];
    }));
  }, [draft.roles]);

  const abstractFields = useMemo(() => toDynamicFields(draft.abstractFields), [draft.abstractFields]);
  const participantFields = useMemo(() => toDynamicFields(draft.participantFields), [draft.participantFields]);
  const limits = useMemo(
    () => evaluateCrossFieldLimits(values, draft.crossFieldLimits.filter((limit) => !limit.perParticipant)),
    [draft.crossFieldLimits, values],
  );
  const visibleAbstractFields = abstractFields.filter((field) => isFieldVisible(field, values));
  const visibleParticipantFields = (answers: Record<string, string>) => participantFields.filter((field) => isFieldVisible(field, answers));
  const participantCount = (role: string) => participants.filter((participant) => participant.role === role).length;
  const addParticipant = (role: string) => setParticipants((current) => [...current, { role, answers: {}, availability: { unavailable: [] } }]);
  const removeParticipant = (index: number) => setParticipants((current) => current.filter((_, participantIndex) => participantIndex !== index));

  const closeDateLabel = useMemo(() => {
    if (!draft.closeDate) return undefined;
    const timestamp = new Date(draft.closeDate).getTime();
    if (Number.isNaN(timestamp)) return undefined;
    const formatted = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(draft.timezone ? { timeZone: draft.timezone } : {}),
    }).format(timestamp);
    return `Submissions close ${formatted}${draft.submissionLimit && draft.submissionLimitValue ? `. Limit: ${draft.submissionLimitValue} per user.` : "."}`;
  }, [draft.closeDate, draft.submissionLimit, draft.submissionLimitValue, draft.timezone]);

  const heading =
    step === "Submission" ? draft.abstractSection.pageHeading || "Submission"
      : step === "Participant" ? draft.participantSection.pageHeading || "Participant"
        : step === "Welcome" ? draft.pageHeading || "Your proposal"
          : step;

  const submitterFacingIndex = previewSteps.indexOf(step);

  return (
    <section aria-label="Call for proposals preview" className={cardSurfaceClasses("muted", "flex min-w-0 flex-col gap-3 p-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Preview</h2>
        <p className="text-xs text-muted-foreground">Live — reflects unsaved edits</p>
      </div>

      <SegmentedControl
        label="Preview screen"
        value={step}
        onChange={(value) => setStep(value as CfpPreviewStep)}
        options={previewSteps.map((label) => ({ value: label, label }))}
      />

      {/* The submitter's page, at the same width the public layout gives it. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <header>
          <p className="text-sm text-muted-foreground">{draft.eventName}</p>
          <h1 className="mt-1 text-2xl font-bold">{draft.externalTitle.trim() || "Submit your proposal"}</h1>
          {closeDateLabel && <p className="mt-2 rounded-md bg-card px-3 py-2 text-sm text-muted-foreground">{closeDateLabel}</p>}
        </header>

        {step !== "Confirmation" && (
          <ol aria-label="Submission progress" className="grid grid-cols-5 gap-1 text-center text-[11px] text-muted-foreground">
            {previewSteps.slice(0, 5).map((label, index) => (
              <li key={label} className={index === submitterFacingIndex ? "rounded-md bg-card py-1.5 text-foreground" : "py-1.5"}>
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        )}

        <div className={cardSurfaceClasses("default", "p-5")}>
          {step === "Confirmation" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Submission received</p>
              <h2 className="text-xl font-bold">Thank you, Alex Rivera.</h2>
              <p className="text-sm text-muted-foreground">
                {draft.successMessage.trim() || `We have received your proposal for ${draft.eventName}.`}
                {draft.confirmationEnabled ? " A confirmation will be sent to alex@example.com." : ""}
              </p>
              {draft.autoRedirectToPortal && <p className="text-sm">Taking you to your speaker portal in 10 seconds.</p>}
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{heading}</h2>

              {step === "Welcome" && (
                <div className="mt-3 text-sm text-muted-foreground">
                  {draft.showWelcomeMessage && draft.welcomeMessage.trim()
                    ? <RichText html={draft.welcomeMessage} />
                    : <p>Please prepare your proposal before continuing.</p>}
                </div>
              )}

              {step === "Account" && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cfp-preview-name">Your name</Label>
                    <Input id="cfp-preview-name" value={account.name} onChange={(event) => setAccount((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cfp-preview-email">Email address</Label>
                    <Input id="cfp-preview-email" type="email" value={account.email} onChange={(event) => setAccount((current) => ({ ...current, email: event.target.value }))} />
                    <p className="text-xs text-muted-foreground">We'll send a 6-digit code to confirm this is your email before you submit.</p>
                  </div>
                </div>
              )}

              {step === "Submission" && (
                <div className="mt-4 space-y-4">
                  <RichText className="text-sm text-muted-foreground" html={draft.abstractSection.description ?? ""} />
                  {abstractFields.length === 0 && <p className="text-sm text-muted-foreground">No proposal fields yet. Add one and it appears here.</p>}
                  <DynamicFormRenderer fields={abstractFields} values={values} onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))} />
                  <LimitCounters limits={limits} />
                </div>
              )}

              {step === "Participant" && (
                <div className="mt-4 space-y-4">
                  {draft.collectParticipants ? (
                    <>
                      {draft.participantSection.description?.trim()
                        ? <RichText className="text-sm text-muted-foreground" html={draft.participantSection.description} />
                        : <p className="text-sm text-muted-foreground">Add the people presenting this proposal.</p>}
                      {draft.roles.length === 0 && <p className="text-sm text-muted-foreground">This form does not define participant roles.</p>}
                      {draft.roles.map((role) => (
                        <ParticipantRole
                          key={role.role}
                          role={role}
                          participants={participants}
                          fields={participantFields}
                          visibleFields={visibleParticipantFields}
                          eventStartDate={draft.eventStartDate}
                          eventEndDate={draft.eventEndDate}
                          timezone={draft.timezone}
                          onAdd={() => addParticipant(role.role)}
                          onRemove={removeParticipant}
                          onUpdate={(index, answers) => setParticipants((current) => current.map((participant, participantIndex) => participantIndex === index ? { ...participant, answers } : participant))}
                          onAvailabilityChange={(index, availability) => setParticipants((current) => current.map((participant, participantIndex) => participantIndex === index ? { ...participant, availability } : participant))}
                          count={participantCount(role.role)}
                          limits={draft.crossFieldLimits.filter((limit) => limit.perParticipant)}
                        />
                      ))}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">This form does not collect participants.</p>
                  )}
                </div>
              )}

              {step === "Review" && (
                <div className="mt-4 space-y-4 text-sm">
                  <ReviewSection title="Account" values={{ Name: account.name || "—", Email: account.email || "—" }} />
                  <ReviewSection
                    title={draft.abstractSection.title.trim() || "Submission"}
                    values={Object.fromEntries(visibleAbstractFields.map((field) => [field.label, values[field.id] || "—"]))}
                  />
                  {draft.collectParticipants && (
                    participants.map((participant, index) => (
                      <ReviewSection
                        key={`${participant.role}-${index}`}
                        title={`${draft.participantSection.title.trim() || "Participant"}: ${participant.role.trim() || "Speaker"} ${participants.filter((entry, entryIndex) => entryIndex <= index && entry.role === participant.role).length}`}
                        values={Object.fromEntries(visibleParticipantFields(participant.answers).map((field) => [field.label, participant.answers[field.id] || "—"]))}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {step !== "Confirmation" && (
          <div className="flex justify-between">
            <Button variant="outline" size="sm" disabled>Back</Button>
            <Button variant="accent" size="sm" disabled>{step === "Review" ? "Submit proposal" : "Continue"}</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function ParticipantRole({
  role,
  participants,
  fields,
  visibleFields,
  eventStartDate,
  eventEndDate,
  timezone,
  onAdd,
  onRemove,
  onUpdate,
  onAvailabilityChange,
  count,
  limits,
}: {
  role: CfpPreviewDraft["roles"][number];
  participants: Array<{ role: string; answers: Record<string, string>; availability: AvailabilityDraft }>;
  fields: DynamicField[];
  visibleFields: (answers: Record<string, string>) => DynamicField[];
  eventStartDate?: number;
  eventEndDate?: number;
  timezone?: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, answers: Record<string, string>) => void;
  onAvailabilityChange: (index: number, availability: AvailabilityDraft) => void;
  count: number;
  limits: CrossFieldLimit[];
}) {
  const minimum = Math.max(0, Number(role.min) || 0);
  const maximum = role.max.trim() ? Number(role.max) : undefined;
  const maxed = maximum !== undefined && count >= maximum;
  const label = role.role.trim() || "Speaker";

  return (
    <section className="space-y-3 rounded-md bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{label}s</h3>
          <p className="text-xs text-muted-foreground">{count}{minimum || maximum !== undefined ? ` selected${minimum ? ` · min ${minimum}` : ""}${maximum !== undefined ? ` · max ${maximum}` : ""}` : " selected"}</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={maxed} onClick={onAdd}>Add {label}</Button>
      </div>
      {participants.map((participant, index) => participant.role === role.role && (
        <div key={`${participant.role}-${index}`} className={cardSurfaceClasses("muted", "space-y-4 p-4")}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{label} {participants.filter((entry, entryIndex) => entryIndex <= index && entry.role === role.role).length}</p>
            <Button type="button" variant="ghost" size="sm" disabled={count <= minimum} onClick={() => onRemove(index)}>Remove</Button>
          </div>
          <DynamicFormRenderer fields={fields} values={participant.answers} onChange={(id, value) => onUpdate(index, { ...participant.answers, [id]: value })} />
          {eventStartDate !== undefined && eventEndDate !== undefined && <AvailabilityEditor startsAt={eventStartDate} endsAt={eventEndDate} timezone={timezone ?? "UTC"} value={participant.availability} onChange={(availability) => onAvailabilityChange(index, availability)} idPrefix={`cfp-preview-participant-${index}-availability`} />}
          <LimitCounters limits={evaluateCrossFieldLimits(participant.answers, limits)} />
        </div>
      ))}
      {participants.filter((participant) => participant.role === role.role).length === 0 && <p className="text-xs text-muted-foreground">No {label.toLowerCase()}s added yet.</p>}
    </section>
  );
}

function ReviewSection({ title, values }: { title: string; values: Record<string, string> }) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <dl className="mt-2 space-y-1 text-muted-foreground">
        {Object.entries(values).length === 0 && <div className="text-xs">Nothing collected on this screen yet.</div>}
        {Object.entries(values).map(([label, value]) => (
          <div key={label} className="grid grid-cols-[9rem_1fr] gap-3">
            <dt>{label}</dt>
            <dd className="text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
