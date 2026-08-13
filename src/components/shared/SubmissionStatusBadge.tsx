import type { SubmissionStatus } from "@/data/types";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

const labels: Record<SubmissionStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  accept_queue: "Accept queue",
  accepted: "Accepted",
  decline_queue: "Decline queue",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export function SubmissionStatusBadge({ status, className }: { status: SubmissionStatus; className?: string }) {
  const tone: StatusTone = status === "accepted"
    ? "success"
    : status === "pending" || status === "accept_queue"
      ? "warning"
      : status === "declined" || status === "decline_queue"
        ? "destructive"
        : "neutral";

  return (
    <StatusBadge tone={tone} className={className}>
      {labels[status]}
    </StatusBadge>
  );
}
