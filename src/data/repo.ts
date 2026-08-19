import { createContext, useContext } from "react";
import type {
  ActivityEntry,
  ApiKey,
  ApiScope,
  ApiAuditLogEntry,
  GeneratedApiKey,
  AssignByFilterResult,
  AssignmentFilter,
  AgendaConflict,
  AgendaItem,
  AgentProposalId,
  AgentRun,
  AgentRunDetail,
  AgentRunId,
  Availability,
  Comm,
  CommPreview,
  CommSendResult,
  CommTemplate,
  CommTemplateWrite,
  CommunicationDraft,
  CrossFieldLimit,
  AirtableConnectInput,
  AirtableImportResult,
  ContentIntegration,
  ContentIntegrationProvider,
  NotionConnectInput,
  NotionImportResult,
  SanityConnectInput,
  SanityPublishResult,
  EmailIntegration,
  EmailIntegrationSaveInput,
  AgentProviderSetting,
  Evaluation,
  EvaluationAssignment,
  EvaluationCriterion,
  EvaluationCriterionScore,
  EvaluationPlan,
  EventAnalyticsSummary,
  Event,
  EventId,
  EventInviteResult,
  EventMember,
  FieldDefinition,
  FieldDefinitionWrite,
  FormId,
  OnboardingTask,
  Organizer,
  Organization,
  PublicEmbed,
  Embed,
  EmbedId,
  EmbedWrite,
  PublicEmbedView,
  PublicSubmissionFormConfig,
  PublicSubmissionFormSummary,
  PortalResourcePage,
  ReviewerProgressRow,
  ReviewerQueueRow,
  ReviewerReminderBatch,
  Room,
  Speaker,
  SpeakerAgendaItem,
  SpeakerConfirmationStatus,
  SpeakerDocument,
  SpeakerDocumentKind,
  SpeakerId,
  SpeakerImportResult,
  SpeakerImportRow,
  SpeakerNote,
  Sponsor,
  SponsorContact,
  SponsorDetail,
  SponsorId,
  SponsorStatus,
  SponsorTier,
  SponsorTierId,
  Submission,
  SubmissionEditability,
  SubmissionForm,
  SubmissionFormStatus,
  SubmissionFormWrite,
  SubmissionId,
  Tag,
  TagId,
  UserProfile,
  TaskTemplate,
  TaskTemplateItem,
  Track,
} from "./types";

export interface EventScope {
  eventId: EventId;
}
export interface FilesRepo {
  generateUploadUrl(): Promise<{ uploadUrl: string }>;
  getUrl(storageId: string): Promise<string | null>;
}
export interface AnalyticsRepo {
  summary(scope: EventScope): Promise<EventAnalyticsSummary>;
}
/**
 * Which event the signed-in portal user is actually a speaker on, resolved server-side.
 * `event`/`speaker` are null when the account matches no speaker record on any reachable
 * event; `publishedEvents` is the same list `listForPortal` returns, so the portal can still
 * show an event shell when the caller is (for example) an organizer with no speaker profile.
 */
export interface PortalSpeakerIdentity {
  event: Event | null;
  speaker: Speaker | null;
  publishedEvents: Event[];
}

