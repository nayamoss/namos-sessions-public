import { ConvexHttpClient } from "convex/browser";
import type { PublicFormSubmissionInput, PublicFormSubmissionResult, Repository } from "../repo";
import { createRepository, type DataTransport, type ReadOperation, type WriteOperation } from "../transport";

export const convexFunction: Record<Exclude<ReadOperation | WriteOperation, "publicForms.submit">, string> = {
  "analytics.summary": "analytics:summary",
  "events.list": "events:list", "events.listMine": "events:listMine", "events.listForPortal": "events:listForPortal", "events.get": "events:get", "events.getBySlug": "events:getBySlug", "events.rooms.list": "events:listRooms", "events.tracks.list": "events:listTracks", "speakerNotes.list": "speakerNotes:list",
  "events.save": "events:save", "events.duplicate": "events:duplicate", "events.remove": "events:remove", "events.rooms.save": "events:saveRoom", "events.rooms.remove": "events:removeRoom", "events.tracks.save": "events:saveTrack", "events.tracks.remove": "events:removeTrack", "eventMembers.list": "eventMembers:list", "eventMembers.canManage": "eventMembers:hasOrganizerAccess", "eventMembers.invite": "eventInviteActions:invite", "eventMembers.resend": "eventInviteActions:resend", "eventMembers.claimPending": "eventMembers:claimPending", "eventMembers.add": "eventMembers:add", "eventMembers.remove": "eventInviteActions:remove", "tags.list": "tags:list", "tags.create": "tags:create", "tags.rename": "tags:rename", "tags.remove": "tags:remove", "speakerNotes.create": "speakerNotes:create", "speakerNotes.remove": "speakerNotes:remove",
  "forms.list": "forms:list", "forms.fields": "forms:fields", "forms.listFields": "forms:listFields", "forms.save": "forms:save", "forms.saveField": "forms:saveField", "forms.createFromTemplate": "forms:createFromTemplate", "forms.duplicate": "forms:duplicate", "forms.remove": "forms:remove", "forms.setStatus": "forms:setStatus", "submissions.list": "submissions:list", "submissions.submit": "submissions:submit", "submissions.saveDraft": "submissions:saveDraft", "submissions.createAdmin": "submissions:createAdmin", "submissions.decide": "submissions:decide", "submissions.setStatus": "submissions:setStatus", "submissions.setTags": "submissions:setTags", "submissions.getForSpeaker": "submissions:getForSpeaker", "submissions.updateBySpeaker": "submissions:updateBySpeaker", "speakers.list": "speakers:list", "speakers.create": "speakers:create", "speakers.setConfirmationStatus": "speakers:setConfirmationStatus", "speakers.getMine": "speakers:getMine", "speakers.headshotUrl": "speakers:headshotUrl", "speakers.updateProfile": "speakers:updateProfile", "speakers.requestHeadshotUpload": "speakers:requestHeadshotUpload", "speakers.saveHeadshot": "speakers:saveHeadshot", "speakers.documents.requestUpload": "speakerDocuments:requestUpload", "speakers.documents.save": "speakerDocuments:save", "speakers.documents.list": "speakerDocuments:list", "speakers.documents.remove": "speakerDocuments:remove", "evaluations.list": "evaluations:list", "evaluations.save": "evaluations:save", "evaluations.plans.list": "evaluations:listPlans", "evaluations.plans.save": "evaluations:savePlan", "evaluations.assignments.list": "evaluations:listAssignments", "evaluations.assignments.assign": "evaluations:assign", "evaluations.assignments.assignByFilter": "evaluations:assignByFilter", "evaluations.myQueue": "evaluations:myQueue", "evaluations.reviewerProgress": "evaluations:reviewerProgress", "evaluations.sendReviewerReminders": "reviewerRemindersActions:send", "agenda.list": "agenda:list", "agenda.listForSpeaker": "agenda:listForSpeaker", "agenda.detectConflicts": "agenda:detectConflicts", "agenda.save": "agenda:save", "agenda.remove": "agenda:remove", "agenda.publishSchedule": "agenda:publishSchedule", "tasks.list": "tasks:list", "tasks.create": "tasks:create", "tasks.setStatus": "tasks:setStatus", "taskTemplates.list": "taskTemplates:list", "taskTemplates.create": "taskTemplates:create", "taskTemplates.update": "taskTemplates:update", "taskTemplates.remove": "taskTemplates:remove", "taskTemplates.setDefault": "taskTemplates:setDefault", "taskTemplates.applyToSubmission": "taskTemplates:applyToSubmission", "comms.list": "comms:list", "availability.list": "availability:list", "availability.upsert": "availability:upsert", "publicEmbeds.get": "publicEmbeds:get", "publicEmbeds.list": "publicEmbeds:list", "publicEmbeds.getAdmin": "publicEmbeds:getAdmin", "publicEmbeds.preview": "publicEmbeds:preview", "publicEmbeds.getPublic": "publicEmbeds:getPublic", "publicEmbeds.save": "publicEmbeds:save", "publicEmbeds.duplicate": "publicEmbeds:duplicate", "publicEmbeds.remove": "publicEmbeds:remove", "publicForms.listOpen": "publicForms:listOpen", "publicForms.get": "publicForms:get", "portalForms.get": "portalFormResponses:get", "portalForms.submit": "portalFormResponses:submit",
  "organizers.list": "organizers:list", "organizers.getMine": "organizers:getMine", "organizers.isCurrentUserOrganizer": "organizers:isCurrentUserOrganizer", "organizers.hasAdminAccess": "organizers:hasAdminAccess", "organizations.createForCurrentUser": "organizations:createForCurrentUser", "organizations.listMine": "organizations:listMine", "organizations.getMine": "organizations:getMine", "organizations.rename": "organizations:rename", "organizers.completeOnboarding": "organizers:completeOnboarding", "organizers.add": "organizers:add", "organizers.remove": "organizers:remove", "speakers.bulkImport": "speakers:bulkImport",
  "profiles.getMine": "userProfiles:getMine", "profiles.save": "userProfiles:save",
  "emailIntegrations.status": "emailIntegrations:status", "emailIntegrations.save": "emailIntegrationsActions:save", "emailIntegrations.test": "emailIntegrationsActions:test", "emailIntegrations.disconnect": "emailIntegrationsActions:disconnect",
  "contentIntegrations.status": "contentIntegrations:status", "contentIntegrations.connectNotion": "contentIntegrationsActions:connectNotion", "contentIntegrations.importNotion": "contentIntegrationsActions:importNotion", "contentIntegrations.connectAirtable": "contentIntegrationsActions:connectAirtable", "contentIntegrations.importAirtable": "contentIntegrationsActions:importAirtable", "contentIntegrations.connectSanity": "contentIntegrationsActions:connectSanity", "contentIntegrations.publishSanity": "contentIntegrationsActions:publishSanity", "contentIntegrations.disconnect": "contentIntegrationsActions:disconnect",
  "comms.templates.list": "comms:listTemplates",
  "notifications.unreadCount": "notifications:unreadCount",
  "comms.templates.save": "comms:saveTemplate",
  "comms.sendDecision": "commsActions:sendDecision",
  "comms.sendReminder": "commsActions:sendReminder",
  "comms.previewDecision": "comms:previewDecision",
  "comms.previewReminder": "comms:previewReminder",
  "comms.previewConsolidatedDecision": "comms:previewConsolidatedDecision",
  "comms.sendConsolidatedDecision": "commsActions:sendConsolidatedDecision",
  "apiKeys.list": "apiKeys:list", "apiKeys.auditLog": "apiKeys:auditLog", "apiKeys.generate": "apiKeysActions:generate", "apiKeys.revoke": "apiKeys:revoke",
  "activity.list": "activity:list",
  "sponsors.list": "sponsors:list", "sponsors.get": "sponsors:get", "sponsors.create": "sponsors:create", "sponsors.update": "sponsors:update", "sponsors.remove": "sponsors:remove",
  "sponsorTiers.list": "sponsorTiers:list", "sponsorTiers.create": "sponsorTiers:create", "sponsorTiers.update": "sponsorTiers:update", "sponsorTiers.reorder": "sponsorTiers:reorder", "sponsorTiers.remove": "sponsorTiers:remove",
  "sponsorContacts.listBySponsor": "sponsorContacts:listBySponsor", "sponsorContacts.create": "sponsorContacts:create", "sponsorContacts.update": "sponsorContacts:update", "sponsorContacts.remove": "sponsorContacts:remove", "taskTemplates.applyToSponsor": "taskTemplates:applyToSponsor",
  "agentRuns.canUse": "agentRuns:canUse", "agentRuns.list": "agentRuns:list", "agentRuns.get": "agentRuns:get", "agentRuns.create": "agentRuns:create", "agentRuns.respond": "agentRuns:respond", "agentRuns.retry": "agentRuns:retry", "agentRuns.cancel": "agentRuns:cancel", "agentRuns.approveTaskProposal": "agentRuns:approveTaskProposal", "agentRuns.rejectProposal": "agentRuns:rejectProposal",
  "agentProviderSettings.status": "agentProviderSettings:status", "agentProviderSettings.saveManaged": "agentProviderSettingsActions:saveManaged", "agentProviderSettings.saveByok": "agentProviderSettingsActions:saveByok", "agentProviderSettings.disconnectByok": "agentProviderSettingsActions:disconnectByok", "agentProviderSettings.assignBillingOwner": "agentProviderSettings:assignBillingOwner",
};

