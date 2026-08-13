import type { AssignmentFilter, Submission } from "@/data/types";

/**
 * The eligibility predicate for bulk reviewer assignment, shared by the client-side preview
 * count and mirrored exactly by convex/evaluations.ts `assignByFilter`. If these two ever
 * disagree, the organizer is shown a number the write will not honour — which is the whole
 * reason the preview exists. Keep them in lockstep.
 *
 * Drafts were never submitted and withdrawn proposals are out of the running, so neither is
 * routed to a reviewer.
 */
export function isAssignableSubmission(submission: Pick<Submission, "status">): boolean {
  return submission.status !== "draft" && submission.status !== "withdrawn";
}

/** Submissions a single tag-or-track filter resolves to, drafts and withdrawals removed. */
export function matchSubmissionsForFilter<T extends Pick<Submission, "status" | "tagIds" | "trackId">>(
  submissions: T[],
  filter: AssignmentFilter,
): T[] {
  const eligible = submissions.filter(isAssignableSubmission);
  return filter.kind === "tag"
    ? eligible.filter(submission => (submission.tagIds ?? []).some(tagId => tagId === filter.tagId))
    : eligible.filter(submission => submission.trackId === filter.trackId);
}
