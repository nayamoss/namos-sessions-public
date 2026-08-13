import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Mail,
  Plus,
  Send,
  TriangleAlert,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type {
  Comm,
  CommTemplate,
  CommTemplateKind,
  EventId,
} from "@/data/types";
import { calendarInvite } from "@/lib/calendar-invite";
import { submissionConfirmationEmail } from "@/lib/confirmation-email";
import { resolveCommTemplate } from "@/lib/comms-template-tokens";

type DeliveryStatus = "queued" | "sent" | "failed";
type DeliveryChannel = "email" | "calendar_invite";

type Delivery = {
  id: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  recipient: string;
  subject: string;
  createdAt: number;
  error?: string;
};

const statusLabel: Record<DeliveryStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
};

type CommDocument = Comm & {
  channel?: string;
  status?: string;
  toEmail?: string;
  subject?: string;
  createdAt?: number;
  sentAt?: number;
  error?: string;
};

const templateKinds: Array<{ value: CommTemplateKind; label: string }> = [
  { value: "submission_confirmation", label: "Submission confirmation" },
  { value: "acceptance", label: "Acceptance" },
  { value: "rejection", label: "Rejection" },
  { value: "consolidated_decision", label: "Consolidated decision" },
  { value: "reminder", label: "Reminder" },
  { value: "calendar_invite", label: "Calendar invite" },
  { value: "custom", label: "Custom" },
];

type TemplateDraft = Pick<
  CommTemplate,
  "name" | "kind" | "subject" | "body"
> & { id?: string };
const emptyTemplate: TemplateDraft = {
  name: "",
  kind: "custom",
  subject: "",
  body: "",
};

function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return value === "queued" || value === "sent" || value === "failed";
}

function isDeliveryChannel(value: unknown): value is DeliveryChannel {
  return value === "email" || value === "calendar_invite";
}

function createDeliveries(comms: CommDocument[]): Delivery[] {
  return comms
    .map((comm) => {
      const channel = comm.channel ?? comm.type;
      return {
        id: comm.id,
        channel: isDeliveryChannel(channel) ? channel : "email",
        status: isDeliveryStatus(comm.status) ? comm.status : "queued",
        recipient: comm.toEmail?.trim() || "Unknown recipient",
        subject: comm.subject?.trim() || "Untitled communication",
        createdAt: comm.createdAt ?? comm.sentAt ?? 0,
        error: comm.error,
      };
    })
    .sort((first, second) => second.createdAt - first.createdAt);
}

