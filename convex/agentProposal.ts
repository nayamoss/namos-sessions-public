export type CanonicalProposedTask = {
  title: string;
  targetType: "contact" | "group" | "submission" | "sponsor";
  speakerId?: string;
  submissionId?: string;
  sponsorId?: string;
  linkedFormId?: string;
  dueDate?: number;
  reason: string;
};

export function canonicalProposalPayload(summary: string, tasks: CanonicalProposedTask[]) {
  if (tasks.length < 1 || tasks.length > 50) throw new Error("A task proposal must contain between 1 and 50 tasks.");
  const normalizedSummary = summary.trim();
  if (!normalizedSummary || normalizedSummary.length > 1000) throw new Error("A proposal summary must be between 1 and 1,000 characters.");
  return JSON.stringify({
    kind: "create_tasks",
    summary: normalizedSummary,
    tasks: tasks.map((task) => {
      const title = task.title.trim();
      const reason = task.reason.trim();
      if (!title || title.length > 200) throw new Error("Each proposed task needs a title of at most 200 characters.");
      if (!reason || reason.length > 1000) throw new Error("Each proposed task needs a reason of at most 1,000 characters.");
      if (task.dueDate !== undefined && !Number.isFinite(task.dueDate)) throw new Error("Each proposed due date must be a valid timestamp.");
      return { title, targetType: task.targetType, ...(task.speakerId ? { speakerId: task.speakerId } : {}), ...(task.submissionId ? { submissionId: task.submissionId } : {}), ...(task.sponsorId ? { sponsorId: task.sponsorId } : {}), ...(task.linkedFormId ? { linkedFormId: task.linkedFormId } : {}), ...(task.dueDate !== undefined ? { dueDate: task.dueDate } : {}), reason };
    }),
  });
}
