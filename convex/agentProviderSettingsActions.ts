"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertEventOrganizerAction } from "./emailDelivery";
import { agentCredentialHint, encryptAgentApiKey } from "./agentProviderSecrets";

function safeVerificationError(status?: number) {
  if (status === 401 || status === 403) return "OpenAI rejected this API key.";
  return "The OpenAI key could not be verified. Check the key and try again.";
}

export const saveManaged = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    if (!process.env.OPENAI_API_KEY) throw new Error("Namos-managed AI is not configured on this deployment.");
    await ctx.runMutation(internal.agentProviderSettings.upsertInternal, { eventId: args.eventId, mode: "managed", status: "ready", updatedByUserId: identity.subject });
    return { mode: "managed" as const, status: "ready" as const };
  },
});

export const saveByok = action({
  args: { eventId: v.id("events"), apiKey: v.string() },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAction(ctx, args.eventId);
    const apiKey = args.apiKey.trim();
    if (apiKey.length < 20) throw new Error("Enter a valid OpenAI API key.");
    let response: Response;
    try { response = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` } }); }
    catch { throw new Error(safeVerificationError()); }
    if (!response.ok) throw new Error(safeVerificationError(response.status));
    await ctx.runMutation(internal.agentProviderSettings.upsertInternal, { eventId: args.eventId, mode: "bring_your_own", credentialHint: agentCredentialHint(apiKey), credentialEnvelope: encryptAgentApiKey(apiKey), status: "ready", updatedByUserId: identity.subject });
    return { mode: "bring_your_own" as const, status: "ready" as const };
  },
});
