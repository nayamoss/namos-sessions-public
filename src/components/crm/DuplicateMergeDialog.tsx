import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { CrmQueryErrorBoundary } from "@/components/crm/CrmQueryErrorBoundary";
import { cleanErrorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type MergeResult = { mergeId: Id<"crm_contact_merges">; retainedLabel: string; archivedLabel: string };

function IdentityCard({ label, name, email, tone }: { label: string; name: string; email: string; tone: "keep" | "archive" }) {
  return (
    <div className="min-w-0 flex-1 rounded-[12px] bg-muted/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{name}</p>
      <p className="truncate text-sm text-muted-foreground">{email}</p>
      {tone === "archive" && <p className="mt-2 text-xs text-muted-foreground">Kept as a reversible, audited record — no history is deleted.</p>}
    </div>
  );
}

function PreflightBody({
  organizationId,
  sourceContactId,
  targetContactId,
  onSwap,
  onMerged,
  onClose,
}: {
  organizationId: Id<"organizations">;
  sourceContactId: Id<"crm_contacts">;
  targetContactId: Id<"crm_contacts">;
  onSwap: () => void;
  onMerged: (result: MergeResult) => void;
  onClose: () => void;
}) {
  const preflight = useQuery(api.crm.mergePreflight, { organizationId, sourceContactId, targetContactId });
  const mergeExactEmail = useMutation(api.crm.mergeExactEmail);
  const [confirmed, setConfirmed] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { setConfirmed(false); setError(undefined); }, [sourceContactId, targetContactId]);

  if (preflight === undefined) return <SkeletonList rows={2} label="Comparing contacts…" />;

  const confirm = async () => {
    setMerging(true); setError(undefined);
    try {
      const result = await mergeExactEmail({ organizationId, sourceContactId, targetContactId, confirmationHash: preflight.confirmationHash });
      onMerged({ mergeId: result.mergeId, retainedLabel: preflight.target.name, archivedLabel: preflight.source.name });
    } catch (cause) {
      setError(cleanErrorMessage(cause, "This merge preview is out of date. Review the contacts again before confirming."));
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-stretch gap-3">
        <IdentityCard label="Archived (source)" name={preflight.source.name} email={preflight.source.email} tone="archive" />
        <Button type="button" variant="ghost" size="icon" className="mt-auto mb-auto shrink-0" onClick={onSwap} aria-label="Swap which contact is retained" title="Swap which contact is retained">
          <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <IdentityCard label="Retained (target)" name={preflight.target.name} email={preflight.target.email} tone="keep" />
      </div>
      {preflight.alreadyMergedAt && (
        <p role="status" className="text-sm text-muted-foreground">
          This contact was already merged on {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(preflight.alreadyMergedAt))}.
        </p>
      )}
      <div className="space-y-1.5 rounded-[12px] bg-muted/40 p-4">
        <p className="text-sm font-medium">This will move</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <li>Event memberships: {preflight.affected.memberships}</li>
          <li>Speaker records: {preflight.affected.speakers}</li>
          <li>Imported source records: {preflight.affected.sourceRecords}</li>
          <li>Stage history entries: {preflight.affected.stageHistory}</li>
        </ul>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} disabled={merging || Boolean(preflight.alreadyMergedAt)} />
        <span>I understand {preflight.source.name} will be archived as a reversible record and every reference above will move to {preflight.target.name}.</span>
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={merging}>Cancel</Button>
        <Button type="button" onClick={() => void confirm()} disabled={!confirmed || merging || Boolean(preflight.alreadyMergedAt)}>
          {merging ? "Merging…" : "Merge contacts"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * Duplicate preflight/merge/reverse UI (#268 T010). Preflight always shows affected references
 * before any mutation runs, and the mutation itself is bound to that exact preview via
 * `confirmationHash` (convex/crm.ts `mergeExactEmail`) — confirming a stale preview fails closed
 * server-side. Reversal is offered immediately after a successful merge, as an "Undo" affordance
 * on the announcement banner, since there is no query to list past merges for a contact.
 */
export function DuplicateMergeDialog({
  organizationId,
  open,
  onOpenChange,
  contactIds,
  onMerged,
}: {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: [Id<"crm_contacts">, Id<"crm_contacts">];
  onMerged: (result: MergeResult) => void;
}) {
  const [keepSecond, setKeepSecond] = useState(false);
  const sourceContactId = keepSecond ? contactIds[0] : contactIds[1];
  const targetContactId = keepSecond ? contactIds[1] : contactIds[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate contacts</DialogTitle>
          <DialogDescription>Only contacts with the exact same email address can be merged. Review what will move before confirming.</DialogDescription>
        </DialogHeader>
        <CrmQueryErrorBoundary
          fallback={(message) => (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">{message}</p>
              <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
            </div>
          )}
        >
          <PreflightBody
            organizationId={organizationId}
            sourceContactId={sourceContactId}
            targetContactId={targetContactId}
            onSwap={() => setKeepSecond((current) => !current)}
            onMerged={onMerged}
            onClose={() => onOpenChange(false)}
          />
        </CrmQueryErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}

export function MergeAnnouncement({
  organizationId,
  result,
  onDismiss,
}: {
  organizationId: Id<"organizations">;
  result: MergeResult;
  onDismiss: () => void;
}) {
  const reverseMerge = useMutation(api.crm.reverseMerge);
  const [status, setStatus] = useState<"idle" | "reversing" | "reversed" | "refused">("idle");
  const [error, setError] = useState<string>();

  const undo = async () => {
    setStatus("reversing"); setError(undefined);
    try {
      const outcome = await reverseMerge({ organizationId, mergeId: result.mergeId });
      setStatus(outcome.reversed || outcome.alreadyReversed ? "reversed" : "idle");
    } catch (cause) {
      // convex/crm.ts reverseMerge refuses specifically when references changed since the merge —
      // that is a distinct, expected outcome from a generic failure, so it gets its own message
      // rather than being folded into the catch-all below.
      const message = cleanErrorMessage(cause, "This merge could not be reversed.");
      setError(message);
      setStatus(message.includes("changed since this merge") ? "refused" : "idle");
    }
  };

  return (
    <section role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-muted/60 px-4 py-3">
      <p className="text-sm">
        {status === "reversed"
          ? `${result.archivedLabel} was restored.`
          : `${result.archivedLabel} was merged into ${result.retainedLabel}.`}
      </p>
      <div className="flex items-center gap-2">
        {status !== "reversed" && status !== "refused" && (
          <Button type="button" variant="outline" size="sm" onClick={() => void undo()} disabled={status === "reversing"}>
            {status === "reversing" ? "Undoing…" : "Undo"}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {status === "refused" ? "This can no longer be undone automatically — something about these records changed after the merge. " : ""}
          {error}
        </p>
      )}
    </section>
  );
}
