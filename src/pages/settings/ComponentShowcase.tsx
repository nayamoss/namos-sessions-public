import { useState } from "react";
import { Inbox, Plus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorList } from "@/components/shared/ErrorList";
import { FormField } from "@/components/shared/FormField";
import { SectionCard } from "@/components/shared/SectionCard";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { SubmissionStatusBadge } from "@/components/shared/SubmissionStatusBadge";
import { ToggleField } from "@/components/shared/ToggleField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SubmissionStatus } from "@/data/types";

type PreviewRow = { id: string; title: string; speaker: string; status: SubmissionStatus };

const previewRows: PreviewRow[] = [
  { id: "preview-1", title: "Reliable AI agents", speaker: "Jordan Lee", status: "pending" },
  { id: "preview-2", title: "Accessible program design", speaker: "Samira Noor", status: "accepted" },
];

const previewColumns: DataGridColumn<PreviewRow>[] = [
  { key: "title", header: "Submission", cell: (row) => row.title },
  { key: "speaker", header: "Speaker", cell: (row) => row.speaker },
  { key: "status", header: "Status", cell: (row) => <SubmissionStatusBadge status={row.status} /> },
];

/** A live reference for the shared product components; keep new generic UI here first. */
export default function ComponentShowcase() {
  const [name, setName] = useState("Program committee review");
  const [notes, setNotes] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [notifications, setNotifications] = useState(true);

  return (
    <AppLayout title="Component library">
      <div className="space-y-6">
        <ContentToolbar
          ariaLabel="Component library controls"
          utilities={<p className="text-sm text-muted-foreground">Live reference for shared product UI.</p>}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Fields" description="Labels, inputs, help text, and validation use one rhythm.">
            <div className="space-y-4">
              <FormField label="Plan name" hint="Used by organizers and reviewers.">
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </FormField>
              <FormField label="Internal note">
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for the team…" />
              </FormField>
              <ToggleField label="Send reminder notifications" hint="Only unresolved assignments receive reminders." checked={notifications} onCheckedChange={setNotifications} surface />
              <ErrorList errors={["A close date is required before publishing."]} className="mt-0" />
            </div>
          </SectionCard>

          <SectionCard title="Choices and status" description="Selection and state use semantic color rather than local styling.">
            <div className="space-y-5">
              <SegmentedControl
                label="Preview filter"
                value={view}
                options={[{ value: "active" as const, label: "Active" }, { value: "archived" as const, label: "Archived" }]}
                onChange={(value) => setView(value)}
              />
              <div className="flex flex-wrap gap-2">
                {(["draft", "pending", "accept_queue", "accepted", "declined"] as SubmissionStatus[]).map((status) => <SubmissionStatusBadge key={status} status={status} />)}
              </div>
              <EmptyState compact icon={Inbox} title={view === "active" ? "No active records" : "No archived records"} message="Useful empty states explain what belongs here and offer a next step." action={<Button variant="accent" size="sm"><Plus />Add record</Button>} className="rounded-lg bg-muted/60" />
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Data grid" description="Tables use one responsive, accessible surface.">
          <DataGrid rows={previewRows} columns={previewColumns} empty="No preview records." rowActivation="none" ariaLabel="Component library table preview" />
        </SectionCard>
      </div>
    </AppLayout>
  );
}
