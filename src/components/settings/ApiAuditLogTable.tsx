import { useEffect, useState } from "react";
import { DataGrid } from "@/components/shared/DataGrid";
import { useRepo } from "@/data/repo";
import type { ApiAuditLogEntry } from "@/data/types";
const time = (value: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
export function ApiAuditLogTable({ eventId }: { eventId: string }) { const repo = useRepo(); const [rows, setRows] = useState<ApiAuditLogEntry[]>([]); const [loading, setLoading] = useState(true); useEffect(() => { void repo.apiKeys.auditLog({ eventId: eventId as never }).then(setRows).finally(() => setLoading(false)); }, [repo, eventId]); return <DataGrid rows={rows} loading={loading} skeletonRows={5} paginated defaultPageSize={25} rowActivation="none" empty="No API activity yet. Requests made with your API tokens will show up here." ariaLabel="Recent API activity" columns={[
  { key: "timestamp", header: "Timestamp", cell: (row) => time(row.createdAt) }, { key: "token", header: "Token", cell: (row) => row.tokenLabel }, { key: "request", header: "Method + Path", cell: (row) => <code className="text-xs">{row.method} {row.path}</code> }, { key: "status", header: "Status", cell: (row) => <span className={row.status < 300 ? "text-success" : row.status < 500 ? "text-amber-600" : "text-destructive"}>● {row.status}</span> }, { key: "scope", header: "Scope used", cell: (row) => row.scopeUsed },
]}/>; }
