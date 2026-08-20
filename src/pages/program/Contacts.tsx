import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Database, Mail, RefreshCw, UsersRound } from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import { selectedBackend } from "@/data/backend";
import type { CrmContact, CrmContactId, CrmSegment, CrmSource, CrmSourceProvider, CrmStage } from "@/data/types";

const stages: CrmStage[] = ["prospect", "contacted", "qualified", "invited", "negotiating", "confirmed", "declined", "archived"];
const stageLabel: Record<CrmStage, string> = {
  prospect: "Prospect", contacted: "Contacted", qualified: "Qualified", invited: "Invited",
  negotiating: "Negotiating", confirmed: "Confirmed", declined: "Declined", archived: "Archived",
};

function ContactPane({ contact, onClose, onSaved }: { contact?: CrmContact; onClose: () => void; onSaved: () => void }) {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [firstName, setFirstName] = useState(contact?.firstName ?? "");
  const [lastName, setLastName] = useState(contact?.lastName ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [stage, setStage] = useState<CrmStage>(contact?.stage ?? "prospect");
  const [score, setScore] = useState(String(contact?.score ?? 0));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    const numericScore = Number(score);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) { setError("Enter a first name, last name, and email address."); return; }
    if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 100) { setError("Score must be a whole number from 0 to 100."); return; }
    setSaving(true); setError(undefined);
    try {
      await repo.crm.save({ eventId: event.id, id: contact?.id, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), stage, score: numericScore });
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this contact."); }
    finally { setSaving(false); }
  };
  const unlink = async () => {
    if (!contact) return;
    setSaving(true); setError(undefined);
    try { await repo.crm.unlinkFromEvent({ eventId: event.id, contactId: contact.id }); onSaved(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Contact could not be removed from this event."); }
    finally { setSaving(false); }
  };

  const content = (
    <form className="space-y-5" onSubmit={(formEvent) => void submit(formEvent)}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="crm-first-name">First name</Label><Input id="crm-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" autoFocus disabled={saving} /></div>
        <div className="space-y-1.5"><Label htmlFor="crm-last-name">Last name</Label><Input id="crm-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" disabled={saving} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="crm-email">Email</Label><Input id="crm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={saving} /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="crm-stage">Stage</Label><Select value={stage} onValueChange={(value) => setStage(value as CrmStage)} disabled={saving}><SelectTrigger id="crm-stage"><SelectValue /></SelectTrigger><SelectContent>{stages.map((value) => <SelectItem key={value} value={value}>{stageLabel[value]}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="crm-score">Score</Label><Input id="crm-score" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} disabled={saving} /></div>
      </div>
      {contact?.speakerId && <p className="text-xs leading-5 text-muted-foreground">This contact is linked to a speaker record. Archiving keeps speaker and portal history intact.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2">{contact ? <Button type="button" variant="outline" onClick={() => void unlink()} disabled={saving || Boolean(contact.speakerId)}>Remove from event</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save contact"}</Button></div></div>
    </form>
  );
  return <AppLayout title={contact ? "Edit contact" : "New contact"}>{content}</AppLayout>;
}

function SourceDialog({ open, onOpenChange, onSaved, pendingId, pendingProvider }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void; pendingId?: string; pendingProvider?: CrmSourceProvider }) {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [provider, setProvider] = useState<CrmSourceProvider>("airtable");
  const [token, setToken] = useState("");
  const [location, setLocation] = useState("");
  const [table, setTable] = useState("");
  const [emailField, setEmailField] = useState("Email");
  const [nameMapping, setNameMapping] = useState<"full" | "split">("full");
  const [fullNameField, setFullNameField] = useState("Name");
  const [firstNameField, setFirstNameField] = useState("First name");
  const [lastNameField, setLastNameField] = useState("Last name");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { if (pendingProvider) setProvider(pendingProvider); }, [pendingProvider]);
  const config = provider === "airtable"
    ? { airtableBaseId: location.trim(), airtableTableName: table.trim(), emailField: emailField.trim(), fullNameField: nameMapping === "full" ? fullNameField.trim() || undefined : undefined, firstNameField: nameMapping === "split" ? firstNameField.trim() || undefined : undefined, lastNameField: nameMapping === "split" ? lastNameField.trim() || undefined : undefined }
    : { notionDatabaseId: location.trim(), emailField: emailField.trim(), fullNameField: nameMapping === "full" ? fullNameField.trim() || undefined : undefined, firstNameField: nameMapping === "split" ? firstNameField.trim() || undefined : undefined, lastNameField: nameMapping === "split" ? lastNameField.trim() || undefined : undefined };
  const startOAuth = async () => {
    setSaving(true); setError(undefined);
    try { const result = await repo.crm.startSourceOAuth({ eventId: event.id, provider }); window.location.assign(result.url); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "OAuth connection could not start."); setSaving(false); }
  };
  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault(); setSaving(true); setError(undefined);
    try {
      if (pendingId) await repo.crm.finishSourceOAuth({ eventId: event.id, provider, pendingId, config });
      else await repo.crm.connectSource({ eventId: event.id, provider, token, config });
      onSaved(); onOpenChange(false); setToken("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CRM source could not be connected."); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{pendingId ? "Finish CRM source setup" : "Connect CRM source"}</DialogTitle><DialogDescription>Map an email and full-name field. Imports can update contact identity only; your stages, scores, segments, and event links stay in Namos.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(formEvent) => void submit(formEvent)}>
    <div className="space-y-1.5"><Label htmlFor="crm-source-provider">Provider</Label><Select value={provider} onValueChange={(value) => setProvider(value as CrmSourceProvider)} disabled={saving || Boolean(pendingId)}><SelectTrigger id="crm-source-provider"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="airtable">Airtable</SelectItem><SelectItem value="notion">Notion</SelectItem></SelectContent></Select></div>
    {!pendingId && <div className="rounded-md bg-muted/60 p-3"><p className="text-sm font-medium">Recommended</p><p className="mt-1 text-sm text-muted-foreground">Authorize access without copying credentials into this form.</p><Button className="mt-3" type="button" variant="outline" onClick={() => void startOAuth()} disabled={saving}>Connect with OAuth</Button></div>}
    {!pendingId && <div className="space-y-1.5"><Label htmlFor="crm-source-token">Personal access credential</Label><Input id="crm-source-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" disabled={saving} /><p className="text-xs text-muted-foreground">Use this only when OAuth is not available for your workspace.</p></div>}
    <div className="space-y-1.5"><Label htmlFor="crm-source-location">{provider === "airtable" ? "Base ID" : "Database ID"}</Label><Input id="crm-source-location" value={location} onChange={(event) => setLocation(event.target.value)} disabled={saving} /></div>
    {provider === "airtable" && <div className="space-y-1.5"><Label htmlFor="crm-source-table">Table name</Label><Input id="crm-source-table" value={table} onChange={(event) => setTable(event.target.value)} disabled={saving} /></div>}
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="crm-source-email">Email field</Label><Input id="crm-source-email" value={emailField} onChange={(event) => setEmailField(event.target.value)} disabled={saving} /></div><div className="space-y-1.5"><Label htmlFor="crm-source-name-mode">Name mapping</Label><Select value={nameMapping} onValueChange={(value) => setNameMapping(value as "full" | "split")} disabled={saving}><SelectTrigger id="crm-source-name-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full">One full-name field</SelectItem><SelectItem value="split">Separate first and last fields</SelectItem></SelectContent></Select></div></div>
    {nameMapping === "full" ? <div className="space-y-1.5"><Label htmlFor="crm-source-name">Full-name field</Label><Input id="crm-source-name" value={fullNameField} onChange={(event) => setFullNameField(event.target.value)} disabled={saving} /></div> : <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="crm-source-first-name">First-name field</Label><Input id="crm-source-first-name" value={firstNameField} onChange={(event) => setFirstNameField(event.target.value)} disabled={saving} /></div><div className="space-y-1.5"><Label htmlFor="crm-source-last-name">Last-name field</Label><Input id="crm-source-last-name" value={lastNameField} onChange={(event) => setLastNameField(event.target.value)} disabled={saving} /></div></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || (!pendingId && !token.trim())}>{saving ? "Connecting…" : pendingId ? "Finish connection" : "Connect with credential"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}

