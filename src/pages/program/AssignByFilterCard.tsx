import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { matchSubmissionsForFilter } from "@/lib/assignment-filter";
import type { AssignByFilterResult, AssignmentFilter, EvaluationPlan, Submission, Tag, TagId, Track } from "@/data/types";
import { useOptionalCurrentEvent } from "@/components/EventContext";

type FilterKind = "tag" | "track";

export interface AssignByFilterCardProps {
  tags: Tag[];
  tracks: Track[];
  /** Preview only — the server resolves the filter itself and its count is authoritative. */
  submissions: Submission[];
  plans: EvaluationPlan[];
  selectedPlanId?: string;
  onSelectPlan: (planId: string) => void;
  round: number;
  onRoundChange: (round: number) => void;
  disabled?: boolean;
  onAssign: (input: { evaluationPlanId: string; filter: AssignmentFilter; reviewerUserIds: string[]; round: number }) => Promise<AssignByFilterResult>;
}

export function AssignByFilterCard({ tags, tracks, submissions, plans, selectedPlanId, onSelectPlan, round, onRoundChange, disabled, onAssign }: AssignByFilterCardProps) {
  const event = useOptionalCurrentEvent()?.event;
  const [filterKind, setFilterKind] = useState<FilterKind>("tag");
  const [filterValue, setFilterValue] = useState("");
  const [reviewerEmailsInput, setReviewerEmailsInput] = useState("");
  // Idle → confirming → working. A bulk assignment cannot be undone anywhere in this product,
  // so the write is deliberately two presses away and any input change drops back to idle.
  const [stage, setStage] = useState<"idle" | "confirming" | "working">("idle");
  const [result, setResult] = useState<{ text: string; created: number } | undefined>();
  const [error, setError] = useState<string>();

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId);
  const reviewerEmails = useMemo(
    () => [...new Set(reviewerEmailsInput.split(",").map(email => email.trim().toLowerCase()).filter(Boolean))],
    [reviewerEmailsInput],
  );
  const filter = useMemo<AssignmentFilter | undefined>(() => {
    if (!filterValue) return undefined;
    return filterKind === "tag" ? { kind: "tag", tagId: filterValue as TagId } : { kind: "track", trackId: filterValue };
  }, [filterKind, filterValue]);
  // Zero network calls: the same submissions the page already holds, run through the same
  // predicate the mutation applies server-side.
  const matchedCount = useMemo(() => (filter ? matchSubmissionsForFilter(submissions, filter).length : 0), [filter, submissions]);
  const totalAssignments = matchedCount * reviewerEmails.length;
  const filterLabel = filterKind === "tag"
    ? tags.find(tag => tag.id === filterValue)?.name
    : tracks.find(track => track.id === filterValue)?.name;

  // Any change to what would be written invalidates a pending confirmation and the last result.
  useEffect(() => { setStage(current => (current === "confirming" ? "idle" : current)); setResult(undefined); }, [filterKind, filterValue, reviewerEmailsInput, round, selectedPlanId]);

  const noLibrary = !tags.length && !tracks.length;
  const canAssign = !disabled && !!selectedPlan && !!filter && reviewerEmails.length > 0 && matchedCount > 0;

  const runAssignment = async () => {
    if (!selectedPlan || !filter) return;
    setStage("working"); setError(undefined); setResult(undefined);
    try {
      const outcome = await onAssign({ evaluationPlanId: selectedPlan.id, filter, reviewerUserIds: reviewerEmails, round });
      // The server count wins. If it differs from what was previewed, say so rather than
      // quietly showing a stale number an organizer might act on.
      const drift = outcome.matchedSubmissionCount !== matchedCount ? ` (the filter matched ${outcome.matchedSubmissionCount} submission${outcome.matchedSubmissionCount === 1 ? "" : "s"} when it ran)` : "";
      setResult({ created: outcome.created, text: `${outcome.skipped} already existed and ${outcome.skipped === 1 ? "was" : "were"} skipped.${drift}` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create these assignments.");
    } finally { setStage("idle"); }
  };

  const selectKind = (kind: FilterKind) => { setFilterKind(kind); setFilterValue(""); };

  return <section className={cardSurfaceClasses("default", "p-5")}>
    <h2 className="font-semibold">Assign by tag or track</h2>
    <p className="mt-1 text-sm text-muted-foreground">Assign every submission carrying one tag, or every submission in one track, to the reviewers you pick. Drafts and withdrawn submissions are skipped.</p>
    {noLibrary
      ? <p className="mt-4 text-sm text-muted-foreground">Add tags or tracks before assigning in bulk. <Link to={event ? `/events/${event.slug}/settings/library` : "/settings/library"} className="underline underline-offset-4">Settings → Library</Link></p>
      : <>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <SegmentedControl
              label="Assignment filter type"
              value={filterKind}
              options={(["tag", "track"] as const).map(kind => ({ value: kind, label: kind[0].toUpperCase() + kind.slice(1), disabled: kind === "tag" ? !tags.length : !tracks.length }))}
              onChange={selectKind}
              disabled={disabled}
            />
            <Select value={filterValue} onValueChange={setFilterValue} disabled={disabled || (filterKind === "tag" ? !tags.length : !tracks.length)}>
              <SelectTrigger className="w-52" aria-label={filterKind === "tag" ? "Tag" : "Track"}><SelectValue placeholder={filterKind === "tag" ? "Select tag" : "Select track"} /></SelectTrigger>
              <SelectContent>{filterKind === "tag" ? tags.map(tag => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>) : tracks.map(track => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedPlanId ?? ""} onValueChange={onSelectPlan} disabled={disabled}>
              <SelectTrigger className="w-52" aria-label="Evaluation plan for bulk assignment"><SelectValue placeholder="Select plan" /></SelectTrigger>
              <SelectContent>{plans.map(plan => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(round)} onValueChange={value => onRoundChange(Number(value))} disabled={disabled || !selectedPlan}>
              <SelectTrigger className="w-32" aria-label="Bulk assignment round"><SelectValue placeholder="Round" /></SelectTrigger>
              <SelectContent>{selectedPlan ? Array.from({ length: selectedPlan.rounds }, (_, index) => index + 1).map(value => <SelectItem key={value} value={String(value)}>Round {value}</SelectItem>) : null}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="bulk-reviewer-emails" className="sr-only">Reviewers for this assignment</Label>
              <Input id="bulk-reviewer-emails" value={reviewerEmailsInput} onChange={event => setReviewerEmailsInput(event.target.value)} disabled={disabled} className="w-64" placeholder="reviewer@example.com, another@example.com" />
            </div>
            {stage === "confirming"
              ? <div className="flex items-end gap-2">
                <Button variant="accent" size="sm" onClick={() => void runAssignment()}>Confirm {totalAssignments} assignment{totalAssignments === 1 ? "" : "s"}</Button>
                <Button variant="ghost" size="sm" onClick={() => setStage("idle")}>Cancel</Button>
              </div>
              : <Button variant="accent" size="sm" disabled={!canAssign || stage === "working"} onClick={() => setStage("confirming")}>{stage === "working" ? "Assigning…" : `Assign ${totalAssignments || ""}`.trim()}</Button>}
          </div>
        </div>
        {(filterKind === "tag" ? !tags.length : !tracks.length) && <p className="mt-3 text-sm text-muted-foreground">{filterKind === "tag" ? <>No tags yet. <Link to={event ? `/events/${event.slug}/settings/library` : "/settings/library"} className="underline underline-offset-4">Create tags in Settings → Library</Link> first.</> : "No tracks configured yet. Add tracks in event settings first."}</p>}
        {result
          ? <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-[hsl(var(--success))]">Created {result.created} assignment{result.created === 1 ? "" : "s"}.</span> {result.text}</p>
          : filter && reviewerEmails.length > 0 && <p className={`mt-3 text-sm ${stage === "confirming" ? "text-foreground" : "text-muted-foreground"}`}>{matchedCount === 0
            ? "No submissions match this filter yet."
            : <><span className="font-medium text-foreground">{matchedCount}</span> submission{matchedCount === 1 ? "" : "s"} {filterKind === "tag" ? "tagged" : "in track"} “{filterLabel}” × <span className="font-medium text-foreground">{reviewerEmails.length}</span> reviewer{reviewerEmails.length === 1 ? "" : "s"} = <span className="font-medium text-foreground">{totalAssignments}</span> review assignment{totalAssignments === 1 ? "" : "s"} for Round {round}.</>}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </>}
  </section>;
}
import { cardSurfaceClasses } from "@/components/ui/card";
