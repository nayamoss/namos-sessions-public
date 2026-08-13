import type { SubmissionStatus } from "@/data/types";
export function filterSubmissionsByStatus<T extends { status: SubmissionStatus }>(submissions: T[], status: SubmissionStatus | "all") { return status === "all" ? submissions : submissions.filter(submission => submission.status === status); }