// Write operations backed by a Convex *action* rather than a mutation. Actions are the only
// Convex function type that can reach an external service (an email provider, here), so they
// dispatch through client.action instead of client.mutation.
const convexActions = new Set<WriteOperation>(["eventMembers.invite", "eventMembers.resend", "eventMembers.remove", "emailIntegrations.save", "emailIntegrations.test", "emailIntegrations.disconnect", "contentIntegrations.connectNotion", "contentIntegrations.importNotion", "contentIntegrations.connectAirtable", "contentIntegrations.importAirtable", "contentIntegrations.connectSanity", "contentIntegrations.publishSanity", "contentIntegrations.disconnect", "agentProviderSettings.saveManaged", "agentProviderSettings.saveByok", "agentProviderSettings.disconnectByok", "evaluations.sendReviewerReminders", "apiKeys.generate", "comms.sendDecision", "comms.sendReminder", "comms.sendConsolidatedDecision"]);

type ConvexDocument = { _id: string; [key: string]: unknown };

function documentRow(document: unknown): ConvexDocument {
  if (!document || typeof document !== "object" || !("_id" in document) || typeof document._id !== "string") throw new Error("Convex returned an invalid document.");
  return document as ConvexDocument;
}

function documentRows(value: unknown): ConvexDocument[] {
  if (!Array.isArray(value)) throw new Error("Convex returned an invalid document list.");
  return value.map(documentRow);
}

