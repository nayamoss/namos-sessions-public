import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, LockKeyhole, Plus, Search, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { TemplateGallery } from "@/components/forms/TemplateGallery";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { WizardShell } from "@/components/shared/WizardShell";
import { useRepo } from "@/data/repo";
import type { Event, FieldDefinition, SubmissionForm } from "@/data/types";

type PortalFormKind = "contact" | "group" | "submission_task";
type PortalField = {
  id: string;
  recordId?: string;
  label: string;
  type: "text" | "textarea" | "email" | "number" | "select";
  required?: boolean;
  maxChars?: number;
  options?: string[];
};
type PortalForm = {
  id?: string;
  name: string;
  title: string;
  kind: PortalFormKind;
  fields: PortalField[];
  sectionTitle: string;
  instructions: string;
  sendConfirmationEmail: boolean;
  confirmationBody: string;
  version: number;
};
type StoredForm = SubmissionForm & {
  internalName?: string;
  externalTitle?: string;
  kind?: PortalFormKind;
  version?: number;
  sections?: {
    key: string;
    title: string;
    description?: string;
    fieldIds: string[];
  }[];
  portalFormSettings?: {
    sendConfirmationEmail?: boolean;
    confirmationBody?: string;
  };
};
type StoredField = FieldDefinition & {
  maxChars?: number;
  options?: string[];
  locked?: boolean;
};

const kinds: PortalFormKind[] = ["contact", "group", "submission_task"];
const kindCopy: Record<PortalFormKind, { label: string; description: string }> =
  {
    contact: {
      label: "Contacts",
      description: "Collect contact information from people.",
    },
    group: {
      label: "Groups",
      description: "Collect information from sponsors and exhibitors.",
    },
    submission_task: {
      label: "Submissions",
      description: "Collect submission related information.",
    },
  };
const toDynamicType = (type: string): PortalField["type"] =>
  type === "wysiwyg"
    ? "textarea"
    : type === "dropdown" || type === "multiselect"
      ? "select"
      : type === "email" || type === "number"
        ? type
        : "text";
const toStoredType = (type: PortalField["type"]) =>
  type === "textarea" ? "wysiwyg" : type === "select" ? "dropdown" : type;
const newForm = (): PortalForm => ({
  name: "",
  title: "",
  kind: "contact",
  fields: [],
  sectionTitle: "Form questions",
  instructions: "",
  sendConfirmationEmail: true,
  confirmationBody:
    "<p>Thank you for submitting your form. Here is a link to your submission.</p>",
  version: 1,
});