function relativeTime(value: number) {
  if (!value) return "—";
  const minutes = Math.max(1, Math.round((Date.now() - value) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

function downloadInvite() {
  const now = Date.now();
  const content = calendarInvite({
    uid: `sessionboard-preview-${now}`,
    title: "Schedule invitation preview",
    startTime: now + 86_400_000,
    endTime: now + 90_000_000,
  });
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/calendar;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "takumi-talks-invitation.ics";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Communications() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [searchParams] = useSearchParams();
  const selectedId = searchParams.get("selected");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [eventId, setEventId] = useState<EventId>();
  const [templates, setTemplates] = useState<CommTemplate[]>([]);
  const [templateDraft, setTemplateDraft] =
    useState<TemplateDraft>(emptyTemplate);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState("");
  const [templateContexts, setTemplateContexts] = useState<Array<{ id: string; title: string; speakerName: string }>>([]);
  const [templateContextId, setTemplateContextId] = useState("");
  const [eventName, setEventName] = useState("Your event");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const [recipient, setRecipient] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Your session title");
  const [message, setMessage] = useState("");
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const event = activeEvent;
      if (!event) {
        setDeliveries([]);
        setTemplates([]);
        setEventId(undefined);
        setEventName("Your event");
        return;
      }
      setEventId(event.id);
      setEventName(event.name);
      const [log, submissions, speakers] = await Promise.all([repo.comms.list({ eventId: event.id }), repo.submissions.list({ eventId: event.id }), repo.speakers.list({ eventId: event.id })]);
      setDeliveries(createDeliveries(log as CommDocument[]));
      const speakerNames = new Map(speakers.map((speaker) => [speaker.id, speaker.name]));
      const contexts = submissions.filter((submission) => submission.status === "accepted" || submission.status === "declined").map((submission) => ({ id: submission.id, title: submission.title?.trim() || "Untitled session", speakerName: speakerNames.get(submission.speakerIds[0]) ?? "Speaker" }));
      setTemplateContexts(contexts);
      setTemplateContextId((current) => contexts.some((context) => context.id === current) ? current : contexts[0]?.id ?? "");
      try {
        const savedTemplates = await repo.comms.listTemplates({
          eventId: event.id,
        });
        setTemplates(savedTemplates);
        setTemplateDraft((current) =>
          current.id || current.name
            ? current
            : savedTemplates[0]
              ? { ...savedTemplates[0] }
              : emptyTemplate,
        );
      } catch (error) {
        setTemplates([]);
        setTemplateMessage(
          error instanceof Error
            ? error.message
            : "Could not load communication templates.",
        );
      }
    } catch (error) {
      setDeliveries([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load communication activity.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  // A `selected` deep link (e.g. from Readiness) must land on the exact record, not a
  // generic list — switch to whichever status tab actually contains it so the status
  // filter can't hide the row the link promised.
  useEffect(() => {
    if (!selectedId) return;
    const target = deliveries.find((delivery) => delivery.id === selectedId);
    if (target) setStatus(target.status);
  }, [deliveries, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "center" });
  }, [selectedId, deliveries, status]);

  const visibleDeliveries = useMemo(
    () =>
      status === "all"
        ? deliveries
        : deliveries.filter((delivery) => delivery.status === status),
    [deliveries, status],
  );
  const tabs = (["all", "queued", "sent", "failed"] as const).map((value) => ({
    value,
    label: value === "all" ? "All activity" : statusLabel[value],
    count:
      value === "all"
        ? deliveries.length
        : deliveries.filter((delivery) => delivery.status === value).length,
  }));

  const preview = useMemo(() => {
    const portalUrl =
      typeof window === "undefined"
        ? "/portal"
        : `${window.location.origin}/portal`;
    return submissionConfirmationEmail({
      speakerName: "Speaker",
      eventName,
      sessionTitle: sessionTitle || "Your session",
      portalUrl,
    });
  }, [eventName, sessionTitle]);

  const previewConfirmation = () => {
    const email = recipient.trim();
    if (!email) return;
    setMessage(
      `Preview prepared for ${email}. This screen does not send or record a delivery.`,
    );
  };

  const selectedTemplateContext = templateContexts.find((context) => context.id === templateContextId);
  const resolvedTemplatePreview = {
    subject: resolveCommTemplate(templateDraft.subject, { speakerName: selectedTemplateContext?.speakerName ?? "Speaker", eventName, sessionTitle: selectedTemplateContext?.title ?? "Your session", portalUrl: typeof window === "undefined" ? "/portal" : `${window.location.origin}/portal` }),
    body: resolveCommTemplate(templateDraft.body, { speakerName: selectedTemplateContext?.speakerName ?? "Speaker", eventName, sessionTitle: selectedTemplateContext?.title ?? "Your session", portalUrl: typeof window === "undefined" ? "/portal" : `${window.location.origin}/portal` }),
  };

  const editTemplate = (template: CommTemplate) => {
    setTemplateDraft({ ...template });
    setTemplateMessage("");
  };

  const saveTemplate = async () => {
    if (
      !eventId ||
      !templateDraft.name.trim() ||
      !templateDraft.subject.trim() ||
      !templateDraft.body.trim()
    ) {
      setTemplateMessage("Add a name, subject, and body before saving.");
      return;
    }
    setSavingTemplate(true);
    setTemplateMessage("");
    try {
      const id = await repo.comms.saveTemplate({ ...templateDraft, eventId });
      const savedTemplates = await repo.comms.listTemplates({ eventId });
      setTemplates(savedTemplates);
      const saved = savedTemplates.find((template) => template.id === id);
      if (saved) setTemplateDraft({ ...saved });
      setTemplateMessage("Template saved.");
    } catch (error) {
      setTemplateMessage(
        error instanceof Error ? error.message : "Could not save the template.",
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  const columns: DataGridColumn<Delivery>[] = [
    {
      key: "channel",
      header: "Channel",
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          {row.channel === "email" ? "Email" : "Calendar invite"}
        </span>
      ),
    },
    {
      key: "recipient",
      header: "Recipient",
      cell: (row) => <span>{row.recipient}</span>,
    },
    {
      key: "subject",
      header: "Subject",
      cell: (row) => <span className="font-medium">{row.subject}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span
          className={
            row.status === "failed"
              ? "text-destructive"
              : row.status === "sent"
                ? "text-emerald-700"
                : "text-muted-foreground"
          }
        >
          {statusLabel[row.status]}
          {row.error ? ` · ${row.error}` : ""}
        </span>
      ),
    },
    {
      key: "created",
      header: "Attempted",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {relativeTime(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <AppLayout title="Communications">
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="Communication actions"
          primaryAction={
            <Button variant="outline" size="sm" onClick={previewConfirmation}>
              <Send className="h-4 w-4" />
              Preview confirmation
            </Button>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Queued"
            value={
              deliveries.filter((delivery) => delivery.status === "queued")
                .length
            }
            icon={Mail}
          />
          <StatCard
            label="Delivered"
            value={
              deliveries.filter((delivery) => delivery.status === "sent").length
            }
            icon={CheckCircle2}
          />
          <StatCard
            label="Needs attention"
            value={
              deliveries.filter((delivery) => delivery.status === "failed")
                .length
            }
            icon={TriangleAlert}
          />
        </div>

        <section className="space-y-4 rounded-lg bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Template library</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Save reusable copy for confirmations, decisions, reminders, and
                calendar delivery.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTemplateDraft(emptyTemplate);
                setTemplateMessage("");
              }}
            >
              <Plus className="h-4 w-4" />
              New template
            </Button>
          </div>
          <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="space-y-2" aria-label="Saved templates">
              {templates.length ? (
                templates.map((template) => (
                  <Button
                    type="button"
                    key={template.id}
                    variant={
                      templateDraft.id === template.id ? "secondary" : "ghost"
                    }
                    className="h-auto w-full justify-start px-3 py-2 text-left"
                    onClick={() => editTemplate(template)}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {template.name}
                      </span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {
                          templateKinds.find(
                            (kind) => kind.value === template.kind,
                          )?.label
                        }
                      </span>
                    </span>
                  </Button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  No templates yet.
                </p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template name</Label>
                <Input
                  id="template-name"
                  value={templateDraft.name}
                  onChange={(event) =>
                    setTemplateDraft((draft) => ({
                      ...draft,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-kind">Message type</Label>
                <Select
                  value={templateDraft.kind}
                  onValueChange={(kind) =>
                    setTemplateDraft((draft) => ({
                      ...draft,
                      kind: kind as CommTemplateKind,
                    }))
                  }
                >
                  <SelectTrigger id="template-kind" aria-label="Message type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateKinds.map((kind) => (
                      <SelectItem key={kind.value} value={kind.value}>
                        {kind.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="template-subject">Subject</Label>
                <Input
                  id="template-subject"
                  value={templateDraft.subject}
                  onChange={(event) =>
                    setTemplateDraft((draft) => ({
                      ...draft,
                      subject: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="template-body">Body</Label>
                <Textarea
                  id="template-body"
                  className="min-h-36 resize-y"
                  value={templateDraft.body}
                  onChange={(event) =>
                    setTemplateDraft((draft) => ({
                      ...draft,
                      body: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-3 rounded-lg bg-background p-4 md:col-span-2">
                <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)] md:items-end"><div className="space-y-2"><Label htmlFor="template-preview-context">Preview with</Label><Select value={templateContextId} onValueChange={setTemplateContextId}><SelectTrigger id="template-preview-context"><SelectValue placeholder="Example speaker and session" /></SelectTrigger><SelectContent>{templateContexts.map((context) => <SelectItem key={context.id} value={context.id}>{context.speakerName} · {context.title}</SelectItem>)}</SelectContent></Select></div><p className="text-xs text-muted-foreground">This uses the same token resolver as delivery. Schedule-only tokens populate in the send review when an agenda item is selected.</p></div>
                <div><p className="text-sm font-medium">{resolvedTemplatePreview.subject || "Subject preview"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{resolvedTemplatePreview.body || "Body preview"}</p></div>
              </div>
              <div className="space-y-3 rounded-lg bg-background p-4 md:col-span-2">
                <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)] md:items-end"><div className="space-y-2"><Label htmlFor="template-preview-context">Preview with</Label><Select value={templateContextId} onValueChange={setTemplateContextId}><SelectTrigger id="template-preview-context"><SelectValue placeholder="Example speaker and session" /></SelectTrigger><SelectContent>{templateContexts.map((context) => <SelectItem key={context.id} value={context.id}>{context.speakerName} · {context.title}</SelectItem>)}</SelectContent></Select></div><p className="text-xs text-muted-foreground">This uses the same token resolver as delivery. Schedule-only tokens populate in the send review when an agenda item is selected.</p></div>
                <div><p className="text-sm font-medium">{resolvedTemplatePreview.subject || "Subject preview"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{resolvedTemplatePreview.body || "Body preview"}</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                <Button
                  type="button"
                  variant="accent"
                  onClick={() => void saveTemplate()}
                  disabled={savingTemplate || !eventId}
                >
                  {savingTemplate ? "Saving…" : "Save template"}
                </Button>
                {templateMessage && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {templateMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4 rounded-lg bg-card p-5">
            <div>
              <h2 className="font-semibold">Submission confirmation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A confirmation is queued without blocking the submission. Failed
                provider sends stay visible in the log.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="comms-recipient">Recipient</Label>
              <Input
                id="comms-recipient"
                type="email"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="comms-session-title">Session title</Label>
              <Input
                id="comms-session-title"
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="comms-preview">Email preview</Label>
              <Textarea
                id="comms-preview"
                value={`${preview.subject}\n\n${preview.text}`}
                readOnly
                className="min-h-40 resize-y"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={previewConfirmation}>
                <Send />
                Preview confirmation
              </Button>
              <Button variant="outline" onClick={downloadInvite}>
                <CalendarDays />
                Download .ics preview
              </Button>
            </div>
            {message && (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
            )}
          </div>
          <aside className="space-y-3 rounded-lg bg-card p-5">
            <h2 className="font-semibold">Send safeguards</h2>
            <p className="text-sm text-muted-foreground">
              Confirmation delivery is non-blocking. Every queued, sent, and
              failed attempt should be recorded against the event, speaker, and
              submission.
            </p>
            <p className="text-sm text-muted-foreground">
              Decision emails should be consolidated per speaker so mixed
              outcomes arrive as one coherent message.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={downloadInvite}
            >
              <CalendarDays />
              Test calendar attachment
            </Button>
          </aside>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Send log</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                An auditable history of delivery attempts for this event.
              </p>
            </div>
            <StatusTabs
              tabs={tabs}
              value={status}
              onValueChange={(value) =>
                setStatus(value as DeliveryStatus | "all")
              }
            />
          </div>
          {loadError && (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          )}
          {loading ? (
            <DataGrid
              rows={[]}
              columns={columns}
              empty="No delivery attempts match this view."
              loading
            />
          ) : visibleDeliveries.length ? (
            <DataGrid
              rows={visibleDeliveries}
              columns={columns}
              empty="No delivery attempts match this view."
              paginated
              onRowRef={(row, element) => {
                if (element) rowRefs.current.set(row.id, element);
                else rowRefs.current.delete(row.id);
              }}
            />
          ) : (
            <div className="rounded-lg bg-card">
              <EmptyState message="No delivery attempts match this view." />
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
