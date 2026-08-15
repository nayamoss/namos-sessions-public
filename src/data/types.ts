export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };
export type EventId = Brand<string, "EventId">;
export type FormId = Brand<string, "FormId">;
export type SubmissionId = Brand<string, "SubmissionId">;
export type SpeakerId = Brand<string, "SpeakerId">;
export type AgendaItemId = Brand<string, "AgendaItemId">;
export type TaskId = Brand<string, "TaskId">;
export type TagId = Brand<string, "TagId">;
export type SponsorId = Brand<string, "SponsorId">;
export type SponsorTierId = Brand<string, "SponsorTierId">;
export type AgentRunId = Brand<string, "AgentRunId">;
export type AgentProposalId = Brand<string, "AgentProposalId">;
export type EmbedId = Brand<string, "EmbedId">;

export type SubmissionStatus =
  | "draft" | "pending" | "accept_queue" | "accepted"
  | "decline_queue" | "declined" | "withdrawn";

export type EventStatus = "draft" | "published" | "archived";
export interface Event { id: EventId; name: string; slug: string; type?: string; websiteUrl?: string; location?: string; timezone: string; startDate: number; endDate: number; description?: string; contactEmail?: string; logoFileId?: string; programPublishedAt?: number; theme?: string; logoStorageKey?: string; backgroundStorageKey?: string; exhibitorsEnabled: boolean; sponsorsEnabled: boolean; defaultOnboardingTemplateId?: string; status: EventStatus; }

export interface ApiKey { id: string; label: string; keyPrefix: string; createdAt: number; lastUsedAt?: number; revokedAt?: number; }
export interface GeneratedApiKey { id: string; rawKey: string; }
export interface Room { id: string; eventId: EventId; name: string; capacity?: number; sortOrder: number; }
export interface Track { id: string; eventId: EventId; name: string; color?: string; sortOrder: number; }
export interface Tag { id: TagId; eventId: EventId; name: string; color?: string; }
export interface SponsorTier { id: SponsorTierId; eventId: EventId; name: string; sortOrder: number; color?: string; benefitsDescription?: string; sponsorCount: number; }
export interface SponsorContact { id: string; eventId: EventId; sponsorId: SponsorId; name: string; email?: string; phone?: string; role?: string; isPrimary: boolean; }
export type SponsorStatus = "prospect" | "confirmed" | "declined";
export interface Sponsor { id: SponsorId; eventId: EventId; name: string; tierId?: SponsorTierId; tier?: SponsorTier; status: SponsorStatus; website?: string; notes?: string; primaryContact?: SponsorContact; openTaskCount: number; }
export interface SponsorDetail extends Sponsor { contacts: SponsorContact[]; tasks: OnboardingTask[]; submissions: Submission[]; }
export interface SubmissionForm { id: FormId; eventId: EventId; name: string; isOpen: boolean; sections?: SubmissionFormSection[]; }
export interface FieldDefinition { id: string; label: string; type: string; required: boolean; maxChars?: number; options?: string[]; showIf?: { fieldId: string; equals: string }; }
export type SubmissionFormKind = "abstract" | "session" | "contact" | "group" | "submission_task";
export type SubmissionFormStatus = "draft" | "open" | "closed";
export type SubmissionFormSection = { id: string; key: "abstract" | "participant" | "portal"; title: string; pageHeading: string; description?: string; fieldIds: string[] };
export type ParticipantRole = { role: string; min?: number; max?: number };
export type CrossFieldLimit = { id: string; label: string; fieldIds: string[]; maxCombinedChars: number; perParticipant: boolean };
export type SubmissionRoutingRule = {
  id: string;
  fieldId: string;
  equals: string;
  assignTagIds?: TagId[];
  assignTrackId?: string;
  assignSponsorId?: SponsorId;
  setStatus?: "pending" | "accept_queue" | "accepted";
  reviewerUserIds?: string[];
};
export interface SubmissionFormWrite {
  id?: string;
  eventId: EventId;
  internalName: string;
  externalTitle: string;
  pageHeading: string;
  version: number;
  kind: SubmissionFormKind;
  collectParticipants: boolean;
  welcomeMessage?: string;
  showWelcomeMessage: boolean;
  sections: SubmissionFormSection[];
  participantRoles: ParticipantRole[];
  crossFieldLimits: CrossFieldLimit[];
  routingRules?: SubmissionRoutingRule[];
  closeDate?: number;
  submissionLimit?: number;
  allowMultipleDrafts: boolean;
  autoRedirectToPortal: boolean;
  successPageMessage?: string;
  reminderEmailEnabled: boolean;
  adminUserIds: string[];
  notifyAdminsOnNew: string[];
  notifyAdminsOnUpdate: string[];
  sendSubmitterConfirmation: boolean;
  portalFormSettings?: { sendConfirmationEmail: boolean; confirmationBody?: string };
  status: SubmissionFormStatus;
}
export interface FieldDefinitionWrite { id?: string; label: string; type: "text" | "wysiwyg" | "dropdown" | "multiselect" | "email" | "phone" | "file" | "date" | "number"; maxChars?: number; options?: string[]; locked: boolean; required: boolean; showIf?: { fieldId: string; equals: string }; }
export type SubmissionEditLockReason = "under_review" | "decision_recorded" | "submissions_closed";
export type SubmissionEditability =
  | { editable: true; mode: "draft" | "submitted" }
  | { editable: false; reason: SubmissionEditLockReason; closedAt?: number };