export function normalize(operation: ReadOperation | WriteOperation, value: unknown): unknown {
  // Strip Convex's system fields — leaving _creationTime on a client-side object means it
  // silently rides along when a fetched record (e.g. Event) is spread back into a save call,
  // and Convex's strict args validator rejects the unexpected field.
  const row = (document: unknown) => { const { _id, _creationTime: _drop, ...rest } = documentRow(document); return { ...rest, id: _id }; };
  if (!value) return value;
  if (operation === "events.list" || operation === "events.listMine" || operation === "events.listForPortal") return documentRows(value).map(row);
  if (operation === "agentRuns.list") return documentRows(value).map(row);
  if (operation === "agentRuns.get") {
    const detail = value as { run: unknown; events: unknown; proposals: unknown };
    return { run: row(detail.run), events: documentRows(detail.events).map(row), proposals: documentRows(detail.proposals).map(row) };
  }
  if (operation === "events.get" || operation === "events.getBySlug" || operation === "emailIntegrations.status" || operation === "contentIntegrations.status" || operation === "organizers.getMine" || operation === "organizations.getMine" || operation === "profiles.getMine") return row(value);
  if (operation === "agentProviderSettings.status") return value;
  if (operation === "publicEmbeds.getAdmin") return row(value);
  if (operation === "publicEmbeds.list") return documentRows(value).map(row);
  if (operation === "events.rooms.list" || operation === "events.tracks.list" || operation === "eventMembers.list" || operation === "tags.list" || operation === "speakers.documents.list" || operation === "speakerNotes.list" || operation === "agenda.list" || operation === "agenda.listForSpeaker" || operation === "evaluations.list" || operation === "evaluations.plans.list" || operation === "evaluations.assignments.list" || operation === "tasks.list" || operation === "taskTemplates.list" || operation === "availability.list" || operation === "organizers.list" || operation === "organizations.listMine" || operation === "apiKeys.list" || operation === "apiKeys.auditLog") return documentRows(value).map(row);
  if (operation === "sponsors.list" || operation === "sponsorTiers.list" || operation === "sponsorContacts.listBySponsor") return documentRows(value).map((document) => ({ ...row(document), ...(document.tier && typeof document.tier === "object" ? { tier: row(document.tier) } : {}), ...(document.primaryContact && typeof document.primaryContact === "object" ? { primaryContact: row(document.primaryContact) } : {}) }));
  if (operation === "sponsors.get") { const document = documentRow(value); return { ...row(document), ...(document.tier && typeof document.tier === "object" ? { tier: row(document.tier) } : {}), contacts: Array.isArray(document.contacts) ? document.contacts.map(row) : [], tasks: Array.isArray(document.tasks) ? document.tasks.map(row) : [], submissions: Array.isArray(document.submissions) ? document.submissions.map((submission) => ({ ...row(submission), speakerIds: documentRow(submission).speakerId ? [documentRow(submission).speakerId] : [], tagIds: Array.isArray(documentRow(submission).tagIds) ? documentRow(submission).tagIds : [] })) : [] }; }
  if (operation === "forms.list") return documentRows(value).map((document) => ({ ...row(document), name: document.internalName, isOpen: document.status === "open" }));
  if (operation === "forms.fields" || operation === "forms.listFields") return documentRows(value).map(row);
  if (operation === "speakers.list") return documentRows(value).map((document) => ({ ...row(document), name: `${document.firstName ?? ""} ${document.lastName ?? ""}`.trim() }));
  if (operation === "speakers.getMine") { const document = documentRow(value); return { ...row(document), name: `${document.firstName ?? ""} ${document.lastName ?? ""}`.trim() }; }
  if (operation === "submissions.list") return documentRows(value).map((document) => ({ ...row(document), speakerIds: document.speakerId ? [document.speakerId] : [], tagIds: Array.isArray(document.tagIds) ? document.tagIds : [] }));
  if (operation === "submissions.getForSpeaker") {
    const result = value as { submission: unknown; [key: string]: unknown };
    const document = documentRow(result.submission);
    return { ...result, submission: { ...row(document), speakerIds: document.speakerId ? [document.speakerId] : [], tagIds: Array.isArray(document.tagIds) ? document.tagIds : [] } };
  }
  if (operation === "comms.list") return documentRows(value).map((document) => ({ ...row(document), type: document.channel }));
  if (operation === "comms.templates.list") return documentRows(value).map(row);
  return value;
}

