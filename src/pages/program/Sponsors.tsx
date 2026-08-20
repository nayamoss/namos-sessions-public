import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Handshake,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { DetailPane } from "@/components/shared/DetailPane";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cleanErrorMessage } from "@/lib/errors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRepo } from "@/data/repo";
import type {
  Event,
  OnboardingTask,
  Sponsor,
  SponsorContact,
  SponsorDetail as SponsorDetailType,
  SponsorStatus,
  SponsorTier,
  SponsorTierId,
  SubmissionStatus,
  TaskTemplate,
} from "@/data/types";

const noTier = "__none__";
const statusLabels: Record<SponsorStatus, string> = {
  prospect: "Prospect",
  confirmed: "Confirmed",
  declined: "Declined",
};

const submissionStatusLabels: Record<SubmissionStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  accept_queue: "Accept Queue",
  accepted: "Accepted",
  maybe: "Maybe",
  decline_queue: "Decline Queue",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

function errorMessage(error: unknown, fallback: string) {
  return cleanErrorMessage(error, fallback);
}

function StatusDot({ status }: { status: SponsorStatus }) {
  const color =
    status === "confirmed"
      ? "bg-success"
      : status === "declined"
        ? "bg-destructive"
        : "bg-warning";
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        className={`h-1.5 w-1.5 rounded-full ${color}`}
        aria-hidden="true"
      />
      {statusLabels[status]}
    </span>
  );
}