export interface EventsRepo {
  list(): Promise<Event[]>;
  listMine(): Promise<Event[]>;
  listForPortal(): Promise<Event[]>;
  portalSpeakerIdentity(): Promise<PortalSpeakerIdentity>;
  get(eventId: EventId): Promise<Event | null>;
  getBySlug(slug: string): Promise<Event | null>;
  save(
    event: Omit<Event, "id"> & {
      id?: EventId;
      pullTeamFromEventId?: EventId;
    },
  ): Promise<EventId>;
  duplicate(input: {
    sourceEventId: EventId;
    name: string;
    slug: string;
    startDate: number;
    endDate: number;
    pullTeamFrom?: boolean;
  }): Promise<EventId>;
  /** Permanently removes a draft event and every event-scoped record it owns. */
  remove(eventId: EventId): Promise<void>;
  listRooms(scope: EventScope): Promise<Room[]>;
  saveRoom(room: Omit<Room, "id"> & { id?: string }): Promise<string>;
  removeRoom(input: EventScope & { id: string }): Promise<void>;
  listTracks(scope: EventScope): Promise<Track[]>;
  saveTrack(track: Omit<Track, "id"> & { id?: string }): Promise<string>;
  removeTrack(input: EventScope & { id: string }): Promise<void>;
}
export interface EventMembersRepo {
  list(scope: EventScope): Promise<EventMember[]>;
  canManage(scope: EventScope): Promise<boolean>;
  invite(
    input: EventScope & { email: string; role: EventMember["role"] },
  ): Promise<EventInviteResult>;
  resend(input: EventScope & { memberId: string }): Promise<EventInviteResult>;
  claimPending(): Promise<number>;
  add(
    input: EventScope & {
      email: string;
      role: EventMember["role"];
      userId?: string;
    },
  ): Promise<string>;
  remove(input: EventScope & { memberId: string }): Promise<void>;
}
export interface TagsRepo {
  list(scope: EventScope): Promise<Tag[]>;
  create(input: EventScope & { name: string; color?: string }): Promise<TagId>;
  rename(input: EventScope & { id: TagId; name: string }): Promise<void>;
  remove(input: EventScope & { id: TagId }): Promise<void>;
}
export interface SponsorsRepo {
  list(scope: EventScope): Promise<Sponsor[]>;
  get(sponsorId: SponsorId): Promise<SponsorDetail | null>;
  create(
    input: EventScope & {
      name: string;
      tierId?: SponsorTierId;
      status: SponsorStatus;
      website?: string;
      notes?: string;
    },
  ): Promise<SponsorId>;
  update(input: {
    sponsorId: SponsorId;
    name?: string;
    tierId?: SponsorTierId | null;
    status?: SponsorStatus;
    website?: string;
    notes?: string;
  }): Promise<void>;
  remove(sponsorId: SponsorId): Promise<void>;
}
export interface SponsorTiersRepo {
  list(scope: EventScope): Promise<SponsorTier[]>;
  create(
    input: EventScope & {
      name: string;
      color?: string;
      benefitsDescription?: string;
    },
  ): Promise<SponsorTierId>;
  update(input: {
    tierId: SponsorTierId;
    name?: string;
    color?: string;
    benefitsDescription?: string;
    sortOrder?: number;
  }): Promise<void>;
  reorder(input: EventScope & { tierIds: SponsorTierId[] }): Promise<void>;
  remove(tierId: SponsorTierId): Promise<void>;
}
export interface SponsorContactsRepo {
  listBySponsor(sponsorId: SponsorId): Promise<SponsorContact[]>;
  create(input: {
    sponsorId: SponsorId;
    name: string;
    email?: string;
    phone?: string;
    role?: string;
    isPrimary: boolean;
  }): Promise<string>;
  update(input: {
    contactId: string;
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    isPrimary?: boolean;
  }): Promise<void>;
  remove(contactId: string): Promise<void>;
}
export interface FormsRepo {
  list(scope: EventScope): Promise<SubmissionForm[]>;
  fields(formId: string): Promise<FieldDefinition[]>;
  listFields(scope?: EventScope): Promise<FieldDefinition[]>;
  save(input: SubmissionFormWrite): Promise<string>;
  saveField(
    input: FieldDefinitionWrite & { eventId?: EventId },
  ): Promise<string>;
  createFromTemplate(templateId: string, eventId: EventId): Promise<string>;
  duplicate(id: string, eventId: EventId): Promise<string>;
  remove(id: string, eventId: EventId): Promise<void>;
  /** Open or close the public call for proposals. Separate from `save`, which never
   *  changes status — see the note on the `setStatus` mutation in convex/forms.ts. */
  setStatus(input: {
    id: string;
    eventId: EventId;
    status: SubmissionFormStatus;
  }): Promise<SubmissionFormStatus>;
}
export interface PublicSubmissionInput {
  eventId: EventId;
  formId: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  answers: Record<string, string>;
}
/** An organizer-created review row. It intentionally has no implied speaker or email. */
export interface AdminSubmissionInput {
  eventId: EventId;
  formId: string;
  title: string;
  description?: string;
  status: Submission["status"];
}
export interface PublicFormParticipantInput {
  role: string;
  answers: Record<string, string>;
  availability?: {
    unavailable: Array<{
      date: number;
      hour?: number;
      part?: "morning" | "afternoon" | "evening";
    }>;
    notes?: string;
  };
}
export interface PublicFormSubmissionInput {
  eventSlug: string;
  formId: string;
  idempotencyKey: string;
  firstName: string;
  lastName: string;
  /** Legacy single-field name, still accepted by the public HTTP API. */
  name?: string;
  email: string;
  title: string;
  answers: Record<string, string>;
  /** The public form's opaque key for the primary abstract body, never a label. */
  abstractFieldKey?: string;
  participants?: PublicFormParticipantInput[];
  /** Single-use Cloudflare Turnstile proof, verified at the edge before Convex is called. */
  turnstileToken: string;
}
/** The resolved speaker is returned only so the portal handoff opens that speaker's record. */
export interface PublicFormSubmissionResult {
  speakerId?: string;
}
export interface SubmissionArchivedAnswer {
  key: string;
  label: string;
  value: string;
}
export interface SubmissionEditView {
  submission: Submission;
  form: {
    title: string;
    sectionTitle: string;
    description?: string;
    fields: FieldDefinition[];
    crossFieldLimits: CrossFieldLimit[];
  };
  answers: Record<string, string>;
  archivedAnswers: SubmissionArchivedAnswer[];
  editability: SubmissionEditability;
}
export interface SubmissionSpeakerUpdate {
  eventId: EventId;
  submissionId: SubmissionId;
  speakerId: SpeakerId;
  title: string;
  answers: Record<string, string>;
  submit: boolean;
}
export interface SubmissionSpeakerUpdateResult {
  status: Submission["status"];
  updatedAt: number;
  lastSpeakerEditAt: number;
  speakerEditCount: number;
}
export interface SubmissionsRepo {
  list(scope: EventScope & { speakerId?: SpeakerId }): Promise<Submission[]>;
  submit(input: PublicSubmissionInput): Promise<Submission>;
  saveDraft(input: PublicSubmissionInput): Promise<Submission>;
  createAdmin(input: AdminSubmissionInput): Promise<Submission>;
  decide(
    submissionId: string,
    status: "accepted" | "declined",
  ): Promise<Submission>;
  setStatus(submissionId: string, status: Submission["status"]): Promise<void>;
  setTags(
    input: EventScope & { submissionId: SubmissionId; tagIds: TagId[] },
  ): Promise<void>;
  getForSpeaker(
    input: EventScope & { submissionId: SubmissionId; speakerId: SpeakerId },
  ): Promise<SubmissionEditView>;
  updateBySpeaker(
    input: SubmissionSpeakerUpdate,
  ): Promise<SubmissionSpeakerUpdateResult>;
}
export interface SpeakerProfileUpdate {
  eventId: EventId;
  speakerId: SpeakerId;
  firstName: string;
  lastName: string;
  bio?: string;
  salutation?: string;
  honorific?: string;
  pronouns?: string;
  gender?: string;
  linkedinUrl?: string;
  xUrl?: string;
  facebookUrl?: string;
  websiteUrl?: string;
}
export interface SpeakerHeadshotScope extends EventScope {
  speakerId: SpeakerId;
}
export interface SpeakerHeadshotUpload extends SpeakerHeadshotScope {
  uploadUrl: string;
}
export interface SpeakerDocumentScope extends SpeakerHeadshotScope {
  submissionId: SubmissionId;
}
export interface SpeakerCreateInput extends EventScope {
  firstName: string;
  lastName: string;
  email: string;
  confirmationStatus?: SpeakerConfirmationStatus;
}
export interface SpeakersRepo {
  list(scope: EventScope): Promise<Speaker[]>;
  create(input: SpeakerCreateInput): Promise<SpeakerId>;
  bulkImport(
    input: EventScope & { rows: SpeakerImportRow[] },
  ): Promise<SpeakerImportResult>;
  setConfirmationStatus(
    input: EventScope & {
      speakerId: SpeakerId;
      status: SpeakerConfirmationStatus;
    },
  ): Promise<void>;
  /**
   * Resolves the signed-in Clerk account to its speaker record for this event, by email.
   * This is the only supported way for the portal to determine "who am I" — never trust a
   * client-supplied speakerId as the source of identity.
   */
  getMine(scope: EventScope): Promise<Speaker | null>;
  updateProfile(input: SpeakerProfileUpdate): Promise<void>;
  requestHeadshotUpload(
    scope: SpeakerHeadshotScope,
  ): Promise<SpeakerHeadshotUpload>;
  saveHeadshot(
    input: SpeakerHeadshotScope & { storageId: string },
  ): Promise<void>;
  getHeadshotUrl(scope: SpeakerHeadshotScope): Promise<string | null>;
  requestDocumentUpload(
    scope: SpeakerDocumentScope,
  ): Promise<{ uploadUrl: string }>;
  saveDocument(
    input: SpeakerDocumentScope & {
      storageId: string;
      fileName: string;
      kind: SpeakerDocumentKind;
    },
  ): Promise<string>;
  listDocuments(scope: SpeakerDocumentScope): Promise<SpeakerDocument[]>;
  removeDocument(
    input: SpeakerDocumentScope & { documentId: string },
  ): Promise<void>;
}
export interface SpeakerNotesRepo {
  list(scope: EventScope & { speakerId: SpeakerId }): Promise<SpeakerNote[]>;
  create(input: EventScope & { speakerId: SpeakerId; body: string }): Promise<string>;
  remove(input: EventScope & { noteId: string }): Promise<void>;
}
// `score` is optional because a scorecard review records per-criterion values instead. Exactly
// one of the two paths is used per call: legacy single score, or `criteriaScores`.
export interface EvaluationWrite {
  id?: string;
  assignmentId?: string;
  eventId: EventId;
  submissionId: string;
  reviewerName: string;
  score?: number;
  comments?: string;
  criteriaScores?: EvaluationCriterionScore[];
}
export interface EvaluationPlanWrite {
  id?: string;
  eventId: EventId;
  name: string;
  rounds: number;
  scoringScaleMax: 5 | 10;
  aiAssistEnabled: boolean;
  anonymized?: boolean;
  criteria?: EvaluationCriterion[];
}
export interface EvaluationAssignmentWrite {
  eventId: EventId;
  evaluationPlanId: string;
  submissionIds: string[];
  reviewerUserIds: string[];
  round: number;
}
export interface EvaluationAssignmentFilterWrite {
  eventId: EventId;
  evaluationPlanId: string;
  filter: AssignmentFilter;
  reviewerUserIds: string[];
  round: number;
}
export interface EvaluationRepo {
  list(scope: EventScope): Promise<Evaluation[]>;
  save(input: EvaluationWrite): Promise<string>;
  listPlans(scope: EventScope): Promise<EvaluationPlan[]>;
  savePlan(input: EvaluationPlanWrite): Promise<string>;
  listAssignments(
    scope: EventScope & { reviewerUserId?: string },
  ): Promise<EvaluationAssignment[]>;
  // The reviewer-only surface: the caller's own assignments, joined server-side. Takes no
  // event scope — a non-organizer reviewer cannot call events.list to learn one.
  myQueue(): Promise<ReviewerQueueRow[]>;
  assign(input: EvaluationAssignmentWrite): Promise<string[]>;
  /** Per-reviewer completion on one plan, derived at read time — nothing is stored. */
  reviewerProgress(
    input: EventScope & { evaluationPlanId: string },
  ): Promise<ReviewerProgressRow[]>;
  /**
   * Organizer-triggered reminders. Pass one reviewer or a threshold — never a recipient list:
   * the server re-reads progress and selects, so a stale tab cannot mail an arbitrary address.
   */
  sendReviewerReminders(
    input: ReviewerReminderSend,
  ): Promise<ReviewerReminderBatch>;
  // Bulk path: the filter resolves to submissions server-side, so no submission id list ever
  // leaves the browser. Same cross-product, same per-(plan, submission, reviewer, round)
  // idempotency as `assign` — it reports what it created versus skipped.
  assignByFilter(
    input: EvaluationAssignmentFilterWrite,
  ): Promise<AssignByFilterResult>;
}
export interface ReviewerReminderSend {
  eventId: EventId;
  evaluationPlanId: string;
  queueUrl: string;
  reviewerUserId?: string;
  thresholdPercent?: number;
}
export interface AgendaWrite {
  id?: string;
  eventId: EventId;
  title: string;
  roomId: string;
  trackId?: string;
  submissionId?: string;
  speakerIds: SpeakerId[];
  startTime: number;
  endTime: number;
  videoUrl?: string;
  locationDetails?: string;
  isPublished: boolean;
}
export interface AgendaRepo {
  list(scope: EventScope): Promise<AgendaItem[]>;
  listForSpeaker(scope: EventScope & { speakerId: SpeakerId }): Promise<SpeakerAgendaItem[]>;
  detectConflicts(scope: EventScope): Promise<AgendaConflict[]>;
  save(input: AgendaWrite): Promise<string>;
  remove(input: EventScope & { id: string }): Promise<void>;
  publishSchedule(eventId: EventId): Promise<void>;
}
export interface TaskCreateInput {
  eventId: EventId;
  title: string;
  targetType: OnboardingTask["targetType"];
  speakerId?: SpeakerId;
  submissionId?: SubmissionId;
  sponsorId?: SponsorId;
  linkedFormId?: FormId;
  dueDate?: number;
}
// speakerId narrows to one speaker's own tasks (portal) — organizer access is required to
// omit it and see the whole event (see convex/tasks.ts).
export interface TasksRepo {
  list(
    scope: EventScope & { speakerId?: SpeakerId },
  ): Promise<OnboardingTask[]>;
  create(input: TaskCreateInput): Promise<string>;
  setStatus(id: string, status: OnboardingTask["status"]): Promise<void>;
}
export interface TaskTemplatesRepo {
  list(scope: EventScope): Promise<TaskTemplate[]>;
  create(
    input: EventScope & {
      name: string;
      description?: string;
      items: TaskTemplateItem[];
    },
  ): Promise<string>;
  update(input: {
    templateId: string;
    name?: string;
    description?: string;
    items?: TaskTemplateItem[];
  }): Promise<void>;
  remove(templateId: string): Promise<void>;
  setDefault(input: EventScope & { templateId?: string }): Promise<void>;
  applyToSubmission(input: {
    templateId: string;
    submissionId: SubmissionId;
  }): Promise<{ created: number; skipped: number }>;
  applyToSponsor(input: {
    templateId: string;
    sponsorId: SponsorId;
  }): Promise<{ created: number; skipped: number }>;
}
export interface CommsRepo {
  list(scope: EventScope): Promise<Comm[]>;
  listDrafts(scope: EventScope): Promise<CommunicationDraft[]>;
  listTemplates(scope: EventScope): Promise<CommTemplate[]>;
  previewDecision(input: { eventId: EventId; submissionId: string }): Promise<CommPreview>;
  previewReminder(input: { eventId: EventId; speakerId: string; taskId?: string }): Promise<CommPreview>;
  previewConsolidatedDecision(input: { eventId: EventId; speakerId: string }): Promise<CommPreview>;
  saveTemplate(input: CommTemplateWrite): Promise<string>;
  sendDecision(input: { eventId: EventId; submissionId: string; recipientSpeakerIds?: string[] }): Promise<CommSendResult>;
  sendReminder(input: { eventId: EventId; speakerId: string; taskId?: string }): Promise<CommSendResult>;
  sendConsolidatedDecision(input: { eventId: EventId; speakerId: string }): Promise<CommSendResult>;
}
// speakerId narrows to one speaker's own availability (portal) — organizer access is
// required to omit it and see the whole event (see convex/availability.ts).
export interface AvailabilityRepo {
  list(scope: EventScope & { speakerId?: SpeakerId }): Promise<Availability[]>;
  upsert(input: Omit<Availability, "id">): Promise<string>;
}
export interface PublicEmbedsRepo {
  list(scope: EventScope): Promise<Embed[]>;
  getAdmin(input: EventScope & { embedId: EmbedId }): Promise<Embed | null>;
  preview(input: Omit<EmbedWrite, "id">): Promise<PublicEmbedView | null>;
  save(input: EmbedWrite): Promise<EmbedId>;
  duplicate(input: EventScope & { embedId: EmbedId }): Promise<EmbedId>;
  remove(input: EventScope & { embedId: EmbedId }): Promise<void>;
  getPublic(embedId: string): Promise<PublicEmbedView | null>;
  /** Legacy slug feed; retained to keep `/e/:eventSlug/:feed` links working. */
  getLegacy(eventSlug: string): Promise<PublicEmbed | null>;
}
export interface PublicFormsRepo {
  listOpen(eventSlug: string): Promise<PublicSubmissionFormSummary[]>;
  get(
    eventSlug: string,
    formId: string,
  ): Promise<PublicSubmissionFormConfig | null>;
  submit(input: PublicFormSubmissionInput): Promise<PublicFormSubmissionResult>;
}
export interface PortalFormView {
  id: string;
  title: string;
  sectionTitle: string;
  description?: string;
  fields: FieldDefinition[];
  answers: Record<string, string>;
}
export interface PortalFormsRepo {
  get(input: {
    eventId: EventId;
    formId: string;
    speakerId: SpeakerId;
  }): Promise<PortalFormView>;
  submit(input: {
    eventId: EventId;
    formId: string;
    speakerId: SpeakerId;
    taskId?: string;
    answers: Record<string, string>;
  }): Promise<string>;
}
export interface PortalResourcesRepo {
  listAdmin(scope: EventScope): Promise<PortalResourcePage[]>;
  listPublished(input: EventScope & { speakerId: SpeakerId }): Promise<PortalResourcePage[]>;
  save(input: EventScope & { id?: string; title: string; bodyHtml: string; status: PortalResourcePage["status"] }): Promise<string>;
  reorder(input: EventScope & { ids: string[] }): Promise<void>;
  remove(input: EventScope & { id: string }): Promise<void>;
}
/**
 * Organizer role lives on a database row, never in an env var or hardcoded list, and every row
 * is scoped to one organization — see OrganizationsRepo. Holding a row grants access to that
 * organization's events and nothing else. Only an existing owner of that organization can
 * `add`/`remove`.
 */