export function normalizeInput(operation: ReadOperation | WriteOperation, input: Record<string, unknown>) {
  if (operation === "events.save" && "id" in input) {
    // `event` here is a previously-read row, so it still carries server-managed fields —
    // timestamps (`createdAt`/`updatedAt`) the `save` mutation sets itself, and
    // `organizationId`, the tenant an event is stamped with once at creation and never
    // changes after (see convex/schema.ts). None of these are in `save`'s arg validator,
    // so leaving any of them in sends "Object contains extra field" straight to the user
    // on every single save from this page. Strip them the same way `row()` already strips
    // `_creationTime`.
    const { id, createdAt: _createdAt, updatedAt: _updatedAt, organizationId: _organizationId, ...event } = input;
    return { ...event, eventId: id };
  }
  return input;
}

// Resolves the caller's current Clerk session token, or undefined when signed out.
type TokenGetter = () => Promise<string | null | undefined>;

export async function submitPublicFormAtEdge(input: PublicFormSubmissionInput, authToken?: string | null) {
  const { turnstileToken, ...submission } = input;
  const headers = new Headers({ "content-type": "application/json" });
  if (authToken) headers.set("authorization", `Bearer ${authToken}`);
  const response = await fetch("/api/public/cfp-submissions", {
    method: "POST",
    headers,
    body: JSON.stringify({ input: submission, turnstileToken }),
  });
  let result: { speakerId?: string; error?: string } = {};
  try {
    result = await response.json() as { speakerId?: string; error?: string };
  } catch {
    // The generic failure below is intentional; never surface an edge or provider response body.
  }
  if (!response.ok) {
    if (result.error === "rate_limited") throw new Error("Submission rate limit reached.");
    if (result.error === "verification_failed") throw new Error("Submission verification failed.");
    if (result.error === "verification_unavailable") throw new Error("Submission verification is temporarily unavailable.");
    if (result.error === "form_closed") throw new Error("This submission form is closed.");
    if (result.error === "submission_limit") throw new Error("You have reached this form's submission limit.");
    throw new Error("Submission service unavailable.");
  }
  return { ...(typeof result.speakerId === "string" ? { speakerId: result.speakerId } : {}) } satisfies PublicFormSubmissionResult;
}

