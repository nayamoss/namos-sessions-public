import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";

type Row = { id: string; name: string; startsAt?: number };

const columns: DataGridColumn<Row>[] = [{ key: "name", header: "Name", cell: (row) => row.name }];
const rows = Array.from({ length: 51 }, (_, index) => ({ id: String(index + 1), name: `Row ${index + 1}` }));

function renderGrid(data = rows) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = (nextRows: Row[]) => act(() => root.render(<MemoryRouter><DataGrid rows={nextRows} columns={columns} empty="No rows." paginated /></MemoryRouter>));
  render(data);
  return {
    container,
    rerender: render,
    click: (name: string) => act(() => (container.querySelector(`[aria-label="${name}"]`) as HTMLButtonElement).click()),
    cleanup: () => { act(() => root.unmount()); container.remove(); },
  };
}

describe("DataGrid pagination", () => {
  it("limits rendered rows and moves between pages", () => {
    const grid = renderGrid();
    expect(grid.container.querySelectorAll("tbody tr")).toHaveLength(25);
    expect(grid.container.textContent).toContain("1 — 25 of 51 rows");
    expect((grid.container.querySelector('[aria-label="Previous page"]') as HTMLButtonElement).disabled).toBe(true);

    grid.click("Next page");

    expect(grid.container.querySelectorAll("tbody tr")).toHaveLength(25);
    expect(grid.container.textContent).toContain("26 — 50 of 51 rows");
    expect((grid.container.querySelector('[aria-label="Previous page"]') as HTMLButtonElement).disabled).toBe(false);
    grid.cleanup();
  });

  it("returns to the first page when filtered rows change", () => {
    const grid = renderGrid();
    grid.click("Next page");
    expect(grid.container.textContent).toContain("26 — 50 of 51 rows");

    grid.rerender(rows.slice(1));

    expect(grid.container.textContent).toContain("1 — 25 of 50 rows");
    grid.cleanup();
  });

  it("keeps only the range text when every row fits on one page", () => {
    const grid = renderGrid(rows.slice(0, 2));
    expect(grid.container.textContent).toContain("1 — 2 of 2 rows");
    expect(grid.container.querySelector('[aria-label="Previous page"]')).toBeNull();
    expect(grid.container.querySelector('[aria-label="Next page"]')).toBeNull();
    expect(grid.container.querySelector('[aria-label="Rows per page"]')).toBeNull();
    grid.cleanup();
  });
});

describe("DataGrid row activation", () => {
  it("exposes column labels for the narrow-screen card layout", () => {
    const grid = renderGrid(rows.slice(0, 1));
    const table = grid.container.querySelector("table")!;
    const cell = grid.container.querySelector("tbody td")!;

    expect(table).toHaveClass("responsive-data-grid");
    // bg-card, not bg-background: the grid is a distinct surface sitting on
    // the page background, which AppLayout no longer covers with a card (#171).
    expect(table.parentElement).toHaveClass("bg-card", "ring-1", "ring-inset", "ring-foreground/10");
    expect(table.querySelector("thead")).toHaveClass(
      "bg-muted/35",
      "text-sm",
      "font-medium",
      "text-muted-foreground",
    );
    expect(table.querySelector("tbody")).toHaveClass(
      "[&>tr:not(:last-child)>*]:shadow-[inset_0_-1px_0_hsl(var(--foreground)/0.10)]",
    );
    expect(cell).toHaveAttribute("data-label", "Name");
    grid.cleanup();
  });

  it("opens a labelled row from the keyboard", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onRowActivated = vi.fn();
    act(() => root.render(
      <MemoryRouter>
        <DataGrid rows={[{ id: "row-1", name: "Ada" }]} columns={columns} empty="No rows." getRowLabel={(row) => `Open ${row.name}`} onRowActivated={onRowActivated} />
      </MemoryRouter>,
    ));
    const row = container.querySelector<HTMLTableRowElement>('tbody tr[aria-label="Open Ada"]')!;
    act(() => row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onRowActivated).toHaveBeenCalledWith({ id: "row-1", name: "Ada" });
    act(() => root.unmount());
    container.remove();
  });

  it("does not activate the row when a nested action receives Enter", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onRowActivated = vi.fn();
    const onAction = vi.fn();
    const actionColumns: DataGridColumn<Row>[] = [
      ...columns,
      { key: "actions", header: "", headerLabel: "Actions", cell: () => <button onClick={onAction}>Delete</button> },
    ];
    act(() => root.render(
      <MemoryRouter>
        <DataGrid rows={[{ id: "row-1", name: "Ada" }]} columns={actionColumns} empty="No rows." onRowActivated={onRowActivated} />
      </MemoryRouter>,
    ));
    const action = container.querySelector<HTMLButtonElement>("tbody button")!;
    act(() => action.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onRowActivated).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("supports static semantic rows without making them selectable", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const staticColumns: DataGridColumn<Row>[] = [
      { key: "name", header: "Name", kind: "row-header", cell: (row) => row.name },
    ];
    act(() => root.render(
      <MemoryRouter>
        <DataGrid
          rows={[{ id: "row-1", name: "Ada" }]}
          columns={staticColumns}
          empty="No rows."
          rowActivation="none"
          ariaLabel="Static people"
        />
      </MemoryRouter>,
    ));

    const row = container.querySelector<HTMLTableRowElement>("tbody tr")!;
    expect(row.tabIndex).toBe(-1);
    expect(row).not.toHaveAttribute("aria-selected");
    expect(row.querySelector('th[scope="row"]')).toHaveTextContent("Ada");
    expect(container.querySelector("table")).toHaveAccessibleName("Static people");

    act(() => root.unmount());
    container.remove();
  });
});

