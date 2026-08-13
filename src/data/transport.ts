import type { Repository } from "./repo";
import type {
  ApiKey,
  GeneratedApiKey,
  AssignByFilterResult,
  AgendaConflict,
  AgendaItem,
  Availability,
  Comm,
  CommPreview,
  CommSendResult,
  CommTemplate,
  EmailIntegration,
  Evaluation,
  EvaluationAssignment,
  EvaluationPlan,
  Event,
  EventMember,
  FieldDefinition,
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
  SpeakerDocument,
  SpeakerImportResult,
  Sponsor,
  SponsorContact,
  SponsorDetail,
  SponsorTier,
  Submission,
  SubmissionForm,
  Tag,
  TaskTemplate,
  Track,
} from "./types";
import type {
  PortalFormView,
  PublicFormSubmissionResult,
  SubmissionEditView,
  SubmissionSpeakerUpdateResult,
} from "./repo";

export const readOperations = [
  "events.list",
  "events.listMine",
  "events.listForPortal",
  "events.get",
  "events.getBySlug",
  "events.rooms.list",
  "events.tracks.list",
  "eventMembers.list",
  "tags.list",
  "forms.list",
  "forms.fields",
  "forms.listFields",
  "submissions.list",
  "submissions.getForSpeaker",
  "speakers.list",
  "speakers.getMine",
  "speakers.headshotUrl",
  "speakers.documents.list",
  "evaluations.list",
  "evaluations.plans.list",
  "evaluations.assignments.list",
  "evaluations.myQueue",
  "agenda.list",
  "agenda.listForSpeaker",
  "agenda.detectConflicts",
  "tasks.list",
  "taskTemplates.list",
  "comms.list",
  "comms.templates.list",
  "availability.list",
  "publicEmbeds.get",
  "publicForms.listOpen",
  "publicForms.get",
  "portalForms.get",
  "organizers.list",
  "organizers.getMine",
  "organizers.isCurrentUserOrganizer",
  "organizers.canClaimOwner",
  "organizers.hasAdminAccess",
  "emailIntegrations.status",
  "evaluations.reviewerProgress",
  "comms.previewDecision",
  "comms.previewReminder",
  "comms.previewConsolidatedDecision",
  "apiKeys.list",
  "sponsors.list",
  "sponsors.get",
  "sponsorTiers.list",
  "sponsorContacts.listBySponsor",
] as const;

export type ReadOperation = (typeof readOperations)[number];
export type WriteOperation =
  | "events.save"
  | "events.duplicate"
  | "events.rooms.save"
  | "events.rooms.remove"
  | "events.tracks.save"
  | "events.tracks.remove"
  | "eventMembers.add"
  | "eventMembers.remove"
  | "tags.create"
  | "tags.rename"
  | "tags.remove"
  | "forms.save"
  | "forms.saveField"
  | "forms.createFromTemplate"
  | "forms.duplicate"
  | "forms.remove"
  | "submissions.submit"
  | "submissions.saveDraft"
  | "submissions.createAdmin"
  | "submissions.decide"
  | "submissions.setStatus"
  | "submissions.setTags"
  | "submissions.updateBySpeaker"
  | "speakers.create"
  | "speakers.setConfirmationStatus"
  | "speakers.updateProfile"
  | "speakers.requestHeadshotUpload"
  | "speakers.saveHeadshot"
  | "speakers.documents.requestUpload"
  | "speakers.documents.save"
  | "speakers.documents.remove"
  | "evaluations.save"
  | "evaluations.plans.save"
  | "evaluations.assignments.assign"
  | "evaluations.assignments.assignByFilter"
  | "agenda.save"
  | "agenda.publishSchedule"
  | "tasks.create"
  | "tasks.setStatus"
  | "availability.upsert"
  | "publicForms.submit"
  | "portalForms.submit"
  | "organizers.claimOwner"
  | "organizers.completeOnboarding"
  | "organizers.add"
  | "organizers.remove"
  | "speakers.bulkImport"
  | "emailIntegrations.save"
  | "emailIntegrations.test"
  | "emailIntegrations.disconnect"
  | "evaluations.sendReviewerReminders"
  | "taskTemplates.create"
  | "taskTemplates.update"
  | "taskTemplates.remove"
  | "taskTemplates.setDefault"
  | "taskTemplates.applyToSubmission"
  | "taskTemplates.applyToSponsor"
  | "comms.templates.save"
  | "comms.sendDecision"
  | "comms.sendReminder"
  | "comms.sendConsolidatedDecision"
  | "apiKeys.generate"
  | "apiKeys.revoke"
  | "sponsors.create"
  | "sponsors.update"
  | "sponsors.remove"
  | "sponsorTiers.create"
  | "sponsorTiers.update"
  | "sponsorTiers.reorder"
  | "sponsorTiers.remove"
  | "sponsorContacts.create"
  | "sponsorContacts.update"
  | "sponsorContacts.remove";