export interface Submission { id: SubmissionId; eventId: EventId; formId: FormId; speakerIds: SpeakerId[]; tagIds: TagId[]; trackId?: string; sponsorId?: SponsorId; status: SubmissionStatus; title?: string; answers?: Record<string, unknown>; updatedAt?: number; lastSpeakerEditAt?: number; speakerEditCount?: number; editability?: SubmissionEditability; }
export type SpeakerConfirmationStatus = "awaiting" | "confirmed" | "declined";
export interface Speaker { id: SpeakerId; eventId: EventId; name: string; email?: string; firstName?: string; lastName?: string; bio?: string; salutation?: string; honorific?: string; pronouns?: string; gender?: string; linkedinUrl?: string; xUrl?: string; facebookUrl?: string; websiteUrl?: string; headshotStorageKey?: string; confirmationStatus: SpeakerConfirmationStatus; }
export interface SpeakerImportRow { firstName: string; lastName: string; email: string; bio?: string; talkTitle?: string; talkAbstract?: string; }
export interface SpeakerImportResult { importedSpeakers: number; importedTalks: number; skipped: Array<{ row: number; reason: string }>; }
export type SpeakerDocumentKind = "slides" | "supporting_doc";
export interface SpeakerDocument { id: string; submissionId: SubmissionId; speakerId: SpeakerId; kind: SpeakerDocumentKind; fileUrl: string; fileName: string; createdAt: number; }
// A named scoring dimension on an evaluation plan. `max`/`weight` apply to `number` criteria
// only — a `text` criterion is a free response and is deliberately excluded from the total.
export interface EvaluationCriterion { id: string; label: string; type: "number" | "text"; max?: number; weight?: number; required: boolean; }
// A reviewer's answer for one criterion, keyed by criterion id rather than array position.
export interface EvaluationCriterionScore { criterionId: string; value?: number; text?: string; }
// `score` is retained as the legacy single-score value for reviews recorded before scorecards.
// The scorecard path writes `criteriaScores` and never touches it.
// `criteria`/`scoringScaleMax` are joined in by evaluations:list from the row's own plan, so a
// grid can compute the weighted total without loading assignments and plans itself.
export interface Evaluation { id: string; submissionId: SubmissionId; assignmentId?: string; reviewerName?: string; score?: number; comments?: string; criteriaScores?: EvaluationCriterionScore[]; criteria?: EvaluationCriterion[]; scoringScaleMax?: number; }
export interface EvaluationPlan { id: string; eventId: EventId; name: string; rounds: number; scoringScaleMax: 5 | 10; aiAssistEnabled: boolean; anonymized?: boolean; criteria?: EvaluationCriterion[]; }
// `reviewerUserId` is intentionally an application identity, not an organization member id.
// Until Clerk is connected the UI requires an explicit demo reviewer selection.
export interface EvaluationAssignment { id: string; eventId: EventId; evaluationPlanId: string; submissionId: SubmissionId; reviewerUserId: string; round: number; }
// A single-dimension bulk-assignment filter: exactly one tag, or exactly one track, never both
// and never neither. Modelled as a discriminated union so the invalid combinations are
// unrepresentable at the type and validator boundary rather than checked by hand.
export type AssignmentFilter = { kind: "tag"; tagId: TagId } | { kind: "track"; trackId: string };
// What a bulk assignment actually did. `matchedSubmissionCount` is the server's authoritative
// count — the client's preview may be stale — and `skipped` is what idempotency already covered.
export interface AssignByFilterResult { matchedSubmissionCount: number; reviewerCount: number; created: number; skipped: number; assignmentIds: string[]; }
// One row of the signed-in reviewer's own queue, joined server-side so a reviewer never has to
// call an organizer-gated list to render their queue. Carries its own `eventId` because the
// reviewer surface has no other way to learn it (events.list is organizer-only).
//
// Deliberately projection-only, like the PublicEmbed* types below: on a plan whose `anonymized`
// flag is set, the server omits `speakerNames` entirely before returning. The client never has
// the identity to hide, so this is not a UI concern.
export interface ReviewerQueueRow { assignmentId: string; eventId: EventId; submissionId: SubmissionId; submissionTitle: string; submissionAnswers: { abstract?: string; track?: string }; speakerNames?: string[]; round: number; planName: string; scoringScaleMax: number; anonymized?: boolean; criteria?: EvaluationCriterion[]; review?: { id: string; score?: number; comments?: string; criteriaScores?: EvaluationCriterionScore[] }; }
// Per-reviewer completion on one evaluation plan (derived, never stored), and the outcome of a
// reminder batch. The row shape is owned by the pure helper the Convex query and tests share.
export type { ReviewerProgressRow } from "@/lib/reviewer-progress";
export interface ReviewerReminderResult { reviewerUserId: string; toEmail?: string; status: "sent" | "failed" | "skipped"; error?: string; reason?: string; }
export interface ReviewerReminderBatch { status: "sent" | "failed" | "skipped"; requested: number; sent: number; failed: number; skippedNoEmail: number; results: ReviewerReminderResult[]; }
export interface AgendaItem { id: AgendaItemId; eventId: EventId; title: string; roomId: string; trackId?: string; submissionId?: SubmissionId; speakerIds: SpeakerId[]; startTime: number; endTime: number; videoUrl?: string; locationDetails?: string; calendarUid?: string; calendarSequence?: number; isPublished: boolean; }
export interface SpeakerAgendaItem extends AgendaItem { roomName: string; trackName?: string; }
export interface AgendaConflict { itemA: AgendaItemId; itemB: AgendaItemId; reason: "room_overlap" | "speaker_overlap" | "speaker_unavailable" | "track_overlap"; speakerId?: SpeakerId; }
export interface OnboardingTask { id: TaskId; eventId: EventId; speakerId?: SpeakerId; submissionId?: SubmissionId; sponsorId?: SponsorId; linkedFormId?: FormId; targetType: "contact" | "group" | "submission" | "sponsor"; title: string; source: "manual" | "auto" | "agent"; status: "pending" | "in_progress" | "completed"; dueDate?: number; completedAt?: number; }
export type AgentRunStatus = "queued" | "running" | "needs_input" | "needs_approval" | "completed" | "failed" | "cancelled";
export type AgentProviderMode = "managed" | "bring_your_own";
export interface AgentRun { id: AgentRunId; eventId: EventId; threadId?: string; requestedByUserId: string; objective: string; status: AgentRunStatus; model: string; providerMode?: AgentProviderMode; idempotencyKey: string; stepCount: number; maxSteps: number; inputTokens?: number; outputTokens?: number; finalSummary?: string; error?: string; startedAt?: number; completedAt?: number; createdAt: number; updatedAt: number; }
export type AgentRunEventType = "user_message" | "assistant_message" | "progress" | "tool_call" | "tool_result" | "clarification" | "proposal" | "approval" | "error";
export interface AgentRunEvent { id: string; eventId: EventId; runId: AgentRunId; sequence: number; type: AgentRunEventType; message: string; toolName?: string; toolCallId?: string; detailsJson?: string; durationMs?: number; createdAt: number; }
export interface AgentProposedTask { title: string; targetType: OnboardingTask["targetType"]; speakerId?: SpeakerId; submissionId?: SubmissionId; sponsorId?: SponsorId; linkedFormId?: FormId; dueDate?: number; reason: string; }
export interface AgentTaskProposal { id: AgentProposalId; eventId: EventId; runId: AgentRunId; kind: "create_tasks"; tasks: AgentProposedTask[]; payloadHash: string; summary: string; status: "pending" | "rejected" | "applying" | "applied" | "failed" | "superseded"; proposedByToolCallId: string; decidedByUserId?: string; decisionReason?: string; decidedAt?: number; appliedAt?: number; createdTaskIds?: TaskId[]; error?: string; createdAt: number; updatedAt: number; }
export interface AgentRunDetail { run: AgentRun; events: AgentRunEvent[]; proposals: AgentTaskProposal[]; }
export type TaskTemplateItem = { title: string; description?: string; targetType: OnboardingTask["targetType"]; linkedFormId?: FormId; dueDateOffsetDays?: number };
export interface TaskTemplate { id: string; eventId: EventId; name: string; description?: string; items: TaskTemplateItem[]; isSeeded: boolean; }
export interface Comm { id: string; eventId: EventId; type: string; speakerId?: SpeakerId; status?: "queued" | "sent" | "failed"; sentAt?: number; createdAt?: number; }
export type CommTemplateKind = "submission_confirmation" | "acceptance" | "rejection" | "consolidated_decision" | "reminder" | "calendar_invite" | "custom";
export interface CommTemplate { id: string; eventId: EventId; name: string; kind: CommTemplateKind; subject: string; body: string; createdAt: number; updatedAt: number; }
export interface CommTemplateWrite { id?: string; eventId: EventId; name: string; kind: CommTemplateKind; subject: string; body: string; }
export interface CommPreview { kind: "acceptance" | "rejection" | "consolidated_decision" | "reminder"; templateId?: string; templateName?: string; subject: string; body: string; recipients: Array<{ speakerId: string; name: string; email?: string }>; calendarAttached: boolean; attachmentCount?: number; scheduleTime?: string; location?: string; }
export interface CommSendRecipientResult { speakerId?: string; toEmail?: string; status: "sent" | "failed" | "skipped"; error?: string; reason?: string; }
export interface CommSendResult { status: "sent" | "failed" | "skipped"; requested: number; sent: number; failed: number; skipped: number; results: CommSendRecipientResult[]; }
// Role lives on this row, never in an env var or hardcoded list — see convex/organizers.ts.
export interface Organizer { id: string; userId: string; email: string; role: "owner" | "admin"; onboardingCompletedAt?: number; createdAt: number; }
// Onboarding-captured personalization for any signed-in user — see schema.ts's `userProfiles`
// comment for why this is separate from Organizer.
export interface UserProfile { id: string; userId: string; displayName?: string; signupRole?: "solo" | "team"; referralSource?: string; updatedAt: number; }
export interface EventMember {
  id: string;
  eventId: EventId;
  userId: string;
  email: string;
  role: "organizer" | "reviewer";
  invitedByUserId: string;
  clerkInvitationId?: string;
  inviteEmailStatus?: "pending" | "sent" | "failed";
  inviteError?: string;
  invitedAt?: number;
  createdAt: number;
}
export interface EventInviteResult {
  memberId: string;
  status: "active" | "pending";
  clerkInvitationCreated: boolean;
  emailSent: boolean;
  warning?: string;
}

