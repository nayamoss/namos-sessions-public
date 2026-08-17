import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { GripVertical, ImageUp, Loader2, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { cardSurfaceClasses } from "@/components/ui/card";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import {
  CfpPreviewPanel,
  type CfpPreviewDraft,
} from "@/components/forms/CfpPreviewPanel";
import {
  RoutingRulesEditor,
  type RoutingFieldOption,
} from "@/components/forms/RoutingRulesEditor";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { FormField } from "@/components/shared/FormField";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ToggleField } from "@/components/shared/ToggleField";
import { WizardShell, type WizardStep } from "@/components/shared/WizardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRepo } from "@/data/repo";
import type {
  CrossFieldLimit,
  Event,
  FieldDefinition,
  Sponsor,
  SubmissionForm,
  SubmissionFormStatus,
  SubmissionRoutingRule,
  Tag,
  Track,
} from "@/data/types";
import {
  parseOptionsDraft,
  sanitizeOptionsForSave,
} from "@/lib/form-builder-options";
import { contrastForeground, hexToHslTriplet } from "@/lib/color";

type FieldType =
  | "text"
  | "wysiwyg"
  | "dropdown"
  | "multiselect"
  | "email"
  | "phone"
  | "file"
  | "date"
  | "number";
type BuilderField = {
  id: string;
  recordId?: string;
  label: string;
  type: FieldType;
  locked?: boolean;
  required: boolean;
  maxChars?: number;
  options?: string[];
  showIf?: { fieldId: string; equals: string };
};
type Role = { role: string; min: string; max: string };
type StoredForm = SubmissionForm & {
  internalName?: string;
  externalTitle?: string;
  pageHeading?: string;
  version?: number;
  kind?: "abstract" | "session";
  collectParticipants?: boolean;
  welcomeMessage?: string;
  showWelcomeMessage?: boolean;
  sections?: {
    key: "abstract" | "participant";
    title: string;
    pageHeading: string;
    description?: string;
    fieldIds: string[];
  }[];
  participantRoles?: { role: string; min?: number; max?: number }[];
  closeDate?: number;
  submissionLimit?: number;
  allowMultipleDrafts?: boolean;
  autoRedirectToPortal?: boolean;
  successPageMessage?: string;
  crossFieldLimits?: CrossFieldLimit[];
  routingRules?: SubmissionRoutingRule[];
  sendSubmitterConfirmation?: boolean;
  status?: "draft" | "open" | "closed";
  reminderEmailEnabled?: boolean;
  adminUserIds?: string[];
  notifyAdminsOnNew?: string[];
  notifyAdminsOnUpdate?: string[];
};
type StoredField = FieldDefinition & {
  locked?: boolean;
  maxChars?: number;
  options?: string[];
};

const PREVIEW_STORAGE_KEY = "namos-cfp-builder-preview";

const statusLabels: Record<SubmissionFormStatus, string> = {
  draft: "Draft — not accepting submissions",
  open: "Open — accepting submissions",
  closed: "Closed — not accepting submissions",
};

const steps: WizardStep[] = [
  { id: "setup", label: "Submission setup" },
  { id: "welcome", label: "Welcome screen" },
  { id: "appearance", label: "Appearance" },
  { id: "abstract", label: "Abstract information" },
  { id: "participants", label: "Participant information" },
  { id: "routing", label: "Routing" },
  { id: "settings", label: "Form settings" },
  { id: "notifications", label: "Notifications" },
];

const initialAbstractFields: BuilderField[] = [
  {
    id: "title",
    label: "Title",
    type: "text",
    locked: true,
    required: true,
    maxChars: 255,
  },
  {
    id: "description",
    label: "Description",
    type: "wysiwyg",
    required: true,
    maxChars: 5000,
  },
  { id: "format", label: "Format", type: "dropdown", required: false },
  { id: "tags", label: "Tags", type: "multiselect", required: false },
  { id: "track", label: "Track", type: "dropdown", required: false },
  { id: "level", label: "Level", type: "dropdown", required: false },
];
const initialParticipantFields: BuilderField[] = [
  {
    id: "first-name",
    label: "First name",
    type: "text",
    locked: true,
    required: true,
  },
  {
    id: "last-name",
    label: "Last name",
    type: "text",
    locked: true,
    required: true,
  },
  { id: "email", label: "Email", type: "email", locked: true, required: true },
  { id: "mobile-phone", label: "Mobile phone", type: "phone", required: false },
  {
    id: "biography",
    label: "Biography",
    type: "wysiwyg",
    required: false,
    maxChars: 5000,
  },
];

const defaultAbstractSection = {
  title: "Abstract information",
  pageHeading: "Tell us about your proposal",
  description:
    "<p>Tell us what your session will cover and why it matters.</p>",
};
const defaultParticipantSection = {
  title: "Participant information",
  pageHeading: "Tell us about the people presenting",
  description: "<p>Add the people presenting this proposal.</p>",
};
const defaultCrossFieldRule = {
  id: "printed-program",
  label: "Printed program block",
  maxCombinedChars: "600",
  fieldIds: ["title", "description"],
  perParticipant: false,
};

function toBuilderField(field: StoredField): BuilderField {
  return {
    id: field.id,
    recordId: field.id,
    label: field.label,
    type: field.type as FieldType,
    locked: field.locked,
    required: field.required,
    maxChars: field.maxChars,
    options: field.options,
    showIf: field.showIf,
  };
}

