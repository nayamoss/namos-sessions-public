import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Mail,
  Inbox,
  Send,
  TriangleAlert,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { FilterMenu } from "@/components/shared/StatusTabs";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useRepo } from "@/data/repo";
import type {
  Comm,
  CommTemplate,
  CommunicationDraft,
  Event,
  InboundMessage,
  InboundEmailDomain,
  InboundTriageStatus,
  Speaker,
  Submission,
} from "@/data/types";
import { calendarInvite } from "@/lib/calendar-invite";
import { submissionConfirmationEmail } from "@/lib/confirmation-email";
import { templateKinds } from "./CommTemplateEditor";

type DeliveryStatus = "queued" | "sent" | "failed";
type DeliveryChannel = "email" | "calendar_invite";
type CommTab = "inbox" | "drafts" | "templates" | "campaign" | "test" | "activity";

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

/** Sample invite for the active event, so organizers see their own branding and times. */
function downloadInvite(
  event: Pick<Event, "name" | "slug" | "location" | "startDate"> | undefined,
) {
  const startTime = event?.startDate ?? Date.now() + 86_400_000;
  const content = calendarInvite({
    uid: `namos-sessions-preview-${event?.slug ?? "event"}`,
    title: event
      ? `${event.name} — schedule invitation preview`
      : "Schedule invitation preview",
    startTime,
    endTime: startTime + 45 * 60_000,
    location: event?.location,
    description:
      "Sample invite. Real invites carry each speaker's own session times, room and portal link.",
  });
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/calendar;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${event?.slug ?? "event"}-invitation-preview.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Communications() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const selectedId = searchParams.get("selected");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [templates, setTemplates] = useState<CommTemplate[]>([]);
  const [drafts, setDrafts] = useState<CommunicationDraft[]>([]);
  const [inbox, setInbox] = useState<InboundMessage[]>([]);
  const [inboundDomains, setInboundDomains] = useState<InboundEmailDomain[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [inboxLinks, setInboxLinks] = useState<Record<string, { speakerId?: string; submissionId?: string }>>({});
  const [inboxStatus, setInboxStatus] = useState<InboundTriageStatus | "all">("all");
  const [inboundProvider, setInboundProvider] = useState<"resend" | "ses">("resend");
  const [inboundMode, setInboundMode] = useState<"managed" | "custom">("managed");
  const [inboundDomain, setInboundDomain] = useState("");
  const [inboundAlias, setInboundAlias] = useState("");
  const [eventName, setEventName] = useState("Your event");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const [recipient, setRecipient] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Your session title");
  const [message, setMessage] = useState("");
  const crmContactIds = useMemo(() => {
    const value = location.state as { crmContactIds?: unknown } | null;
    return Array.isArray(value?.crmContactIds)
      ? value.crmContactIds.filter((id): id is string => typeof id === "string")
      : [];
  }, [location.state]);
  const [tab, setTab] = useState<CommTab>(
    selectedId ? "activity" : crmContactIds.length ? "campaign" : "templates",
  );
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [campaignConfirmOpen, setCampaignConfirmOpen] = useState(false);
  const [campaignSending, setCampaignSending] = useState(false);
  const [campaignResult, setCampaignResult] = useState<string>();
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const event = activeEvent;
      if (!event) {
        setDeliveries([]);
        setTemplates([]);
        setDrafts([]);
        setEventName("Your event");
        return;
      }
      setEventName(event.name);
      const [log, preparedDrafts] = await Promise.all([
        repo.comms.list({ eventId: event.id }),
        repo.comms.listDrafts({ eventId: event.id }),
      ]);
      setDeliveries(createDeliveries(log as CommDocument[]));
      setDrafts(preparedDrafts);
      try {
        const [messages, domains, eventSpeakers, eventSubmissions] = await Promise.all([
          repo.comms.listInbox({ eventId: event.id }),
          repo.comms.listInboundDomains({ eventId: event.id }),
          repo.speakers.list({ eventId: event.id }),
          repo.submissions.list({ eventId: event.id }),
        ]);
        setInbox(messages);
        setInboundDomains(domains);
        setSpeakers(eventSpeakers);
        setSubmissions(eventSubmissions);
      } catch {
        setInbox([]);
        setInboundDomains([]);
        setSpeakers([]);
        setSubmissions([]);
      }
      try {
        const savedTemplates = await repo.comms.listTemplates({
          eventId: event.id,
        });
        setTemplates(savedTemplates);
      } catch {
        setTemplates([]);
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
    if (drafts.some((draft) => draft.id === selectedId)) {
      setTab("drafts");
      return;
    }
    setTab("activity");
    const target = deliveries.find((delivery) => delivery.id === selectedId);
    if (target) setStatus(target.status);
  }, [deliveries, drafts, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "center" });
    document
      .getElementById(`draft-${selectedId}`)
      ?.scrollIntoView({ block: "center" });
  }, [selectedId, deliveries, status]);

  useEffect(() => {
    if (crmContactIds.length) setTab("campaign");
  }, [crmContactIds.length]);

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

  const sendCampaign = async () => {
    if (!activeEvent || !crmContactIds.length) return;
    setCampaignSending(true);
    setCampaignResult(undefined);
    try {
      const result = await repo.comms.sendCrmCampaign({
        eventId: activeEvent.id,
        contactIds: crmContactIds,
        subject: campaignSubject,
        body: campaignBody,
      });
      setCampaignResult(`${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`);
      setCampaignConfirmOpen(false);
      await loadDeliveries();
    } catch (cause) {
      setCampaignResult(cause instanceof Error ? cause.message : "Campaign could not be sent.");
      setCampaignConfirmOpen(false);
    } finally {
      setCampaignSending(false);
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

        <Tabs value={tab} onValueChange={(value) => setTab(value as CommTab)}>
          <TabsList>
            <TabsTrigger value="inbox">Inbox{inbox.filter((message) => message.triageStatus === "unmatched").length ? ` (${inbox.filter((message) => message.triageStatus === "unmatched").length})` : ""}</TabsTrigger>
            <TabsTrigger value="drafts">
              Drafts{drafts.length ? ` (${drafts.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="campaign">Campaign</TabsTrigger>
            <TabsTrigger value="test">Test &amp; preview</TabsTrigger>
            <TabsTrigger value="activity">Activity log</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="space-y-4">
            <section className={cardSurfaceClasses("default", "space-y-4 p-5")}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Replies</h2><p className="mt-1 text-sm text-muted-foreground">Matched replies stay attached to send history. Unmatched messages wait here for organizer triage.</p></div><FilterMenu tabs={(["all", "unmatched", "matched", "resolved"] as const).map((value) => ({ value, label: value === "all" ? "All replies" : value[0].toUpperCase() + value.slice(1), count: value === "all" ? inbox.length : inbox.filter((message) => message.triageStatus === value).length }))} value={inboxStatus} onValueChange={(value) => setInboxStatus(value as InboundTriageStatus | "all")} /></div>
              {inbox.filter((message) => inboxStatus === "all" || message.triageStatus === inboxStatus).length ? (
                <div className="divide-y">
                  {inbox.filter((message) => inboxStatus === "all" || message.triageStatus === inboxStatus).map((message) => {
                    const link = inboxLinks[message.id] ?? {};
                    return (
                      <article key={message.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-medium">{message.subject || "No subject"}</h3>
                            <p className="mt-1 text-xs text-muted-foreground">{message.fromEmail} · {message.provider.toUpperCase()} · {relativeTime(message.receivedAt)}</p>
                          </div>
                          <span className="text-xs capitalize text-muted-foreground">{message.triageStatus}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm">{message.text}</p>
                        {message.triageStatus !== "resolved" && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                            <Select value={link.speakerId} onValueChange={(speakerId) => setInboxLinks((current) => ({ ...current, [message.id]: { ...current[message.id], speakerId } }))}>
                              <SelectTrigger aria-label={`Speaker for ${message.subject || "reply"}`}><SelectValue placeholder="Link speaker" /></SelectTrigger>
                              <SelectContent>{speakers.map((speaker) => <SelectItem key={speaker.id} value={speaker.id}>{speaker.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={link.submissionId} onValueChange={(submissionId) => setInboxLinks((current) => ({ ...current, [message.id]: { ...current[message.id], submissionId } }))}>
                              <SelectTrigger aria-label={`Submission for ${message.subject || "reply"}`}><SelectValue placeholder="Link submission" /></SelectTrigger>
                              <SelectContent>{submissions.map((submission) => <SelectItem key={submission.id} value={submission.id}>{submission.title || "Untitled submission"}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="sm" disabled={!link.speakerId && !link.submissionId} onClick={() => void repo.comms.linkInbox({ eventId: activeEvent!.id, messageId: message.id, speakerId: link.speakerId as Speaker["id"] | undefined, submissionId: link.submissionId as Submission["id"] | undefined }).then(loadDeliveries)}>Link and resolve</Button>
                            <Button size="sm" variant="outline" onClick={() => void repo.comms.linkInbox({ eventId: activeEvent!.id, messageId: message.id }).then(loadDeliveries)}>Resolve only</Button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : <EmptyState compact icon={Inbox} title="No replies in this view" message="Replies received through a verified Resend or SES domain will appear here." />}
            </section>
            <section className={cardSurfaceClasses("default", "space-y-4 p-5")}><div><h2 className="font-semibold">Reply domains</h2><p className="mt-1 text-sm text-muted-foreground">A domain activates only after its MX record and a signed provider receipt are both verified.</p></div>{inboundDomains.length > 0 && <ul className="space-y-2">{inboundDomains.map((domain) => <li key={domain.id} className="space-y-2 rounded-md bg-background px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>{domain.aliasLocalPart}@{domain.domain}</span><span className="text-muted-foreground">{domain.provider.toUpperCase()} · {domain.status === "verified" || domain.verifiedAt ? "Verified" : domain.status === "dns_verified" ? "DNS verified; awaiting receipt" : domain.status === "failed" ? "Verification failed" : "Awaiting verification"}</span></div>{domain.expectedMx && <p className="text-xs text-muted-foreground">Expected MX: {domain.expectedMx}</p>}{domain.failureReason && <p className="text-xs text-destructive">{domain.failureReason}</p>}<Button size="sm" variant="outline" onClick={() => void repo.comms.verifyInboundDomain({ eventId: activeEvent!.id, domainId: domain.id }).then(loadDeliveries)}>Check DNS</Button></li>)}</ul>}<div className="grid gap-3 md:grid-cols-4"><Select value={inboundProvider} onValueChange={(value) => setInboundProvider(value as "resend" | "ses")}><SelectTrigger aria-label="Inbound provider"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="resend">Resend</SelectItem><SelectItem value="ses">Amazon SES</SelectItem></SelectContent></Select><Select value={inboundMode} onValueChange={(value) => setInboundMode(value as "managed" | "custom")}><SelectTrigger aria-label="Reply domain mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="managed">Namos managed</SelectItem><SelectItem value="custom">Custom domain</SelectItem></SelectContent></Select><Input aria-label="Reply alias" placeholder="event-code" value={inboundAlias} onChange={(event) => setInboundAlias(event.target.value)} /><Input aria-label="Reply domain" placeholder="reply.example.com" value={inboundDomain} onChange={(event) => setInboundDomain(event.target.value)} /></div><Button size="sm" variant="outline" disabled={!inboundAlias.trim() || !inboundDomain.trim()} onClick={() => void repo.comms.saveInboundDomain({ eventId: activeEvent!.id, provider: inboundProvider, mode: inboundMode, domain: inboundDomain, aliasLocalPart: inboundAlias }).then(loadDeliveries)}>Save reply domain</Button></section>
          </TabsContent>

          <TabsContent value="drafts" className="space-y-4">
            <section className={cardSurfaceClasses("default", "space-y-4 p-5")}>
              <div>
                <h2 className="font-semibold">Prepared drafts</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review agent-prepared copy here. Preparing a draft never sends
                  it.
                </p>
              </div>
              {drafts.length ? (
                <div className="space-y-3">
                  {drafts.map((draft) => (
                    <article
                      id={`draft-${draft.id}`}
                      key={draft.id}
                      className={`rounded-lg bg-background p-4 ${selectedId === draft.id ? "ring-2 ring-ring" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-medium">{draft.subject}</h3>
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {draft.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        To {draft.toEmail} · {draft.kind}
                        {draft.calendarAttached
                          ? " · Calendar invite"
                          : ""} ·{" "}
                        {draft.source === "agent"
                          ? "Prepared by Operations Agent"
                          : "Manual"}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm">
                        {draft.body}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={Mail}
                  title="No prepared drafts"
                  message="Operations Agent proposals appear here only after organizer approval."
                />
              )}
            </section>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <section className={cardSurfaceClasses("default", "space-y-4 p-5")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Template library</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save reusable copy for confirmations, decisions, reminders,
                    and calendar delivery.
                  </p>
                </div>
                <Button type="button" variant="accent" size="sm" asChild>
                  <Link
                    to={
                      activeEvent
                        ? `/events/${activeEvent.slug}/program/communications/templates/new`
                        : "#"
                    }
                  >
                    New template
                  </Link>
                </Button>
              </div>
              {templates.length ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {templates.map((template) => (
                    <Link
                      key={template.id}
                      to={`/events/${activeEvent?.slug}/program/communications/templates/${template.id}/edit`}
                      className="rounded-lg bg-background p-4"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {template.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {
                              templateKinds.find(
                                (kind) => kind.value === template.kind,
                              )?.label
                            }
                          </span>
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-background">
                  <EmptyState
                    compact
                    icon={FileText}
                    title="Create your first message template"
                    message="Reuse consistent copy for confirmations, decisions, reminders, and calendar delivery."
                    action={
                      <Button type="button" variant="accent" size="sm" asChild>
                        <Link
                          to={
                            activeEvent
                              ? `/events/${activeEvent.slug}/program/communications/templates/new`
                              : "#"
                          }
                        >
                          New template
                        </Link>
                      </Button>
                    }
                  />
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="campaign" className="space-y-4">
            <section className={cardSurfaceClasses("default", "space-y-4 p-5")}>
              <div>
                <h2 className="font-semibold">Campaign composer</h2>
                <p className="mt-1 text-sm text-muted-foreground">Selected contacts are resolved securely by the server for this event. Recipient details are never placed in the address bar or analytics.</p>
              </div>
              {crmContactIds.length ? (
                <>
                  <div className="space-y-2"><Label htmlFor="crm-campaign-subject">Subject</Label><Input id="crm-campaign-subject" value={campaignSubject} onChange={(event) => setCampaignSubject(event.target.value)} maxLength={200} disabled={campaignSending} /></div>
                  <div className="space-y-2"><Label htmlFor="crm-campaign-body">Message</Label><Textarea id="crm-campaign-body" value={campaignBody} onChange={(event) => setCampaignBody(event.target.value)} maxLength={20_000} className="min-h-48 resize-y" disabled={campaignSending} /></div>
                  <Button type="button" disabled={!campaignSubject.trim() || !campaignBody.trim() || campaignSending} onClick={() => setCampaignConfirmOpen(true)}><Send className="h-4 w-4" aria-hidden="true" />Review and send</Button>
                </>
              ) : (
                <EmptyState compact icon={Mail} title="Select contacts to start a campaign" message="Choose contacts from the Speaker CRM, then use Email selected." action={activeEvent ? <Button type="button" variant="outline" size="sm" asChild><Link to={`/events/${activeEvent.slug}/program/speakers`}>Open Speaker CRM</Link></Button> : undefined} />
              )}
              {campaignResult && <p role="status" className="text-sm text-muted-foreground">{campaignResult}</p>}
            </section>
            <AlertDialog open={campaignConfirmOpen} onOpenChange={setCampaignConfirmOpen}>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Send this campaign?</AlertDialogTitle><AlertDialogDescription>The selected Contacts recipients will be resolved for the current event on the server. You cannot undo a send.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={campaignSending}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void sendCampaign(); }} disabled={campaignSending}>{campaignSending ? "Sending…" : "Send campaign"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          <TabsContent value="test" className="space-y-4">
            <section className={cardSurfaceClasses("default", "space-y-4 p-5")}>
              <div>
                <h2 className="font-semibold">Test the confirmation email</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This previews the automatic email sent when someone submits —
                  separate from the templates above. Nothing here sends or
                  records a real delivery. Confirmation delivery itself is
                  non-blocking: every queued, sent, and failed attempt is
                  recorded in the activity log, and decision emails are
                  consolidated per speaker so mixed outcomes arrive as one
                  message.
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
                <Button
                  variant="outline"
                  onClick={() => downloadInvite(activeEvent)}
                >
                  <CalendarDays />
                  Download .ics preview
                </Button>
              </div>
              {message && (
                <p role="status" className="text-sm text-muted-foreground">
                  {message}
                </p>
              )}
            </section>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Activity log</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  An auditable history of delivery attempts for this event.
                </p>
              </div>
              <FilterMenu
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
              <div className={cardSurfaceClasses()}>
                <EmptyState
                  icon={status === "all" ? Send : TriangleAlert}
                  title={
                    deliveries.length
                      ? "No deliveries match this status"
                      : "No delivery activity yet"
                  }
                  message={
                    deliveries.length
                      ? "Show all delivery attempts or choose another status."
                      : "Confirmation, decision, reminder, and calendar deliveries will appear here after they run."
                  }
                  action={
                    deliveries.length ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStatus("all")}
                      >
                        Show all activity
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