export type EmailProvider = "resend" | "ses";
export type EmailAuthMethod = "resend_oauth" | "resend_api_key" | "ses_api" | "ses_smtp";
/** Never carries the credential itself — only a masked hint of what is stored. */
export interface EmailIntegration {
  id: string;
  eventId: EventId;
  provider: EmailProvider;
  authMethod: EmailAuthMethod;
  sender: string;
  region?: string;
  credentialHint: string;
  status: "connected" | "error";
  lastError?: string;
  updatedAt: number;
}
export interface EmailIntegrationCredentials { apiKey?: string; accessKeyId?: string; secretAccessKey?: string; username?: string; password?: string; }
export interface EmailIntegrationSaveInput { eventId: EventId; authMethod: EmailAuthMethod; sender: string; region?: string; credentials: EmailIntegrationCredentials; }
/** Organizer-safe projection. The API key itself is never returned. */
export interface AgentProviderSetting { eventId: EventId; mode: AgentProviderMode; provider: "openai"; credentialHint?: string; status: "ready" | "error"; lastError?: string; managedAvailable: boolean; updatedAt: number; }
export type AvailabilitySlot = {
  date: number;
  /** Exact event-local hour for new records. */
  hour?: number;
  /** Backward-compatible coarse value for records created before hourly availability. */
  part?: "morning" | "afternoon" | "evening";
};
export interface Availability { id: string; eventId: EventId; speakerId: SpeakerId; unavailable: AvailabilitySlot[]; notes?: string; }

