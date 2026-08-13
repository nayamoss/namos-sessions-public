import { useRef, useState } from "react";
import Papa from "papaparse";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { SkeletonList } from "@/components/shared/SkeletonList";
import type { EventId, SpeakerImportResult } from "@/data/types";
import { useRepo } from "@/data/repo";
import { validateImportRows, type PreviewRow } from "../importCsv";

const headers = ["firstName", "lastName", "email", "bio", "talkTitle", "talkAbstract"];
type PreviewGridRow = PreviewRow & { id: string };

const previewColumns: DataGridColumn<PreviewGridRow>[] = [
  { key: "firstName", header: "First name", cell: (row) => row.firstName },
  { key: "lastName", header: "Last name", cell: (row) => row.lastName },
  { key: "email", header: "Email", cell: (row) => row.email },
  { key: "talkTitle", header: "Talk title", cell: (row) => row.talkTitle ?? "—" },
  {
    key: "status",
    header: "Status",
    cell: (row) => <span className={row.error ? "text-destructive" : undefined}>{row.error ?? "Ready"}</span>,
  },
];

export function ImportDataStep({ eventId, onDone }: { eventId: EventId; onDone: () => void }) {
  const repo = useRepo();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>();
  const [error, setError] = useState<string>();
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<SpeakerImportResult>();
  const valid = rows?.filter((row) => !row.error) ?? [];
  const previewRows = rows?.map((row) => ({ ...row, id: String(row.row) })) ?? [];

  const download = () => {
    const blob = new Blob(
      [`${headers.join(",")}\nAda,Lovelace,ada@example.com,Mathematician,Computing before computers,Notes from the first programmer\n`],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "takumi-talks-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const choose = async (file?: File) => {
    if (!file) return;
    setParsing(true);
    setError(undefined);
    setResult(undefined);
    try {
      const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: true });
      if (parsed.errors.length || !headers.slice(0, 3).every((header) => parsed.meta.fields?.includes(header))) {
        setRows(undefined);
        setError("This file doesn't look like a valid CSV. Expected columns: firstName, lastName, email, bio, talkTitle, talkAbstract.");
      } else {
        const preview = validateImportRows(parsed.data);
        setRows(preview.rows);
        setError(preview.error);
      }
    } catch {
      setError("This file doesn't look like a valid CSV. Expected columns: firstName, lastName, email, bio, talkTitle, talkAbstract.");
    } finally {
      setParsing(false);
    }
  };

  const importRows = async () => {
    setImporting(true);
    setError(undefined);
    try {
      setResult(await repo.speakers.bulkImport({
        eventId,
        rows: valid.map(({ row: _row, error: _error, ...value }) => value),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this file.");
    } finally {
      setImporting(false);
    }
  };

  if (parsing) return <SkeletonList rows={3} label="Parsing CSV…" />;

  if (result) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Imported {result.importedSpeakers} speakers and {result.importedTalks} talks. {result.skipped.length} rows were skipped
          {result.skipped.length ? `: ${result.skipped.map((item) => `row ${item.row} (${item.reason})`).join(", ")}` : "."}
        </p>
        <Button type="button" variant="accent" onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Import previous conference data</h2>
        <p className="mt-1 text-sm text-muted-foreground">Bring in speakers and one past talk per speaker. You can always import more later.</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={download}>
        <Download className="mr-1.5 h-4 w-4" />Download CSV template
      </Button>
      {!rows ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center rounded-lg bg-muted/60 p-8 text-center hover:bg-muted"
        >
          <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
          <span className="font-medium">Drop a CSV file or click to choose</span>
          <span className="mt-1 text-sm text-muted-foreground">Required: firstName, lastName, email. Optional: bio, talkTitle, talkAbstract.</span>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </button>
      ) : (
        <>
          <DataGrid
            rows={previewRows}
            columns={previewColumns}
            empty="No CSV rows found."
            rowActivation="none"
            minWidth={680}
            ariaLabel="CSV import preview"
          />
          <p className="text-sm text-muted-foreground">
            {valid.length} rows ready to import, {rows.length - valid.length} rows have errors and will be skipped.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="accent" disabled={!valid.length || importing} onClick={() => void importRows()}>
              {importing ? "Importing…" : `Import ${valid.length} speakers`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setRows(undefined); setError(undefined); }}>
              Choose a different file
            </Button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