function createConvexTransport(getToken?: TokenGetter): DataTransport {
  let client: ConvexHttpClient | undefined;
  const getClient = () => {
    if (!client) {
      const url = import.meta.env.VITE_CONVEX_URL;
      if (!url) throw new Error("VITE_CONVEX_URL is required when VITE_DATA_BACKEND=convex");
      client = new ConvexHttpClient(url);
    }
    return client;
  };
  // The Convex functions this repo calls don't require auth yet, but attaching the caller's
  // Clerk token here means they can start checking ctx.auth without any further frontend change.
  const authedClient = async () => {
    const instance = getClient();
    const token = await getToken?.();
    if (token) instance.setAuth(token); else instance.clearAuth();
    return instance;
  };
  return {
    read: async (operation, input) => normalize(operation, await (await authedClient()).query(convexFunction[operation] as never, normalizeInput(operation, input as Record<string, unknown>) as never)) as never,
    write: async (operation, input) => {
      if (operation === "publicForms.submit") {
        return submitPublicFormAtEdge((input as { input: PublicFormSubmissionInput }).input, await getToken?.()) as never;
      }
      const client = await authedClient();
      const name = convexFunction[operation as Exclude<WriteOperation, "publicForms.submit">] as never;
      const args = normalizeInput(operation, input as Record<string, unknown>) as never;
      return normalize(operation, await (convexActions.has(operation) ? client.action(name, args) : client.mutation(name, args))) as never;
    },
  };
}

// The Convex client remains behind this factory so feature code never imports convex/react.
// Feature-owned Convex functions replace the relevant methods as their tables land.
export function createConvexRepo(transport?: DataTransport, getToken?: TokenGetter): Repository {
  return createRepository(transport ?? createConvexTransport(getToken));
}