export type EmbedView = "agenda" | "schedule_itinerary" | "session_list" | "speaker_gallery" | "speaker_list" | "schedule_grid";
export type EmbedTheme = "light" | "dark" | "system";
export type EmbedDateFormat = "weekday_long" | "weekday_short" | "numeric";
export type EmbedTimeFormat = "12_hour" | "24_hour";
export interface EmbedFieldOptions {
  agenda: { title: boolean; time: boolean; room: boolean; track: boolean; speakers: boolean };
  session: { title: boolean; time: boolean; room: boolean; track: boolean; speakers: boolean };
  speaker: { name: boolean; headshot: boolean; bio: boolean; links: boolean; sessions: boolean };
}
export interface Embed { id: EmbedId; eventId: EventId; name: string; format: "styled_html"; view: EmbedView; enabled: boolean; theme: EmbedTheme; primaryColor: string; dateFormat: EmbedDateFormat; timeFormat: EmbedTimeFormat; trackIds: string[]; fields: EmbedFieldOptions; createdAt: number; updatedAt: number; }
export type EmbedWrite = Omit<Embed, "id" | "createdAt" | "updatedAt"> & { id?: EmbedId };
export interface PublicEmbedSession { key: string; title: string; startTime?: number; endTime?: number; roomName?: string; trackKey?: string; trackName?: string; speakerNames?: string[]; }
export interface PublicEmbedView { name: string; view: EmbedView; theme: EmbedTheme; primaryColor: string; dateFormat: EmbedDateFormat; timeFormat: EmbedTimeFormat; event: { name: string; timezone: string }; tracks: Array<{ key: string; name: string }>; sessions: PublicEmbedSession[]; speakers: Array<{ key: string; name: string; headshotUrl?: string; bio?: string; links?: PublicEmbedSpeakerLink[]; sessions?: Array<{ title: string; startTime?: number; roomName?: string }> }>; }

