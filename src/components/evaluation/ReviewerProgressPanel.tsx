import { useCallback, useEffect, useRef, useState } from "react";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRepo } from "@/data/repo";
import type { EvaluationPlan, EventId, ReviewerProgressRow, ReviewerReminderBatch } from "@/data/types";

// Per-reviewer completion for one evaluation plan, plus organizer-triggered reminders.
//
// Everything here is derived: no reviewer_progress table, no counters, no scheduler. Reminders
// only ever leave on an explicit press followed by an inline confirmation — there is no cron
// and no automatic send anywhere in this feature, by design (see docs/features/reviewer-progress).
//
// Confirmation is an inline state swap inside the cell, never window.confirm and never an
// overlay: a reminder is not destructive, so even a sanctioned dialog would be too much.

type Confirming = { kind: "row"; reviewerUserId: string } | { kind: "bulk" } | undefined;
type RowResult = { status: "sent" | "failed" | "skipped"; error?: string };

function meterClass(rate: number) {
  return rate === 100 ? "h-1.5 rounded-full bg-[hsl(var(--success))]" : "h-1.5 rounded-full bg-primary";
}

export function ReviewerProgressPanel({ eventId, plan, refreshKey }: { eventId: EventId; plan: EvaluationPlan; refreshKey: number }) {
  const repo = useRepo();
  const [rows, setRows] = useState<ReviewerProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(50);
  const [thresholdDraft, setThresholdDraft] = useState("50");
  const [confirming, setConfirming] = useState<Confirming>();
  const [sending, setSending] = useState<string>();
  const [rowResults, setRowResults] = useState<Record<string, RowResult>>({});
  const [bulkResult, setBulkResult] = useState<ReviewerReminderBatch>();
  const [error, setError] = useState<string>();
  // The plan the in-flight request was issued for: a response that lands after the organizer
  // switched plans is discarded rather than painted onto the wrong plan (E15).
  const planRef = useRef(plan.id);
  planRef.current = plan.id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await repo.evaluations.reviewerProgress({ eventId, evaluationPlanId: plan.id });
      setRows(next);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load reviewer progress.");
    } finally {
      setLoading(false);
    }
  }, [eventId, plan.id, repo]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setConfirming(undefined); setRowResults({}); setBulkResult(undefined); }, [plan.id]);

  const remindable = rows.filter(row => row.emailResolved && row.completionRate < 100);
  const belowThreshold = rows.filter(row => row.completionRate < threshold);
  const belowThresholdWithEmail = belowThreshold.filter(row => row.emailResolved);
  const allComplete = rows.length > 0 && rows.every(row => row.completionRate === 100);

  const send = async (input: { reviewerUserId?: string; thresholdPercent?: number }, key: string) => {
    const requestedPlanId = plan.id;
    setSending(key); setConfirming(undefined); setError(undefined);
    try {
      const batch = await repo.evaluations.sendReviewerReminders({
        eventId, evaluationPlanId: plan.id, queueUrl: `${window.location.origin}/program/evaluation`, ...input,
      });
      if (planRef.current !== requestedPlanId) return;
      // Per-row status stays consistent with the batch summary, single send or bulk.
      setRowResults(current => ({
        ...current,
        ...Object.fromEntries(batch.results.map(result => [result.reviewerUserId, { status: result.status, error: result.error ?? result.reason }])),
      }));
      if (input.thresholdPercent !== undefined) setBulkResult(batch);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send reminders.");
    } finally {
      setSending(undefined);
    }
  };

  const commitThreshold = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
    setThreshold(next); setThresholdDraft(String(next));
  };

  const reminderCell = (row: ReviewerProgressRow) => {
    const result = rowResults[row.reviewerUserId];
    if (confirming?.kind === "row" && confirming.reviewerUserId === row.reviewerUserId) {
      return <span className="inline-flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Send reminder?</span>
        <Button variant="accent" size="sm" onClick={() => void send({ reviewerUserId: row.reviewerUserId }, row.reviewerUserId)}>Confirm send</Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(undefined)}>Cancel</Button>
      </span>;
    }
    if (result) {
      return <span className="inline-flex items-center justify-end gap-2">
        {result.status === "sent"
          ? <span className="text-xs text-[hsl(var(--success))]">Reminded</span>
          : <span className="text-xs text-destructive">Could not send — {result.error ?? "unknown reason"}</span>}
        <Button variant="ghost" size="sm" disabled={!!sending || !row.emailResolved} onClick={() => setConfirming({ kind: "row", reviewerUserId: row.reviewerUserId })}>Remind again</Button>
      </span>;
    }
    const reason = row.completionRate === 100 ? "Complete" : row.emailResolved ? undefined : "No email on file";
    return <Button variant="ghost" size="sm" disabled={!!reason || !!sending} title={reason} onClick={() => setConfirming({ kind: "row", reviewerUserId: row.reviewerUserId })}>Remind</Button>;
  };
  const progressRows = rows.map((row) => ({ ...row, id: row.reviewerUserId }));
  const progressColumns: DataGridColumn<(typeof progressRows)[number]>[] = [
    { key: "reviewer", header: "Reviewer", cell: row => <span className="block max-w-64"><span className="block truncate font-medium" title={row.reviewerUserId}>{row.reviewerUserId}</span>{!row.emailResolved && <span className="block text-xs text-muted-foreground">No email on file</span>}</span> },
    { key: "assigned", header: "Assigned", cell: row => <span className="tabular-nums">{row.assigned}</span> },
    { key: "completed", header: "Completed", cell: row => <span className="tabular-nums">{row.completed}</span> },
    { key: "complete", header: "Complete", cell: row => <><span className="tabular-nums">{row.completionRate}%</span><span className="mt-1 block h-1.5 w-24 rounded-full bg-muted" aria-hidden><span className={`${meterClass(row.completionRate)} block`} style={{ width: `${row.completionRate}%` }} /></span></> },
    { key: "actions", header: "", cell: row => <span className="flex justify-end">{reminderCell(row)}</span> },
  ];

  return <section className="rounded-lg bg-card p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-semibold">Reviewer progress</h2>
        <p className="mt-1 text-sm text-muted-foreground">Completion is derived from assignments and submitted scores on {plan.name}. Reminders are sent only when you press the button.</p>
      </div>
      {rows.length > 0 && <div className="flex flex-wrap items-end gap-2">
        <label htmlFor="reminder-threshold" className="text-sm text-muted-foreground">Below</label>
        <Input id="reminder-threshold" type="number" min={1} max={100} step={5} value={thresholdDraft}
          onChange={event => setThresholdDraft(event.target.value)} onBlur={event => commitThreshold(event.target.value)}
          className="w-20" />
        <span className="text-sm text-muted-foreground">% complete</span>
        {confirming?.kind === "bulk"
          ? <span className="inline-flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Send {belowThresholdWithEmail.length} reminder{belowThresholdWithEmail.length === 1 ? "" : "s"}?</span>
            <Button variant="accent" size="sm" onClick={() => void send({ thresholdPercent: threshold }, "bulk")}>Confirm send</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(undefined)}>Cancel</Button>
          </span>
          : <Button variant="secondary" size="sm" disabled={belowThresholdWithEmail.length === 0 || !!sending} onClick={() => setConfirming({ kind: "bulk" })}>
            {sending === "bulk" ? "Sending…" : `Remind all below ${threshold}%`}
            {belowThreshold.length > belowThresholdWithEmail.length ? ` (${belowThresholdWithEmail.length} of ${belowThreshold.length} have an email)` : ""}
          </Button>}
      </div>}
    </div>

    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {rows.length > 0 && belowThresholdWithEmail.length === 0 && <p className="mt-2 text-xs text-muted-foreground">
      {allComplete ? "Every reviewer on this plan is complete." : remindable.length === 0 ? "No reviewer on this plan has an email address on file." : `No reviewer on this plan is below ${threshold}% with an email address on file.`}
    </p>}

    <div className="mt-4"><DataGrid rows={progressRows} columns={progressColumns} empty="No reviewers assigned to this plan yet. Assign submissions to reviewers below to start tracking completion." loading={loading} skeletonRows={2} /></div>

    {bulkResult && <div className="mt-4 space-y-1 text-sm" role="status" aria-live="polite">
      <p>Sent {bulkResult.sent} of {bulkResult.requested} reminder{bulkResult.requested === 1 ? "" : "s"}.</p>
      {bulkResult.results.filter(result => result.status !== "sent").map(result => <p key={result.reviewerUserId} className="text-xs text-muted-foreground">
        {result.reviewerUserId} — {result.status === "skipped" ? "no email on file, not sent." : result.error}
      </p>)}
    </div>}
  </section>;
}