function AddSponsorPane({
  event,
  tiers,
  onClose,
  onCreated,
}: {
  event: Event;
  tiers: SponsorTier[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const repo = useRepo();
  const [name, setName] = useState("");
  const [tierId, setTierId] = useState(noTier);
  const [status, setStatus] = useState<SponsorStatus>("prospect");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!name.trim()) {
      setError("Enter a sponsor name.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const id = await repo.sponsors.create({
        eventId: event.id,
        name: name.trim(),
        tierId: tierId === noTier ? undefined : (tierId as SponsorTierId),
        status,
        website: website.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated(id);
    } catch (cause) {
      setError(errorMessage(cause, "Could not add the sponsor."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className={cardSurfaceClasses("default", "mx-auto max-w-3xl p-6")} aria-label="New sponsor">
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="space-y-2">
          <Label htmlFor="sponsor-name">Sponsor name</Label>
          <Input
            id="sponsor-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div className="space-y-2">
            <Label>Tier</Label>
            <Select value={tierId} onValueChange={setTierId} disabled={saving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={noTier}>No tier</SelectItem>
                {tiers.map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as SponsorStatus)}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sponsor-website">Website</Label>
          <Input
            id="sponsor-website"
            type="url"
            placeholder="https://"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sponsor-notes">Notes</Label>
          <Textarea
            id="sponsor-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={saving}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add sponsor"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ContactForm({
  contact,
  onCancel,
  onSave,
}: {
  contact?: SponsorContact;
  onCancel: () => void;
  onSave: (values: {
    name: string;
    email?: string;
    phone?: string;
    role?: string;
    isPrimary: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [isPrimary, setPrimary] = useState(contact?.isPrimary ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a contact name.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role: role.trim() || undefined,
        isPrimary,
      });
    } catch (cause) {
      setError(errorMessage(cause, "Could not save the contact."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="space-y-3 rounded-lg bg-background p-4"
      onSubmit={(event) => void submit(event)}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Input
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Marketing, logistics…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={isPrimary}
          onCheckedChange={(checked) => setPrimary(checked === true)}
        />
        Set as primary contact
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save contact"}
        </Button>
      </div>
    </form>
  );
}

function SponsorDetailPane({
  sponsorId,
  event,
  tiers,
  templates,
  onClose,
  onChanged,
  onRemoved,
}: {
  sponsorId: string;
  event: Event;
  tiers: SponsorTier[];
  templates: TaskTemplate[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onRemoved: () => void;
}) {
  const repo = useRepo();
  const [detail, setDetail] = useState<SponsorDetailType | null>();
  const [editingContact, setEditingContact] = useState<string | "new">();
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState<{ error?: boolean; text: string }>();
  const load = useCallback(async () => {
    try {
      setDetail(await repo.sponsors.get(sponsorId as never));
    } catch (cause) {
      setMessage({
        error: true,
        text: errorMessage(cause, "Could not load sponsor details."),
      });
    }
  }, [repo, sponsorId]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = async (patch: Parameters<typeof repo.sponsors.update>[0]) => {
    setMessage(undefined);
    try {
      await repo.sponsors.update(patch);
      await Promise.all([load(), onChanged()]);
      setMessage({ text: "Sponsor updated." });
    } catch (cause) {
      setMessage({
        error: true,
        text: errorMessage(cause, "Could not update the sponsor."),
      });
    }
  };
  const saveContact = async (values: {
    name: string;
    email?: string;
    phone?: string;
    role?: string;
    isPrimary: boolean;
  }) => {
    if (editingContact === "new")
      await repo.sponsorContacts.create({
        sponsorId: sponsorId as never,
        ...values,
      });
    else
      await repo.sponsorContacts.update({
        contactId: editingContact!,
        ...values,
      });
    setEditingContact(undefined);
    await Promise.all([load(), onChanged()]);
  };
  const removeContact = async (contactId: string) => {
    try {
      await repo.sponsorContacts.remove(contactId);
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setMessage({
        error: true,
        text: errorMessage(cause, "Could not remove the contact."),
      });
    }
  };
  const createTask = async () => {
    if (!taskTitle.trim()) return;
    setAddingTask(true);
    try {
      await repo.tasks.create({
        eventId: event.id,
        sponsorId: sponsorId as never,
        title: taskTitle.trim(),
        targetType: "sponsor",
      });
      setTaskTitle("");
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setMessage({
        error: true,
        text: errorMessage(cause, "Could not add the task."),
      });
    } finally {
      setAddingTask(false);
    }
  };
  const applyTemplate = async () => {
    if (!templateId) return;
    setAddingTask(true);
    try {
      const result = await repo.taskTemplates.applyToSponsor({
        templateId,
        sponsorId: sponsorId as never,
      });
      setMessage({
        text: `Added ${result.created} tasks; ${result.skipped} already existed.`,
      });
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setMessage({
        error: true,
        text: errorMessage(cause, "Could not apply the template."),
      });
    } finally {
      setAddingTask(false);
    }
  };
  const setTaskStatus = async (task: OnboardingTask) => {
    const status = task.status === "completed" ? "pending" : "completed";
    try {
      await repo.tasks.setStatus(task.id, status);
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setMessage({
        error: true,
        text: errorMessage(cause, "Could not update the task."),
      });
    }
  };
  if (detail === undefined)
    return (
      <section className={cardSurfaceClasses("default", "p-6")}>
        <p className="text-sm text-muted-foreground">Loading sponsor…</p>
      </section>
    );
  if (!detail)
    return (
      <section className={cardSurfaceClasses("default", "p-6")}>
        <p className="text-sm text-muted-foreground">
          This sponsor no longer exists.
        </p>
      </section>
    );
  return (
    <section className={cardSurfaceClasses("default", "p-6")} aria-label={`Edit ${detail.name}`}>
      <div className="space-y-6">
        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={`text-sm ${message.error ? "text-destructive" : "text-muted-foreground"}`}
          >
            {message.text}
          </p>
        )}
        <section className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              defaultValue={detail.name}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== detail.name)
                  void update({ sponsorId: detail.id, name });
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="space-y-2">
              <Label>Tier</Label>
              <Select
                value={detail.tierId ?? noTier}
                onValueChange={(value) =>
                  void update({
                    sponsorId: detail.id,
                    tierId: value === noTier ? null : (value as SponsorTierId),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={noTier}>No tier</SelectItem>
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={detail.status}
                onValueChange={(value) =>
                  void update({
                    sponsorId: detail.id,
                    status: value as SponsorStatus,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              type="url"
              defaultValue={detail.website ?? ""}
              onBlur={(event) => {
                if (event.target.value.trim() !== (detail.website ?? ""))
                  void update({
                    sponsorId: detail.id,
                    website: event.target.value,
                  });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              defaultValue={detail.notes ?? ""}
              onBlur={(event) => {
                if (event.target.value.trim() !== (detail.notes ?? ""))
                  void update({
                    sponsorId: detail.id,
                    notes: event.target.value,
                  });
              }}
            />
          </div>
        </section>
        <section className="space-y-3" aria-labelledby="sponsor-contacts">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="sponsor-contacts" className="text-sm font-semibold">
                Contacts
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                One primary contact appears in the sponsor list.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingContact("new")}
            >
              Add contact
            </Button>
          </div>
          {editingContact === "new" && (
            <ContactForm
              onCancel={() => setEditingContact(undefined)}
              onSave={saveContact}
            />
          )}
          {detail.contacts.length ? (
            <ul className="space-y-2">
              {detail.contacts.map((contact) => (
                <li key={contact.id} className="rounded-lg bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{contact.name}</p>
                        {contact.isPrimary && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            Primary
                          </span>
                        )}
                      </div>
                      {contact.role && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {contact.role}
                        </p>
                      )}
                      {contact.email && (
                        <a
                          className="mt-1 block truncate text-xs hover:underline"
                          href={`mailto:${contact.email}`}
                        >
                          {contact.email}
                        </a>
                      )}
                      {contact.phone && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {contact.phone}
                        </p>
                      )}
                    </div>
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${contact.name}`}
                        onClick={() => setEditingContact(contact.id)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${contact.name}`}
                        onClick={() => void removeContact(contact.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  {editingContact === contact.id && (
                    <div className="mt-3">
                      <ContactForm
                        contact={contact}
                        onCancel={() => setEditingContact(undefined)}
                        onSave={saveContact}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No contacts yet.</p>
          )}
        </section>
        <section className="space-y-3" aria-labelledby="sponsor-tasks">
          <div>
            <h3 id="sponsor-tasks" className="text-sm font-semibold">
              Deliverables
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sponsor work uses the same task system as speaker onboarding.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Add a task"
              aria-label="New sponsor task"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void createTask()}
              disabled={addingTask || !taskTitle.trim()}
            >
              Add
            </Button>
          </div>
          {templates.length > 0 && (
            <div className="flex gap-2">
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger aria-label="Task template">
                  <SelectValue placeholder="Apply template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void applyTemplate()}
                disabled={!templateId || addingTask}
              >
                Apply
              </Button>
            </div>
          )}
          <ul className="space-y-2">
            {detail.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-lg bg-background p-3"
              >
                <button
                  type="button"
                  aria-label={
                    task.status === "completed"
                      ? `Reopen ${task.title}`
                      : `Complete ${task.title}`
                  }
                  onClick={() => void setTaskStatus(task)}
                >
                  {task.status === "completed" ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <span className="block h-4 w-4 rounded-full bg-muted" />
                  )}
                </button>
                <span
                  className={`text-sm ${task.status === "completed" ? "text-muted-foreground line-through" : ""}`}
                >
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
          {detail.tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No deliverables assigned.
            </p>
          )}
        </section>
        <section className="space-y-3" aria-labelledby="sponsor-submissions">
          <div>
            <h3 id="sponsor-submissions" className="text-sm font-semibold">
              Linked submissions
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              CFP responses linked by sponsor routing appear here.
            </p>
          </div>
          {detail.submissions.length ? (
            <ul className="space-y-2">
              {detail.submissions.map((submission) => (
                <li key={submission.id}>
                  <Link
                    to={`/events/${event.slug}/program/abstracts?selected=${submission.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-background p-3 text-sm hover:underline"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {submission.title || "Untitled submission"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {submissionStatusLabels[submission.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No linked submissions yet.
            </p>
          )}
        </section>
        <section className="space-y-3 rounded-lg bg-background p-4">
          <div>
            <h3 className="text-sm font-semibold">Remove sponsor</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Contacts are deleted. Linked tasks and submissions are preserved
              and unassigned.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" size="sm">
                <Trash2 /> Remove sponsor
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {detail.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes sponsor contacts and unassigns linked tasks and
                  submissions. Those tasks and submissions are not deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    void repo.sponsors
                      .remove(detail.id)
                      .then(onRemoved)
                      .catch((cause) =>
                        setMessage({
                          error: true,
                          text: errorMessage(
                            cause,
                            "Could not remove the sponsor.",
                          ),
                        }),
                      )
                  }
                >
                  Remove sponsor
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </div>
    </section>
  );
}

function SponsorTiersPane({
  event,
  tiers,
  onClose,
  onChanged,
}: {
  event: Event;
  tiers: SponsorTier[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const repo = useRepo();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(undefined);
    try {
      await repo.sponsorTiers.create({ eventId: event.id, name });
      setName("");
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Could not add the tier."));
    } finally {
      setSaving(false);
    }
  };
  const reorder = async (index: number, delta: number) => {
    const next = [...tiers];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await repo.sponsorTiers.reorder({
        eventId: event.id,
        tierIds: next.map((tier) => tier.id),
      });
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Could not reorder tiers."));
    }
  };
  const remove = async (tierId: SponsorTierId) => {
    setError(undefined);
    try {
      await repo.sponsorTiers.remove(tierId);
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Could not remove the tier."));
    }
  };
  return (
    <DetailPane title="Sponsor tiers" onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <ul className="space-y-2">
          {tiers.map((tier, index) => (
            <li
              key={tier.id}
              className="flex items-center gap-2 rounded-lg bg-background p-3"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{
                  backgroundColor: tier.color || "hsl(var(--muted-foreground))",
                }}
                aria-hidden="true"
              />
              <Input
                aria-label={`${tier.name} tier name`}
                defaultValue={tier.name}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== tier.name)
                    void repo.sponsorTiers
                      .update({ tierId: tier.id, name: next })
                      .then(onChanged)
                      .catch((cause) =>
                        setError(
                          errorMessage(cause, "Could not rename the tier."),
                        ),
                      );
                }}
              />
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {tier.sponsorCount} sponsors
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${tier.name} up`}
                disabled={index === 0}
                onClick={() => void reorder(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${tier.name} down`}
                disabled={index === tiers.length - 1}
                onClick={() => void reorder(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${tier.name}`}
                onClick={() => void remove(tier.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New tier name"
            aria-label="New tier name"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void add();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void add()}
            disabled={saving || !name.trim()}
          >
            Add
          </Button>
        </div>
      </div>
    </DetailPane>
  );
}

export default function Sponsors() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const navigate = useNavigate();
  const { sponsorId } = useParams<{ sponsorId?: string }>();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [event, setEvent] = useState<Event>();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [tiers, setTiers] = useState<SponsorTier[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const listPath = `/events/${activeEvent.slug}/program/sponsors`;
  const pane = sponsorId === "new" || location.pathname.endsWith("/new") ? "add" : sponsorId ? "detail" : params.get("pane");
  const selected = sponsorId && sponsorId !== "new" ? sponsorId : params.get("selected");
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const nextEvent = activeEvent;
      setEvent(nextEvent);
      if (!nextEvent) {
        setSponsors([]);
        setTiers([]);
        return;
      }
      const [nextSponsors, nextTiers, nextTemplates] = await Promise.all([
        repo.sponsors.list({ eventId: nextEvent.id }),
        repo.sponsorTiers.list({ eventId: nextEvent.id }),
        repo.taskTemplates.list({ eventId: nextEvent.id }),
      ]);
      setSponsors(nextSponsors);
      setTiers(nextTiers.sort((a, b) => a.sortOrder - b.sortOrder));
      setTemplates(nextTemplates);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load sponsors."));
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (sponsorId || !activeEvent?.slug) return;
    const legacyPane = params.get("pane");
    const legacyId = params.get("selected");
    if (legacyPane === "add") navigate(`${listPath}/new`, { replace: true });
    else if (legacyPane === "detail" && legacyId) navigate(`${listPath}/${encodeURIComponent(legacyId)}/edit`, { replace: true });
  }, [activeEvent?.slug, listPath, navigate, params, sponsorId]);

  const closePane = () => {
    if (sponsorId || location.pathname.endsWith("/new")) { navigate(listPath); return; }
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("pane");
      next.delete("selected");
      return next;
    });
  };
  const openPane = (nextPane: string, id?: string) => {
    if (nextPane === "add") { navigate(`${listPath}/new`); return; }
    if (nextPane === "detail" && id) { navigate(`${listPath}/${encodeURIComponent(id)}/edit`); return; }
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("pane", nextPane);
      if (id) next.set("selected", id);
      else next.delete("selected");
      return next;
    });
  };
  const visible = useMemo(
    () =>
      sponsors.filter(
        (sponsor) =>
          (tierFilter === "all" ||
            (tierFilter === noTier
              ? !sponsor.tierId
              : sponsor.tierId === tierFilter)) &&
          `${sponsor.name} ${sponsor.primaryContact?.name ?? ""} ${sponsor.primaryContact?.email ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [search, sponsors, tierFilter],
  );
  const columns = useMemo<DataGridColumn<Sponsor>[]>(
    () => [
      {
        key: "name",
        header: "Sponsor",
        cell: (sponsor) => <span className="font-medium">{sponsor.name}</span>,
      },
      {
        key: "tier",
        header: "Tier",
        cell: (sponsor) =>
          sponsor.tier ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    sponsor.tier.color || "hsl(var(--muted-foreground))",
                }}
              />
              {sponsor.tier.name}
            </span>
          ) : (
            <span className="text-muted-foreground">No tier</span>
          ),
      },
      {
        key: "status",
        header: "Status",
        cell: (sponsor) => <StatusDot status={sponsor.status} />,
      },
      {
        key: "contact",
        header: "Primary contact",
        cell: (sponsor) =>
          sponsor.primaryContact ? (
            <span>
              <span className="block">{sponsor.primaryContact.name}</span>
              <span className="block text-xs text-muted-foreground">
                {sponsor.primaryContact.email}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          ),
      },
      {
        key: "tasks",
        header: "Open tasks",
        align: "right",
        cell: (sponsor) => sponsor.openTaskCount,
      },
    ],
    [],
  );
  if (event && !event.sponsorsEnabled)
    return (
      <AppLayout title="Sponsors">
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <Handshake className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Sponsor management is turned off for this event.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={`/events/${activeEvent.slug}/settings/event`}>Enable sponsors in Event Settings</Link>
          </Button>
        </div>
      </AppLayout>
    );
  if (event && pane === "add") {
    return (
      <AppLayout title="New sponsor">
      <AddSponsorPane
        event={event}
        tiers={tiers}
        onClose={closePane}
        onCreated={(id) => {
          void load();
          openPane("detail", id);
        }}
      />
      </AppLayout>
    );
  }
  if (event && pane === "detail" && selected) {
    return (
      <AppLayout title={sponsors.find((sponsor) => sponsor.id === selected)?.name ?? "Sponsor"}>
        <SponsorDetailPane
          sponsorId={selected}
          event={event}
          tiers={tiers}
          templates={templates}
          onClose={closePane}
          onChanged={load}
          onRemoved={() => { closePane(); void load(); }}
        />
      </AppLayout>
    );
  }
  const detail = event && pane === "tiers" ? (
      <SponsorTiersPane
        event={event}
        tiers={tiers}
        onClose={closePane}
        onChanged={load}
      />
    ) : undefined;
  return (
    <AppLayout title="Sponsors" detail={detail}>
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="Sponsor controls"
          search={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 pl-9"
                placeholder="Search sponsors"
                aria-label="Search sponsors"
              />
            </div>
          }
          utilities={
            <>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="h-8 w-40" aria-label="Filter by tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value={noTier}>No tier</SelectItem>
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openPane("tiers")}
              >
                Manage tiers
              </Button>
            </>
          }
          primaryAction={
            <Button variant="accent" size="sm" onClick={() => openPane("add")}>
              Add sponsor
            </Button>
          }
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!loading && sponsors.length === 0 ? (
          <div className={cardSurfaceClasses("default")}>
            <EmptyState
              icon={Handshake}
              title="Add your first sponsor"
              message="Track tiers, contacts, deliverables, and sponsored submissions in one place."
              action={<Button variant="accent" size="sm" onClick={() => openPane("add")}>Add sponsor</Button>}
            />
          </div>
        ) : (
          <DataGrid
            rows={visible}
            columns={columns}
            empty={<EmptyState compact icon={Search} title="No sponsors match these filters" message="Clear the search or choose another tier." action={<Button variant="outline" size="sm" onClick={() => { setSearch(""); setTierFilter("all"); }}>Clear filters</Button>} />}
            loading={loading}
            skeletonRows={4}
            onRowActivated={(sponsor) => openPane("detail", sponsor.id)}
            getRowLabel={(sponsor) => `Open ${sponsor.name}`}
            paginated
          />
        )}
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
