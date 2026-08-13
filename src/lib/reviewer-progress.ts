// Per-reviewer completion for one evaluation plan, derived at read time.
//
// This is the single definition of "complete" for the feature: an assignment counts as done
// when an evaluations row links to it (assignmentId) AND carries a numeric score. Both the
// Convex query and the unit tests call this one function so no adapter can drift on the rule.
// Mirrors src/lib/evaluation-score.ts — pure, no Convex imports, no I/O.

export type ReviewerProgressRow = {
  reviewerUserId: string;
  assigned: number;
  completed: number;
  outstanding: number;
  /** Integer 0..100. 0 when nothing is assigned, which cannot happen for a derived row. */
  completionRate: number;
  emailResolved: boolean;
  toEmail?: string;
};

export type ProgressAssignment = { id: string; reviewerUserId: string };
export type ProgressReview = { assignmentId?: string; score?: number };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** FR-007: the reviewer identifier itself when it is an address, else a known speaker email. */
function resolveEmail(reviewerUserId: string, speakerEmails: Set<string>): string | undefined {
  const candidate = reviewerUserId.trim();
  if (emailPattern.test(candidate)) return candidate.toLowerCase();
  const matched = speakerEmails.has(candidate.toLowerCase()) ? candidate.toLowerCase() : undefined;
  return matched;
}

export function computeReviewerProgress(
  assignments: ProgressAssignment[],
  reviews: ProgressReview[],
  speakerEmails: string[],
): ReviewerProgressRow[] {
  const scored = new Set(
    reviews.filter(review => review.assignmentId && typeof review.score === "number").map(review => review.assignmentId!),
  );
  const knownEmails = new Set(speakerEmails.map(email => email.trim().toLowerCase()).filter(Boolean));

  const byReviewer = new Map<string, { assigned: number; completed: number }>();
  for (const assignment of assignments) {
    const entry = byReviewer.get(assignment.reviewerUserId) ?? { assigned: 0, completed: 0 };
    entry.assigned += 1;
    if (scored.has(assignment.id)) entry.completed += 1;
    byReviewer.set(assignment.reviewerUserId, entry);
  }

  const rows: ReviewerProgressRow[] = [...byReviewer.entries()].map(([reviewerUserId, entry]) => {
    const toEmail = resolveEmail(reviewerUserId, knownEmails);
    return {
      reviewerUserId,
      assigned: entry.assigned,
      completed: entry.completed,
      outstanding: entry.assigned - entry.completed,
      completionRate: entry.assigned ? Math.round((entry.completed / entry.assigned) * 100) : 0,
      emailResolved: toEmail !== undefined,
      ...(toEmail ? { toEmail } : {}),
    };
  });

  // Least-complete first, then by identifier so the order never shuffles between reads (FR-004).
  return rows.sort((left, right) => left.completionRate - right.completionRate || left.reviewerUserId.localeCompare(right.reviewerUserId));
}

/** The reviewers a bulk send would actually mail: below the bar and reachable (FR-015, FR-008). */
export function reviewersBelowThreshold(rows: ReviewerProgressRow[], thresholdPercent: number): ReviewerProgressRow[] {
  return rows.filter(row => row.completionRate < thresholdPercent);
}
