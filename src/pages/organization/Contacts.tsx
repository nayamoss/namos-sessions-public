import { useEffect, useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Database, UsersRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { OrganizationContactPane } from "@/components/crm/OrganizationContactPane";
import { DuplicateMergeDialog, MergeAnnouncement } from "@/components/crm/DuplicateMergeDialog";
import { selectedBackend } from "@/data/backend";
import { crmStageLabel, crmStages } from "@/lib/crm-stages";
import { cleanErrorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { CrmStage } from "@/data/types";

type Row = Doc<"crm_contacts"> & { id: string };

function useOrganizationEvents(organizationId: Id<"organizations">) {
  const events = useQuery(api.events.listMine, {});
  return useMemo(
    () => (events ?? []).filter((event) => event.organizationId === organizationId),
    [events, organizationId],
  );
}

// Kept separate from the content component below so the "unsupported backend"/"no id" branches
// never render a component whose body assumes a real convex `Id`, matching the guard pattern
// the event-scoped Contacts page already uses.
export default function OrganizationContacts() {
  const { organizationId } = useParams<{ organizationId: string }>();
  if (selectedBackend() !== "convex" || !organizationId) {
    return (
      <AppLayout title="Contacts">
        <EmptyState
          icon={UsersRound}
          title="Contacts require a managed workspace"
          message="The organization CRM is available only when this workspace uses the managed Convex data service."
        />
      </AppLayout>
    );
  }
  return <OrganizationContactsContent organizationId={organizationId as Id<"organizations">} />;
}

function OrganizationContactsContent({ organizationId }: { organizationId: Id<"organizations"> }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const stageFilter = (searchParams.get("stage") as CrmStage | null) ?? "all";
  const eventFilter = (searchParams.get("event") as Id<"events"> | null) ?? undefined;
  const segmentId = searchParams.get("segment") ?? "all";
  const selectedId = searchParams.get("selected");

  const setParam = (key: string, value: string | undefined) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  };

  const authorizedEvents = useOrganizationEvents(organizationId);
  // Saved segments and merge are organizer-of-this-organization-only capabilities
  // (convex/crm.ts `listSegments`/`saveSegment`/`mergePreflight` all call `assertOrganizerOf`,
  // which throws for an event-limited caller). `organizations.getMine` never throws — it simply
  // returns the org this caller actually organizes, or null — so it doubles as a safe,
  // non-throwing signal for whether to even ask for segments, instead of letting
  // `listSegments` throw and fall into an error boundary for every event-limited visitor.
  const myOrganization = useQuery(api.organizations.getMine, {});
  const isOrgAdmin = myOrganization === undefined ? undefined : myOrganization?._id === organizationId;
  const segments = useQuery(api.crm.listSegments, isOrgAdmin ? { organizationId } : "skip") ?? [];
  const saveSegment = useMutation(api.crm.saveSegment);
  const selectedSegment = segments.find((segment) => segment._id === segmentId);

  const { results, status, loadMore } = usePaginatedQuery(
    api.crm.listOrganizationDirectory,
    {
      organizationId,
      stage: stageFilter === "all" ? undefined : stageFilter,
      minScore: selectedSegment?.minScore,
      maxScore: selectedSegment?.maxScore,
      eventId: eventFilter,
    },
    { initialNumItems: 25 },
  );
  const loading = status === "LoadingFirstPage";

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ mergeId: Id<"crm_contact_merges">; retainedLabel: string; archivedLabel: string }>();
  const [segmentSaving, setSegmentSaving] = useState(false);
  const [segmentError, setSegmentError] = useState<string>();

  useEffect(() => { setSelectedIds([]); }, [organizationId, stageFilter, eventFilter, segmentId]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const rows: Row[] = results.map((contact) => ({ ...contact, id: contact._id }));
    const segmentFiltered = selectedSegment?.stage
      ? rows.filter((row) => row.stage === selectedSegment.stage)
      : rows;
    if (!query) return segmentFiltered;
    return segmentFiltered.filter((row) => `${row.firstName} ${row.lastName} ${row.email}`.toLocaleLowerCase().includes(query));
  }, [results, search, selectedSegment]);

  const selectedRows = visible.filter((row) => selectedIds.includes(row.id));
  const mergeCandidates = selectedRows.length === 2 && selectedRows[0]!.email.toLowerCase() === selectedRows[1]!.email.toLowerCase()
    ? [selectedRows[0]!.id as Id<"crm_contacts">, selectedRows[1]!.id as Id<"crm_contacts">] as [Id<"crm_contacts">, Id<"crm_contacts">]
    : undefined;

  const saveCurrentFilters = async () => {
    setSegmentSaving(true); setSegmentError(undefined);
    try {
      await saveSegment({
        organizationId,
        id: selectedSegment?._id,
        name: selectedSegment?.name ?? `${stageFilter === "all" ? "All stages" : crmStageLabel[stageFilter]} view`,
        stage: stageFilter === "all" ? undefined : stageFilter,
      });
    } catch (cause) {
      setSegmentError(cleanErrorMessage(cause, "This saved view could not be saved."));
    } finally {
      setSegmentSaving(false);
    }
  };

  const columns: DataGridColumn<Row>[] = [
    {
      key: "contact",
      header: "Contact",
      kind: "row-header",
      sortValue: (row) => `${row.lastName} ${row.firstName}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.firstName} {row.lastName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      width: "10rem",
      sortValue: (row) => row.stage,
      cell: (row) => <StatusBadge tone={row.stage === "confirmed" ? "success" : row.stage === "declined" ? "destructive" : "neutral"}>{crmStageLabel[row.stage]}</StatusBadge>,
    },
    { key: "score", header: "Score", width: "6rem", align: "right", sortValue: (row) => row.score, cell: (row) => <span className="tabular-nums">{row.score}</span> },
  ];

  const detail = selectedId
    ? (
      <OrganizationContactPane
        organizationId={organizationId}
        contactId={selectedId === "new" ? undefined : (selectedId as Id<"crm_contacts">)}
        authorizedEvents={authorizedEvents}
        onClose={() => setParam("selected", undefined)}
        onCreated={(id) => setParam("selected", id)}
      />
    )
    : undefined;

  return (
    <AppLayout title="Contacts" detail={detail}>
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="Organization contact directory controls"
          search={<Input value={search} onChange={(e) => setParam("q", e.target.value)} placeholder="Search contacts" aria-label="Search contacts" />}
          utilities={<>
            <Select value={eventFilter ?? "all"} onValueChange={(value) => setParam("event", value === "all" ? undefined : value)}>
              <SelectTrigger className="w-[12rem]" aria-label="Filter by event"><SelectValue placeholder="All events" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {authorizedEvents.map((event) => <SelectItem key={event._id} value={event._id}>{event.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stageFilter} onValueChange={(value) => setParam("stage", value)}>
              <SelectTrigger className="w-[10rem]" aria-label="Filter by stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {crmStages.map((value) => <SelectItem key={value} value={value}>{crmStageLabel[value]}</SelectItem>)}
              </SelectContent>
            </Select>
            {eventFilter && (
              <Button asChild type="button" variant="outline" size="sm">
                <Link to={`/events/${authorizedEvents.find((event) => event._id === eventFilter)?.slug ?? ""}/program/contacts`}>
                  <Database className="h-4 w-4" aria-hidden="true" />Import for this event
                </Link>
              </Button>
            )}
          </>}
          primaryAction={<Button type="button" size="sm" onClick={() => setParam("selected", "new")}>Add contact</Button>}
        />
        {isOrgAdmin && (
          <section aria-label="Saved views" className="flex flex-wrap items-center gap-2.5">
            <Label htmlFor="org-crm-segment" className="text-sm text-muted-foreground">Saved view</Label>
            <Select value={segmentId} onValueChange={(value) => setParam("segment", value)}>
              <SelectTrigger id="org-crm-segment" className="w-[11rem]" aria-label="Choose saved view"><SelectValue placeholder="All contacts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contacts</SelectItem>
                {segments.map((segment) => <SelectItem key={segment._id} value={segment._id}>{segment.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => void saveCurrentFilters()} disabled={segmentSaving}>
              {segmentSaving ? "Saving…" : selectedSegment ? "Update view" : "Save current filters"}
            </Button>
            {segmentError && <p role="alert" className="text-sm text-destructive">{segmentError}</p>}
          </section>
        )}
        {selectedIds.length > 0 && isOrgAdmin && (
          <section aria-label="Bulk contact actions" className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            <p className="mr-1 text-sm text-muted-foreground">{selectedIds.length} selected</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setMergeOpen(true)} disabled={!mergeCandidates} title={!mergeCandidates ? "Select exactly two contacts with the same email address to merge" : undefined}>
              Merge duplicates
            </Button>
          </section>
        )}
        {mergeResult && <MergeAnnouncement organizationId={organizationId} result={mergeResult} onDismiss={() => setMergeResult(undefined)} />}
        <DataGrid
          rows={visible}
          columns={columns}
          loading={loading}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActivation="url"
          getRowLabel={(row) => `${row.firstName} ${row.lastName}`}
          ariaLabel="Organization contacts"
          empty={
            <EmptyState
              icon={UsersRound}
              title={search || stageFilter !== "all" || eventFilter ? "No contacts match these filters" : "Start your organization directory"}
              message={search || stageFilter !== "all" || eventFilter ? "Try another search, event, or stage." : "Add a contact, or open an event's Contacts page to backfill speakers into this directory."}
              action={!search && stageFilter === "all" && !eventFilter ? <Button type="button" size="sm" onClick={() => setParam("selected", "new")}>Add contact</Button> : undefined}
            />
          }
        />
        {!loading && status === "CanLoadMore" && (
          <div className="flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={() => loadMore(25)}>Load more contacts</Button>
          </div>
        )}
      </div>
      {mergeCandidates && (
        <DuplicateMergeDialog
          organizationId={organizationId}
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          contactIds={mergeCandidates}
          onMerged={(result) => { setMergeResult(result); setMergeOpen(false); setSelectedIds([]); }}
        />
      )}
    </AppLayout>
  );
}
