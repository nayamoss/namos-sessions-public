"use node";

// Per-event email provider configuration, owned by Convex.
//
// This module deliberately does NOT live in a Netlify function: the app has to stay portable to
// other hosts, and none of this logic is host-specific. A Convex Node action can do everything
// the function did — node:crypto for credential encryption, the Resend/SES/SMTP SDKs for
// delivery — while getting a verified caller identity for free from ctx.auth, with no manual
// JWT verification step and no env-var admin allowlist.
//
// Credentials are only ever stored AES-256-GCM encrypted (EMAIL_INTEGRATION_ENCRYPTION_KEY, a
// base64 32-byte key set in the Convex deployment) and are never returned to any client.
//
// The encryption and provider-send primitives live in convex/emailDelivery.ts so every Convex
// action that sends mail (this one, reviewerRemindersActions.ts) shares one implementation.

import { v } from "convex/values";
import type { UserIdentity } from "convex/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  assertEventAccessAction, credentialHint, decryptCredentials, deliveryFailure, emailPattern,
  encryptCredentials, providerForAuthMethod, sendWithIntegration,
  type AuthMethod, type Credentials, type Integration,
} from "./emailDelivery";

const regionPattern = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;

const authMethod = v.union(v.literal("resend_oauth"), v.literal("resend_api_key"), v.literal("ses_api"), v.literal("ses_smtp"));
const credentialsArg = v.object({
  apiKey: v.optional(v.string()),
  accessKeyId: v.optional(v.string()),
  secretAccessKey: v.optional(v.string()),
  username: v.optional(v.string()),
  password: v.optional(v.string()),
});

function organizerEmail(identity: UserIdentity): string {
  const address = typeof identity.email === "string" ? identity.email.trim() : "";
  if (!address || !emailPattern.test(address)) throw new Error("Your account needs a verified email address before a test message can be sent.");
  if (identity.emailVerified === false) throw new Error("Your account email is not verified yet, so a test message cannot be sent to it.");
  return address;
}

// Rejects an incomplete form before any provider is contacted, so "no credentials entered"
// never surfaces as an opaque provider error.
function assertCredentials(method: AuthMethod, credentials: Credentials, region: string) {
  if (providerForAuthMethod(method) === "ses" && !regionPattern.test(region)) throw new Error("Amazon SES requires a valid AWS region, such as us-east-1.");
  const filled = (value?: string) => typeof value === "string" && value.trim().length > 0;
  if (method === "resend_api_key" && !filled(credentials.apiKey)) throw new Error("A Resend API key is required.");
  if (method === "ses_api" && !(filled(credentials.accessKeyId) && filled(credentials.secretAccessKey))) throw new Error("An AWS access key ID and secret access key are required.");
  if (method === "ses_smtp" && !(filled(credentials.username) && filled(credentials.password))) throw new Error("An SES SMTP username and password are required.");
  if (method === "resend_oauth") throw new Error("Resend OAuth is not available yet. Connect with a Resend API key instead.");
}

const testMessage = { subject: "Takumi Talks email delivery test", text: "Your event email connection is working." };

// Saves only after a live send succeeds, so a stored integration is always one that worked at
// least once. The plaintext credentials never leave this action.
export const save = action({
  args: { eventId: v.id("events"), authMethod, sender: v.string(), region: v.optional(v.string()), credentials: credentialsArg },
  handler: async (ctx, args) => {
    const identity = await assertEventAccessAction(ctx, args.eventId);
    const sender = args.sender.trim();
    if (!emailPattern.test(sender)) throw new Error("Sender address must be a valid email address.");
    const region = args.region?.trim() ?? "";
    const credentials: Credentials = args.credentials;
    assertCredentials(args.authMethod, credentials, region);
    const provider = providerForAuthMethod(args.authMethod);
    const recipient = organizerEmail(identity);
    const integration: Integration = { provider, authMethod: args.authMethod, sender, ...(region ? { region } : {}), credentials };
    try {
      await sendWithIntegration(integration, { to: recipient, ...testMessage });
    } catch (cause) {
      throw deliveryFailure(cause);
    }
    await ctx.runMutation(internal.emailIntegrations.upsertInternal, {
      eventId: args.eventId, provider, authMethod: args.authMethod, sender, ...(region ? { region } : {}),
      credentialHint: credentialHint(args.authMethod, credentials), credentialEnvelope: encryptCredentials(credentials),
      status: "connected", updatedByUserId: identity.subject,
    });
    return { status: "connected" as const, testRecipient: recipient };
  },
});

// Re-tests the stored connection and records the outcome on the integration record.
export const test = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventAccessAction(ctx, args.eventId);
    const stored = await ctx.runQuery(internal.emailIntegrations.getInternal, { eventId: args.eventId });
    if (!stored) throw new Error("No event email provider is connected yet.");
    const recipient = organizerEmail(identity);
    try {
      await sendWithIntegration({ provider: stored.provider, authMethod: stored.authMethod, sender: stored.sender, region: stored.region, credentials: decryptCredentials(stored.credentialEnvelope) }, { to: recipient, ...testMessage });
    } catch (cause) {
      const failure = deliveryFailure(cause);
      await ctx.runMutation(internal.emailIntegrations.upsertInternal, {
        eventId: args.eventId, provider: stored.provider, authMethod: stored.authMethod, sender: stored.sender, ...(stored.region ? { region: stored.region } : {}),
        credentialHint: stored.credentialHint, credentialEnvelope: stored.credentialEnvelope, status: "error", lastError: failure.message.slice(0, 500), updatedByUserId: identity.subject,
      });
      throw failure;
    }
    await ctx.runMutation(internal.emailIntegrations.upsertInternal, {
      eventId: args.eventId, provider: stored.provider, authMethod: stored.authMethod, sender: stored.sender, ...(stored.region ? { region: stored.region } : {}),
      credentialHint: stored.credentialHint, credentialEnvelope: stored.credentialEnvelope, status: "connected", updatedByUserId: identity.subject,
    });
    return { status: "sent" as const, testRecipient: recipient };
  },
});

export const disconnect = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccessAction(ctx, args.eventId);
    const stored = await ctx.runQuery(internal.emailIntegrations.getInternal, { eventId: args.eventId });
    if (stored?.authMethod === "resend_oauth") {
      const credentials = decryptCredentials(stored.credentialEnvelope);
      // Best effort: a failed revoke must never leave the organizer stuck with a record they
      // asked to delete.
      await fetch("https://api.resend.com/oauth/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: credentials.clientId ?? "", token: credentials.refreshToken ?? "", token_type_hint: "refresh_token" }),
      }).catch(() => undefined);
    }
    await ctx.runMutation(internal.emailIntegrations.removeInternal, { eventId: args.eventId });
    return { status: "disconnected" as const };
  },
});
