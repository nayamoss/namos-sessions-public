import type { SubmissionEditability, SubmissionEditLockReason, SubmissionStatus } from "@/data/types";

export const submissionEditCopy: Record<SubmissionEditLockReason, { list: string; detail: string }> = {
  under_review: {
    list: "Locked · under review",
    detail: "This proposal is being reviewed, so it can no longer be changed. Email the organizers if something is wrong.",
  },
  decision_recorded: {
    list: "Locked · decision recorded",
    detail: "A decision has been recorded for this proposal, so it can no longer be changed.",
  },
  submissions_closed: {
    list: "Locked · submissions closed",
    detail: "Submissions are closed, so this proposal can no longer be changed.",
  },
};

export function listEditability(status: SubmissionStatus): SubmissionEditability {
  if (status === "accept_queue" || status === "decline_queue") return { editable: false, reason: "under_review" };
  if (status === "accepted" || status === "declined") return { editable: false, reason: "decision_recorded" };
  return { editable: true, mode: status === "draft" ? "draft" : "submitted" };
}

export function lockDetailCopy(editability: Extract<SubmissionEditability, { editable: false }>, timezone: string) {
  if (editability.reason !== "submissions_closed" || editability.closedAt === undefined) return submissionEditCopy[editability.reason].detail;
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short", timeZone: timezone }).format(editability.closedAt);
  return `Submissions closed on ${date}.`;
}

export function formatPortalDate(value: number, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: timezone }).format(value);
}

export function relativeEditTime(value: number, now = Date.now()) {
  const elapsed = Math.max(0, now - value);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
