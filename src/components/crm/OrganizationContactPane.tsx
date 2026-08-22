import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { DetailPane } from "@/components/shared/DetailPane";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { CrmQueryErrorBoundary } from "@/components/crm/CrmQueryErrorBoundary";
import { crmStageLabel, crmStages } from "@/lib/crm-stages";
import { cleanErrorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { CrmStage } from "@/data/types";

type OrgEvent = Doc<"events">;

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
}

function IdentityForm({
  organizationId,
  contact,
  onSaved,
}: {
  organizationId: Id<"organizations">;
  contact?: { _id: Id<"crm_contacts">; firstName: string; lastName: string; email: string; stage: CrmStage; score: number };
  onSaved: (id: Id<"crm_contacts">) => void;
}) {
  const save = useMutation(api.crm.save);
  const [firstName, setFirstName] = useState(contact?.firstName ?? "");
  const [lastName, setLastName] = useState(contact?.lastName ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [stage, setStage] = useState<CrmStage>(contact?.stage ?? "prospect");
  const [score, setScore] = useState(String(contact?.score ?? 0));
  const [editing, setEditing] = useState(!contact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    const numericScore = Number(score);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) { setError("Enter a first name, last name, and email address."); return; }
    if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 100) { setError("Score must be a whole number from 0 to 100."); return; }
    setSaving(true); setError(undefined);
    try {
      const id = await save({ id: contact?._id, organizationId, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), stage, score: numericScore });
      setEditing(false);
      onSaved(id);
    } catch (cause) {
      // Event-limited organizers can view a shared-event contact here but cannot edit
      // organization identity (assertOrganizerOf in convex/crm.ts `save`); this is the message
      // that failure surfaces as, instead of a raw "Forbidden" mutation error.
      setError(cleanErrorMessage(cause, "This contact could not be saved. You may not have permission to edit the organization directory."));
    } finally {
      setSaving(false);
    }
  };

  if (!editing && contact) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-base font-semibold">{contact.firstName} {contact.lastName}</p>
            <p className="text-sm text-muted-foreground">{contact.email}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={contact.stage === "confirmed" ? "success" : contact.stage === "declined" ? "destructive" : "neutral"}>{crmStageLabel[contact.stage]}</StatusBadge>
          <span className="text-sm tabular-nums text-muted-foreground">Score {contact.score}</span>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(formEvent) => void submit(formEvent)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="org-crm-first-name">First name</Label><Input id="org-crm-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" autoFocus disabled={saving} /></div>
        <div className="space-y-1.5"><Label htmlFor="org-crm-last-name">Last name</Label><Input id="org-crm-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" disabled={saving} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="org-crm-email">Email</Label><Input id="org-crm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={saving} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="org-crm-stage">Stage</Label><Select value={stage} onValueChange={(value) => setStage(value as CrmStage)} disabled={saving}><SelectTrigger id="org-crm-stage"><SelectValue /></SelectTrigger><SelectContent>{crmStages.map((value) => <SelectItem key={value} value={value}>{crmStageLabel[value]}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="org-crm-score">Score</Label><Input id="org-crm-score" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} disabled={saving} /></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {contact && <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>}
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : contact ? "Save changes" : "Add contact"}</Button>
      </div>
    </form>
  );
}

