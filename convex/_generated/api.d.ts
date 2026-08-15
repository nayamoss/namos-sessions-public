/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agenda from "../agenda.js";
import type * as agendaAudit from "../agendaAudit.js";
import type * as agentData from "../agentData.js";
import type * as agentProposal from "../agentProposal.js";
import type * as agentProviderSecrets from "../agentProviderSecrets.js";
import type * as agentProviderSettings from "../agentProviderSettings.js";
import type * as agentProviderSettingsActions from "../agentProviderSettingsActions.js";
import type * as agentRuns from "../agentRuns.js";
import type * as agentRuntime from "../agentRuntime.js";
import type * as agentState from "../agentState.js";
import type * as agentWorkflow from "../agentWorkflow.js";
import type * as apiKeyAuth from "../apiKeyAuth.js";
import type * as apiKeys from "../apiKeys.js";
import type * as apiKeysActions from "../apiKeysActions.js";
import type * as availability from "../availability.js";
import type * as categoryRouting from "../categoryRouting.js";
import type * as comms from "../comms.js";
import type * as commsActions from "../commsActions.js";
import type * as commsData from "../commsData.js";
import type * as commsEmailRender from "../commsEmailRender.js";
import type * as confirmationEmailActions from "../confirmationEmailActions.js";
import type * as emailDelivery from "../emailDelivery.js";
import type * as emailIntegrations from "../emailIntegrations.js";
import type * as emailIntegrationsActions from "../emailIntegrationsActions.js";
import type * as evaluations from "../evaluations.js";
import type * as eventInviteActions from "../eventInviteActions.js";
import type * as eventMembers from "../eventMembers.js";
import type * as eventValidation from "../eventValidation.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as formTemplates from "../formTemplates.js";
import type * as forms from "../forms.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as organizers from "../organizers.js";
import type * as portalFormConfirmationActions from "../portalFormConfirmationActions.js";
import type * as portalFormResponses from "../portalFormResponses.js";
import type * as publicEmbeds from "../publicEmbeds.js";
import type * as publicEventsApi from "../publicEventsApi.js";
import type * as publicFormValidation from "../publicFormValidation.js";
import type * as publicForms from "../publicForms.js";
import type * as reviewerRemindersActions from "../reviewerRemindersActions.js";
import type * as seed from "../seed.js";
import type * as speakerDocuments from "../speakerDocuments.js";
import type * as speakers from "../speakers.js";
import type * as sponsorContacts from "../sponsorContacts.js";
import type * as sponsorTiers from "../sponsorTiers.js";
import type * as sponsors from "../sponsors.js";
import type * as submissionEditing from "../submissionEditing.js";
import type * as submissions from "../submissions.js";
import type * as tags from "../tags.js";
import type * as taskTemplates from "../taskTemplates.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agenda: typeof agenda;
  agendaAudit: typeof agendaAudit;
  agentData: typeof agentData;
  agentProposal: typeof agentProposal;
  agentProviderSecrets: typeof agentProviderSecrets;
  agentProviderSettings: typeof agentProviderSettings;
  agentProviderSettingsActions: typeof agentProviderSettingsActions;
  agentRuns: typeof agentRuns;
  agentRuntime: typeof agentRuntime;
  agentState: typeof agentState;
  agentWorkflow: typeof agentWorkflow;
  apiKeyAuth: typeof apiKeyAuth;
  apiKeys: typeof apiKeys;
  apiKeysActions: typeof apiKeysActions;
  availability: typeof availability;
  categoryRouting: typeof categoryRouting;
  comms: typeof comms;
  commsActions: typeof commsActions;
  commsData: typeof commsData;
  commsEmailRender: typeof commsEmailRender;
  confirmationEmailActions: typeof confirmationEmailActions;
  emailDelivery: typeof emailDelivery;
  emailIntegrations: typeof emailIntegrations;
  emailIntegrationsActions: typeof emailIntegrationsActions;
  evaluations: typeof evaluations;
  eventInviteActions: typeof eventInviteActions;
  eventMembers: typeof eventMembers;
  eventValidation: typeof eventValidation;
  events: typeof events;
  files: typeof files;
  formTemplates: typeof formTemplates;
  forms: typeof forms;
  functions: typeof functions;
  http: typeof http;
  organizers: typeof organizers;
  portalFormConfirmationActions: typeof portalFormConfirmationActions;
  portalFormResponses: typeof portalFormResponses;
  publicEmbeds: typeof publicEmbeds;
  publicEventsApi: typeof publicEventsApi;
  publicFormValidation: typeof publicFormValidation;
  publicForms: typeof publicForms;
  reviewerRemindersActions: typeof reviewerRemindersActions;
  seed: typeof seed;
  speakerDocuments: typeof speakerDocuments;
  speakers: typeof speakers;
  sponsorContacts: typeof sponsorContacts;
  sponsorTiers: typeof sponsorTiers;
  sponsors: typeof sponsors;
  submissionEditing: typeof submissionEditing;
  submissions: typeof submissions;
  tags: typeof tags;
  taskTemplates: typeof taskTemplates;
  tasks: typeof tasks;
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
