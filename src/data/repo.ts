import { createContext, useContext } from "react";
import type {
  ApiKey,
  GeneratedApiKey,
  AssignByFilterResult,
  AssignmentFilter,
  AgendaConflict,
  AgendaItem,
  Availability,
  Comm,
  CommPreview,
  CommSendResult,
  CommTemplate,
  CommTemplateWrite,
  CrossFieldLimit,
  EmailIntegration,
  EmailIntegrationSaveInput,
  Evaluation,
  EvaluationAssignment,
  EvaluationCriterion,
  EvaluationCriterionScore,
  EvaluationPlan,
  Event,
  EventId,
  EventMember,
  FieldDefinition,
  FieldDefinitionWrite,
  FormId,
  OnboardingTask,
  Organizer,
  PublicEmbed,
  PublicSubmissionFormConfig,
  PublicSubmissionFormSummary,
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
  SubmissionFormWrite,
  SubmissionId,
  Tag,
  TagId,
  TaskTemplate,
  TaskTemplateItem,
  Track,
} from "./types";

export interface EventScope {
  eventId: EventId;
}
export interface EventsRepo {
  list(): Promise<Event[]>;
  listMine(): Promise<Event[]>;
  listForPortal(): Promise<Event[]>;
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
  listRooms(scope: EventScope): Promise<Room[]>;
  saveRoom(room: Omit<Room, "id"> & { id?: string }): Promise<string>;
  removeRoom(input: EventScope & { id: string }): Promise<void>;
  listTracks(scope: EventScope): Promise<Track[]>;
  saveTrack(track: Omit<Track, "id"> & { id?: string }): Promise<string>;
  removeTrack(input: EventScope & { id: string }): Promise<void>;
}
export interface EventMembersRepo {
  list(scope: EventScope): Promise<EventMember[]>;
  add(
    input: EventScope & {
      email: string;
      role: EventMember["role"];
      userId?: string;
    },
  ): Promise<string>;
  remove(input: EventScope & { userId: string }): Promise<void>;
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
  name: string;
  email: string;
  title: string;
  answers: Record<string, string>;
  /** The public form's opaque key for the primary abstract body, never a label. */
  abstractFieldKey?: string;
  participants?: PublicFormParticipantInput[];
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
  get(eventSlug: string): Promise<PublicEmbed | null>;
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
/**
 * Organizer role lives on a database row, never in an env var or hardcoded list.
 * `claimOwner` only succeeds while no organizer exists yet — a one-time bootstrap for the
 * very first signed-in account. After that, only an existing owner can `add`/`remove`.
 */
export interface OrganizersRepo {
  list(): Promise<Organizer[]>;
  getMine(): Promise<Organizer | null>;
  isCurrentUserOrganizer(): Promise<boolean>;
  canClaimOwner(): Promise<boolean>;
  hasAdminAccess(): Promise<boolean>;
  claimOwner(): Promise<string>;
  completeOnboarding(): Promise<void>;
  add(input: {
    userId?: string;
    email: string;
    role: "owner" | "admin";
  }): Promise<string>;
  remove(userId: string): Promise<void>;
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
export interface ApiKeysRepo {
  list(): Promise<ApiKey[]>;
  generate(label: string): Promise<GeneratedApiKey>;
  revoke(id: string): Promise<void>;
}
export interface Repository {
  apiKeys: ApiKeysRepo;
  emailIntegrations: EmailIntegrationsRepo;
  events: EventsRepo;
  eventMembers: EventMembersRepo;
  tags: TagsRepo;
  sponsors: SponsorsRepo;
  sponsorTiers: SponsorTiersRepo;
  sponsorContacts: SponsorContactsRepo;
  forms: FormsRepo;
  submissions: SubmissionsRepo;
  speakers: SpeakersRepo;
  evaluations: EvaluationRepo;
  agenda: AgendaRepo;
  tasks: TasksRepo;
  taskTemplates: TaskTemplatesRepo;
  comms: CommsRepo;
  availability: AvailabilityRepo;
  publicEmbeds: PublicEmbedsRepo;
  publicForms: PublicFormsRepo;
  portalForms: PortalFormsRepo;
  organizers: OrganizersRepo;
}

export const RepoContext = createContext<Repository | null>(null);
export function useRepo(): Repository {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error("Repository provider is missing");
  return repo;
}
