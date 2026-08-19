import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CRM campaign handoff", () => {
  it("keeps recipient IDs out of URLs and resolves event-scoped contacts in Convex", () => {
    const contacts = readFileSync("src/pages/program/Contacts.tsx", "utf8");
    const comms = readFileSync("src/pages/program/Communications.tsx", "utf8");
    const action = readFileSync("convex/commsActions.ts", "utf8");
    const data = readFileSync("convex/commsData.ts", "utf8");
    expect(contacts).toContain("state={{ crmContactIds: selection }}");
    expect(contacts).not.toContain("?crmContactIds=");
    expect(comms).toContain("sendCrmCampaign");
    const campaign = action.slice(action.indexOf("export const sendCrmCampaign"));
    expect(campaign).toContain("assertEventOrganizerAction(ctx, args.eventId)");
    expect(campaign).toContain("internal.commsData.crmCampaignRecipients");
    expect(campaign).toContain("CrmCampaignSendBatch");
    expect(campaign).not.toContain("results:");
    expect(data).toContain('withIndex("by_event_contact"');
  });
});