export interface OrganizersRepo {
  list(organizationId: string): Promise<Organizer[]>;
  getMine(): Promise<Organizer | null>;
  isCurrentUserOrganizer(): Promise<boolean>;
  hasAdminAccess(): Promise<boolean>;
  completeOnboarding(): Promise<void>;
  add(input: {
    organizationId: string;
    userId?: string;
    email: string;
    role: "owner" | "admin";
  }): Promise<string>;
  remove(input: { organizationId: string; userId: string }): Promise<void>;
}
/**
 * The tenant boundary. Every signup gets their own organization via `createForCurrentUser`
 * (idempotent per user) and never joins an existing one uninvited.
 */
export interface OrganizationsRepo {
  createForCurrentUser(input?: { name?: string }): Promise<string>;
  listMine(): Promise<Organization[]>;
  getMine(): Promise<Organization | null>;
  rename(input: { organizationId: string; name: string }): Promise<void>;
}
/**
 * Onboarding-captured personalization (name, solo/team, referral source) for ANY signed-in
 * user — deliberately separate from OrganizersRepo, whose `organizers` table only ever has a
 * row for the bootstrap owner or someone an owner explicitly added. See schema.ts's
 * `userProfiles` comment.
 */
export interface ProfilesRepo {
  getMine(): Promise<UserProfile | null>;
  save(input: { displayName?: string; signupRole?: "solo" | "team"; referralSource?: string }): Promise<void>;
}
/**
 * Per-event email provider configuration. Every method is organizer-gated server-side and
 * credentials only ever travel inbound — `status` returns a masked hint, never a secret.
 * `save` performs a live test send before it stores anything.
 */
