import type { SubmissionStatus } from "@/data/types";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

const labels: Record<SubmissionStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  accept_queue: "Accept queue",
  accepted: "Accepted",
  maybe: "Maybe",
  decline_queue: "Decline queue",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export function SubmissionStatusBadge({ status, className, label }: { status: SubmissionStatus; className?: string; label?: string }) {
  const tone: StatusTone = status === "accepted"
    ? "success"
    : status === "pending" || status === "accept_queue" || status === "maybe"
      ? "warning"
      : status === "declined" || status === "decline_queue"
        ? "destructive"
        : "neutral";

  return (
    <StatusBadge tone={tone} className={className}>
      {label ?? labels[status]}
    </StatusBadge>
  );
}
