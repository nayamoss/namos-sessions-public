import type { Repository } from "./repo";
import type {
  ActivityEntry,
  ApiKey,
  ApiAuditLogEntry,
  GeneratedApiKey,
  AssignByFilterResult,
  AgendaConflict,
  AgendaItem,
  AgentRun,
  AgentRunDetail,
  AgentProviderSetting,
  Availability,
  Comm,
  CommPreview,
  CommSendResult,
  CommTemplate,
  AirtableConnectInput,
  AirtableImportResult,
  ContentIntegration,
  NotionConnectInput,
  NotionImportResult,
  SanityConnectInput,
  SanityPublishResult,
  EmailIntegration,
  Evaluation,
  EvaluationAssignment,
  EvaluationPlan,
  EventAnalyticsSummary,
  Event,
  EventInviteResult,
  EventMember,
  FieldDefinition,
  OnboardingTask,
  Organizer,
  Organization,
  UserProfile,
  PublicEmbed,
  Embed,
  EmbedId,
  EmbedWrite,
  PublicEmbedView,
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
  SpeakerNote,
  Sponsor,
  SponsorContact,
  SponsorDetail,
  SponsorTier,
  Submission,
  SubmissionForm,
  SubmissionFormStatus,
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
import { analyticsErrorCategory, track, type AnalyticsEventProperties } from "@/lib/analytics";

export const readOperations = [
  "analytics.summary",
  "events.list",
  "events.listMine",
  "events.listForPortal",
  "events.get",
  "events.getBySlug",
  "events.rooms.list",
  "events.tracks.list",
  "eventMembers.list",
  "eventMembers.canManage",
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
  "speakerNotes.list",
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
  "notifications.unreadCount",
  "availability.list",
  "publicEmbeds.get",
  "publicEmbeds.list",
  "publicEmbeds.getAdmin",
  "publicEmbeds.preview",
  "publicEmbeds.getPublic",
  "publicForms.listOpen",
  "publicForms.get",
  "portalForms.get",
  "organizers.list",
  "organizers.getMine",
  "organizers.isCurrentUserOrganizer",
  "organizations.listMine",
  "organizations.getMine",
  "organizers.hasAdminAccess",
  "profiles.getMine",
  "emailIntegrations.status",
  "contentIntegrations.status",
  "evaluations.reviewerProgress",
  "comms.previewDecision",
  "comms.previewReminder",
  "comms.previewConsolidatedDecision",
  "apiKeys.list",
  "apiKeys.auditLog",
  "activity.list",
  "sponsors.list",
  "sponsors.get",
  "sponsorTiers.list",
  "sponsorContacts.listBySponsor",
  "agentRuns.canUse",
  "agentRuns.list",
  "agentRuns.get",
  "agentProviderSettings.status",
] as const;

export type ReadOperation = (typeof readOperations)[number];
export type WriteOperation =
  | "events.save"
  | "events.duplicate"
  | "events.remove"
  | "events.rooms.save"
  | "events.rooms.remove"
  | "events.tracks.save"
  | "events.tracks.remove"
  | "eventMembers.add"
  | "eventMembers.invite"
  | "eventMembers.resend"
  | "eventMembers.claimPending"
  | "eventMembers.remove"
  | "tags.create"
  | "tags.rename"
  | "tags.remove"
  | "forms.save"
  | "forms.saveField"
  | "forms.createFromTemplate"
  | "forms.duplicate"
  | "forms.remove"
  | "forms.setStatus"
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
  | "speakerNotes.create"
  | "speakerNotes.remove"
  | "evaluations.save"
  | "evaluations.plans.save"
  | "evaluations.assignments.assign"
  | "evaluations.assignments.assignByFilter"
  | "agenda.save"
  | "agenda.remove"
  | "agenda.publishSchedule"
  | "tasks.create"
  | "tasks.setStatus"
  | "availability.upsert"
  | "publicForms.submit"
  | "publicEmbeds.save"
  | "publicEmbeds.duplicate"
  | "publicEmbeds.remove"
  | "portalForms.submit"
  | "organizations.createForCurrentUser"
  | "organizations.rename"
  | "organizers.completeOnboarding"
  | "profiles.save"
  | "organizers.add"
  | "organizers.remove"
  | "speakers.bulkImport"
  | "emailIntegrations.save"
  | "emailIntegrations.test"
  | "emailIntegrations.disconnect"
  | "contentIntegrations.connectNotion"
  | "contentIntegrations.importNotion"
  | "contentIntegrations.connectAirtable"
  | "contentIntegrations.importAirtable"
  | "contentIntegrations.connectSanity"
  | "contentIntegrations.publishSanity"
  | "contentIntegrations.disconnect"
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
  | "sponsorContacts.remove"
  | "agentRuns.create"
  | "agentRuns.respond"
  | "agentRuns.retry"
  | "agentRuns.cancel"
  | "agentRuns.approveTaskProposal"
  | "agentRuns.rejectProposal"
  | "agentProviderSettings.saveManaged"
  | "agentProviderSettings.saveByok"
  | "agentProviderSettings.disconnectByok"
  | "agentProviderSettings.assignBillingOwner";
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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizedSubmissionStatus(value: unknown) {
  if (value === "accept_queue" || value === "maybe" || value === "decline_queue") return "in_review" as const;
  return value === "draft" || value === "pending" || value === "accepted" || value === "declined" || value === "withdrawn" ? value : "pending";
}

function trackWriteSuccess(operation: WriteOperation, inputValue: object, resultValue: unknown) {
  const input = object(inputValue);
  const result = object(resultValue);
  switch (operation) {
    case "events.save": track(input.id ? "event_updated" : "event_created", { event_status: input.status as "draft" | "published" | "archived" | undefined }); break;
    case "events.duplicate": track("event_created", { event_status: "draft" }); break;
    case "forms.save": track("form_saved", { mode: input.id ? "updated" : "created", form_kind: input.kind as never }); break;
    case "forms.setStatus": track("form_status_updated", { form_status: input.status as never }); break;
    case "forms.duplicate": case "forms.createFromTemplate": track("form_duplicated", {}); break;
    case "forms.remove": track("record_removed", { record_type: "form" }); break;
    case "submissions.createAdmin": {
      const status = normalizedSubmissionStatus(object(input.input).status);
      track("submission_created", { source: "organizer", submission_status: status === "accepted" || status === "declined" || status === "draft" ? status : "pending" });
      break;
    }
    case "submissions.submit": case "submissions.saveDraft": track("submission_created", { source: "organizer", submission_status: operation === "submissions.saveDraft" ? "draft" : "pending" }); break;
    case "submissions.decide": case "submissions.setStatus": track("submission_status_updated", { submission_status: normalizedSubmissionStatus(input.status) }); break;
    case "publicForms.submit": track("public_submission_completed", { participant_count: Array.isArray(object(input.input).participants) ? (object(input.input).participants as unknown[]).length : 0 }); break;
    case "speakers.create": track("speaker_created", {}); break;
    case "speakers.bulkImport": track("speakers_imported", { imported_count: Number(result.importedSpeakers || 0), skipped_count: Array.isArray(result.skipped) ? result.skipped.length : 0 }); break;
    case "speakers.setConfirmationStatus": track("speaker_confirmation_updated", { confirmation_status: input.status as never }); break;
    case "speakers.updateProfile": track("speaker_profile_updated", { has_bio: Boolean(input.bio) }); break;
    case "speakers.saveHeadshot": track("speaker_profile_updated", { has_headshot: true }); break;
    case "speakers.documents.remove": track("record_removed", { record_type: "speaker_document" }); break;
    case "sponsors.create": track("sponsor_saved", { mode: "created", sponsor_status: input.status as never }); break;
    case "sponsors.update": track("sponsor_saved", { mode: "updated", sponsor_status: input.status as never }); break;
    case "sponsors.remove": track("record_removed", { record_type: "sponsor" }); break;
    case "evaluations.plans.save": track("review_plan_saved", { mode: input.id ? "updated" : "created", round_count: typeof input.rounds === "number" ? input.rounds : undefined, anonymized: typeof input.anonymized === "boolean" ? input.anonymized : undefined }); break;
    case "evaluations.assignments.assign": track("review_assignments_created", { created_count: 1 }); break;
    case "evaluations.assignments.assignByFilter": track("review_assignments_created", { created_count: Number(result.created || 0), skipped_count: Number(result.skipped || 0) }); break;
    case "evaluations.save": track("review_completed", { has_scorecard: Array.isArray(input.criteriaScores) }); break;
    case "evaluations.sendReviewerReminders": track("reviewer_reminders_sent", { sent_count: Number(result.sent || 0), failed_count: Number(result.failed || 0) }); break;
    case "agenda.save": track("agenda_session_saved", { mode: input.id ? "updated" : "created", published: typeof input.isPublished === "boolean" ? input.isPublished : undefined }); break;
    case "agenda.publishSchedule": track("agenda_published", { published_count: typeof result === "number" ? result : undefined }); break;
    case "agenda.remove": track("record_removed", { record_type: "agenda_session" }); break;
    case "comms.templates.save": track("communication_template_saved", { mode: input.id ? "updated" : "created", communication_kind: input.kind as never }); break;
    case "comms.sendDecision": case "comms.sendReminder": case "comms.sendConsolidatedDecision": track("communication_sent", { communication_kind: operation === "comms.sendDecision" ? "decision" : operation === "comms.sendReminder" ? "reminder" : "consolidated_decision", sent_count: Number(result.sent || 0), failed_count: Number(result.failed || 0) }); break;
    case "tasks.create": track("task_created", { task_target: input.targetType as never, source: "manual" }); break;
    case "tasks.setStatus": track("task_status_updated", { task_status: input.status as never }); break;
    case "taskTemplates.remove": track("record_removed", { record_type: "task_template" }); break;
    case "emailIntegrations.save": track("integration_connected", { integration: "email" }); break;
    case "emailIntegrations.test": track("integration_tested", { integration: "email", outcome: "succeeded" }); break;
    case "emailIntegrations.disconnect": track("integration_disconnected", { integration: "email" }); break;
    case "agentProviderSettings.saveManaged": case "agentProviderSettings.saveByok": track("integration_connected", { integration: "ai_provider" }); break;
    case "agentProviderSettings.disconnectByok": track("integration_disconnected", { integration: "ai_provider" }); break;
    case "apiKeys.generate": track("api_key_created", { scope_count: Array.isArray(input.scopes) ? input.scopes.length : 1 }); break;
    case "apiKeys.revoke": track("api_key_revoked", {}); break;
    case "publicEmbeds.save": track("embed_saved", { mode: input.id ? "updated" : "created", enabled: typeof input.enabled === "boolean" ? input.enabled : undefined, embed_view: input.view as never }); break;
    case "publicEmbeds.duplicate": track("embed_duplicated", {}); break;
    case "publicEmbeds.remove": track("embed_removed", {}); break;
    case "portalForms.submit": track("portal_form_completed", {}); break;
    case "availability.upsert": track("availability_updated", { unavailable_count: Array.isArray(input.unavailable) ? input.unavailable.length : 0 }); break;
    case "organizers.completeOnboarding": track("onboarding_completed", {}); break;
  }
}

function workflowFor(operation: WriteOperation): AnalyticsEventProperties["workflow_failed"]["workflow"] | undefined {
  if (operation.startsWith("agenda.")) return "agenda";
  if (operation.startsWith("apiKeys.")) return "api_key";
  if (operation.startsWith("publicEmbeds.")) return "embed";
  if (operation.startsWith("events.")) return "event";
  if (operation.startsWith("forms.")) return "form";
  if (operation.startsWith("emailIntegrations.") || operation.startsWith("agentProviderSettings.")) return "integration";
  if (operation === "organizers.completeOnboarding" || operation.startsWith("organizations.")) return "onboarding";
  if (operation.startsWith("evaluations.")) return "review";
  if (operation.startsWith("speakers.")) return "speaker";
  if (operation.startsWith("sponsors.") || operation.startsWith("sponsor")) return "sponsor";
  if (operation.startsWith("submissions.") || operation === "publicForms.submit") return "submission";
  if (operation.startsWith("tasks.") || operation.startsWith("taskTemplates.")) return "task";
  return undefined;
}

// This is the sole translation point between domain operations and a backend.
// Feature code imports Repository, never a transport, Convex, or Airtable.
export function createRepository(transport: DataTransport): Repository {
  const baseTransport = transport;
  transport = {
    read: (operation, input) => baseTransport.read(operation, input),
    write: async <Result>(operation: WriteOperation, input: object): Promise<Result> => {
      try {
        const result = await baseTransport.write<Result>(operation, input);
        trackWriteSuccess(operation, input, result);
        return result;
      } catch (error) {
        if (operation === "publicForms.submit") track("public_submission_failed", { error_category: analyticsErrorCategory(error) });
        else if (operation === "emailIntegrations.test") track("integration_tested", { integration: "email", outcome: "failed" });
        else if (operation === "comms.sendDecision" || operation === "comms.sendReminder" || operation === "comms.sendConsolidatedDecision") track("communication_failed", { communication_kind: operation === "comms.sendDecision" ? "decision" : operation === "comms.sendReminder" ? "reminder" : "consolidated_decision", error_category: analyticsErrorCategory(error) });
        else {
          const workflow = workflowFor(operation);
          if (workflow) track("workflow_failed", { workflow, error_category: analyticsErrorCategory(error) });
        }
        throw error;
      }
    },
  };
  return {
    activity: {
      list: ({ eventId }) => transport.read<ActivityEntry[]>("activity.list", { eventId }),
    },
    analytics: {
      summary: ({ eventId }) =>
        transport.read<EventAnalyticsSummary>("analytics.summary", { eventId }),
    },
    agentProviderSettings: {
      status: ({ eventId }) => transport.read<AgentProviderSetting>("agentProviderSettings.status", { eventId }),
      saveManaged: ({ eventId }) => transport.write("agentProviderSettings.saveManaged", { eventId }),
      saveByok: (input) => transport.write("agentProviderSettings.saveByok", input),
      disconnectByok: ({ eventId }) => transport.write("agentProviderSettings.disconnectByok", { eventId }),
      assignBillingOwner: ({ eventId }) => transport.write("agentProviderSettings.assignBillingOwner", { eventId }),
    },
    agentRuns: {
      canUse: ({ eventId }) => transport.read<boolean>("agentRuns.canUse", { eventId }),
      list: ({ eventId, limit }) => transport.read<AgentRun[]>("agentRuns.list", { eventId, limit }),
      get: ({ eventId, runId }) => transport.read<AgentRunDetail | null>("agentRuns.get", { eventId, runId }),
      create: (input) => transport.write("agentRuns.create", input),
      respond: (input) => transport.write<void>("agentRuns.respond", input),
      retry: (input) => transport.write<void>("agentRuns.retry", input),
      cancel: (input) => transport.write<void>("agentRuns.cancel", input),
      approveTaskProposal: (input) => transport.write<{ createdTaskIds: string[] }>("agentRuns.approveTaskProposal", input),
      rejectProposal: (input) => transport.write<void>("agentRuns.rejectProposal", input),
    },
    apiKeys: {
      list: ({ eventId }) => transport.read<ApiKey[]>("apiKeys.list", { eventId }),
      generate: ({ eventId, label, scopes = ["events:read"] }) =>
        transport.write<GeneratedApiKey>("apiKeys.generate", { eventId, label, scopes }),
      revoke: ({ eventId, id }) => transport.write<void>("apiKeys.revoke", { eventId, id }),
      auditLog: ({ eventId }) => transport.read<ApiAuditLogEntry[]>("apiKeys.auditLog", { eventId }),
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
    contentIntegrations: {
      status: ({ eventId, provider }) =>
        transport.read<ContentIntegration | null>("contentIntegrations.status", {
          eventId,
          provider,
        }),
      connectNotion: (input: NotionConnectInput) =>
        transport.write<{ status: "connected" }>("contentIntegrations.connectNotion", input),
      importNotion: ({ eventId }) =>
        transport.write<NotionImportResult>("contentIntegrations.importNotion", { eventId }),
      connectAirtable: (input: AirtableConnectInput) =>
        transport.write<{ status: "connected" }>("contentIntegrations.connectAirtable", input),
      importAirtable: ({ eventId }) =>
        transport.write<AirtableImportResult>("contentIntegrations.importAirtable", { eventId }),
      connectSanity: (input: SanityConnectInput) =>
        transport.write<{ status: "connected" }>("contentIntegrations.connectSanity", input),
      publishSanity: ({ eventId }) =>
        transport.write<SanityPublishResult>("contentIntegrations.publishSanity", { eventId }),
      disconnect: ({ eventId, provider }) =>
        transport.write<{ status: "disconnected" }>("contentIntegrations.disconnect", {
          eventId,
          provider,
        }),
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
      remove: (eventId) => transport.write("events.remove", { eventId }),
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
      canManage: ({ eventId }) =>
        transport.read<boolean>("eventMembers.canManage", { eventId }),
      invite: (input) =>
        transport.write<EventInviteResult>("eventMembers.invite", input),
      resend: (input) =>
        transport.write<EventInviteResult>("eventMembers.resend", input),
      claimPending: () =>
        transport.write<number>("eventMembers.claimPending", {}),
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
      setStatus: (input) =>
        transport.write<SubmissionFormStatus>("forms.setStatus", input),
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
    speakerNotes: {
      list: ({ eventId, speakerId }) => transport.read<SpeakerNote[]>("speakerNotes.list", { eventId, speakerId }),
      create: (input) => transport.write<string>("speakerNotes.create", input),
      remove: (input) => transport.write<void>("speakerNotes.remove", input),
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
      remove: ({ eventId, id }) =>
        transport.write<void>("agenda.remove", { eventId, id }),
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
      list: ({ eventId }) => transport.read<Embed[]>("publicEmbeds.list", { eventId }),
      getAdmin: (input) => transport.read<Embed | null>("publicEmbeds.getAdmin", input),
      preview: (input) => transport.read<PublicEmbedView | null>("publicEmbeds.preview", input),
      save: (input) => transport.write<EmbedId>("publicEmbeds.save", input),
      duplicate: (input) => transport.write<EmbedId>("publicEmbeds.duplicate", input),
      remove: async (input) => { await transport.write<null>("publicEmbeds.remove", input); },
      getPublic: (embedId) => transport.read<PublicEmbedView | null>("publicEmbeds.getPublic", { embedId }),
      getLegacy: (eventSlug) =>
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
      list: (organizationId) =>
        transport.read<Organizer[]>("organizers.list", { organizationId }),
      getMine: () => transport.read<Organizer | null>("organizers.getMine", {}),
      isCurrentUserOrganizer: () =>
        transport.read<boolean>("organizers.isCurrentUserOrganizer", {}),
      hasAdminAccess: () =>
        transport.read<boolean>("organizers.hasAdminAccess", {}),
      completeOnboarding: () =>
        transport.write<void>("organizers.completeOnboarding", {}),
      add: (input) => transport.write<string>("organizers.add", input),
      remove: (input) => transport.write<void>("organizers.remove", input),
    },
    organizations: {
      createForCurrentUser: (input) =>
        transport.write<string>("organizations.createForCurrentUser", input ?? {}),
      listMine: () =>
        transport.read<Organization[]>("organizations.listMine", {}),
      getMine: () =>
        transport.read<Organization | null>("organizations.getMine", {}),
      rename: (input) => transport.write<void>("organizations.rename", input),
    },
    profiles: {
      getMine: () => transport.read<UserProfile | null>("profiles.getMine", {}),
      save: (input) => transport.write<void>("profiles.save", input),
    },
  };
}