function FieldCheckGroup({
  legend,
  fields,
  selected,
  onToggle,
}: {
  legend: string;
  fields: BuilderField[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  if (!fields.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {legend}
      </p>
      {fields.map((field) => {
        const value = field.recordId ?? field.id;
        return (
          <div key={field.id} className="flex items-center gap-2">
            <Checkbox
              id={`crossfield-${value}`}
              checked={selected.includes(value)}
              onCheckedChange={(checked) => onToggle(value, checked === true)}
            />
            <Label
              htmlFor={`crossfield-${value}`}
              className="text-sm font-normal"
            >
              {field.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

function FieldRows({
  fields,
  setFields,
  title,
}: {
  fields: BuilderField[];
  setFields: (next: BuilderField[]) => void;
  title: string;
}) {
  const add = () =>
    setFields([
      ...fields,
      {
        id: `${title.toLowerCase()}-${Date.now()}`,
        label: "New question",
        type: "text",
        required: false,
      },
    ]);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Form questions</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what submitters should provide in this section.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          Add field
        </Button>
      </div>
      <div className="space-y-2">
        {fields.map((field, index) => {
          // A field can only depend on an already-saved dropdown sibling — the condition is an exact
          // option match, and referencing a not-yet-saved field has no stable id to point at until
          // this form is saved once. Save the source field first if it's missing from this list.
          const conditionSources = fields.filter(
            (candidate) =>
              candidate.recordId &&
              candidate.recordId !== field.recordId &&
              candidate.type === "dropdown" &&
              candidate.options?.length,
          );
          const conditionSource = conditionSources.find(
            (candidate) => candidate.recordId === field.showIf?.fieldId,
          );
          return (
            <div key={field.id} className="rounded-md bg-background p-4">
              <div className="flex flex-wrap items-center gap-3">
                <GripVertical
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-40 flex-1">
                  <Input
                    aria-label={`${field.label} label`}
                    value={field.label}
                    disabled={field.locked}
                    onChange={(event) =>
                      setFields(
                        fields.map((item, position) =>
                          position === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {field.locked
                      ? "Locked field"
                      : `${field.type}${field.maxChars ? ` · ${field.maxChars} characters` : ""}`}
                  </p>
                </div>
                <Select
                  value={field.type}
                  disabled={field.locked}
                  onValueChange={(value) =>
                    setFields(
                      fields.map((item, position) =>
                        position === index
                          ? { ...item, type: value as FieldType }
                          : item,
                      ),
                    )
                  }
                >
                  <SelectTrigger
                    className="w-36"
                    aria-label={`${field.label} type`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "text",
                      "wysiwyg",
                      "dropdown",
                      "multiselect",
                      "email",
                      "phone",
                      "file",
                      "date",
                      "number",
                    ].map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-sm">
                  <span>Required</span>
                  <Switch
                    checked={field.required}
                    onCheckedChange={(required) =>
                      setFields(
                        fields.map((item, position) =>
                          position === index ? { ...item, required } : item,
                        ),
                      )
                    }
                  />
                </label>
                {!field.locked && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${field.label}`}
                    onClick={() =>
                      setFields(
                        fields.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              {!field.locked && (
                <div className="mt-3 grid grid-cols-1 gap-3 pl-7 md:grid-cols-2">
                  <FormField label="Maximum characters">
                    <Input
                      type="number"
                      min="1"
                      value={field.maxChars ?? ""}
                      onChange={(event) =>
                        setFields(
                          fields.map((item, position) =>
                            position === index
                              ? {
                                  ...item,
                                  maxChars: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </FormField>
                  {(field.type === "dropdown" ||
                    field.type === "multiselect") && (
                    <FormField label="Options" hint="One option per line">
                      <Textarea
                        value={field.options?.join("\n") ?? ""}
                        onChange={(event) =>
                          setFields(
                            fields.map((item, position) =>
                              position === index
                                ? {
                                    ...item,
                                    options: parseOptionsDraft(
                                      event.target.value,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </FormField>
                  )}
                </div>
              )}
              {!field.locked && (
                <div className="mt-3 pl-7">
                  <FormField
                    label="Show only if"
                    hint={
                      conditionSources.length
                        ? undefined
                        : "Save this form once you've added a dropdown field to make other fields conditional on it."
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={field.showIf?.fieldId ?? "always"}
                        onValueChange={(value) =>
                          setFields(
                            fields.map((item, position) =>
                              position === index
                                ? value === "always"
                                  ? { ...item, showIf: undefined }
                                  : {
                                      ...item,
                                      showIf: {
                                        fieldId: value,
                                        equals:
                                          conditionSources.find(
                                            (candidate) =>
                                              candidate.recordId === value,
                                          )?.options?.[0] ?? "",
                                      },
                                    }
                                : item,
                            ),
                          )
                        }
                      >
                        <SelectTrigger
                          className="w-56"
                          aria-label={`${field.label} condition field`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="always">Always show</SelectItem>
                          {conditionSources.map((candidate) => (
                            <SelectItem
                              key={candidate.recordId}
                              value={candidate.recordId!}
                            >
                              {candidate.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.showIf && conditionSource && (
                        <>
                          <span className="self-center text-sm text-muted-foreground">
                            equals
                          </span>
                          <Select
                            value={field.showIf.equals}
                            onValueChange={(value) =>
                              setFields(
                                fields.map((item, position) =>
                                  position === index
                                    ? {
                                        ...item,
                                        showIf: {
                                          fieldId: item.showIf!.fieldId,
                                          equals: value,
                                        },
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <SelectTrigger
                              className="w-44"
                              aria-label={`${field.label} condition value`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {conditionSource.options!.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                  </FormField>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// A datetime-local input value is interpreted by the browser as
// LOCAL time with no timezone info. Date.prototype.toISOString() always
// returns UTC. Feeding a toISOString() string into this input silently
// re-labels a UTC instant as if it were local time — every load-then-save
// round-trip shifts closeDate by the browser's UTC offset (observed as a
// stable 4-hour drift under US Eastern Daylight Time).
function toLocalDatetimeInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function AppearanceStep({ event, onUpdate }: { event: Event; onUpdate: (patch: Partial<Event>) => Promise<void> }) {
  const repo = useRepo();
  const [logoUrl, setLogoUrl] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [colorDraft, setColorDraft] = useState(event.accentColor ?? "#0066FF");
  const validColor = HEX_COLOR.test(colorDraft) ? colorDraft : event.accentColor;
  const hsl = validColor ? hexToHslTriplet(validColor) : null;
  const previewStyle = hsl && validColor ? { "--primary": hsl, "--primary-foreground": contrastForeground(validColor) } as CSSProperties : undefined;

  useEffect(() => {
    let active = true;
    if (!event.logoStorageKey) { setLogoUrl(undefined); return; }
    void repo.files.getUrl(event.logoStorageKey).then((url) => { if (active) setLogoUrl(url ?? undefined); }).catch(() => { if (active) setLogoUrl(undefined); });
    return () => { active = false; };
  }, [event.logoStorageKey, repo]);

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadError("Couldn't upload image — try again"); return; }
    setUploading(true); setUploadError(undefined);
    try {
      const { uploadUrl } = await repo.files.generateUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "content-type": file.type }, body: file });
      if (!response.ok) throw new Error("Upload rejected");
      const { storageId } = await response.json() as { storageId?: string };
      if (!storageId) throw new Error("Missing storage id");
      await onUpdate({ logoStorageKey: storageId });
      setLogoUrl(URL.createObjectURL(file));
    } catch { setUploadError("Couldn't upload image — try again"); }
    finally { setUploading(false); }
  };
  const persistColor = () => {
    if (HEX_COLOR.test(colorDraft) && colorDraft.toLowerCase() !== event.accentColor?.toLowerCase()) void onUpdate({ accentColor: colorDraft });
  };

  return <div className="space-y-6">
    <div><h2 className="text-base font-semibold">Appearance</h2><p className="mt-1 text-sm text-muted-foreground">Add your event's logo and accent color to the submission page speakers will see.</p></div>
    <FormField label="Event logo">
      <div className="space-y-2">
        <Input id="cfp-logo-upload" type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(input) => { void uploadLogo(input.target.files?.[0]); input.currentTarget.value = ""; }} />
        <label htmlFor="cfp-logo-upload" className="relative flex min-h-24 cursor-pointer items-center justify-center rounded-md border border-dashed border-input bg-background p-4 text-sm text-muted-foreground hover:bg-muted/50">
          {logoUrl ? <img src={logoUrl} alt={`${event.name} logo`} className="max-h-10 max-w-48 object-contain" /> : <span className="flex items-center gap-2"><ImageUp className="h-4 w-4" />Drop a logo here or click to upload</span>}
          {uploading && <span className="absolute inset-0 flex items-center justify-center rounded-md bg-background/80"><Loader2 className="h-5 w-5 animate-spin" aria-label="Uploading logo" /></span>}
        </label>
        {event.logoStorageKey && <Button type="button" variant="link" size="sm" className="h-auto px-0" disabled={uploading} onClick={() => void onUpdate({ logoStorageKey: undefined }).then(() => setLogoUrl(undefined))}>Remove logo</Button>}
        {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
      </div>
    </FormField>
    <FormField label="Accent color" hint="Used for the progress bar and primary action.">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative h-10 w-10 cursor-pointer overflow-hidden rounded-md border border-input" style={{ backgroundColor: validColor ?? "#0066FF" }}><input aria-label="Choose accent color" type="color" className="absolute inset-0 cursor-pointer opacity-0" value={validColor ?? "#0066FF"} onChange={(input) => { setColorDraft(input.target.value); void onUpdate({ accentColor: input.target.value }); }} /></label>
        <Input aria-label="Accent color hex value" className="w-32 font-mono uppercase" value={colorDraft} onChange={(input) => setColorDraft(input.target.value)} onBlur={persistColor} />
        {event.accentColor && <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => { setColorDraft("#0066FF"); void onUpdate({ accentColor: undefined }); }}>Reset to default</Button>}
      </div>
    </FormField>
    <section className={cardSurfaceClasses("default", "space-y-5 p-5")} style={previewStyle} aria-label="Submission page appearance preview">
      <p className="text-sm font-medium">Live preview</p>
      <div className="space-y-5 rounded-md bg-background p-4">
        <div className="flex items-center justify-between"><div>{logoUrl ? <img src={logoUrl} alt="" className="max-h-10 max-w-40 object-contain" /> : <span className="inline-flex items-center gap-2 text-sm font-semibold">{event.name}<span className="h-1.5 w-1.5 rounded-full bg-primary" /></span>}</div><span className="text-xs text-muted-foreground">1 / 5</span></div>
        <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/5 bg-primary" /></div>
        <Button type="button" variant="accent" disabled className="h-10 rounded-[12px] px-5">Continue</Button>
      </div>
    </section>
  </div>;
}

export default function SubmissionFormBuilder() {
  const { id = "new" } = useParams();
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [event, setEvent] = useState<Event>();
  const [formId, setFormId] = useState<string | undefined>(
    id === "new" ? undefined : id,
  );
  const [version, setVersion] = useState(1);
  // Preserved verbatim from the loaded form and never edited by this wizard —
  // there is no UI for them here. Must be carried through on every save or a
  // save silently reverts an existing form to "new form" defaults: an open,
  // live form flips to draft (pulling it from the public CFP), reminder
  // emails get disabled, and admin notification recipients are wiped.
  const [existingStatus, setExistingStatus] = useState<SubmissionFormStatus>("draft");
  const [statusSaving, setStatusSaving] = useState(false);
  const [existingReminderEmailEnabled, setExistingReminderEmailEnabled] = useState(false);
  const [existingAdminUserIds, setExistingAdminUserIds] = useState<string[]>([]);
  const [existingNotifyAdminsOnNew, setExistingNotifyAdminsOnNew] = useState<string[]>([]);
  const [existingNotifyAdminsOnUpdate, setExistingNotifyAdminsOnUpdate] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [activeStep, setActiveStep] = useState(0);
  const [kind, setKind] = useState<"abstract" | "session">("abstract");
  const [collectParticipants, setCollectParticipants] = useState(true);
  const [internalName, setInternalName] = useState("New submission form");
  const [externalTitle, setExternalTitle] = useState("Submit your proposal");
  const [pageHeading, setPageHeading] = useState("Your proposal");
  const [welcomeMessage, setWelcomeMessage] = useState(
    "<p>We are excited to read your proposal.</p>",
  );
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true);
  const [abstractFields, setAbstractFields] = useState(initialAbstractFields);
  const [participantFields, setParticipantFields] = useState(
    initialParticipantFields,
  );
  const [abstractSection, setAbstractSection] = useState(
    defaultAbstractSection,
  );
  const [participantSection, setParticipantSection] = useState(
    defaultParticipantSection,
  );
  const [roles, setRoles] = useState<Role[]>([
    { role: "Speaker", min: "1", max: "5" },
  ]);
  const [closeDate, setCloseDate] = useState("");
  const [submissionLimit, setSubmissionLimit] = useState(false);
  const [submissionLimitValue, setSubmissionLimitValue] = useState("3");
  const [allowMultipleDrafts, setAllowMultipleDrafts] = useState(true);
  const [autoRedirect, setAutoRedirect] = useState(true);
  const [successMessage, setSuccessMessage] = useState(
    "Thanks — your submission has been received. You can continue in your speaker portal.",
  );
  const [crossFieldEnabled, setCrossFieldEnabled] = useState(false);
  const [crossFieldRule, setCrossFieldRule] = useState(defaultCrossFieldRule);
  const toggleCrossFieldId = useCallback(
    (id: string, checked: boolean) =>
      setCrossFieldRule((rule) => ({
        ...rule,
        fieldIds: checked
          ? [...rule.fieldIds, id]
          : rule.fieldIds.filter((item) => item !== id),
      })),
    [],
  );
  const [routingRules, setRoutingRules] = useState<SubmissionRoutingRule[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [availableTracks, setAvailableTracks] = useState<Track[]>([]);
  const [availableReviewers, setAvailableReviewers] = useState<string[]>([]);
  const [availableSponsors, setAvailableSponsors] = useState<Sponsor[]>([]);
  const [confirmationEnabled, setConfirmationEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(() => {
    try { return localStorage.getItem(PREVIEW_STORAGE_KEY) !== "false"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(PREVIEW_STORAGE_KEY, String(previewOpen)); } catch { /* the builder still works without storage */ }
  }, [previewOpen]);
  const isHeadingTooLong = pageHeading.length > 15;
  const current = steps[activeStep];
  const publicUrl = event && formId ? `/submit/${event.slug}/${formId}` : "#";
  const routingFields = useMemo<RoutingFieldOption[]>(
    () =>
      abstractFields.flatMap((field) => {
        const options = field.options?.filter(Boolean) ?? [];
        return (field.type === "dropdown" || field.type === "multiselect") &&
          options.length
          ? [{ id: field.recordId ?? field.id, label: field.label, options }]
          : [];
      }),
    [abstractFields],
  );
  const updateAppearance = useCallback(async (patch: Partial<Event>) => {
    if (!event) return;
    const nextEvent = { ...event, ...patch };
    setEvent(nextEvent);
    try {
      await repo.events.save(nextEvent);
    } catch (cause) {
      setEvent(event);
      setLoadError(cause instanceof Error ? cause.message : "Could not save appearance settings.");
      throw cause;
    }
  }, [event, repo]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const nextEvent = activeEvent;
      if (!nextEvent) {
        setEvent(undefined);
        setLoadError("Create an event before configuring a submission form.");
        return;
      }
      setEvent(nextEvent);
      const [nextTags, nextTracks, nextAssignments, nextSponsors] =
        await Promise.all([
          repo.tags.list({ eventId: nextEvent.id }),
          repo.events.listTracks({ eventId: nextEvent.id }),
          repo.evaluations.listAssignments({ eventId: nextEvent.id }),
          repo.sponsors.list({ eventId: nextEvent.id }),
        ]);
      setAvailableTags(nextTags);
      setAvailableTracks(nextTracks);
      setAvailableReviewers(
        [
          ...new Set(
            nextAssignments.map((assignment) => assignment.reviewerUserId),
          ),
        ].sort(),
      );
      setAvailableSponsors(nextSponsors);
      if (id === "new") return;
      const form = (await repo.forms.list({ eventId: nextEvent.id })).find(
        (candidate) => candidate.id === id,
      ) as StoredForm | undefined;
      if (!form) {
        setLoadError(
          "This submission form was not found for the configured event.",
        );
        return;
      }
      const fields = (await repo.forms.fields(form.id)) as StoredField[];
      const fieldsById = new Map(
        fields.map((field) => [field.id, toBuilderField(field)]),
      );
      const abstract = form.sections?.find(
        (section) => section.key === "abstract",
      );
      const participant = form.sections?.find(
        (section) => section.key === "participant",
      );
      const loadedAbstractFields =
        abstract?.fieldIds
          .map((fieldId) => fieldsById.get(fieldId))
          .filter((field): field is BuilderField => Boolean(field)) ??
        initialAbstractFields;
      const loadedParticipantFields =
        participant?.fieldIds
          .map((fieldId) => fieldsById.get(fieldId))
          .filter((field): field is BuilderField => Boolean(field)) ??
        initialParticipantFields;
      const firstLimit = form.crossFieldLimits?.[0];
      setFormId(form.id);
      setVersion(form.version ?? 1);
      setInternalName(form.internalName ?? form.name);
      setExternalTitle(form.externalTitle ?? form.name);
      setPageHeading(form.pageHeading ?? "Your proposal");
      setKind(form.kind ?? "abstract");
      setCollectParticipants(form.collectParticipants ?? true);
      setWelcomeMessage(form.welcomeMessage ?? "");
      setShowWelcomeMessage(form.showWelcomeMessage ?? true);
      setAbstractFields(loadedAbstractFields);
      setParticipantFields(loadedParticipantFields);
      setAbstractSection({
        title: abstract?.title ?? defaultAbstractSection.title,
        pageHeading:
          abstract?.pageHeading ?? defaultAbstractSection.pageHeading,
        description:
          abstract?.description ?? defaultAbstractSection.description,
      });
      setParticipantSection({
        title: participant?.title ?? defaultParticipantSection.title,
        pageHeading:
          participant?.pageHeading ?? defaultParticipantSection.pageHeading,
        description:
          participant?.description ?? defaultParticipantSection.description,
      });
      setRoles(
        form.participantRoles?.map((role) => ({
          role: role.role,
          min: String(role.min ?? 0),
          max: String(role.max ?? 1),
        })) ?? [{ role: "Speaker", min: "1", max: "5" }],
      );
      setCloseDate(form.closeDate ? toLocalDatetimeInputValue(form.closeDate) : "");
      setSubmissionLimit(typeof form.submissionLimit === "number");
      setSubmissionLimitValue(
        form.submissionLimit === undefined ? "3" : String(form.submissionLimit),
      );
      setAllowMultipleDrafts(form.allowMultipleDrafts ?? true);
      setAutoRedirect(form.autoRedirectToPortal ?? true);
      setSuccessMessage(
        form.successPageMessage ??
          "Thanks — your submission has been received. You can continue in your speaker portal.",
      );
      setCrossFieldEnabled(Boolean(firstLimit));
      setCrossFieldRule(
        firstLimit
          ? {
              id: firstLimit.id,
              label: firstLimit.label,
              maxCombinedChars: String(firstLimit.maxCombinedChars),
              fieldIds: firstLimit.fieldIds,
              perParticipant: firstLimit.perParticipant,
            }
          : defaultCrossFieldRule,
      );
      setRoutingRules(form.routingRules ?? []);
      setConfirmationEnabled(form.sendSubmitterConfirmation ?? true);
      setExistingStatus(form.status ?? "draft");
      setExistingReminderEmailEnabled(form.reminderEmailEnabled ?? false);
      setExistingAdminUserIds(form.adminUserIds ?? []);
      setExistingNotifyAdminsOnNew(form.notifyAdminsOnNew ?? []);
      setExistingNotifyAdminsOnUpdate(form.notifyAdminsOnUpdate ?? []);
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Could not load this submission form.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, id, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!event) {
      setLoadError("Create an event before saving a submission form.");
      return;
    }
    if (isHeadingTooLong) {
      setLoadError("Page heading must be 15 characters or fewer.");
      return;
    }
    const parsedSubmissionLimit = Number(submissionLimitValue);
    const parsedCrossFieldLimit = Number(crossFieldRule.maxCombinedChars);
    if (
      submissionLimit &&
      (!Number.isInteger(parsedSubmissionLimit) || parsedSubmissionLimit < 1)
    ) {
      setLoadError(
        "Form submission limit must be a whole number of at least 1.",
      );
      return;
    }
    if (
      crossFieldEnabled &&
      (!Number.isInteger(parsedCrossFieldLimit) || parsedCrossFieldLimit < 1)
    ) {
      setLoadError(
        "Maximum combined characters must be a whole number of at least 1.",
      );
      return;
    }
    if (crossFieldEnabled && crossFieldRule.fieldIds.length === 0) {
      setLoadError(
        "Choose at least one field for the combined character limit.",
      );
      return;
    }
    setSaving(true);
    setLoadError(undefined);
    try {
      const persistFields = async (fields: BuilderField[]) => {
        // Drop a dangling condition rather than send it: its source field must still be in this
        // same save (deleting the source field should silently clear anything depending on it).
        const liveRecordIds = new Set(
          fields.map((field) => field.recordId).filter(Boolean),
        );
        return Promise.all(
          fields.map(async (field) => {
            const showIf =
              field.showIf && liveRecordIds.has(field.showIf.fieldId)
                ? field.showIf
                : undefined;
            const recordId = await repo.forms.saveField({
              eventId: event.id,
              id: field.recordId,
              label: field.label.trim() || "Untitled field",
              type: field.type,
              locked: Boolean(field.locked),
              required: field.required,
              maxChars: field.maxChars,
              options: sanitizeOptionsForSave(field.options),
              showIf,
            });
            return { ...field, recordId };
          }),
        );
      };
      const [nextAbstractFields, nextParticipantFields] = await Promise.all([
        persistFields(abstractFields),
        persistFields(participantFields),
      ]);
      const nextFieldIds = new Map(
        [...nextAbstractFields, ...nextParticipantFields].flatMap((field) =>
          field.recordId
            ? [
                [field.id, field.recordId],
                [field.recordId, field.recordId],
              ]
            : [],
        ),
      );
      const persistedLimitFieldIds = crossFieldRule.fieldIds.flatMap(
        (fieldId) => nextFieldIds.get(fieldId) ?? [],
      );
      const persistedRoutingRules = routingRules.map((rule) => ({
        ...rule,
        fieldId: nextFieldIds.get(rule.fieldId) ?? rule.fieldId,
      }));
      const nextFormId = await repo.forms.save({
        id: formId,
        eventId: event.id,
        internalName: internalName.trim() || "Untitled form",
        externalTitle: externalTitle.trim() || "Submit your proposal",
        pageHeading: pageHeading.trim() || "Proposal",
        version,
        kind,
        collectParticipants,
        welcomeMessage: showWelcomeMessage ? welcomeMessage : undefined,
        showWelcomeMessage,
        sections: [
          {
            id: "abstract",
            key: "abstract",
            title: abstractSection.title.trim() || defaultAbstractSection.title,
            pageHeading:
              abstractSection.pageHeading.trim() ||
              defaultAbstractSection.pageHeading,
            description: abstractSection.description || undefined,
            fieldIds: nextAbstractFields.map((field) => field.recordId!),
          },
          {
            id: "participants",
            key: "participant",
            title:
              participantSection.title.trim() ||
              defaultParticipantSection.title,
            pageHeading:
              participantSection.pageHeading.trim() ||
              defaultParticipantSection.pageHeading,
            description: participantSection.description || undefined,
            fieldIds: collectParticipants
              ? nextParticipantFields.map((field) => field.recordId!)
              : [],
          },
        ],
        participantRoles: collectParticipants
          ? roles.map((role) => ({
              role: role.role.trim() || "Speaker",
              min: role.min ? Number(role.min) : undefined,
              max: role.max ? Number(role.max) : undefined,
            }))
          : [],
        crossFieldLimits:
          crossFieldEnabled && persistedLimitFieldIds.length
            ? [
                {
                  id: crossFieldRule.id || "printed-program",
                  label:
                    crossFieldRule.label.trim() || "Combined character limit",
                  fieldIds: persistedLimitFieldIds,
                  maxCombinedChars: parsedCrossFieldLimit,
                  perParticipant: crossFieldRule.perParticipant,
                },
              ]
            : [],
        routingRules: persistedRoutingRules,
        closeDate: closeDate ? new Date(closeDate).getTime() : undefined,
        submissionLimit: submissionLimit ? parsedSubmissionLimit : undefined,
        allowMultipleDrafts,
        autoRedirectToPortal: autoRedirect,
        successPageMessage: successMessage.trim() || undefined,
        reminderEmailEnabled: existingReminderEmailEnabled,
        adminUserIds: existingAdminUserIds,
        notifyAdminsOnNew: existingNotifyAdminsOnNew,
        notifyAdminsOnUpdate: existingNotifyAdminsOnUpdate,
        sendSubmitterConfirmation: confirmationEnabled,
        status: existingStatus,
      });
      setAbstractFields(nextAbstractFields);
      setParticipantFields(nextParticipantFields);
      setRoutingRules(persistedRoutingRules);
      setFormId(nextFormId);
      setSaved(true);
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Could not save the submission form.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Everything the public CFP renders, derived from live wizard state rather than the
  // saved record — the preview has to move on keystroke, and has to work on a form that
  // has never been saved. Field ids follow the builder's `recordId ?? id` convention so
  // conditional fields and combined-character limits resolve the same way they will
  // once persisted.
  const previewDraft = useMemo<CfpPreviewDraft>(() => ({
    eventName: event?.name ?? "Your event",
    eventStartDate: event?.startDate,
    eventEndDate: event?.endDate,
    timezone: event?.timezone,
    externalTitle,
    pageHeading,
    welcomeMessage,
    showWelcomeMessage,
    abstractSection,
    participantSection,
    abstractFields,
    participantFields,
    collectParticipants,
    roles,
    closeDate,
    submissionLimit,
    submissionLimitValue,
    successMessage,
    confirmationEnabled,
    autoRedirectToPortal: autoRedirect,
    crossFieldLimits:
      crossFieldEnabled && crossFieldRule.fieldIds.length
        ? [{
            id: crossFieldRule.id || "printed-program",
            label: crossFieldRule.label.trim() || "Combined character limit",
            fieldIds: crossFieldRule.fieldIds,
            maxCombinedChars: Number(crossFieldRule.maxCombinedChars) || 0,
            perParticipant: crossFieldRule.perParticipant,
          }]
        : [],
  }), [
    abstractFields,
    abstractSection,
    autoRedirect,
    closeDate,
    collectParticipants,
    confirmationEnabled,
    crossFieldEnabled,
    crossFieldRule,
    event,
    externalTitle,
    pageHeading,
    participantFields,
    participantSection,
    roles,
    showWelcomeMessage,
    submissionLimit,
    submissionLimitValue,
    successMessage,
    welcomeMessage,
  ]);

  // Opening the CFP is what makes the public URL reachable, so it is its own explicit
  // action rather than a side effect of Save — and it round-trips through the dedicated
  // `forms.setStatus` mutation, which never rides along with an unrelated field edit.
  const changeStatus = async (nextStatus: SubmissionFormStatus) => {
    if (!event || !formId) return;
    setStatusSaving(true);
    setLoadError(undefined);
    try {
      setExistingStatus(await repo.forms.setStatus({ id: formId, eventId: event.id, status: nextStatus }));
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Could not change this form's status.",
      );
    } finally {
      setStatusSaving(false);
    }
  };

  const headerActions = (
    <>
      <span
        className="text-xs text-muted-foreground"
        aria-label={`Form status: ${statusLabels[existingStatus]}`}
      >
        {statusLabels[existingStatus]}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!event || !formId || statusSaving}
        onClick={() => void changeStatus(existingStatus === "open" ? "closed" : "open")}
      >
        {statusSaving
          ? "Saving…"
          : existingStatus === "open"
            ? "Close submissions"
            : "Open submissions"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={previewOpen}
        onClick={() => setPreviewOpen((open) => !open)}
      >
        {previewOpen ? "Hide preview" : "Show preview"}
      </Button>
      <Button asChild variant="outline" size="sm" disabled={!event || !formId}>
        <Link to={publicUrl}>View form</Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!event || !formId}
        onClick={() =>
          navigator.clipboard?.writeText(
            `${window.location.origin}${publicUrl}`,
          )
        }
      >
        Copy link
      </Button>
      <Button
        type="button"
        variant="accent"
        size="sm"
        disabled={loading || saving}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </>
  );
  const next = () => {
    if (activeStep < steps.length - 1) setActiveStep(activeStep + 1);
    else void save();
  };
  const content = useMemo(() => {
    if (current.id === "setup")
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold">
              What are you collecting?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select the submission type for this form.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(["abstract", "session"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={cardSurfaceClasses("default", `p-5 text-left ${kind === option ? "bg-muted" : "bg-background hover:bg-muted/70"}`)}
              >
                <p className="font-semibold">
                  {option === "abstract" ? "Abstracts" : "Sessions"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {option === "abstract"
                    ? "Collect abstract submissions for review before sessions are finalized."
                    : "Collect full session proposals for your event program."}
                </p>
              </button>
            ))}
          </div>
          <ToggleField
            label="Participants"
            checked={collectParticipants}
            onCheckedChange={setCollectParticipants}
            hint="Collect speaker and participant information with each submission."
            surface
          />
        </div>
      );
    if (current.id === "welcome")
      return (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Internal form name"
              htmlFor="form-internal-name"
              hint={`${internalName.length}/255`}
            >
              <Input
                id="form-internal-name"
                maxLength={255}
                value={internalName}
                onChange={(event) => setInternalName(event.target.value)}
              />
            </FormField>
            <FormField
              label="External form title"
              htmlFor="form-external-title"
              hint={`${externalTitle.length}/255`}
            >
              <Input
                id="form-external-title"
                maxLength={255}
                value={externalTitle}
                onChange={(event) => setExternalTitle(event.target.value)}
              />
            </FormField>
          </div>
          <FormField
            label="Page heading"
            hint={`${pageHeading.length}/15 characters`}
          >
            {
              <Input
                maxLength={15}
                value={pageHeading}
                onChange={(event) => setPageHeading(event.target.value)}
              />
            }
          </FormField>
          {isHeadingTooLong && (
            <p className="text-sm text-destructive">
              Page heading must be 15 characters or fewer.
            </p>
          )}
          <ToggleField
            label="Show welcome message"
            checked={showWelcomeMessage}
            onCheckedChange={setShowWelcomeMessage}
            surface
          />
          {showWelcomeMessage && (
            <FormField label="Welcome message">
              <RichTextEditor
                value={welcomeMessage}
                onChange={setWelcomeMessage}
                placeholder="Welcome submitters…"
              />
            </FormField>
          )}
        </div>
      );
    if (current.id === "appearance" && event)
      return <AppearanceStep event={event} onUpdate={updateAppearance} />;
    if (current.id === "abstract")
      return (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Section title">
              <Input
                value={abstractSection.title}
                onChange={(event) =>
                  setAbstractSection((section) => ({
                    ...section,
                    title: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Page heading">
              <Input
                value={abstractSection.pageHeading}
                onChange={(event) =>
                  setAbstractSection((section) => ({
                    ...section,
                    pageHeading: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>
          <FormField label="Description & instructions">
            <RichTextEditor
              value={abstractSection.description}
              onChange={(description) =>
                setAbstractSection((section) => ({ ...section, description }))
              }
            />
          </FormField>
          <FieldRows
            title="Abstract"
            fields={abstractFields}
            setFields={setAbstractFields}
          />
        </div>
      );
    if (current.id === "participants")
      return (
        <div className="space-y-6">
          {!collectParticipants ? (
            <p className="text-sm text-muted-foreground">
              Participants are disabled. Turn them on in Submission setup to
              collect speaker information.
            </p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Section title">
                  <Input
                    value={participantSection.title}
                    onChange={(event) =>
                      setParticipantSection((section) => ({
                        ...section,
                        title: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="Page heading">
                  <Input
                    value={participantSection.pageHeading}
                    onChange={(event) =>
                      setParticipantSection((section) => ({
                        ...section,
                        pageHeading: event.target.value,
                      }))
                    }
                  />
                </FormField>
              </div>
              <FormField label="Description & instructions">
                <RichTextEditor
                  value={participantSection.description}
                  onChange={(description) =>
                    setParticipantSection((section) => ({
                      ...section,
                      description,
                    }))
                  }
                />
              </FormField>
              <div>
                <h2 className="text-base font-semibold">Participant roles</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set how many people can be attached to a submission.
                </p>
              </div>
              {roles.map((role, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-3 rounded-md bg-background p-4 md:grid-cols-[1fr_120px_120px_auto]"
                >
                  <Input
                    aria-label="Participant role"
                    value={role.role}
                    onChange={(event) =>
                      setRoles(
                        roles.map((item, position) =>
                          position === index
                            ? { ...item, role: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label="Minimum participants"
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={role.min}
                    onChange={(event) =>
                      setRoles(
                        roles.map((item, position) =>
                          position === index
                            ? { ...item, min: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label="Maximum participants"
                    type="number"
                    min="1"
                    placeholder="Max"
                    value={role.max}
                    onChange={(event) =>
                      setRoles(
                        roles.map((item, position) =>
                          position === index
                            ? { ...item, max: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove role"
                    onClick={() =>
                      setRoles(
                        roles.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRoles([
                    ...roles,
                    { role: "Co-speaker", min: "0", max: "1" },
                  ])
                }
              >
                Add role
              </Button>
              <FieldRows
                title="Participant"
                fields={participantFields}
                setFields={setParticipantFields}
              />
            </>
          )}
        </div>
      );
    if (current.id === "routing")
      return (
        <RoutingRulesEditor
          fields={routingFields}
          tags={availableTags}
          tracks={availableTracks}
          reviewers={availableReviewers}
          sponsors={availableSponsors}
          rules={routingRules}
          onChange={setRoutingRules}
        />
      );
    if (current.id === "settings")
      return (
        <div className="space-y-6">
          <FormField
            label="Close date"
            hint="Submissions are closed automatically at this date and time."
          >
            <Input
              type="datetime-local"
              value={closeDate}
              onChange={(event) => setCloseDate(event.target.value)}
            />
          </FormField>
          <ToggleField
            label="Set submission limit"
            checked={submissionLimit}
            onCheckedChange={setSubmissionLimit}
            hint="Event max: 3 applies when no form-level limit is set."
            surface
          />
          {submissionLimit && (
            <FormField label="Form submission limit">
              <Input
                type="number"
                min="1"
                value={submissionLimitValue}
                onChange={(event) =>
                  setSubmissionLimitValue(event.target.value)
                }
              />
            </FormField>
          )}
          <ToggleField
            label="Allow multiple draft submissions"
            checked={allowMultipleDrafts}
            onCheckedChange={setAllowMultipleDrafts}
            surface
          />
          <div className="space-y-4">
            <h2 className="text-base font-semibold">After submission</h2>
            <ToggleField
              label="Auto-redirect to speaker portal"
              checked={autoRedirect}
              onCheckedChange={setAutoRedirect}
              surface
              hint="Redirect after 10 seconds, while retaining a visible portal link."
            />
            <FormField label="Success page message">
              <Textarea
                value={successMessage}
                onChange={(event) => setSuccessMessage(event.target.value)}
              />
            </FormField>
          </div>
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Validation rules</h2>
            <ToggleField
              label="Cross-field character limits"
              checked={crossFieldEnabled}
              onCheckedChange={setCrossFieldEnabled}
              surface
              hint="Cap the combined length of selected text fields and show a live counter to submitters."
            />
            {crossFieldEnabled && (
              <div className="grid gap-4 rounded-md bg-background p-4 md:grid-cols-2">
                <FormField label="Rule label">
                  <Input
                    value={crossFieldRule.label}
                    onChange={(event) =>
                      setCrossFieldRule((rule) => ({
                        ...rule,
                        label: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="Maximum combined characters">
                  <Input
                    type="number"
                    min="1"
                    value={crossFieldRule.maxCombinedChars}
                    onChange={(event) =>
                      setCrossFieldRule((rule) => ({
                        ...rule,
                        maxCombinedChars: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="Fields">
                  <fieldset className="max-h-40 space-y-3 overflow-y-auto rounded-md bg-muted p-3">
                    <FieldCheckGroup
                      legend="Proposal fields"
                      fields={abstractFields}
                      selected={crossFieldRule.fieldIds}
                      onToggle={toggleCrossFieldId}
                    />
                    {crossFieldRule.perParticipant && collectParticipants && (
                      <FieldCheckGroup
                        legend="Participant fields"
                        fields={participantFields}
                        selected={crossFieldRule.fieldIds}
                        onToggle={toggleCrossFieldId}
                      />
                    )}
                  </fieldset>
                </FormField>
                <ToggleField
                  label="Apply per participant"
                  checked={crossFieldRule.perParticipant}
                  onCheckedChange={(perParticipant) =>
                    setCrossFieldRule((rule) => ({ ...rule, perParticipant }))
                  }
                  surface
                />
              </div>
            )}
          </div>
        </div>
      );
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep submitters and your program team informed.
          </p>
        </div>
        <ToggleField
          label="Send submission confirmation"
          checked={confirmationEnabled}
          onCheckedChange={setConfirmationEnabled}
          surface
          hint="Required confirmation email containing a speaker-portal link."
        />
        <ToggleField
          label="Notify admins on new submissions"
          checked={false}
          onCheckedChange={() => undefined}
          surface
          hint="Optional admin alert."
        />
        <ToggleField
          label="Notify admins on updated submissions"
          checked={false}
          onCheckedChange={() => undefined}
          surface
          hint="Optional admin alert."
        />
      </div>
    );
  }, [
    abstractFields,
    abstractSection,
    allowMultipleDrafts,
    autoRedirect,
    availableReviewers,
    availableSponsors,
    availableTags,
    availableTracks,
    closeDate,
    collectParticipants,
    confirmationEnabled,
    crossFieldEnabled,
    crossFieldRule,
    current.id,
    externalTitle,
    internalName,
    isHeadingTooLong,
    kind,
    pageHeading,
    participantFields,
    participantSection,
    roles,
    routingFields,
    routingRules,
    showWelcomeMessage,
    submissionLimit,
    submissionLimitValue,
    successMessage,
    toggleCrossFieldId,
    welcomeMessage,
    event,
    updateAppearance,
  ]);

  return (
    <AppLayout title={internalName}>
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="Submission form actions"
          utilities={headerActions}
        />
        {loadError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {loadError}
          </p>
        )}
        {saved && (
          <p role="status" className="rounded-md bg-muted px-4 py-3 text-sm">
            Changes saved for this form.
          </p>
        )}
        {loading ? (
          <SkeletonList rows={4} label="Loading submission form…" />
        ) : (
          <div
            className={
              previewOpen
                ? "grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] xl:items-start"
                : "grid gap-4"
            }
          >
            <WizardShell
              steps={steps}
              // Side by side, the wizard's own step rail would eat the width the preview
              // needs, so it stacks above the editor once the preview is showing.
              layout={previewOpen ? "stack" : "row"}
              activeStep={activeStep}
              onStepChange={setActiveStep}
              onBack={() => setActiveStep(Math.max(0, activeStep - 1))}
              onNext={next}
            >
              {content}
            </WizardShell>
            {previewOpen && (
              <div className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-hidden">
                <CfpPreviewPanel draft={previewDraft} wizardStepId={current.id} />
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
