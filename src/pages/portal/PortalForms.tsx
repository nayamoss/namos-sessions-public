import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, GripVertical, LockKeyhole, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { TemplateGallery } from "@/components/forms/TemplateGallery";
import { FieldInspector } from "@/components/forms/FieldInspector";
import { FormPreviewHost } from "@/components/forms/FormPreviewHost";
import { PagesRail } from "@/components/forms/PagesRail";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { FormField } from "@/components/shared/FormField";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { FilterMenu } from "@/components/shared/StatusTabs";
import { useRepo } from "@/data/repo";
import type { Event, FieldDefinition, FormPage, PublicSubmissionFormConfig, SubmissionForm } from "@/data/types";

type PortalFormKind = "contact" | "group" | "submission_task";
type PortalField = {
  id: string;
  recordId?: string;
  label: string;
  type: "text" | "textarea" | "email" | "number" | "select";
  required?: boolean;
  maxChars?: number;
  options?: string[];
  showIf?: { fieldId: string; equals: string };
};
type PortalForm = {
  id?: string;
  name: string;
  title: string;
  kind: PortalFormKind;
  fields: PortalField[];
  pages: FormPage[];
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
    id?: string;
    key: string;
    title: string;
    pageHeading?: string;
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
  pages: [{ id: "portal", kind: "custom", label: "Form questions", pageHeading: "Form", fieldIds: [] }],
  sectionTitle: "Form questions",
  instructions: "",
  sendConfirmationEmail: true,
  confirmationBody:
    "<p>Thank you for submitting your form. Here is a link to your submission.</p>",
  version: 1,
});

