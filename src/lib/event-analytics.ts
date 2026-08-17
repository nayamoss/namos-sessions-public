type SubmissionStatus = "draft" | "pending" | "accept_queue" | "accepted" | "maybe" | "decline_queue" | "declined" | "withdrawn";

type SubmissionMetricRow = { id: string; status: SubmissionStatus };
type EvaluationMetricRow = { assignmentId?: string };
type AssignmentMetricRow = { id: string };
type SpeakerMetricRow = {
  confirmationStatus?: "awaiting" | "confirmed" | "declined";
  bio?: string;
  headshotStorageKey?: string;
};
type AgendaMetricRow = { submissionId?: string; isPublished: boolean };
type CommunicationMetricRow = { status?: "queued" | "sent" | "failed" };
type TaskMetricRow = {
  status: "pending" | "in_progress" | "completed";
  dueDate?: number;
};

export type EventAnalyticsRows = {
  submissions: SubmissionMetricRow[];
  evaluations: EvaluationMetricRow[];
  assignments: AssignmentMetricRow[];
  speakers: SpeakerMetricRow[];
  agenda: AgendaMetricRow[];
  communications: CommunicationMetricRow[];
  tasks: TaskMetricRow[];
};

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : Math.round((numerator / denominator) * 1_000) / 10;

export function buildEventAnalyticsSummary(
  rows: EventAnalyticsRows,
  now = Date.now(),
) {
  const statusCount = (status: SubmissionStatus) =>
    rows.submissions.filter((submission) => submission.status === status).length;
  const accepted = statusCount("accepted");
  const declined = statusCount("declined");
  const completedAssignmentIds = new Set(
    rows.evaluations.flatMap((evaluation) =>
      evaluation.assignmentId ? [evaluation.assignmentId] : [],
    ),
  );
  const assignedIds = new Set(rows.assignments.map((assignment) => assignment.id));
  const completedReviews = [...completedAssignmentIds].filter((id) =>
    assignedIds.has(id),
  ).length;
  const acceptedIds = new Set(
    rows.submissions
      .filter((submission) => submission.status === "accepted")
      .map((submission) => submission.id),
  );
  const scheduledAcceptedIds = new Set(
    rows.agenda.flatMap((item) =>
      item.submissionId && acceptedIds.has(item.submissionId)
        ? [item.submissionId]
        : [],
    ),
  );
  const completedTasks = rows.tasks.filter((task) => task.status === "completed").length;

  return {
    version: 1,
    generatedAt: now,
    submissions: {
      total: rows.submissions.length,
      draft: statusCount("draft"),
      pending: statusCount("pending"),
      inReview:
        statusCount("accept_queue") +
        statusCount("maybe") +
        statusCount("decline_queue"),
      accepted,
      declined,
      withdrawn: statusCount("withdrawn"),
      acceptanceRate: ratio(accepted, accepted + declined),
    },
    reviews: {
      assigned: assignedIds.size,
      completed: completedReviews,
      completionRate: ratio(completedReviews, assignedIds.size),
    },
    speakers: {
      total: rows.speakers.length,
      awaiting: rows.speakers.filter(
        (speaker) => !speaker.confirmationStatus || speaker.confirmationStatus === "awaiting",
      ).length,
      confirmed: rows.speakers.filter(
        (speaker) => speaker.confirmationStatus === "confirmed",
      ).length,
      declined: rows.speakers.filter(
        (speaker) => speaker.confirmationStatus === "declined",
      ).length,
      profileComplete: rows.speakers.filter(
        (speaker) => Boolean(speaker.bio?.trim() && speaker.headshotStorageKey),
      ).length,
    },
    agenda: {
      total: rows.agenda.length,
      published: rows.agenda.filter((item) => item.isPublished).length,
      acceptedSessions: acceptedIds.size,
      scheduledAccepted: scheduledAcceptedIds.size,
      scheduleRate: ratio(scheduledAcceptedIds.size, acceptedIds.size),
    },
    communications: {
      total: rows.communications.length,
      queued: rows.communications.filter((comm) => comm.status === "queued").length,
      sent: rows.communications.filter((comm) => comm.status === "sent").length,
      failed: rows.communications.filter((comm) => comm.status === "failed").length,
    },
    tasks: {
      total: rows.tasks.length,
      pending: rows.tasks.filter((task) => task.status === "pending").length,
      inProgress: rows.tasks.filter((task) => task.status === "in_progress").length,
      completed: completedTasks,
      overdue: rows.tasks.filter(
        (task) =>
          task.status !== "completed" &&
          typeof task.dueDate === "number" &&
          task.dueDate < now,
      ).length,
      completionRate: ratio(completedTasks, rows.tasks.length),
    },
    history: { available: false, daily: [] },
  };
}
