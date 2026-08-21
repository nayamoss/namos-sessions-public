"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertEventOrganizerAction } from "./emailDelivery";

type VerifyResult = { ok: boolean; observedMx: string[]; expectedMx: string };

export const verifyDomain = action({
  args: { eventId: v.id("events"), domainId: v.id("inbound_email_domains") },
  handler: async (ctx, args): Promise<VerifyResult> => {
    await assertEventOrganizerAction(ctx, args.eventId);
    const row = await ctx.runQuery(internal.commsInbox.getDomainForVerification, { domainId: args.domainId });
    if (!row || row.eventId !== args.eventId) throw new Error("Reply domain not found.");
    const expectedMx = row.expectedMx?.toLowerCase();
    if (!expectedMx) throw new Error("Expected MX is not configured.");
    let observedMx: string[] = [];
    let failureReason: string | undefined;
    try {
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(row.domain)}&type=MX`, {
        headers: { accept: "application/dns-json" },
      });
      if (!response.ok) throw new Error("DNS lookup failed.");
      const body = await response.json() as { Answer?: Array<{ data?: string }> };
      observedMx = (body.Answer ?? []).flatMap((answer) => {
        const match = /^(\d+)\s+(.+?)\.?$/.exec(answer.data?.trim() ?? "");
        return match ? [`${match[1]} ${match[2].toLowerCase()}`] : [];
      });
    } catch {
      failureReason = "MX records could not be verified.";
    }
    const ok = observedMx.some((entry) => entry.split(/\s+/).slice(1).join(" ") === expectedMx);
    if (!ok && !failureReason) failureReason = "Expected provider MX record was not found.";
    await ctx.runMutation(internal.commsInbox.recordDnsVerification, { domainId: row._id, ok, observedMx, ...(failureReason ? { failureReason } : {}) });
    return { ok, observedMx, expectedMx };
  },
});