export interface EmailIntegrationsRepo {
  status(scope: EventScope): Promise<EmailIntegration | null>;
  save(
    input: EmailIntegrationSaveInput,
  ): Promise<{ status: "connected"; testRecipient: string }>;
  test(scope: EventScope): Promise<{ status: "sent"; testRecipient: string }>;
  disconnect(scope: EventScope): Promise<{ status: "disconnected" }>;
}
export interface ContentIntegrationsRepo {
  status(scope: EventScope & { provider: ContentIntegrationProvider }): Promise<ContentIntegration | null>;
  connectNotion(input: NotionConnectInput): Promise<{ status: "connected" }>;
  importNotion(scope: EventScope): Promise<NotionImportResult>;
  connectAirtable(input: AirtableConnectInput): Promise<{ status: "connected" }>;
  startOAuth(input: import("./types").OAuthStartInput): Promise<{ url: string }>;
  listNotionOAuthDatabases(input: { eventId: EventId; pendingId: string }): Promise<Array<{ id: string; title: string }>>;
  finishNotionOAuth(input: { eventId: EventId; pendingId: string; databaseId: string }): Promise<{ status: "connected" }>;
  listAirtableOAuthBases(input: { eventId: EventId; pendingId: string }): Promise<Array<{ id: string; name: string }>>;
  listAirtableOAuthTables(input: { eventId: EventId; pendingId: string; baseId: string }): Promise<Array<{ id: string; name: string }>>;
  finishAirtableOAuth(input: { eventId: EventId; pendingId: string; baseId: string; tableName: string }): Promise<{ status: "connected" }>;
  importAirtable(scope: EventScope): Promise<AirtableImportResult>;
  connectSanity(input: SanityConnectInput): Promise<{ status: "connected" }>;
  publishSanity(scope: EventScope): Promise<SanityPublishResult>;
  disconnect(scope: EventScope & { provider: ContentIntegrationProvider }): Promise<{ status: "disconnected" }>;
}
export interface ApiKeysRepo {
  list(scope: EventScope): Promise<ApiKey[]>;
  generate(input: EventScope & { label: string; scopes?: ApiScope[] }): Promise<GeneratedApiKey>;
  revoke(input: EventScope & { id: string }): Promise<void>;
  auditLog(scope: EventScope): Promise<ApiAuditLogEntry[]>;
}
export interface ActivityRepo {
  list(scope: EventScope): Promise<ActivityEntry[]>;
}
export interface AgentRunsRepo {
  canUse(scope: EventScope): Promise<boolean>;
  suggestions(scope: EventScope): Promise<import("./types").AgentSuggestion[]>;
  list(scope: EventScope & { limit?: number }): Promise<AgentRun[]>;
  get(scope: EventScope & { runId: AgentRunId }): Promise<AgentRunDetail | null>;
  create(input: EventScope & { objective: string; idempotencyKey: string }): Promise<{ runId: AgentRunId }>;
  respond(input: EventScope & { runId: AgentRunId; message: string; idempotencyKey: string }): Promise<void>;
  retry(input: EventScope & { runId: AgentRunId }): Promise<void>;
  cancel(input: EventScope & { runId: AgentRunId }): Promise<void>;
  approveTaskProposal(input: EventScope & { proposalId: AgentProposalId; expectedPayloadHash: string }): Promise<{ createdTaskIds: string[] }>;
  approveMessageProposal(input: EventScope & { proposalId: AgentProposalId; expectedPayloadHash: string }): Promise<{ createdDraftIds: string[] }>;
  rejectProposal(input: EventScope & { proposalId: AgentProposalId; reason?: string }): Promise<void>;
}
export interface AgentProviderSettingsRepo {
  status(scope: EventScope): Promise<AgentProviderSetting>;
  saveManaged(scope: EventScope): Promise<{ mode: "managed"; status: "ready" }>;
  saveByok(input: EventScope & { apiKey: string }): Promise<{ mode: "bring_your_own"; status: "ready" }>;
  disconnectByok(scope: EventScope): Promise<{ mode: "managed"; status: "ready" }>;
  assignBillingOwner(scope: EventScope): Promise<{ billingOwnerAssigned: true }>;
}
export interface Repository {
  activity: ActivityRepo;
  analytics: AnalyticsRepo;
  agentProviderSettings: AgentProviderSettingsRepo;
  agentRuns: AgentRunsRepo;
  apiKeys: ApiKeysRepo;
  emailIntegrations: EmailIntegrationsRepo;
  contentIntegrations: ContentIntegrationsRepo;
  events: EventsRepo;
  files: FilesRepo;
  eventMembers: EventMembersRepo;
  tags: TagsRepo;
  sponsors: SponsorsRepo;
  sponsorTiers: SponsorTiersRepo;
  sponsorContacts: SponsorContactsRepo;
  forms: FormsRepo;
  submissions: SubmissionsRepo;
  speakers: SpeakersRepo;
  speakerNotes: SpeakerNotesRepo;
  evaluations: EvaluationRepo;
  agenda: AgendaRepo;
  tasks: TasksRepo;
  taskTemplates: TaskTemplatesRepo;
  comms: CommsRepo;
  availability: AvailabilityRepo;
  publicEmbeds: PublicEmbedsRepo;
  publicForms: PublicFormsRepo;
  portalForms: PortalFormsRepo;
  portalResources: PortalResourcesRepo;
  organizers: OrganizersRepo;
  organizations: OrganizationsRepo;
  profiles: ProfilesRepo;
}

export const RepoContext = createContext<Repository | null>(null);
export function useRepo(): Repository {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error("Repository provider is missing");
  return repo;
}
// For cross-cutting chrome (e.g. AccountMenu) that renders in contexts/tests which don't
// always wrap a RepoProvider — degrades gracefully instead of throwing.
export function useOptionalRepo(): Repository | null {
  return useContext(RepoContext);
}