describe("DataGrid sortable headers", () => {
  it("uses a quiet, sentence-case header treatment", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const quietColumns: DataGridColumn<Row>[] = [
      { key: "name", header: "Event name", cell: (row) => row.name },
      { key: "actions", header: "Actions", cell: () => "…" },
    ];

    act(() => root.render(
      <MemoryRouter>
        <DataGrid rows={[{ id: "row-1", name: "Namos Sessions" }]} columns={quietColumns} empty="No rows." />
      </MemoryRouter>,
    ));

    const header = container.querySelector("thead")!;
    expect(header).toHaveTextContent("Event name");
    expect(header).toHaveTextContent("Actions");
    expect(header.className).not.toContain("uppercase");
    expect(header.className).not.toContain("shadow-[");

    act(() => root.unmount());
    container.remove();
  });

  it("sorts declared string and number values without page-owned state", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const sortableRows: Row[] = [
      { id: "2", name: "Zulu 10", startsAt: 100 },
      { id: "1", name: "Alpha", startsAt: 300 },
      { id: "3", name: "Zulu 2", startsAt: 200 },
    ];
    const sortableColumns: DataGridColumn<Row>[] = [
      { key: "name", header: "Name", kind: "row-header", cell: (row) => row.name, sortValue: (row) => row.name },
      { key: "date", header: "Date", cell: (row) => row.startsAt, sortValue: (row) => row.startsAt },
    ];
    act(() => root.render(
      <MemoryRouter>
        <DataGrid
          rows={sortableRows}
          columns={sortableColumns}
          empty="No rows."
          rowActivation="none"
          defaultSort={{ key: "date", direction: "desc" }}
        />
      </MemoryRouter>,
    ));
    const rowNames = () => Array.from(container.querySelectorAll("tbody th")).map((cell) => cell.textContent);
    const nameHeader = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Name"]')!;
    const dateHeader = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Date"]')!;

    expect(rowNames()).toEqual(["Alpha", "Zulu 2", "Zulu 10"]);
    expect(dateHeader.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(nameHeader.closest("th")).toHaveAttribute("aria-sort", "none");

    act(() => nameHeader.click());
    expect(rowNames()).toEqual(["Alpha", "Zulu 2", "Zulu 10"]);
    expect(nameHeader.closest("th")).toHaveAttribute("aria-sort", "ascending");

    act(() => nameHeader.click());
    expect(rowNames()).toEqual(["Zulu 10", "Zulu 2", "Alpha"]);
    expect(nameHeader.closest("th")).toHaveAttribute("aria-sort", "descending");

    act(() => root.unmount());
    container.remove();
  });

  it("exposes the active direction and invokes the column sort action", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSort = vi.fn();
    const sortableColumns: DataGridColumn<Row>[] = [
      { key: "name", header: "Name", cell: (row) => row.name, sortDirection: "asc", onSort },
      { key: "email", header: "Email", cell: () => "ada@example.test", onSort: vi.fn() },
    ];
    act(() => root.render(
      <MemoryRouter>
        <DataGrid rows={[{ id: "row-1", name: "Ada" }]} columns={sortableColumns} empty="No rows." />
      </MemoryRouter>,
    ));

    expect(container.querySelector("thead th")?.getAttribute("aria-sort")).toBe("ascending");
    const nameSort = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by Name"]')!;
    act(() => nameSort.click());
    expect(onSort).toHaveBeenCalledOnce();
    expect(container.querySelectorAll("thead button")).toHaveLength(2);

    act(() => root.unmount());
    container.remove();
  });
});