export function PortalFormsEmptyState({
  onChooseTemplate,
  onStartBlank,
}: {
  onChooseTemplate: () => void;
  onStartBlank: () => void;
}) {
  return (
    <EmptyState
      icon={Plus}
      title="Create your first portal form"
      message="Choose a template to get started, or build a blank form."
      action={
        <>
          <Button variant="accent" size="sm" onClick={onChooseTemplate}>
            Choose a template
          </Button>
          <Button variant="outline" size="sm" onClick={onStartBlank}>
            Start blank
          </Button>
        </>
      }
    />
  );
}

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
          Add field
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        <p className="text-sm font-medium">Add question</p>
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
            <Button
              key={field.id}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start px-3 py-2 text-left"
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
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PortalFormEditor({
  form,
  event,
  library,
  saving,
  error,
  onSave,
  onCancel,
}: {
  form: PortalForm;
  event: Event;
  library: PortalField[];
  saving: boolean;
  error?: string;
  onSave: (form: PortalForm) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(form);
  const [activePageId, setActivePageId] = useState(form.pages[0]?.id ?? "portal");
  const [selectedFieldId, setSelectedFieldId] = useState<string>();
  const [editingPageIntro, setEditingPageIntro] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const update = <K extends keyof PortalForm>(key: K, value: PortalForm[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const valid = Boolean(draft.name.trim() && draft.title.trim());
  const activePage = draft.pages.find((page) => page.id === activePageId) ?? draft.pages[0];
  const activeFields = (activePage?.fieldIds ?? []).flatMap((id) => {
    const field = draft.fields.find((candidate) => candidate.id === id);
    return field ? [field] : [];
  });
  const updatePage = (id: string, patch: Partial<FormPage>) => update("pages", draft.pages.map((page) => page.id === id ? { ...page, ...patch } : page));
  const updateField = (id: string, patch: Partial<PortalField>) =>
    update("fields", draft.fields.map((field) => field.id === id ? { ...field, ...patch } : field));
  const previewConfig: PublicSubmissionFormConfig = {
    event: { name: event.name, slug: event.slug, timezone: event.timezone, startDate: event.startDate, endDate: event.endDate, ...(event.accentColor ? { accentColor: event.accentColor } : {}) },
    form: { externalTitle: draft.title, pageHeading: "Form", kind: draft.kind, collectParticipants: false, showWelcomeMessage: false, pages: draft.pages.map((page) => ({ ...page, fieldKeys: page.fieldIds })), sections: [], participantRoles: [], crossFieldLimits: [], allowMultipleDrafts: false, autoRedirectToPortal: false, confirmationEnabled: draft.sendConfirmationEmail, fields: draft.fields.map((field) => ({ key: field.id, label: field.label, type: toStoredType(field.type), required: Boolean(field.required), ...(field.maxChars ? { maxChars: field.maxChars } : {}), ...(field.options ? { options: field.options } : {}), ...(field.showIf ? { showIf: { fieldKey: field.showIf.fieldId, equals: field.showIf.equals } } : {}) })) },
  };
  const addPage = () => {
    const page = { id: `page-${Date.now()}`, kind: "custom" as const, label: "New page", pageHeading: "New page", fieldIds: [] };
    update("pages", [...draft.pages, page]);
    setActivePageId(page.id);
    setSelectedFieldId(undefined);
    setEditingPageIntro(false);
  };
  const duplicatePage = (id: string) => {
    const source = draft.pages.find((page) => page.id === id);
    if (!source) return;
    const sourceFields = source.fieldIds.flatMap((fieldId) => {
      const field = draft.fields.find((candidate) => candidate.id === fieldId);
      return field ? [field] : [];
    });
    const clonedIds = new Map(sourceFields.flatMap((field, index) => {
      const nextId = `field-${Date.now()}-${index}`;
      return [[field.id, nextId], ...(field.recordId ? [[field.recordId, nextId] as const] : [])];
    }));
    const copies = sourceFields.map((field) => ({
      ...field,
      id: clonedIds.get(field.id)!,
      recordId: undefined,
      showIf: field.showIf && clonedIds.has(field.showIf.fieldId)
        ? { ...field.showIf, fieldId: clonedIds.get(field.showIf.fieldId)! }
        : undefined,
    }));
    const page = { ...source, id: `page-${Date.now()}`, label: `${source.label} copy`, fieldIds: copies.map((field) => field.id) };
    update("fields", [...draft.fields, ...copies]);
    update("pages", [...draft.pages, page]);
    setActivePageId(page.id);
    setSelectedFieldId(copies[0]?.id);
    setEditingPageIntro(false);
  };
  const removePage = (id: string) => {
    if (draft.pages.length === 1) return;
    const page = draft.pages.find((candidate) => candidate.id === id);
    const remaining = draft.pages.filter((candidate) => candidate.id !== id);
    update("pages", remaining);
    update("fields", draft.fields.filter((field) => !page?.fieldIds.includes(field.id)));
    setActivePageId(remaining[0]?.id ?? "");
    setSelectedFieldId(undefined);
    setEditingPageIntro(false);
  };
  const movePage = (id: string, direction: "up" | "down") => {
    const index = draft.pages.findIndex((page) => page.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= draft.pages.length) return;
    const pages = [...draft.pages];
    [pages[index], pages[target]] = [pages[target], pages[index]];
    update("pages", pages);
  };
  const moveField = (id: string, direction: "up" | "down") => {
    if (!activePage) return;
    const index = activePage.fieldIds.indexOf(id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= activePage.fieldIds.length) return;
    const fieldIds = [...activePage.fieldIds];
    [fieldIds[index], fieldIds[target]] = [fieldIds[target], fieldIds[index]];
    updatePage(activePage.id, { fieldIds });
  };
  const selectedField = activeFields.find((field) => field.id === selectedFieldId);
  const inspectorField = selectedField ? { ...selectedField, type: toStoredType(selectedField.type) } : null;
  const conditionSources = activeFields
    .filter((field) => field.id !== selectedFieldId && field.type === "select" && field.options?.length)
    .map((field) => ({ ...field, recordId: field.recordId ?? field.id, type: toStoredType(field.type) }));
  return (
    <div className="space-y-4">
      <ContentToolbar
        ariaLabel="Portal form actions"
        utilities={<>
          <Button type="button" variant="outline" size="sm" aria-pressed={previewing} onClick={() => setPreviewing((current) => !current)}>
            <Eye className="h-4 w-4" /> {previewing ? "Back to editor" : "Preview"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </>}
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
      {previewing ? (
        <div className="min-h-[calc(100dvh-11rem)]"><FormPreviewHost config={previewConfig} /></div>
      ) : (
      <div className="grid min-h-[calc(100dvh-11rem)] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] min-[1180px]:grid-cols-[18rem_minmax(30rem,1fr)_24rem]">
        <aside className={cardSurfaceClasses("default", "h-fit p-3 lg:sticky lg:top-4")}>
          <PagesRail pages={draft.pages} activePageId={activePageId} fieldCountByPageId={Object.fromEntries(draft.pages.map((page) => [page.id, page.fieldIds.length]))} onSelect={(id) => { setActivePageId(id); setSelectedFieldId(draft.pages.find((page) => page.id === id)?.fieldIds[0]); setEditingPageIntro(false); }} onAdd={addPage} onDuplicate={duplicatePage} onRemove={removePage} onRename={(id, label) => updatePage(id, { label })} onMove={movePage} />
          <Button type="button" variant={activePageId === "" ? "muted" : "ghost"} className="mt-3 w-full justify-start" onClick={() => { setActivePageId(""); setSelectedFieldId(undefined); setEditingPageIntro(false); }}>Form settings</Button>
        </aside>
        <section className={cardSurfaceClasses("default", "min-w-0 overflow-hidden p-5 sm:p-7")}>
          {!activePage ? <div className="mx-auto max-w-2xl space-y-6">
            <h2 className="text-xl font-semibold tracking-tight">Form settings</h2>
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
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Portal form type">
              {kinds.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  variant={draft.kind === kind ? "muted" : "ghost"}
                  role="radio"
                  aria-checked={draft.kind === kind}
                  onClick={() => update("kind", kind)}
                  className="h-auto items-start justify-start p-3 text-left"
                >
                  <span><span className="block font-semibold">{kindCopy[kind].label}</span><span className="mt-1 block whitespace-normal text-xs font-normal text-muted-foreground">{kindCopy[kind].description}</span></span>
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Confirmation email</span>
              <Switch checked={draft.sendConfirmationEmail} onCheckedChange={(value) => update("sendConfirmationEmail", value)} />
            </div>
            {draft.sendConfirmationEmail && <FormField label="Confirmation email body"><RichTextEditor value={draft.confirmationBody} onChange={(value) => update("confirmationBody", value)} /></FormField>}
          </div> : <div className="mx-auto w-full max-w-3xl space-y-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page</p><h2 className="mt-1 truncate text-xl font-semibold tracking-tight">{activePage.label}</h2></div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingPageIntro((current) => !current)}>{editingPageIntro ? "Done" : "Edit intro"}</Button>
            </div>
            {editingPageIntro && <div className="space-y-4"><FormField label="Page heading"><Input value={activePage.pageHeading} onChange={(event) => updatePage(activePage.id, { pageHeading: event.target.value })} /></FormField><FormField label="Description"><RichTextEditor value={activePage.description ?? ""} onChange={(value) => updatePage(activePage.id, { description: value })} /></FormField></div>}
            <section className="space-y-3">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Questions</h3><FieldLibrary fields={library} onAdd={(field) => { update("fields", [...draft.fields, field]); updatePage(activePage.id, { fieldIds: [...activePage.fieldIds, field.id] }); setSelectedFieldId(field.id); }} /></div>
              <div className="space-y-2">
              {activeFields.map((field, index) => (
                <div
                  key={field.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", field.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = event.dataTransfer.getData("text/plain");
                    const sourceIndex = activePage.fieldIds.indexOf(sourceId);
                    if (sourceIndex < 0 || sourceIndex === index) return;
                    const fieldIds = [...activePage.fieldIds];
                    const [moved] = fieldIds.splice(sourceIndex, 1);
                    fieldIds.splice(index, 0, moved);
                    updatePage(activePage.id, { fieldIds });
                  }}
                  className={`flex min-h-14 items-center gap-2 rounded-md px-2 py-1.5 ${selectedFieldId === field.id ? "bg-primary/10 text-primary" : "bg-background hover:bg-muted/70"}`}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <button type="button" aria-label={`Edit ${field.label || "untitled field"}`} className="min-w-0 flex-1 rounded-sm px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedFieldId(field.id)}><span className="block truncate text-sm font-medium">{field.label || "Untitled field"}</span><span className="block text-xs text-muted-foreground">{field.type}</span></button>
                  {field.required && <span className="hidden rounded bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline">Required</span>}
                  <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${field.label}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-40"><DropdownMenuItem disabled={index === 0} onSelect={() => moveField(field.id, "up")}><ArrowUp className="mr-2 h-4 w-4" />Move up</DropdownMenuItem><DropdownMenuItem disabled={index === activeFields.length - 1} onSelect={() => moveField(field.id, "down")}><ArrowDown className="mr-2 h-4 w-4" />Move down</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { update("fields", draft.fields.filter((item) => item.id !== field.id)); updatePage(activePage.id, { fieldIds: activePage.fieldIds.filter((fieldId) => fieldId !== field.id) }); if (selectedFieldId === field.id) setSelectedFieldId(undefined); }}><Trash2 className="mr-2 h-4 w-4" />Remove</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                </div>
              ))}
              </div>
            </section>
          </div>}
        </section>
        <aside className={cardSurfaceClasses("default", "h-fit p-5 lg:col-start-2 min-[1180px]:sticky min-[1180px]:top-4 min-[1180px]:col-start-3")} aria-label="Question inspector"><FieldInspector field={inspectorField as never} conditionSources={conditionSources as never} onChange={(patch) => { if (!selectedFieldId) return; const { type, showIf, ...rest } = patch; updateField(selectedFieldId, { ...rest, ...(type ? { type: toDynamicType(type) } : {}), ...(Object.prototype.hasOwnProperty.call(patch, "showIf") ? { showIf } : {}) }); }} onClose={() => setSelectedFieldId(undefined)} /></aside>
      </div>)}
    </div>
  );
}

export default function PortalForms() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const { formId } = useParams();
  const location = useLocation();
  const creating = formId === "new" || location.pathname.endsWith("/new");
  const navigate = useNavigate();
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
            showIf: field.showIf,
          } satisfies PortalField,
        ]),
      );
      const portalForms = (storedForms as StoredForm[])
        .filter((form) => form.kind && kinds.includes(form.kind))
        .map((form) => {
          const pages = form.pages?.filter((item) => item.kind === "custom") ?? [];
          const page = pages[0];
          const section = form.sections?.find((item) => item.key === "portal");
          const settings = form.portalFormSettings;
          return {
            id: form.id,
            name: form.internalName ?? form.name,
            title: form.externalTitle ?? form.name,
            kind: form.kind!,
            fields: [...new Map((pages.length ? pages.flatMap((item) => item.fieldIds) : section?.fieldIds ?? []).flatMap((id) => { const field = byId.get(id); return field ? [[id, field] as const] : []; })).values()],
            pages: pages.length ? pages : [{ id: section?.id ?? "portal", kind: "custom" as const, label: section?.title ?? "Form questions", pageHeading: section?.pageHeading ?? "Form", description: section?.description, fieldIds: section?.fieldIds ?? [] }] as FormPage[],
            sectionTitle: page?.label ?? section?.title ?? "Form questions",
            instructions: page?.description ?? section?.description ?? "",
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
  const listPath = activeEvent ? `/events/${activeEvent.slug}/portals/forms` : "/events";
  useEffect(() => {
    if ((!formId && !creating) || loading) return;
    if (creating) {
      if (!editing) setShowGallery(true);
      return;
    }
    const match = forms.find((form) => form.id === formId);
    if (match) setEditing(match);
  }, [creating, editing, formId, forms, loading]);
  const save = async (form: PortalForm) => {
    if (!event) return;
    setSaving(true);
    setError(undefined);
    try {
      const firstPassFields = await Promise.all(
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
            showIf: undefined,
          }),
        })),
      );
      const persistedIds = new Map(firstPassFields.flatMap((field) => [
        [field.id, field.recordId!],
        ...(field.recordId ? [[field.recordId, field.recordId] as const] : []),
      ]));
      const fields = await Promise.all(firstPassFields.map(async (field) => {
        const showIf = field.showIf && persistedIds.has(field.showIf.fieldId)
          ? { ...field.showIf, fieldId: persistedIds.get(field.showIf.fieldId)! }
          : undefined;
        if (!showIf) return field;
        await repo.forms.saveField({
          eventId: event.id,
          id: field.recordId,
          label: field.label.trim() || "Untitled field",
          type: toStoredType(field.type),
          locked: false,
          required: Boolean(field.required),
          maxChars: field.maxChars,
          options: field.options,
          showIf,
        });
        return { ...field, showIf };
      }));
      const fieldIds = new Map(fields.map((field) => [field.id, field.recordId!]));
      const pages = form.pages.map((page) => ({ ...page, fieldIds: page.fieldIds.flatMap((fieldId) => fieldIds.get(fieldId) ?? []) }));
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
        pages,
        sections: [
          {
            id: pages[0]?.id ?? "portal",
            key: "portal",
            title: pages[0]?.label.trim() || "Form questions",
            pageHeading: pages[0]?.pageHeading || "Form",
            description: pages[0]?.description || undefined,
            fieldIds: pages[0]?.fieldIds ?? [],
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
      navigate(listPath);
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
    navigate(`${listPath}/${formId}/edit`, { replace: true });
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
        <PortalFormEditor
          form={editing}
          event={event}
          library={library}
          saving={saving}
          error={error}
          onSave={save}
          onCancel={() => { setEditing(undefined); navigate(listPath); }}
        />
      </AppLayout>
    );
  if (showGallery)
    return (
      <AppLayout title="Portal forms">
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
    <AppLayout title="Portal forms">
      <div className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={3} label="Loading portal forms…" />
        ) : !event ? (
          <EmptyState icon={LockKeyhole} title="No event available" message="Create an event before creating portal forms." />
        ) : (
          <>
            <ContentToolbar
              ariaLabel="Portal form controls"
              utilities={
                <FilterMenu
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
                  onClick={() => navigate(`${listPath}/new`)}
                >
                  Add form
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
                        onClick={() => navigate(`${listPath}/${form.id}/edit`)}
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
              <PortalFormsEmptyState
                onChooseTemplate={() => setShowGallery(true)}
                onStartBlank={() => setEditing(newForm())}
              />
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
