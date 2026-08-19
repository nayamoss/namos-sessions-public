/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as agenda from "../agenda.js";
import type * as agendaAudit from "../agendaAudit.js";
import type * as agentBilling from "../agentBilling.js";
import type * as agentBillingResolver from "../agentBillingResolver.js";
import type * as agentData from "../agentData.js";
import type * as agentProposal from "../agentProposal.js";
import type * as agentProviderSecrets from "../agentProviderSecrets.js";
import type * as agentProviderSettings from "../agentProviderSettings.js";
import type * as agentProviderSettingsActions from "../agentProviderSettingsActions.js";
import type * as agentRuns from "../agentRuns.js";
import type * as agentRuntime from "../agentRuntime.js";
import type * as agentState from "../agentState.js";
import type * as agentWorkflow from "../agentWorkflow.js";
import type * as aiAssessmentActions from "../aiAssessmentActions.js";
import type * as aiAssessments from "../aiAssessments.js";
import type * as airtableSync from "../airtableSync.js";
import type * as analytics from "../analytics.js";
import type * as apiKeyAuth from "../apiKeyAuth.js";
import type * as apiKeys from "../apiKeys.js";
import type * as apiKeysActions from "../apiKeysActions.js";
import type * as availability from "../availability.js";
import type * as categoryRouting from "../categoryRouting.js";
import type * as changelog from "../changelog.js";
import type * as comms from "../comms.js";
import type * as commsActions from "../commsActions.js";
import type * as commsData from "../commsData.js";
import type * as commsEmailRender from "../commsEmailRender.js";
import type * as commsInbox from "../commsInbox.js";
import type * as confirmationEmailActions from "../confirmationEmailActions.js";
import type * as contentIntegrations from "../contentIntegrations.js";
import type * as contentIntegrationsActions from "../contentIntegrationsActions.js";
import type * as controlRoom from "../controlRoom.js";
import type * as credentialEncryption from "../credentialEncryption.js";
import type * as crm from "../crm.js";
import type * as demoWorkspaces from "../demoWorkspaces.js";
import type * as deviceTokens from "../deviceTokens.js";
import type * as emailDelivery from "../emailDelivery.js";
import type * as emailIntegrations from "../emailIntegrations.js";
import type * as emailIntegrationsActions from "../emailIntegrationsActions.js";
import type * as evaluations from "../evaluations.js";
import type * as eventInviteActions from "../eventInviteActions.js";
import type * as eventMembers from "../eventMembers.js";
import type * as eventValidation from "../eventValidation.js";
import type * as events from "../events.js";
import type * as feedback from "../feedback.js";
import type * as files from "../files.js";
import type * as formPages from "../formPages.js";
import type * as formTemplates from "../formTemplates.js";
import type * as forms from "../forms.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as httpAuth from "../httpAuth.js";
import type * as migrations from "../migrations.js";
import type * as notificationEmailActions from "../notificationEmailActions.js";
import type * as notifications from "../notifications.js";
import type * as notionSync from "../notionSync.js";
import type * as organizations from "../organizations.js";
import type * as organizers from "../organizers.js";
import type * as portalFormConfirmationActions from "../portalFormConfirmationActions.js";
import type * as portalFormResponses from "../portalFormResponses.js";
import type * as portalResources from "../portalResources.js";
import type * as publicApi from "../publicApi.js";
import type * as publicEmbeds from "../publicEmbeds.js";
import type * as publicEventsApi from "../publicEventsApi.js";
import type * as publicFeeds from "../publicFeeds.js";
import type * as publicFormValidation from "../publicFormValidation.js";
import type * as publicForms from "../publicForms.js";
import type * as reviewerRemindersActions from "../reviewerRemindersActions.js";
import type * as sanitySync from "../sanitySync.js";
import type * as seed from "../seed.js";
import type * as speakerDocuments from "../speakerDocuments.js";
import type * as speakerNotes from "../speakerNotes.js";
import type * as speakers from "../speakers.js";
import type * as sponsorContacts from "../sponsorContacts.js";
import type * as sponsorTiers from "../sponsorTiers.js";
import type * as sponsors from "../sponsors.js";
import type * as submissionEditing from "../submissionEditing.js";
import type * as submissions from "../submissions.js";
import type * as tags from "../tags.js";
import type * as taskTemplates from "../taskTemplates.js";
import type * as tasks from "../tasks.js";
import type * as userProfiles from "../userProfiles.js";
import type * as voice from "../voice.js";
import type * as voiceStatus from "../voiceStatus.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  agenda: typeof agenda;
  agendaAudit: typeof agendaAudit;
  agentBilling: typeof agentBilling;
  agentBillingResolver: typeof agentBillingResolver;
  agentData: typeof agentData;
  agentProposal: typeof agentProposal;
  agentProviderSecrets: typeof agentProviderSecrets;
  agentProviderSettings: typeof agentProviderSettings;
  agentProviderSettingsActions: typeof agentProviderSettingsActions;
  agentRuns: typeof agentRuns;
  agentRuntime: typeof agentRuntime;
  agentState: typeof agentState;
  agentWorkflow: typeof agentWorkflow;
  aiAssessmentActions: typeof aiAssessmentActions;
  aiAssessments: typeof aiAssessments;
  airtableSync: typeof airtableSync;
  analytics: typeof analytics;
  apiKeyAuth: typeof apiKeyAuth;
  apiKeys: typeof apiKeys;
  apiKeysActions: typeof apiKeysActions;
  availability: typeof availability;
  categoryRouting: typeof categoryRouting;
  changelog: typeof changelog;
  comms: typeof comms;
  commsActions: typeof commsActions;
  commsData: typeof commsData;
  commsEmailRender: typeof commsEmailRender;
  commsInbox: typeof commsInbox;
  confirmationEmailActions: typeof confirmationEmailActions;
  contentIntegrations: typeof contentIntegrations;
  contentIntegrationsActions: typeof contentIntegrationsActions;
  controlRoom: typeof controlRoom;
  credentialEncryption: typeof credentialEncryption;
  crm: typeof crm;
  demoWorkspaces: typeof demoWorkspaces;
  deviceTokens: typeof deviceTokens;
  emailDelivery: typeof emailDelivery;
  emailIntegrations: typeof emailIntegrations;
  emailIntegrationsActions: typeof emailIntegrationsActions;
  evaluations: typeof evaluations;
  eventInviteActions: typeof eventInviteActions;
  eventMembers: typeof eventMembers;
  eventValidation: typeof eventValidation;
  events: typeof events;
  feedback: typeof feedback;
  files: typeof files;
  formPages: typeof formPages;
  formTemplates: typeof formTemplates;
  forms: typeof forms;
  functions: typeof functions;
  http: typeof http;
  httpAuth: typeof httpAuth;
  migrations: typeof migrations;
  notificationEmailActions: typeof notificationEmailActions;
  notifications: typeof notifications;
  notionSync: typeof notionSync;
  organizations: typeof organizations;
  organizers: typeof organizers;
  portalFormConfirmationActions: typeof portalFormConfirmationActions;
  portalFormResponses: typeof portalFormResponses;
  portalResources: typeof portalResources;
  publicApi: typeof publicApi;
  publicEmbeds: typeof publicEmbeds;
  publicEventsApi: typeof publicEventsApi;
  publicFeeds: typeof publicFeeds;
  publicFormValidation: typeof publicFormValidation;
  publicForms: typeof publicForms;
  reviewerRemindersActions: typeof reviewerRemindersActions;
  sanitySync: typeof sanitySync;
  seed: typeof seed;
  speakerDocuments: typeof speakerDocuments;
  speakerNotes: typeof speakerNotes;
  speakers: typeof speakers;
  sponsorContacts: typeof sponsorContacts;
  sponsorTiers: typeof sponsorTiers;
  sponsors: typeof sponsors;
  submissionEditing: typeof submissionEditing;
  submissions: typeof submissions;
  tags: typeof tags;
  taskTemplates: typeof taskTemplates;
  tasks: typeof tasks;
  userProfiles: typeof userProfiles;
  voice: typeof voice;
  voiceStatus: typeof voiceStatus;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
