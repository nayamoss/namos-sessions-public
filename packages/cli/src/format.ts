export type TableColumn = { header: string; value: (row: Record<string, unknown>) => unknown };

export function formatTable(rows: object[], columns: TableColumn[]): string {
  if (rows.length === 0) return "No results.\n";
  const rendered = rows.map((row) => columns.map((column) => display(column.value(row as Record<string, unknown>))));
  const widths = columns.map((column, index) => Math.max(column.header.length, ...rendered.map((row) => row[index].length)));
  const line = (values: string[]) => values.map((value, index) => value.padEnd(widths[index])).join("  ").trimEnd();
  return `${line(columns.map((column) => column.header))}\n${line(widths.map((width) => "-".repeat(width)))}\n${rendered.map(line).join("\n")}\n`;
}

function display(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
