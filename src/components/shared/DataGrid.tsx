import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";

export type DataGridColumn<Row> = {
  key: string;
  header: React.ReactNode;
  headerLabel?: string;
  cell: (row: Row) => React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  kind?: "data" | "row-header";
  sortDirection?: "asc" | "desc";
  onSort?: () => void;
};

type DataGridProps<Row extends { id: string }> = {
  rows: Row[];
  columns: DataGridColumn<Row>[];
  empty: string;
  loading?: boolean;
  skeletonRows?: number;
  paginated?: boolean;
  defaultPageSize?: 25 | 50 | 100;
  getRowLabel?: (row: Row) => string;
  onRowActivated?: (row: Row) => void;
  onRowRef?: (row: Row, element: HTMLTableRowElement | null) => void;
  appearance?: "plain" | "embedded" | "matrix";
  rowActivation?: "url" | "none";
  ariaLabel?: string;
  itemLabel?: string;
  minWidth?: number;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
};

export function DataGrid<Row extends { id: string }>(props: DataGridProps<Row>) {
  if (props.rowActivation === "none") {
    return <DataGridContent {...props} selected={null} />;
  }
  return <RoutedDataGrid {...props} />;
}

function RoutedDataGrid<Row extends { id: string }>(props: DataGridProps<Row>) {
  const [params, setParams] = useSearchParams();
  return (
    <DataGridContent
      {...props}
      selected={params.get("selected")}
      onDefaultRowActivated={(row) => {
        setParams((current) => {
          const next = new URLSearchParams(current);
          next.set("selected", row.id);
          return next;
        });
      }}
    />
  );
}