export type DataOperation = ReadOperation | WriteOperation;

export interface DataTransport {
  read<Result>(operation: ReadOperation, input: object): Promise<Result>;
  write<Result>(operation: WriteOperation, input: object): Promise<Result>;
}

export interface ReadState<Result> {
  data: Result | undefined;
  isLoading: boolean;
  error: Error | undefined;
}

export interface ReactiveTransport {
  useRead<Result>(
    operation: ReadOperation,
    input: object | "skip",
  ): ReadState<Result>;
}

// This is the sole translation point between domain operations and a backend.
// Feature code imports Repository, never a transport, Convex, or Airtable.
export function createRepository(transport: DataTransport): Repository {
  return {
    apiKeys: {
      list: () => transport.read<ApiKey[]>("apiKeys.list", {}),
      generate: (label) =>
        transport.write<GeneratedApiKey>("apiKeys.generate", { label }),
      revoke: (id) => transport.write<void>("apiKeys.revoke", { id }),
    },
    emailIntegrations: {
      status: ({ eventId }) =>
        transport.read<EmailIntegration | null>("emailIntegrations.status", {
          eventId,
        }),
      save: (input) => transport.write("emailIntegrations.save", input),
      test: ({ eventId }) =>
        transport.write("emailIntegrations.test", { eventId }),
      disconnect: ({ eventId }) =>
        transport.write("emailIntegrations.disconnect", { eventId }),
    },
    events: {
      list: () => transport.read<Event[]>("events.list", {}),
      listMine: () => transport.read<Event[]>("events.listMine", {}),
      listForPortal: () => transport.read<Event[]>("events.listForPortal", {}),
      get: (eventId) => transport.read<Event | null>("events.get", { eventId }),
      getBySlug: (slug) =>
        transport.read<Event | null>("events.getBySlug", { slug }),
      save: (event) => transport.write("events.save", event),
      duplicate: (input) => transport.write("events.duplicate", input),
      listRooms: ({ eventId }) =>
        transport.read<Room[]>("events.rooms.list", { eventId }),
      saveRoom: (room) => transport.write("events.rooms.save", room),
      removeRoom: (input) => transport.write("events.rooms.remove", input),
      listTracks: ({ eventId }) =>
        transport.read<Track[]>("events.tracks.list", { eventId }),
      saveTrack: (track) => transport.write("events.tracks.save", track),
      removeTrack: (input) => transport.write("events.tracks.remove", input),
    },
    eventMembers: {
      list: ({ eventId }) =>
        transport.read<EventMember[]>("eventMembers.list", { eventId }),
      add: (input) => transport.write<string>("eventMembers.add", input),
      remove: (input) => transport.write<void>("eventMembers.remove", input),
    },
    tags: {
      list: ({ eventId }) => transport.read<Tag[]>("tags.list", { eventId }),
      create: (input) => transport.write("tags.create", input),
      rename: (input) => transport.write<void>("tags.rename", input),
      remove: (input) => transport.write<void>("tags.remove", input),
    },
    sponsors: {
      list: ({ eventId }) =>
        transport.read<Sponsor[]>("sponsors.list", { eventId }),
      get: (sponsorId) =>
        transport.read<SponsorDetail | null>("sponsors.get", { sponsorId }),
      create: (input) => transport.write("sponsors.create", input),
      update: (input) => transport.write<void>("sponsors.update", input),
      remove: (sponsorId) =>
        transport.write<void>("sponsors.remove", { sponsorId }),
    },
    sponsorTiers: {
      list: ({ eventId }) =>
        transport.read<SponsorTier[]>("sponsorTiers.list", { eventId }),
      create: (input) => transport.write("sponsorTiers.create", input),
      update: (input) => transport.write<void>("sponsorTiers.update", input),
      reorder: (input) => transport.write<void>("sponsorTiers.reorder", input),
      remove: (tierId) =>
        transport.write<void>("sponsorTiers.remove", { tierId }),
    },
    sponsorContacts: {
      listBySponsor: (sponsorId) =>
        transport.read<SponsorContact[]>("sponsorContacts.listBySponsor", {
          sponsorId,
        }),
      create: (input) =>
        transport.write<string>("sponsorContacts.create", input),
      update: (input) => transport.write<void>("sponsorContacts.update", input),
      remove: (contactId) =>
        transport.write<void>("sponsorContacts.remove", { contactId }),
    },
    forms: {
      list: ({ eventId }) =>
        transport.read<SubmissionForm[]>("forms.list", { eventId }),
      fields: (formId) =>
        transport.read<FieldDefinition[]>("forms.fields", { formId }),
      listFields: (scope) =>
        transport.read<FieldDefinition[]>("forms.listFields", scope ?? {}),
      save: (input) => {
        const { id, ...form } = input;
        return transport.write<string>("forms.save", { id, form });
      },
      saveField: (input) => {
        const { id, eventId, ...field } = input;
        return transport.write<string>("forms.saveField", { id, ...(eventId ? { eventId } : {}), field });
      },
      createFromTemplate: (templateId, eventId) =>
        transport.write<string>("forms.createFromTemplate", {
          templateId,
          eventId,
        }),
      duplicate: (id, eventId) =>
        transport.write<string>("forms.duplicate", { id, eventId }),
      remove: (id, eventId) =>
        transport.write<void>("forms.remove", { id, eventId }),
    },
    submissions: {
      list: ({ eventId, speakerId }) =>
        transport.read<Submission[]>(
          "submissions.list",
          speakerId ? { eventId, speakerId } : { eventId },
        ),
      submit: (input) =>
        transport.write<Submission>("submissions.submit", { input }),
      saveDraft: (input) =>
        transport.write<Submission>("submissions.saveDraft", { input }),
      createAdmin: (input) =>
        transport.write<Submission>("submissions.createAdmin", { input }),
      decide: (submissionId, status) =>
        transport.write<Submission>("submissions.decide", {
          submissionId,
          status,
        }),
      setStatus: (submissionId, status) =>
        transport.write<void>("submissions.setStatus", {
          submissionId,
          status,
        }),
      setTags: (input) => transport.write<void>("submissions.setTags", input),
      getForSpeaker: (input) =>
        transport.read<SubmissionEditView>("submissions.getForSpeaker", input),
      updateBySpeaker: (input) =>
        transport.write<SubmissionSpeakerUpdateResult>(
          "submissions.updateBySpeaker",
          input,
        ),
    },
    speakers: {
      list: ({ eventId }) =>
        transport.read<Speaker[]>("speakers.list", { eventId }),
      create: (input) =>
        transport.write<string>("speakers.create", input) as Promise<
          Speaker["id"]
        >,
      bulkImport: (input) =>
        transport.write<SpeakerImportResult>("speakers.bulkImport", input),
      setConfirmationStatus: (input) =>
        transport.write<void>("speakers.setConfirmationStatus", input),
      getMine: ({ eventId }) =>
        transport.read<Speaker | null>("speakers.getMine", { eventId }),
      updateProfile: (input) =>
        transport.write<void>("speakers.updateProfile", input),
      requestHeadshotUpload: (scope) =>
        transport.write("speakers.requestHeadshotUpload", scope),
      saveHeadshot: (input) =>
        transport.write<void>("speakers.saveHeadshot", input),
      getHeadshotUrl: (scope) =>
        transport.read<string | null>("speakers.headshotUrl", scope),
      requestDocumentUpload: (scope) =>
        transport.write("speakers.documents.requestUpload", scope),
      saveDocument: (input) =>
        transport.write<string>("speakers.documents.save", input),
      listDocuments: (scope) =>
        transport.read<SpeakerDocument[]>("speakers.documents.list", scope),
      removeDocument: (input) =>
        transport.write<void>("speakers.documents.remove", input),
    },
    evaluations: {
      list: ({ eventId }) =>
        transport.read<Evaluation[]>("evaluations.list", { eventId }),
      save: (input) => transport.write<string>("evaluations.save", input),
      listPlans: ({ eventId }) =>
        transport.read<EvaluationPlan[]>("evaluations.plans.list", { eventId }),
      savePlan: (input) =>
        transport.write<string>("evaluations.plans.save", input),
      listAssignments: ({ eventId, reviewerUserId }) =>
        transport.read<EvaluationAssignment[]>("evaluations.assignments.list", {
          eventId,
          reviewerUserId,
        }),
      assign: (input) =>
        transport.write<string[]>("evaluations.assignments.assign", input),
      assignByFilter: (input) =>
        transport.write<AssignByFilterResult>(
          "evaluations.assignments.assignByFilter",
          input,
        ),
      myQueue: () =>
        transport.read<ReviewerQueueRow[]>("evaluations.myQueue", {}),
      reviewerProgress: ({ eventId, evaluationPlanId }) =>
        transport.read<ReviewerProgressRow[]>("evaluations.reviewerProgress", {
          eventId,
          evaluationPlanId,
        }),
      sendReviewerReminders: (input) =>
        transport.write<ReviewerReminderBatch>(
          "evaluations.sendReviewerReminders",
          input,
        ),
    },
    agenda: {
      list: ({ eventId }) =>
        transport.read<AgendaItem[]>("agenda.list", { eventId }),
      listForSpeaker: ({ eventId, speakerId }) =>
        transport.read<SpeakerAgendaItem[]>("agenda.listForSpeaker", { eventId, speakerId }),
      detectConflicts: ({ eventId }) =>
        transport.read<AgendaConflict[]>("agenda.detectConflicts", { eventId }),
      save: (input) => transport.write<string>("agenda.save", input),
      publishSchedule: (eventId) =>
        transport.write<void>("agenda.publishSchedule", { eventId }),
    },
    tasks: {
      list: ({ eventId, speakerId }) =>
        transport.read<OnboardingTask[]>("tasks.list", { eventId, speakerId }),
      create: (input) => transport.write<string>("tasks.create", input),
      setStatus: (id, status) =>
        transport.write<void>("tasks.setStatus", { id, status }),
    },
    taskTemplates: {
      list: ({ eventId }) =>
        transport.read<TaskTemplate[]>("taskTemplates.list", { eventId }),
      create: (input) => transport.write<string>("taskTemplates.create", input),
      update: (input) => transport.write<void>("taskTemplates.update", input),
      remove: (templateId) =>
        transport.write<void>("taskTemplates.remove", { templateId }),
      setDefault: (input) =>
        transport.write<void>("taskTemplates.setDefault", input),
      applyToSubmission: (input) =>
        transport.write<{ created: number; skipped: number }>(
          "taskTemplates.applyToSubmission",
          input,
        ),
      applyToSponsor: (input) =>
        transport.write<{ created: number; skipped: number }>(
          "taskTemplates.applyToSponsor",
          input,
        ),
    },
    comms: {
      list: ({ eventId }) => transport.read<Comm[]>("comms.list", { eventId }),
      listTemplates: ({ eventId }) =>
        transport.read<CommTemplate[]>("comms.templates.list", { eventId }),
      previewDecision: (input) =>
        transport.read<CommPreview>("comms.previewDecision", input),
      previewReminder: (input) =>
        transport.read<CommPreview>("comms.previewReminder", input),
      previewConsolidatedDecision: (input) =>
        transport.read<CommPreview>("comms.previewConsolidatedDecision", input),
      saveTemplate: (input) =>
        transport.write<string>("comms.templates.save", input),
      sendDecision: (input) =>
        transport.write<CommSendResult>("comms.sendDecision", input),
      sendReminder: (input) =>
        transport.write<CommSendResult>("comms.sendReminder", input),
      sendConsolidatedDecision: (input) =>
        transport.write<CommSendResult>("comms.sendConsolidatedDecision", input),
    },
    availability: {
      list: ({ eventId, speakerId }) =>
        transport.read<Availability[]>("availability.list", {
          eventId,
          speakerId,
        }),
      upsert: (input) => transport.write<string>("availability.upsert", input),
    },
    publicEmbeds: {
      get: (eventSlug) =>
        transport.read<PublicEmbed | null>("publicEmbeds.get", { eventSlug }),
    },
    publicForms: {
      listOpen: (eventSlug) =>
        transport.read<PublicSubmissionFormSummary[]>("publicForms.listOpen", {
          eventSlug,
        }),
      get: (eventSlug, formId) =>
        transport.read<PublicSubmissionFormConfig | null>("publicForms.get", {
          eventSlug,
          formId,
        }),
      submit: (input) =>
        transport.write<PublicFormSubmissionResult>("publicForms.submit", {
          input,
        }),
    },
    portalForms: {
      get: (input) => transport.read<PortalFormView>("portalForms.get", input),
      submit: (input) => transport.write<string>("portalForms.submit", input),
    },
    organizers: {
      list: () => transport.read<Organizer[]>("organizers.list", {}),
      getMine: () => transport.read<Organizer | null>("organizers.getMine", {}),
      isCurrentUserOrganizer: () =>
        transport.read<boolean>("organizers.isCurrentUserOrganizer", {}),
      canClaimOwner: () =>
        transport.read<boolean>("organizers.canClaimOwner", {}),
      hasAdminAccess: () =>
        transport.read<boolean>("organizers.hasAdminAccess", {}),
      claimOwner: () => transport.write<string>("organizers.claimOwner", {}),
      completeOnboarding: () =>
        transport.write<void>("organizers.completeOnboarding", {}),
      add: (input) => transport.write<string>("organizers.add", input),
      remove: (userId) =>
        transport.write<void>("organizers.remove", { userId }),
    },
  };
}