function EventParticipation({
  organizationId,
  contactId,
  events,
  authorizedEvents,
}: {
  organizationId: Id<"organizations">;
  contactId: Id<"crm_contacts">;
  events: Array<{ event: OrgEvent; membershipId: Id<"crm_event_contacts">; speakerId?: Id<"speakers"> }>;
  authorizedEvents: OrgEvent[];
}) {
  const assign = useMutation(api.crm.assignOrganizationContactToEvent);
  const unlink = useMutation(api.crm.unlinkOrganizationContactFromEvent);
  const [assignEventId, setAssignEventId] = useState("");
  const [busyEventId, setBusyEventId] = useState<string>();
  const [error, setError] = useState<string>();

  const assignedIds = new Set(events.map((row) => row.event._id));
  const assignable = authorizedEvents.filter((event) => !assignedIds.has(event._id));

  const doAssign = async () => {
    if (!assignEventId) return;
    setBusyEventId(assignEventId); setError(undefined);
    try { await assign({ organizationId, contactId, eventId: assignEventId as Id<"events"> }); setAssignEventId(""); }
    catch (cause) { setError(cleanErrorMessage(cause, "This contact could not be assigned to that event.")); }
    finally { setBusyEventId(undefined); }
  };
  const doUnlink = async (eventId: Id<"events">) => {
    setBusyEventId(eventId); setError(undefined);
    try { await unlink({ organizationId, contactId, eventId }); }
    catch (cause) { setError(cleanErrorMessage(cause, "This contact could not be removed from that event.")); }
    finally { setBusyEventId(undefined); }
  };

  return (
    <section aria-label="Event participation" className="space-y-3">
      <h3 className="text-sm font-semibold">Event participation</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not assigned to any event yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((row) => (
            <li key={row.membershipId} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.event.name}</p>
                {row.speakerId && (
                  <Link className="text-xs text-primary hover:underline" to={`/events/${row.event.slug}/program/speakers/${row.speakerId}`}>
                    Linked speaker record
                  </Link>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void doUnlink(row.event._id)} disabled={Boolean(row.speakerId) || busyEventId === row.event._id} title={row.speakerId ? "Linked to a speaker record — archive instead to preserve history" : undefined}>
                {busyEventId === row.event._id ? "Removing…" : "Unlink"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {assignable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={assignEventId} onValueChange={setAssignEventId}>
            <SelectTrigger className="w-[14rem]" aria-label="Assign to event"><SelectValue placeholder="Assign to event…" /></SelectTrigger>
            <SelectContent>{assignable.map((event) => <SelectItem key={event._id} value={event._id}>{event.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => void doAssign()} disabled={!assignEventId || Boolean(busyEventId)}>
            {busyEventId === assignEventId ? "Assigning…" : "Assign"}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

function ContactDetail({
  organizationId,
  contactId,
  authorizedEvents,
  onClose,
}: {
  organizationId: Id<"organizations">;
  contactId: Id<"crm_contacts">;
  authorizedEvents: OrgEvent[];
  onClose: () => void;
}) {
  const data = useQuery(api.crm.getOrganizationContact, { organizationId, contactId });
  if (data === undefined) return <SkeletonList rows={3} label="Loading contact…" />;

  const { contact, events, speakers, history, sources } = data;
  const outstanding: string[] = [];
  if (events.length === 0) outstanding.push("Not assigned to any event yet.");
  if (!["confirmed", "declined", "archived"].includes(contact.stage) && contact.score === 0) outstanding.push("No score recorded yet.");
  if (events.some((row) => !row.speakerId)) outstanding.push("Assigned to an event with no linked speaker record.");

  return (
    <DetailPane title="Contact" onClose={onClose}>
      <div className="space-y-6">
        <IdentityForm organizationId={organizationId} contact={contact} onSaved={() => undefined} />
        <EventParticipation organizationId={organizationId} contactId={contact._id} events={events} authorizedEvents={authorizedEvents} />
        {speakers.length > 0 && (
          <section aria-label="Speaker records" className="space-y-2">
            <h3 className="text-sm font-semibold">Speaker records</h3>
            <ul className="space-y-1">
              {speakers.map((speaker) => {
                const speakerEvent = authorizedEvents.find((event) => event._id === speaker.eventId);
                return (
                  <li key={speaker._id} className="text-sm text-muted-foreground">
                    {speaker.firstName} {speaker.lastName}{speakerEvent ? ` — ${speakerEvent.name}` : ""}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {history.length > 0 && (
          <section aria-label="Stage and score history" className="space-y-2">
            <h3 className="text-sm font-semibold">Stage &amp; score history</h3>
            <ul className="space-y-1">
              {[...history].sort((a, b) => b.createdAt - a.createdAt).map((entry) => (
                <li key={entry._id} className="text-sm text-muted-foreground">
                  {formatDate(entry.createdAt)} — {crmStageLabel[entry.stage]}, score {entry.score}
                </li>
              ))}
            </ul>
          </section>
        )}
        {sources.length > 0 && (
          <section aria-label="Source provenance" className="space-y-2">
            <h3 className="text-sm font-semibold">Source provenance</h3>
            <ul className="space-y-1">
              {sources.map((record) => (
                <li key={record._id} className="text-sm text-muted-foreground">
                  Imported record {record.providerRecordId} — {formatDate(record.createdAt)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {outstanding.length > 0 && (
          <section aria-label="Outstanding work" className="space-y-2">
            <h3 className="text-sm font-semibold">Outstanding work</h3>
            <ul className="list-disc space-y-1 pl-4">
              {outstanding.map((item) => <li key={item} className="text-sm text-muted-foreground">{item}</li>)}
            </ul>
          </section>
        )}
      </div>
    </DetailPane>
  );
}

/**
 * Flex-sibling detail pane for the organization CRM workspace (#268 T009). Rendered through
 * `AppLayout`'s `detail` prop — the same mechanism `EventsLanding` already uses — so it pushes
 * the directory list rather than overlaying it. `contactId` undefined means "create new".
 */
export function OrganizationContactPane({
  organizationId,
  contactId,
  authorizedEvents,
  onClose,
  onCreated,
}: {
  organizationId: Id<"organizations">;
  contactId?: Id<"crm_contacts">;
  authorizedEvents: OrgEvent[];
  onClose: () => void;
  onCreated: (id: Id<"crm_contacts">) => void;
}) {
  if (!contactId) {
    return (
      <DetailPane title="New contact" onClose={onClose}>
        <IdentityForm organizationId={organizationId} onSaved={onCreated} />
      </DetailPane>
    );
  }
  return (
    <CrmQueryErrorBoundary
      fallback={(message) => (
        <DetailPane title="Contact" onClose={onClose}>
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">{message}</p>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </DetailPane>
      )}
    >
      <ContactDetail organizationId={organizationId} contactId={contactId} authorizedEvents={authorizedEvents} onClose={onClose} />
    </CrmQueryErrorBoundary>
  );
}