function DataGridContent<Row extends { id: string }>({
  rows,
  columns,
  empty,
  loading = false,
  skeletonRows = 5,
  paginated = false,
  defaultPageSize = 25,
  getRowLabel = (row) => row.id,
  onRowActivated,
  onRowRef,
  appearance = "plain",
  rowActivation = "url",
  ariaLabel,
  itemLabel = "rows",
  minWidth,
  selectedIds,
  onSelectionChange,
  selected,
  onDefaultRowActivated,
}: DataGridProps<Row> & {
  selected: string | null;
  onDefaultRowActivated?: (row: Row) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const rowSignature = useMemo(
    () => rows.map((row) => row.id).join("\u0000"),
    [rows],
  );
  useEffect(() => {
    setPage(1);
  }, [pageSize, rowSignature]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = paginated ? rows.slice(start, start + pageSize) : rows;
  const rangeStart = total === 0 ? 0 : start + 1;
  const rangeEnd = Math.min(start + pageSize, total);
  const sized = columns.some((column) => column.width);
  const isEmbedded = appearance === "embedded";
  const isMatrix = appearance === "matrix";
  const activatable = rowActivation !== "none";
  const selectable = Boolean(selectedIds && onSelectionChange);
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selectedIds?.includes(row.id));
  const tableClass = isMatrix
    ? "w-full table-fixed border-separate border-spacing-1 text-left text-sm"
    : sized
      ? `w-full table-fixed border-collapse text-left text-sm ${isEmbedded ? "min-w-[720px]" : ""}`
      : `w-full border-collapse text-left text-sm ${isEmbedded ? "min-w-[720px]" : ""}`;
  const headerClass = isEmbedded
    ? "sticky top-0 z-10 bg-muted text-xs text-foreground"
    : isMatrix
      ? "sticky top-0 z-10 bg-card text-xs text-muted-foreground"
    : "text-xs text-muted-foreground";
  const tableViewportClass = isEmbedded
    ? "max-h-[calc(100dvh-11rem)] overflow-auto"
    : isMatrix
      ? "max-h-[38rem] overflow-auto"
      : "overflow-x-auto rounded-lg bg-card";
  const alignmentClass = (column: DataGridColumn<Row>) =>
    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left";
  const columnClass = (column: DataGridColumn<Row>) => {
    if (isMatrix) {
      return `${column.kind === "row-header" ? "px-2 py-2 text-xs text-muted-foreground" : "px-2 py-2 text-sm text-foreground"} font-medium ${alignmentClass(column)}`;
    }
    const padding = isEmbedded ? "px-3 py-2.5" : "px-4 py-3";
    return `${sized ? "truncate " : ""}${padding} font-medium ${alignmentClass(column)}`;
  };
  const dataCellClass = (column: DataGridColumn<Row>) => {
    if (isMatrix) {
      return column.kind === "row-header"
        ? `sticky left-0 z-[1] bg-card px-2 py-3 align-middle ${alignmentClass(column)}`
        : `p-0.5 align-stretch ${alignmentClass(column)}`;
    }
    const padding = isEmbedded ? "px-3 py-2.5" : "px-4 py-3";
    return `${sized ? "truncate " : ""}${padding} ${alignmentClass(column)}`;
  };
  const headerCell = (column: DataGridColumn<Row>) => {
    const SortIcon = column.sortDirection === "asc" ? ChevronUp : ChevronDown;
    const label = column.headerLabel ?? (typeof column.header === "string" ? column.header : column.key);
    return (
      <th
        key={column.key}
        scope="col"
        className={columnClass(column)}
        aria-sort={column.sortDirection === "asc" ? "ascending" : column.sortDirection === "desc" ? "descending" : undefined}
      >
        {column.onSort ? (
          <button
            type="button"
            className={`inline-flex w-full items-center gap-1.5 rounded-sm py-0.5 font-medium text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 ${column.align === "right" ? "justify-end" : "justify-start"}`}
            onClick={column.onSort}
            aria-label={`Sort by ${label}${column.sortDirection ? `, currently ${column.sortDirection === "asc" ? "ascending" : "descending"}` : ""}`}
          >
            <span>{column.header}</span>
            <SortIcon className={`h-3.5 w-3.5 ${column.sortDirection ? "text-foreground" : "text-muted-foreground/45"}`} aria-hidden="true" />
          </button>
        ) : column.header}
      </th>
    );
  };
  const colGroup = sized ? (
    <colgroup>
      {columns.map((column) => (
        <col
          key={column.key}
          style={column.width ? { width: column.width } : undefined}
        />
      ))}
    </colgroup>
  ) : null;
  const activate = (row: Row) => {
    if (onRowActivated) {
      onRowActivated(row);
      return;
    }
    onDefaultRowActivated?.(row);
  };

  if (loading)
    return (
      <div
        className={tableViewportClass}
        aria-busy="true"
        aria-live="polite"
      >
        <table className={tableClass} style={minWidth ? { minWidth } : undefined} aria-label={ariaLabel}>
          {colGroup}
          <thead className={headerClass}>
            <tr>
              {selectable && <th className="w-12 px-4 py-3"><Checkbox disabled aria-label="Select all rows" /></th>}
              {columns.map(headerCell)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: skeletonRows }, (_, row) => (
              <tr key={row}>
                {selectable && <td className="w-12 px-4 py-3"><Skeleton className="h-4 w-4" /></td>}
                {columns.map((column) => (
                  <td key={column.key} className={dataCellClass(column)}>
                    <Skeleton className="h-4 w-full max-w-40" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <span className="sr-only">Loading rows…</span>
      </div>
    );

  return (
    <div className={isEmbedded ? "" : "space-y-3"}>
      <div className={tableViewportClass}>
        <table className={tableClass} style={minWidth ? { minWidth } : undefined} aria-label={ariaLabel}>
          {colGroup}
          <thead className={headerClass}>
            <tr>
              {selectable && <th className="w-12 px-4 py-3"><Checkbox aria-label="Select all rows" checked={allVisibleSelected} onCheckedChange={(checked) => onSelectionChange?.(checked ? Array.from(new Set([...(selectedIds ?? []), ...visible.map((row) => row.id)])) : (selectedIds ?? []).filter((id) => !visible.some((row) => row.id === id)))} /></th>}
              {columns.map(headerCell)}
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((row) => (
                <tr
                  key={row.id}
                  ref={(element) => onRowRef?.(row, element)}
                  tabIndex={activatable ? 0 : undefined}
                  aria-label={activatable ? getRowLabel?.(row) : undefined}
                  aria-selected={activatable ? selected === row.id : undefined}
                  onClick={(event) => {
                    if (!activatable) return;
                    if ((event.target as HTMLElement).closest("button, a, input, select, textarea, [role='button'], [role='option']")) return;
                    activate(row);
                  }}
                  onKeyDown={(event) => {
                    if (!activatable) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    activate(row);
                  }}
                  className={
                    activatable && selected === row.id
                      ? "cursor-pointer bg-accent/70 outline-none ring-2 ring-inset ring-ring/20"
                      : activatable
                        ? `${isEmbedded ? "even:bg-muted/20" : ""} cursor-pointer outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/25`
                        : isEmbedded ? "even:bg-muted/20" : undefined
                  }
                >
                  {selectable && <td className="w-12 px-4 py-3" onClick={(event) => event.stopPropagation()}><Checkbox aria-label={`Select ${getRowLabel(row)}`} checked={selectedIds?.includes(row.id)} onCheckedChange={(checked) => onSelectionChange?.(checked ? [...(selectedIds ?? []), row.id] : (selectedIds ?? []).filter((id) => id !== row.id))} /></td>}
                  {columns.map((column) => column.kind === "row-header" ? (
                    <th key={column.key} scope="row" className={dataCellClass(column)}>
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td key={column.key} className={dataCellClass(column)}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paginated && total > 0 && (
        <footer className={`flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground ${isEmbedded ? "mt-1 px-3 py-2.5" : "px-1 pt-3"}`}>
          <span>
            {rangeStart} — {rangeEnd} of {total} {itemLabel}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger
                  className="h-8 w-[5.5rem]"
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">Show 25</SelectItem>
                  <SelectItem value="50">Show 50</SelectItem>
                  <SelectItem value="100">Show 100</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Previous page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">
                Page {safePage} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Next page"
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                disabled={safePage === pageCount}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </footer>
      )}
    </div>
  );
}
