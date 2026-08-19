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

export type CanonicalProposedMessage = {
  speakerId: string;
  submissionId?: string;
  templateId?: string;
  kind: "acceptance" | "rejection" | "reminder" | "custom";
  subject: string;
  body: string;
  calendarAttached: boolean;
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

export function canonicalMessageDraftProposalPayload(summary: string, messages: CanonicalProposedMessage[]) {
  if (messages.length < 1 || messages.length > 50) throw new Error("A message proposal must contain between 1 and 50 drafts.");
  const normalizedSummary = summary.trim();
  if (!normalizedSummary || normalizedSummary.length > 1000) throw new Error("A proposal summary must be between 1 and 1,000 characters.");
  return JSON.stringify({
    kind: "prepare_message_drafts",
    summary: normalizedSummary,
    messages: messages.map((message) => {
      const subject = message.subject.trim();
      const body = message.body.trim();
      const reason = message.reason.trim();
      if (!message.speakerId) throw new Error("Each message draft needs a speaker.");
      if (!subject || subject.length > 300) throw new Error("Each message draft needs a subject of at most 300 characters.");
      if (!body || body.length > 20_000) throw new Error("Each message draft needs a body of at most 20,000 characters.");
      if (!reason || reason.length > 1000) throw new Error("Each message draft needs a reason of at most 1,000 characters.");
      return {
        speakerId: message.speakerId,
        ...(message.submissionId ? { submissionId: message.submissionId } : {}),
        ...(message.templateId ? { templateId: message.templateId } : {}),
        kind: message.kind,
        subject,
        body,
        calendarAttached: message.calendarAttached,
        reason,
      };
    }),
  });
}
