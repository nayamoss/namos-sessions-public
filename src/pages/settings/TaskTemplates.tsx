import { useCallback, useEffect, useState } from "react";
import { ClipboardList, MoreHorizontal, Trash2 } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EditorPage } from "@/components/shared/EditorPage";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type {
  Event,
  SubmissionForm,
  TaskTemplate,
  TaskTemplateItem,
} from "@/data/types";

type PortalForm = SubmissionForm & {
  kind?: "contact" | "group" | "submission_task";
};

const blankItem = (): TaskTemplateItem => ({
  title: "",
  targetType: "submission",
});

export default function TaskTemplates() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId?: string }>();
  const location = useLocation();
  const creating = templateId === "new" || location.pathname.endsWith("/new");
  const listPath = `/events/${activeEvent.slug}/settings/task-templates`;
  const [event, setEvent] = useState<Event>();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [portalForms, setPortalForms] = useState<PortalForm[]>([]);
  const [editing, setEditing] = useState<TaskTemplate | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<TaskTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TaskTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = activeEvent;
      setEvent(current);
      if (!current) {
        setTemplates([]);
        setPortalForms([]);
        return;
      }
      // Older events may predate automatic starter-template creation. This
      // mutation is idempotent: it adds only missing Namos starter templates
      // and assigns the standard checklist as the event default when needed.
      await repo.taskTemplates.ensureStarters({ eventId: current.id });
      const [nextTemplates, forms] = await Promise.all([
        repo.taskTemplates.list({ eventId: current.id }),
        repo.forms.list({ eventId: current.id }),
      ]);
      setTemplates(nextTemplates);
      setPortalForms(
        (forms as PortalForm[]).filter(
          (form) =>
            form.kind === "contact" ||
            form.kind === "group" ||
            form.kind === "submission_task",
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load task templates.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (template: TaskTemplate | "new") => {
    setEditing(template);
    setName(template === "new" ? "" : template.name);
    setDescription(template === "new" ? "" : (template.description ?? ""));
    setItems(template === "new" ? [blankItem()] : template.items);
    setError(undefined);
    navigate(`${listPath}/${template === "new" ? "new" : `${template.id}/edit`}`);
  };
  useEffect(() => {
    if ((!templateId && !creating) || loading) return;
    const template = creating ? "new" : templates.find((item) => item.id === templateId);
    if (template) {
      setEditing(template);
      setName(template === "new" ? "" : template.name);
      setDescription(template === "new" ? "" : (template.description ?? ""));
      setItems(template === "new" ? [blankItem()] : template.items);
    }
  }, [creating, loading, templateId, templates]);

  const updateItem = (index: number, patch: Partial<TaskTemplateItem>) =>
    setItems((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );

  const save = async () => {
    if (
      !event ||
      !name.trim() ||
      !items.length ||
      items.some((item) => !item.title.trim())
    ) {
      setError("Add a template name and a title for every task.");
      return;
    }
    setSaving(true);
    try {
      if (editing === "new")
        await repo.taskTemplates.create({
          eventId: event.id,
          name,
          description,
          items,
        });
      else if (editing)
        await repo.taskTemplates.update({
          templateId: editing.id,
          name,
          description,
          items,
        });
      setEditing(null);
      await load();
      navigate(listPath);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save template.",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!pendingDelete) return;
    try {
      await repo.taskTemplates.remove(pendingDelete.id);
      await load();
      if (editing !== "new" && editing?.id === pendingDelete.id) {
        setEditing(null);
        navigate(listPath);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete template.",
      );
    } finally {
      setPendingDelete(null);
    }
  };

  const editorDirty = editing
    ? name !== (editing === "new" ? "" : editing.name) ||
      description !== (editing === "new" ? "" : (editing.description ?? "")) ||
      JSON.stringify(items) !== JSON.stringify(editing === "new" ? [blankItem()] : editing.items)
    : false;
  const editorContent = editing ? (
    <section className={cardSurfaceClasses("default", "space-y-4 p-5")}>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Template name</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
          <Input value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className={cardSurfaceClasses("default", "space-y-2 bg-muted p-3")}>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">Task title</Label>
                <Input aria-label={`Task ${index + 1} title`} value={item.title} onChange={(event) => updateItem(index, { title: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description <span className="text-muted-foreground">(optional)</span></Label>
                <Input aria-label={`Task ${index + 1} description`} value={item.description ?? ""} onChange={(event) => updateItem(index, { description: event.target.value || undefined })} />
              </div>
              <Button variant="ghost" size="icon" className="self-end" aria-label={`Remove task ${index + 1}`} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 />
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Target type</Label>
                <Select value={item.targetType} onValueChange={(value) => updateItem(index, { targetType: value as TaskTemplateItem["targetType"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submission">Submission</SelectItem>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="sponsor">Sponsor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Linked portal form <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={item.linkedFormId ?? "none"} onValueChange={(value) => updateItem(index, { linkedFormId: value === "none" ? undefined : (value as never) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No form linked</SelectItem>
                    {portalForms.map((form) => <SelectItem key={form.id} value={form.id}>{form.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due offset <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="number" min={0} aria-label={`Task ${index + 1} due offset in days`} value={item.dueDateOffsetDays ?? ""} onChange={(event) => updateItem(index, { dueDateOffsetDays: event.target.value === "" ? undefined : Number(event.target.value) })} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={() => setItems((current) => [...current, blankItem()])}>Add item</Button>
    </section>
  ) : null;
  const columns: DataGridColumn<TaskTemplate>[] = [
    {
      key: "template",
      header: "Template",
      kind: "row-header",
      cell: (template) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{template.name}</p>
          {template.description && <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">{template.description}</p>}
        </div>
      ),
    },
    {
      key: "tasks",
      header: "Tasks",
      width: "8rem",
      cell: (template) => <span className="text-muted-foreground">{template.items.length} {template.items.length === 1 ? "task" : "tasks"}</span>,
    },
    {
      key: "default",
      header: "Default",
      width: "9rem",
      cell: (template) => event?.defaultOnboardingTemplateId === template.id
        ? <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">Default</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "actions",
      header: "",
      headerLabel: "Actions",
      width: "9rem",
      align: "right",
      cell: (template) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => open(template)}>Edit</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={`More actions for ${template.name}`}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {event?.defaultOnboardingTemplateId !== template.id && (
                <DropdownMenuItem onSelect={() => void repo.taskTemplates.setDefault({ eventId: event!.id, templateId: template.id }).then(load)}>
                  Set as default
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={event?.defaultOnboardingTemplateId === template.id}
                onSelect={() => setPendingDelete(template)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  if (templateId || creating) {
    const existingTemplate = creating ? true : templates.some((template) => template.id === templateId);
    return (
      <>
        <EditorPage
          title={creating ? "New task template" : "Edit task template"}
          backTo={listPath}
          loading={loading || !editing}
          notFound={!loading && !existingTemplate}
          error={error}
          dirty={editorDirty}
          saving={saving}
          saveLabel="Save template"
          saveDisabled={!name.trim() || !items.length || items.some((item) => !item.title.trim())}
          onSave={save}
          secondaryAction={editing !== "new" && editing ? <Button variant="destructive" size="sm" onClick={() => setPendingDelete(editing)}>Delete</Button> : undefined}
        >
          {editorContent}
        </EditorPage>
        <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
              <AlertDialogDescription>This removes the template. It won't affect tasks already applied to submissions.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={buttonVariants({ variant: "ghost" })}>Keep template</AlertDialogCancel>
              <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => void confirmRemove()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="Task template actions"
          primaryAction={
            <Button variant="accent" size="sm" onClick={() => open("new")}>
              New template
            </Button>
          }
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <DataGrid rows={[]} columns={columns} empty="" loading skeletonRows={3} rowActivation="none" ariaLabel="Task templates" minWidth={680} />
        ) : (
          <>
            <DataGrid
              rows={templates}
              columns={columns}
              empty={<EmptyState compact icon={ClipboardList} title="No task templates yet" message="Create a reusable checklist for onboarding work." action={<Button size="sm" onClick={() => open("new")}>Create template</Button>} />}
              rowActivation="none"
              ariaLabel="Task templates"
              minWidth={680}
            />

          </>
        )}

        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the template. It won't affect tasks already applied
                to submissions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className={buttonVariants({ variant: "ghost" })}
              >
                Keep template
              </AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                onClick={() => void confirmRemove()}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
