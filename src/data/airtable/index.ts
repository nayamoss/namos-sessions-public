import type { Repository } from "../repo";
import { createRepository, type DataTransport, type ReadOperation, type WriteOperation } from "../transport";

type TokenGetter = () => Promise<string | null>;
export function createAirtableTransport(getToken: TokenGetter = async () => null): DataTransport {
  const request = async <Result>(operation: ReadOperation | WriteOperation, input: Record<string, unknown>) => {
    if (operation.startsWith("agentRuns.")) throw new Error("Operations Agent currently requires the Convex backend.");
    if (operation.startsWith("agentProviderSettings.")) throw new Error("AI provider settings require the Convex backend — Airtable has no encrypted credential store.");
    if (operation.startsWith("publicEmbeds.")) throw new Error("Public embed management is available on the Convex backend.");
    if (operation.startsWith("tags.") || operation === "submissions.setTags") throw new Error("Airtable tag operations are outside issue #27 and are not implemented.");
    if (operation === "submissions.getForSpeaker" || operation === "submissions.updateBySpeaker") throw new Error("The Airtable backend does not yet provide speaker submission editing.");
    if (operation === "events.listForPortal") throw new Error("Airtable does not yet provide the authenticated speaker portal event boundary.");
    if (operation === "publicForms.listOpen" || operation === "publicForms.get" || operation === "publicForms.submit" || operation === "portalForms.get" || operation === "portalForms.submit" || operation === "speakers.getMine" || operation === "speakers.updateProfile" || operation === "speakers.requestHeadshotUpload" || operation === "speakers.saveHeadshot" || operation === "speakers.headshotUrl" || operation.startsWith("speakers.documents.")) throw new Error("Airtable does not yet provide this server-verified public/profile boundary.");
    if (operation === "forms.listFields" || operation === "forms.createFromTemplate" || operation === "forms.duplicate" || operation === "forms.remove" || operation === "forms.setStatus" || operation === "evaluations.plans.list" || operation === "evaluations.plans.save" || operation === "evaluations.assignments.list" || operation === "evaluations.assignments.assign" || operation === "evaluations.assignments.assignByFilter" || operation === "evaluations.myQueue" || operation === "evaluations.reviewerProgress") throw new Error("Airtable does not yet provide the scoped portal-form or evaluation-plan lifecycle operations.");
    // Reviewer reminders send mail through the per-event provider, which only the Convex
    // backend stores (encrypted). There is no Airtable-side equivalent to fall back to.
    if (operation === "evaluations.sendReviewerReminders") throw new Error("Reviewer reminders require the Convex backend — Airtable has no email provider store.");
    if (operation.startsWith("organizers.") || operation.startsWith("organizations.") || operation.startsWith("eventMembers.") || operation === "events.listMine" || operation === "events.duplicate" || operation === "events.remove" || operation === "speakers.bulkImport") throw new Error("Airtable does not yet provide the organizer/RBAC boundary.");
    if (operation.startsWith("emailIntegrations.")) throw new Error("Email provider settings require the Convex backend — Airtable has no encrypted credential store.");
    if (operation.startsWith("contentIntegrations.")) throw new Error("Content-source integrations require the Convex backend — Airtable has no encrypted credential store.");
    if (operation.startsWith("comms.")) throw new Error("Communication templates, previews, and sends require the Convex backend — Airtable has no template store or email provider.");
    if (operation.startsWith("apiKeys.")) throw new Error("API key settings require the Convex backend.");
    if (operation.startsWith("activity.")) throw new Error("The activity feed requires the Convex backend.");
    const token = await getToken();
    const response = await fetch("/api/data", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ operation, input }) });
    if (!response.ok) throw new Error(`Airtable adapter request failed (${response.status})`);
    return response.json() as Promise<Result>;
  };
  return { read: request, write: request };
}

// Airtable is always reached through a server-side Cloudflare Pages Function. Its API token
// is deliberately absent from Vite environment variables and browser bundles.
export function createAirtableRepo(transport?: DataTransport, getToken?: TokenGetter): Repository {
  const repo = createRepository(transport ?? createAirtableTransport(getToken));
  const unsupported = async (): Promise<never> => { throw new Error("The Airtable backend does not yet provide speaker submission editing."); };
  return {
    ...repo,
    submissions: { ...repo.submissions, getForSpeaker: unsupported, updateBySpeaker: unsupported },
    speakers: {
      ...repo.speakers,
      list: async (scope) => (await repo.speakers.list(scope)).map((speaker) => ({
        ...speaker,
        confirmationStatus: speaker.confirmationStatus === "confirmed" || speaker.confirmationStatus === "declined" ? speaker.confirmationStatus : "awaiting",
      })),
    },
  };
}
