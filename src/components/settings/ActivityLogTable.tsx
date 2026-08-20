import { DataGrid } from "@/components/shared/DataGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { Bell } from "lucide-react";
import type { ActivityEntry } from "@/data/types";

const time = (value: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
const categoryLabels: Record<ActivityEntry["category"], string> = {
  agenda: "Agenda",
  api: "API",
  agent: "Agent",
  comms: "Comms",
  notification: "Notifications",
};
const statusDot = (status?: ActivityEntry["status"]) =>
  status === "success" ? "text-success" : status === "error" ? "text-destructive" : status === "warning" ? "text-amber-600" : "text-muted-foreground";

export function ActivityLogTable({ entries, loading = false }: { entries: ActivityEntry[]; loading?: boolean }) {
  return (
    <DataGrid
      rows={entries}
      loading={loading}
      skeletonRows={8}
      paginated
      defaultPageSize={50}
      rowActivation="none"
      empty={<EmptyState compact icon={Bell} title="No activity yet" />}
      ariaLabel="Event activity log"
      columns={[
        { key: "timestamp", header: "Timestamp", cell: (row) => time(row.createdAt) },
        { key: "category", header: "Type", cell: (row) => categoryLabels[row.category] },
        {
          key: "event",
          header: "Event",
          cell: (row) => (
            <span className={statusDot(row.status)}>
              ● {row.title}
            </span>
          ),
        },
        { key: "detail", header: "Detail", cell: (row) => row.detail ?? "—" },
        { key: "actor", header: "Actor", cell: (row) => row.actorLabel ?? "—" },
      ]}
    />
  );
}