// These are deliberately projection-only types for unauthenticated embeds. They contain no
// record ids, email addresses, internal statuses, or draft data.
export interface PublicEmbedAgendaItem { title: string; startTime: number; endTime: number; roomName: string; trackName?: string; speakerNames: string[]; }
export interface PublicEmbedSpeakerLink { label: "LinkedIn" | "X" | "Facebook" | "Website"; url: string; }
export interface PublicEmbedSpeaker { name: string; bio?: string; headshotUrl?: string; links: PublicEmbedSpeakerLink[]; }
export interface PublicEmbed { eventName: string; eventTimezone: string; agenda: PublicEmbedAgendaItem[]; speakers: PublicEmbedSpeaker[]; }

// Public CFP configuration uses opaque, per-response field keys instead of database ids.
// This is the complete unauthenticated read model for a form; organizer notification and
// administrative fields intentionally do not appear here.
export interface PublicSubmissionField { key: string; label: string; type: string; required: boolean; maxChars?: number; options?: string[]; showIf?: { fieldKey: string; equals: string }; }
export interface PublicSubmissionFormConfig {
  event: { name: string; slug: string; timezone: string; startDate: number; endDate: number };
  form: {
    externalTitle: string; pageHeading: string; kind: SubmissionFormKind; collectParticipants: boolean;
    welcomeMessage?: string; showWelcomeMessage: boolean;
    sections: { key: "abstract" | "participant"; title: string; pageHeading: string; description?: string; fieldKeys: string[] }[];
    participantRoles: ParticipantRole[];
    crossFieldLimits: { key: string; label: string; fieldKeys: string[]; maxCombinedChars: number; perParticipant: boolean }[];
    closeDate?: number; submissionLimit?: number; allowMultipleDrafts: boolean; autoRedirectToPortal: boolean; successPageMessage?: string;
    confirmationEnabled: boolean;
    fields: PublicSubmissionField[];
  };
}
export interface PublicSubmissionFormSummary {
  id: FormId;
  title: string;
}
