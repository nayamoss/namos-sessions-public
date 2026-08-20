import { canonicalMessageDraftProposalPayload, type CanonicalProposedMessage } from "./agentProposal";

export type DemoAcceptanceCandidate = {
  speakerId: string;
  speakerName: string;
  submissionId: string;
  submissionTitle: string;
  templateId?: string;
  scheduled: boolean;
};

export function buildDemoAcceptanceProposal(eventName: string, candidates: DemoAcceptanceCandidate[]) {
  const messages: CanonicalProposedMessage[] = candidates.slice(0, 50).map((candidate) => ({
    speakerId: candidate.speakerId,
    submissionId: candidate.submissionId,
    ...(candidate.templateId ? { templateId: candidate.templateId } : {}),
    kind: "acceptance",
    subject: `You’re accepted to ${eventName}`,
    body: `Hi ${candidate.speakerName},\n\nYour session “${candidate.submissionTitle}” has been accepted for ${eventName}. Please review your speaker tasks and event resources in Namos Sessions.`,
    calendarAttached: candidate.scheduled,
    reason: candidate.scheduled
      ? "This accepted speaker has not been notified; the scheduled session can include a calendar invitation."
      : "This accepted speaker has not been notified; schedule the session before adding a calendar invitation.",
  }));
  if (!messages.length) return null;
  const summary = `Prepared ${messages.length} acceptance message draft${messages.length === 1 ? "" : "s"} from accepted, unnotified submissions. Review and confirm before any drafts are created; nothing has been sent.`;
  return { summary, messages, canonicalPayload: canonicalMessageDraftProposalPayload(summary, messages) };
}
