import { useRef, useState } from "react";
import Papa from "papaparse";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { SkeletonList } from "@/components/shared/SkeletonList";
import type { EventId, SpeakerImportResult } from "@/data/types";
import { useRepo } from "@/data/repo";
import { friendlyErrorMessage } from "@/lib/errors";
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
      setError(friendlyErrorMessage(cause, "Could not import this file."));
    } finally {
      setImporting(false);
    }
  };

  if (parsing) return <SkeletonList rows={3} label="Parsing CSV…" />;

  if (result) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Data imported</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Imported {result.importedSpeakers} speakers and {result.importedTalks} talks. {result.skipped.length} rows were skipped
            {result.skipped.length ? `: ${result.skipped.map((item) => `row ${item.row} (${item.reason})`).join(", ")}` : "."}
          </p>
        </div>
        <Button type="button" data-autofocus="true" className="h-11 rounded-[12px]" onClick={onDone}>
          Finish setup
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Import previous conference data</h1>
        <p className="mt-2 text-sm text-muted-foreground">Bring in speakers and one past talk per speaker. You can always import more later.</p>
      </div>
      <Button type="button" variant="outline" size="sm" className="rounded-[10px]" onClick={download}>
        <Download className="mr-1.5 h-4 w-4" />Download CSV template
      </Button>
      {!rows ? (
        <button
          type="button"
          data-autofocus="true"
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center rounded-[12px] bg-card p-8 text-center transition-colors hover:bg-primary/10"
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
            <Button
              type="button"
              disabled={!valid.length || importing}
              className="h-11 rounded-[12px]"
              onClick={() => void importRows()}
            >
              {importing ? "Importing…" : `Import ${valid.length} speakers`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setRows(undefined); setError(undefined); }}>
              Choose a different file
            </Button>
          </div>
        </>
      )}
      {error && <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