function SegmentDialog({ open, onOpenChange, segment, defaultStage, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; segment?: CrmSegment; defaultStage: CrmStage | "all"; onSaved: () => void }) {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [name, setName] = useState(segment?.name ?? "");
  const [stage, setStage] = useState<CrmStage | "all">(segment?.stage ?? defaultStage);
  const [minScore, setMinScore] = useState(segment?.minScore === undefined ? "" : String(segment.minScore));
  const [maxScore, setMaxScore] = useState(segment?.maxScore === undefined ? "" : String(segment.maxScore));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { setName(segment?.name ?? ""); setStage(segment?.stage ?? defaultStage); setMinScore(segment?.minScore === undefined ? "" : String(segment.minScore)); setMaxScore(segment?.maxScore === undefined ? "" : String(segment.maxScore)); }, [defaultStage, segment, open]);
  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault(); setSaving(true); setError(undefined);
    try {
      await repo.crm.saveSegment({ eventId: event.id, id: segment?.id, name: name.trim(), stage: stage === "all" ? undefined : stage, minScore: minScore === "" ? undefined : Number(minScore), maxScore: maxScore === "" ? undefined : Number(maxScore) });
      onSaved(); onOpenChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Saved segment could not be updated."); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{segment ? "Edit saved segment" : "Save current filters"}</DialogTitle><DialogDescription>Save a reusable stage and score view for this event.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => void submit(event)}><div className="space-y-1.5"><Label htmlFor="crm-segment-name">Name</Label><Input id="crm-segment-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus disabled={saving} /></div><div className="space-y-1.5"><Label htmlFor="crm-segment-stage">Stage</Label><Select value={stage} onValueChange={(value) => setStage(value as CrmStage | "all")} disabled={saving}><SelectTrigger id="crm-segment-stage"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any stage</SelectItem>{stages.map((value) => <SelectItem key={value} value={value}>{stageLabel[value]}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="crm-segment-min">Minimum score</Label><Input id="crm-segment-min" inputMode="numeric" value={minScore} onChange={(event) => setMinScore(event.target.value)} disabled={saving} /></div><div className="space-y-1.5"><Label htmlFor="crm-segment-max">Maximum score</Label><Input id="crm-segment-max" inputMode="numeric" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} disabled={saving} /></div></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save segment"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

export default function Contacts() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contactId } = useParams();
  const location = useLocation();
  const creatingContact = contactId === "new" || location.pathname.endsWith("/new");
  const navigate = useNavigate();
  const pendingId = searchParams.get("crm_oauth") ?? undefined;
  const pendingProvider = searchParams.get("provider") === "notion" ? "notion" : searchParams.get("provider") === "airtable" ? "airtable" : undefined;
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [segments, setSegments] = useState<CrmSegment[]>([]);
  const [sources, setSources] = useState<CrmSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<CrmStage | "all">("all");
  const [segmentId, setSegmentId] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStage, setBulkStage] = useState<CrmStage>("contacted");
  const [busy, setBusy] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string>();
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [sourceMessage, setSourceMessage] = useState<string>();
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { const [nextContacts, nextSegments, nextSources] = await Promise.all([repo.crm.list({ eventId: event.id }), repo.crm.listSegments({ eventId: event.id }), typeof repo.crm.listSources === "function" ? repo.crm.listSources({ eventId: event.id }) : Promise.resolve([])]); setContacts(nextContacts); setSegments(nextSegments); setSources(nextSources); }
    catch (cause) { setContacts([]); setSources([]); setError(cause instanceof Error ? cause.message : "Contacts could not be loaded."); }
    finally { setLoading(false); }
  }, [event.id, repo]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (pendingId && pendingProvider) setSourceDialogOpen(true); }, [pendingId, pendingProvider]);

  const selectedSegment = segments.find((segment) => segment.id === segmentId);
  const visible = useMemo(() => contacts.filter((contact) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesQuery = !query || `${contact.firstName} ${contact.lastName} ${contact.email}`.toLocaleLowerCase().includes(query);
    const matchesStage = stage === "all" || contact.stage === stage;
    const matchesSegment = !selectedSegment || ((selectedSegment.stage === undefined || contact.stage === selectedSegment.stage) && (selectedSegment.minScore === undefined || contact.score >= selectedSegment.minScore) && (selectedSegment.maxScore === undefined || contact.score <= selectedSegment.maxScore));
    return matchesQuery && matchesStage && matchesSegment;
  }), [contacts, search, selectedSegment, stage]);
  const selected = contacts.filter((contact) => selectedIds.includes(contact.id));
  const selection = selectedIds as CrmContactId[];

  const applyBulkStage = async () => { if (selection.length === 0) return; setBusy(true); try { await repo.crm.bulkStage({ eventId: event.id, contactIds: selection, stage: bulkStage }); setSelectedIds([]); await load(); } finally { setBusy(false); } };
  const archiveSelected = async () => { if (selection.length === 0) return; setBusy(true); try { await repo.crm.archive({ eventId: event.id, contactIds: selection }); setSelectedIds([]); await load(); } finally { setBusy(false); } };
  const backfillSpeakers = async () => {
    setBusy(true); setBackfillMessage(undefined);
    try {
      const result = await repo.crm.backfillEvent({ eventId: event.id });
      setBackfillMessage(result.linked ? `${result.linked} speaker ${result.linked === 1 ? "was" : "were"} linked to Contacts.` : result.total ? "All existing speakers are already linked to Contacts." : "There are no speakers to backfill yet.");
      await load();
    } catch (cause) { setBackfillMessage(cause instanceof Error ? cause.message : "Speaker backfill could not run."); }
    finally { setBusy(false); }
  };
  const syncSource = async (provider: CrmSourceProvider) => { setBusy(true); setSourceMessage(undefined); try { const result = await repo.crm.syncSource({ eventId: event.id, provider }); setSourceMessage(`${provider === "airtable" ? "Airtable" : "Notion"} synced: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`); await load(); } catch (cause) { setSourceMessage(cause instanceof Error ? cause.message : "Source sync could not run."); } finally { setBusy(false); } };

  if (selectedBackend() !== "convex") return <AppLayout title="Contacts"><section className="flex min-h-64 flex-col items-center justify-center text-center"><UsersRound className="h-6 w-6 text-muted-foreground" aria-hidden="true" /><h2 className="mt-3 text-base font-semibold">Contacts require a managed workspace</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">The organization CRM is available only when this workspace uses the managed Convex data service.</p></section></AppLayout>;

  if (contactId || creatingContact) {
    const creating = creatingContact;
    const contact = creating ? undefined : contacts.find((row) => row.id === contactId);
    if (loading) return <AppLayout title={creating ? "New contact" : "Edit contact"}><SkeletonList rows={4} label="Loading contact…" /></AppLayout>;
    if (!creating && !contact) return <AppLayout title="Contact not found"><EmptyState icon={UsersRound} title="Contact not found" action={<Button onClick={() => navigate(`/events/${event.slug}/program/contacts`)}>Back to contacts</Button>} /></AppLayout>;
    return <ContactPane contact={contact} onClose={() => navigate(`/events/${event.slug}/program/contacts`)} onSaved={() => void load()} />;
  }

  const columns: DataGridColumn<CrmContact>[] = [
    { key: "contact", header: "Contact", kind: "row-header", sortValue: (row) => `${row.lastName} ${row.firstName}`, cell: (row) => <div className="min-w-0"><Button type="button" variant="ghost" size="sm" className="h-auto max-w-full justify-start truncate p-0 font-medium hover:bg-transparent hover:underline" onClick={() => navigate(`/events/${event.slug}/program/contacts/${row.id}/edit`)}>{row.firstName} {row.lastName}</Button><p className="truncate text-xs text-muted-foreground">{row.email}</p></div> },
    { key: "stage", header: "Stage", width: "11rem", sortValue: (row) => row.stage, cell: (row) => <span className="text-sm">{stageLabel[row.stage]}</span> },
    { key: "score", header: "Score", width: "6rem", align: "right", sortValue: (row) => row.score, cell: (row) => <span className="tabular-nums">{row.score}</span> },
    { key: "linked", header: "Speaker", width: "8rem", cell: (row) => <span className="text-sm text-muted-foreground">{row.speakerId ? "Linked" : "—"}</span> },
  ];
  return <AppLayout title="Contacts">
    <div className="space-y-4">
      <ContentToolbar ariaLabel="Contact directory controls" search={<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts" aria-label="Search contacts" />} utilities={<>
        <Select value={stage} onValueChange={(value) => setStage(value as CrmStage | "all")}><SelectTrigger className="w-[10rem]" aria-label="Filter by stage"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{stages.map((value) => <SelectItem key={value} value={value}>{stageLabel[value]}</SelectItem>)}</SelectContent></Select>
        <Select value={segmentId} onValueChange={setSegmentId}><SelectTrigger className="w-[11rem]" aria-label="Choose saved segment"><SelectValue placeholder="Saved segment" /></SelectTrigger><SelectContent><SelectItem value="all">All contacts</SelectItem>{segments.map((segment) => <SelectItem key={segment.id} value={segment.id}>{segment.name}</SelectItem>)}</SelectContent></Select>
        <Button type="button" variant="outline" size="sm" onClick={() => setSegmentDialogOpen(true)}>{selectedSegment ? "Edit segment" : "Save filters"}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void backfillSpeakers()} disabled={busy}><UsersRound className="h-4 w-4" aria-hidden="true" />Backfill speakers</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setSourceDialogOpen(true)}><Database className="h-4 w-4" aria-hidden="true" />Connect source</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />Refresh</Button>
      </>} primaryAction={<Button type="button" size="sm" onClick={() => navigate(`/events/${event.slug}/program/contacts/new`)}>Add contact</Button>} />
      {backfillMessage && <p role="status" className="text-sm text-muted-foreground">{backfillMessage}</p>}
      {sources.length > 0 && <section aria-label="CRM source sync" className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2">{sources.map((source) => <div key={source.id} className="flex items-center gap-2 text-sm"><span>{source.provider === "airtable" ? "Airtable" : "Notion"}</span><span className={source.status === "error" ? "text-destructive" : "text-muted-foreground"}>{source.status === "error" ? source.lastError || "Needs attention" : source.lastSyncedAt ? "Synced" : "Ready to sync"}</span><Button type="button" variant="outline" size="sm" onClick={() => void syncSource(source.provider)} disabled={busy}>Sync now</Button></div>)}</section>}
      {sourceMessage && <p role="status" className="text-sm text-muted-foreground">{sourceMessage}</p>}
      {selectedIds.length > 0 && <section aria-label="Bulk contact actions" className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2"><p className="mr-1 text-sm text-muted-foreground">{selectedIds.length} selected</p><Select value={bulkStage} onValueChange={(value) => setBulkStage(value as CrmStage)}><SelectTrigger className="w-[10rem]" aria-label="Bulk stage"><SelectValue /></SelectTrigger><SelectContent>{stages.filter((value) => value !== "archived").map((value) => <SelectItem key={value} value={value}>{stageLabel[value]}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" size="sm" onClick={() => void applyBulkStage()} disabled={busy}>Update stage</Button><Button type="button" variant="outline" size="sm" onClick={() => void archiveSelected()} disabled={busy}><Archive className="h-4 w-4" aria-hidden="true" />Archive</Button><Button asChild type="button" variant="outline" size="sm"><Link to={`/events/${event.slug}/program/communications`} state={{ crmContactIds: selection }}><Mail className="h-4 w-4" aria-hidden="true" />Email selected</Link></Button></section>}
      {error ? <section role="alert" className="flex min-h-64 flex-col items-center justify-center text-center"><h2 className="text-base font-semibold">Contacts unavailable</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{error}</p><Button className="mt-4" type="button" variant="outline" size="sm" onClick={() => void load()}>Try again</Button></section> : <DataGrid rows={visible} columns={columns} loading={loading} selectedIds={selectedIds} onSelectionChange={setSelectedIds} rowActivation="none" getRowLabel={(row) => `${row.firstName} ${row.lastName}`} ariaLabel="Contacts" empty={<EmptyState icon={UsersRound} title={search || stage !== "all" ? "No contacts match these filters" : "Start your event contact directory"} message={search || stage !== "all" ? "Try another search or filter." : "Add a prospect or backfill your existing speakers to build a reusable organization directory."} action={!search && stage === "all" ? <Button type="button" size="sm" onClick={() => navigate(`/events/${event.slug}/program/contacts/new`)}>Add contact</Button> : undefined} />} />}
    </div>
    <SourceDialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen} pendingId={pendingId} pendingProvider={pendingProvider} onSaved={() => { setSearchParams({}, { replace: true }); void load(); }} />
    <SegmentDialog open={segmentDialogOpen} onOpenChange={setSegmentDialogOpen} segment={selectedSegment} defaultStage={stage} onSaved={() => void load()} />
  </AppLayout>;
}