function FieldLibrary({
  fields,
  onAdd,
}: {
  fields: PortalField[];
  onAdd: (field: PortalField) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = fields.filter((field) =>
    field.label.toLowerCase().includes(query.toLowerCase()),
  );
  const add = (type: PortalField["type"]) =>
    onAdd({
      id: `field-${Date.now()}`,
      label: "New field",
      type,
      required: false,
    });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus /> Add field
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        <div>
          <p className="text-sm font-medium">Add form question</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reuse a shared field or create a new one.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="muted"
            size="sm"
            onClick={() => add("text")}
          >
            Create text field
          </Button>
          <Button
            type="button"
            variant="muted"
            size="sm"
            onClick={() => add("select")}
          >
            Create dropdown
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder="Search field library"
          />
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {matches.map((field) => (
            <button
              key={field.id}
              type="button"
              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() =>
                onAdd({
                  ...field,
                  id: `field-${Date.now()}`,
                  recordId: field.recordId ?? field.id,
                })
              }
            >
              <span className="block font-medium">{field.label}</span>
              <span className="text-xs text-muted-foreground">
                {field.type}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FormEditor({
  form,
  library,
  saving,
  error,
  onSave,
  onCancel,
}: {
  form: PortalForm;
  library: PortalField[];
  saving: boolean;
  error?: string;
  onSave: (form: PortalForm) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(form);
  const [step, setStep] = useState(0);
  const update = <K extends keyof PortalForm>(key: K, value: PortalForm[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const valid = Boolean(draft.name.trim() && draft.title.trim());
  return (
    <div className="space-y-4">
      <ContentToolbar
        ariaLabel="Portal form actions"
        utilities={
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        }
        primaryAction={
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!valid || saving}
            onClick={() => onSave(draft)}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <WizardShell
        steps={[
          { id: "setup", label: "Form setup" },
          { id: "questions", label: "Form questions" },
          { id: "settings", label: "Settings" },
        ]}
        activeStep={step}
        onStepChange={setStep}
        onBack={() => setStep((current) => Math.max(0, current - 1))}
        onNext={() =>
          step < 2 ? setStep((current) => current + 1) : onSave(draft)
        }
      >
        {step === 0 ? (
          <div className="space-y-6">
            <FormField label="Name *">
              <Input
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </FormField>
            <FormField label="Title *">
              <Input
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
              />
            </FormField>
            <div className="grid gap-3 md:grid-cols-3">
              {kinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => update("kind", kind)}
                  className={
                    draft.kind === kind
                      ? cardSurfaceClasses("default", "bg-muted p-4 text-left")
                      : "rounded-lg bg-background p-4 text-left hover:bg-muted/70"
                  }
                >
                  <p className="font-semibold">{kindCopy[kind].label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {kindCopy[kind].description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : step === 1 ? (
          <div className="space-y-6">
            <FormField label="Section title">
              <Input
                value={draft.sectionTitle}
                onChange={(event) => update("sectionTitle", event.target.value)}
              />
            </FormField>
            <FormField label="Description & instructions">
              <RichTextEditor
                value={draft.instructions}
                onChange={(value) => update("instructions", value)}
              />
            </FormField>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Form questions</h2>
                <p className="text-sm text-muted-foreground">
                  Add shared fields so they stay available in both form
                  builders.
                </p>
              </div>
              <FieldLibrary
                fields={library}
                onAdd={(field) => update("fields", [...draft.fields, field])}
              />
            </div>
            <div className="space-y-3">
              {draft.fields.map((field) => (
                <div
                  key={field.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-background p-4"
                >
                  <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                  <Input
                    className="min-w-40 flex-1"
                    value={field.label}
                    onChange={(event) =>
                      update(
                        "fields",
                        draft.fields.map((item) =>
                          item.id === field.id
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <label className="flex items-center gap-2 text-sm">
                    Required{" "}
                    <Switch
                      checked={Boolean(field.required)}
                      onCheckedChange={(required) =>
                        update(
                          "fields",
                          draft.fields.map((item) =>
                            item.id === field.id ? { ...item, required } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${field.label}`}
                    onClick={() =>
                      update(
                        "fields",
                        draft.fields.filter((item) =>
                          item.id === field.id ? false : true,
                        ),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-lg bg-background p-4">
              <div>
                <p className="font-semibold">Send Confirmation Email</p>
                <p className="text-sm text-muted-foreground">
                  Send speakers a copy after they submit this form.
                </p>
              </div>
              <Switch
                checked={draft.sendConfirmationEmail}
                onCheckedChange={(value) =>
                  update("sendConfirmationEmail", value)
                }
              />
            </div>
            {draft.sendConfirmationEmail && (
              <FormField label="Confirmation email body">
                <RichTextEditor
                  value={draft.confirmationBody}
                  onChange={(value) => update("confirmationBody", value)}
                />
              </FormField>
            )}
          </div>
        )}
      </WizardShell>
    </div>
  );
}

export default function PortalForms() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [event, setEvent] = useState<Event>();
  const [forms, setForms] = useState<PortalForm[]>([]);
  const [library, setLibrary] = useState<PortalField[]>([]);
  const [tab, setTab] = useState<"all" | PortalFormKind>("all");
  const [editing, setEditing] = useState<PortalForm>();
  const [showGallery, setShowGallery] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<PortalForm>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const nextEvent = activeEvent;
      if (!nextEvent) {
        setEvent(undefined);
        setForms([]);
        setLibrary([]);
        return [];
      }
      const [storedForms, storedFields] = await Promise.all([
        repo.forms.list({ eventId: nextEvent.id }),
        repo.forms.listFields({ eventId: nextEvent.id }),
      ]);
      const byId = new Map(
        (storedFields as StoredField[]).map((field) => [
          field.id,
          {
            id: field.id,
            recordId: field.id,
            label: field.label,
            type: toDynamicType(field.type),
            required: field.required,
            maxChars: field.maxChars,
            options: field.options,
          } satisfies PortalField,
        ]),
      );
      const portalForms = (storedForms as StoredForm[])
        .filter((form) => form.kind && kinds.includes(form.kind))
        .map((form) => {
          const section = form.sections?.find((item) => item.key === "portal");
          const settings = form.portalFormSettings;
          return {
            id: form.id,
            name: form.internalName ?? form.name,
            title: form.externalTitle ?? form.name,
            kind: form.kind!,
            fields: section?.fieldIds.flatMap((id) => byId.get(id) ?? []) ?? [],
            sectionTitle: section?.title ?? "Form questions",
            instructions: section?.description ?? "",
            sendConfirmationEmail: settings?.sendConfirmationEmail ?? true,
            confirmationBody: settings?.confirmationBody ?? "",
            version: form.version ?? 1,
          };
        });
      setEvent(nextEvent);
      setForms(portalForms);
      setLibrary([...byId.values()]);
      return portalForms;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load portal forms.",
      );
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (form: PortalForm) => {
    if (!event) return;
    setSaving(true);
    setError(undefined);
    try {
      const fields = await Promise.all(
        form.fields.map(async (field) => ({
          ...field,
          recordId: await repo.forms.saveField({
            eventId: event.id,
            id: field.recordId,
            label: field.label.trim() || "Untitled field",
            type: toStoredType(field.type),
            locked: false,
            required: Boolean(field.required),
            maxChars: field.maxChars,
            options: field.options,
          }),
        })),
      );
      const id = await repo.forms.save({
        id: form.id,
        eventId: event.id,
        internalName: form.name.trim(),
        externalTitle: form.title.trim(),
        pageHeading: "Form",
        version: form.version,
        kind: form.kind,
        collectParticipants: false,
        showWelcomeMessage: false,
        sections: [
          {
            id: "portal",
            key: "portal",
            title: form.sectionTitle.trim() || "Form questions",
            pageHeading: "Form",
            description: form.instructions || undefined,
            fieldIds: fields.map((field) => field.recordId!),
          },
        ],
        participantRoles: [],
        crossFieldLimits: [],
        allowMultipleDrafts: false,
        autoRedirectToPortal: false,
        successPageMessage: undefined,
        reminderEmailEnabled: false,
        adminUserIds: [],
        notifyAdminsOnNew: [],
        notifyAdminsOnUpdate: [],
        sendSubmitterConfirmation: false,
        portalFormSettings: {
          sendConfirmationEmail: form.sendConfirmationEmail,
          confirmationBody: form.confirmationBody || undefined,
        },
        status: "open",
      });
      setEditing(undefined);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save portal form.",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!event || !deleteCandidate?.id) return;
    setSaving(true);
    try {
      await repo.forms.remove(deleteCandidate.id, event.id);
      setDeleteCandidate(undefined);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete portal form.",
      );
    } finally {
      setSaving(false);
    }
  };
  const duplicate = async (form: PortalForm) => {
    if (!event || !form.id) return;
    setSaving(true);
    try {
      await repo.forms.duplicate(form.id, event.id);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not duplicate portal form.",
      );
    } finally {
      setSaving(false);
    }
  };
  const selectTemplate = async (templateId: string) => {
    if (!event)
      throw new Error("Create an event before creating a portal form.");
    const formId = await repo.forms.createFromTemplate(templateId, event.id);
    const nextForms = await load();
    const created = nextForms?.find((form) => form.id === formId);
    if (!created)
      throw new Error("The new form was created but could not be loaded.");
    setShowGallery(false);
    setEditing(created);
  };
  const visible = useMemo(
    () => forms.filter((form) => tab === "all" || form.kind === tab),
    [forms, tab],
  );
  const counts = useMemo(
    () => ({
      all: forms.length,
      contact: forms.filter((form) => form.kind === "contact").length,
      group: forms.filter((form) => form.kind === "group").length,
      submission_task: forms.filter((form) => form.kind === "submission_task")
        .length,
    }),
    [forms],
  );
  if (editing)
    return (
      <AppLayout title={editing.id ? "Edit portal form" : "Create portal form"}>
        <FormEditor
          form={editing}
          library={library}
          saving={saving}
          error={error}
          onSave={save}
          onCancel={() => setEditing(undefined)}
        />
      </AppLayout>
    );
  if (showGallery)
    return (
      <AppLayout title="Forms">
        <TemplateGallery
          appliesTo="portal"
          onSelect={selectTemplate}
          onBlank={() => {
            setShowGallery(false);
            setEditing(newForm());
          }}
          onCancel={() => setShowGallery(false)}
        />
      </AppLayout>
    );
  return (
    <AppLayout title="Forms">
      <div className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={3} label="Loading portal forms…" />
        ) : !event ? (
          <section className={cardSurfaceClasses("default", "p-6")}>
            <p className="font-semibold">No event available</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an event before creating portal forms.
            </p>
          </section>
        ) : (
          <>
            <ContentToolbar
              ariaLabel="Portal form controls"
              utilities={
                <StatusTabs
                  ariaLabel="Portal form types"
                  value={tab}
                  onValueChange={(value) => setTab(value as "all" | PortalFormKind)}
                  tabs={[
                    { value: "all", label: "All forms", count: counts.all },
                    {
                      value: "contact",
                      label: "Contact forms",
                      count: counts.contact,
                    },
                    { value: "group", label: "Group forms", count: counts.group },
                    {
                      value: "submission_task",
                      label: "Submission forms",
                      count: counts.submission_task,
                    },
                  ]}
                />
              }
              primaryAction={
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={!event}
                  onClick={() => setShowGallery(true)}
                >
                  <Plus /> Add form
                </Button>
              }
            />
            {deleteCandidate && (
              <section className={cardSurfaceClasses("default", "bg-muted p-4")}>
                <p className="font-semibold">
                  Delete “{deleteCandidate.name}”?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the form from future portal tasks. Existing
                  responses are not deleted.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={saving}
                    onClick={() => void remove()}
                  >
                    Delete form
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteCandidate(undefined)}
                  >
                    Cancel
                  </Button>
                </div>
              </section>
            )}
            {visible.length ? (
              <div className="grid gap-4">
                {visible.map((form) => (
                  <div
                    key={form.id}
                    className={cardSurfaceClasses("default", "flex flex-wrap items-center justify-between gap-4 p-5")}
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {kindCopy[form.kind].label} · {form.fields.length}{" "}
                        question{form.fields.length === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 font-semibold">{form.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {form.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={() => void duplicate(form)}
                      >
                        <Copy /> Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(form)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${form.name}`}
                        onClick={() => setDeleteCandidate(form)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <section className={cardSurfaceClasses("default", "px-6 py-12 text-center")}>
                <p className="font-medium">No forms yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a form to collect information from participants.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
