"use node";

// Shared email delivery for Convex Node actions.
//
// Every send in this app goes through this module: the per-event integration is resolved,
// decrypted, and used, with a RESEND_* environment fallback when no integration is connected.
// It deliberately does NOT live in a Netlify function — the app has to stay portable to other
// hosts, and nothing here is host-specific (see convex/emailIntegrationsActions.ts, which was
// ported off Netlify for the same reason).
//
// Credentials are only ever stored AES-256-GCM encrypted (EMAIL_INTEGRATION_ENCRYPTION_KEY, a
// base64 32-byte key set in the Convex deployment) and never leave this module in plaintext.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Resend } from "resend";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import type { UserIdentity } from "convex/server";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthMethod = "resend_oauth" | "resend_api_key" | "ses_api" | "ses_smtp";
export type Credentials = { apiKey?: string; accessKeyId?: string; secretAccessKey?: string; username?: string; password?: string; accessToken?: string; refreshToken?: string; clientId?: string };
export type Envelope = { version: 1; iv: string; ciphertext: string; tag: string };
export type Integration = { provider: "resend" | "ses"; authMethod: AuthMethod; sender: string; region?: string; credentials: Credentials };
// `html` is optional so every existing plain-text caller (reviewer reminders, confirmation
// email) keeps working unchanged. Callers that render a branded template pass both; providers
// send whichever parts are present so mail clients that prefer plain text still get one.
export type EmailAttachment = { filename: string; content: string; contentType: string };
export type EmailMessage = { to: string; subject: string; text: string; html?: string; attachments?: EmailAttachment[] };

export const providerNotConfigured = "Email provider is not configured.";

// Actions have no ctx.db, so they cannot call assertOrganizer directly. This is the action-side
// equivalent: the same identity, checked against the same `organizers` table row, via the query
// that already owns that rule. ctx.auth propagates into ctx.runQuery.
export async function assertOrganizerAction(ctx: ActionCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  if (!(await ctx.runQuery(api.organizers.isCurrentUserOrganizer, {}))) throw new Error("Forbidden: organizer access required.");
  return identity;
}

// Same fail-closed rule as the query-context `assertEventAccess` (convex/functions.ts): being
// signed in and the event existing is NOT enough — the caller must be an org-wide organizer or
// hold an explicit `event_members` row for this exact event. `api.events.get` only proves the
// event exists, so it must never be used as the access check on its own.
export async function assertEventAccessAction(ctx: ActionCtx, eventId: Id<"events">): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  if (!(await ctx.runQuery(api.eventMembers.hasAccess, { eventId }))) throw new Error("Forbidden: event access required.");
  return identity;
}

function integrationKey() {
  const configured = process.env.EMAIL_INTEGRATION_ENCRYPTION_KEY;
  if (!configured) throw new Error("EMAIL_INTEGRATION_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("EMAIL_INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptCredentials(value: Credentials): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", integrationKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptCredentials(envelope: Envelope): Credentials {
  if (!envelope || envelope.version !== 1) throw new Error("Email integration credentials are unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", integrationKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as Credentials;
}

// A recognizable, non-reversible reference to the stored secret, safe to show in the UI.
export function credentialHint(method: AuthMethod, credentials: Credentials) {
  if (method === "resend_oauth") return "Resend OAuth";
  const raw = credentials.apiKey ?? credentials.accessKeyId ?? credentials.username ?? "";
  return raw.length > 4 ? `••••${raw.slice(-4)}` : "Configured";
}

export function providerForAuthMethod(method: AuthMethod): "resend" | "ses" {
  return method.startsWith("resend") ? "resend" : "ses";
}

async function sendResend({ sender, credentials }: Integration, email: EmailMessage) {
  const attachments = email.attachments?.map((attachment) => ({ filename: attachment.filename, content: attachment.content, content_type: attachment.contentType }));
  if (credentials.accessToken) {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ from: sender, to: [email.to], subject: email.subject, text: email.text, ...(email.html ? { html: email.html } : {}), ...(attachments?.length ? { attachments } : {}) }),
    });
    if (!result.ok) throw new Error(`Resend rejected the message (${result.status}).`);
    return;
  }
  const { error } = await new Resend(credentials.apiKey).emails.send({ from: sender, to: email.to, subject: email.subject, text: email.text, ...(email.html ? { html: email.html } : {}), ...(attachments?.length ? { attachments } : {}) });
  if (error) throw new Error(error.message || "Resend rejected the message.");
}

async function sendSesApi({ sender, region, credentials }: Integration, email: EmailMessage) {
  const client = new SESv2Client({ region, credentials: { accessKeyId: credentials.accessKeyId!, secretAccessKey: credentials.secretAccessKey! } });
  if (email.attachments?.length) {
    await client.send(new SendEmailCommand({ FromEmailAddress: sender, Content: { Raw: { Data: buildRawMime(sender, email) } } }));
    return;
  }
  await client.send(new SendEmailCommand({
    FromEmailAddress: sender,
    Destination: { ToAddresses: [email.to] },
    Content: { Simple: { Subject: { Data: email.subject, Charset: "UTF-8" }, Body: {
      Text: { Data: email.text, Charset: "UTF-8" },
      ...(email.html ? { Html: { Data: email.html, Charset: "UTF-8" } } : {}),
    } } },
  }));
}

async function sendSesSmtp({ sender, region, credentials }: Integration, email: EmailMessage) {
  const transport = nodemailer.createTransport({ host: `email-smtp.${region}.amazonaws.com`, port: 465, secure: true, auth: { user: credentials.username, pass: credentials.password } });
  await transport.sendMail({ from: sender, to: email.to, subject: email.subject, text: email.text, ...(email.html ? { html: email.html } : {}), attachments: email.attachments?.map((attachment) => ({ filename: attachment.filename, content: Buffer.from(attachment.content, "base64"), contentType: attachment.contentType })) });
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function buildRawMime(sender: string, email: EmailMessage): Uint8Array {
  const mixed = `mixed-${randomBytes(12).toString("hex")}`;
  const alternative = `alternative-${randomBytes(12).toString("hex")}`;
  const encode = (value: string) => Buffer.from(value, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd();
  const lines = [
    `From: ${safeHeader(sender)}`,
    `To: ${safeHeader(email.to)}`,
    `Subject: =?UTF-8?B?${Buffer.from(email.subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    encode(email.text),
    ...(email.html ? [`--${alternative}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", encode(email.html)] : []),
    `--${alternative}--`,
    ...(email.attachments ?? []).flatMap((attachment) => [
      `--${mixed}`,
      `Content-Type: ${safeHeader(attachment.contentType)}; name="${safeHeader(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${safeHeader(attachment.filename)}"`,
      "",
      attachment.content.replace(/.{1,76}/g, "$&\r\n").trimEnd(),
    ]),
    `--${mixed}--`,
    "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8");
}

export async function sendWithIntegration(integration: Integration, email: EmailMessage) {
  if (integration.provider === "resend") return sendResend(integration, email);
  if (integration.authMethod === "ses_api") return sendSesApi(integration, email);
  return sendSesSmtp(integration, email);
}

export function deliveryFailure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) return new Error(`Could not reach the email provider: ${message || "network failure"}.`);
  return new Error(message || "The email provider rejected these credentials.");
}

// The connected per-event integration, or the RESEND_* environment fallback, or nothing.
// Callers treat `undefined` as "not configured" and degrade rather than failing the request.
export async function resolveEventIntegration(ctx: ActionCtx, eventId: Id<"events">): Promise<Integration | undefined> {
  const stored = await ctx.runQuery(internal.emailIntegrations.getInternal, { eventId });
  if (stored) {
    return { provider: stored.provider, authMethod: stored.authMethod, sender: stored.sender, region: stored.region, credentials: decryptCredentials(stored.credentialEnvelope) };
  }
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !sender) return undefined;
  return { provider: "resend", authMethod: "resend_api_key", sender, credentials: { apiKey } };
}

/**
 * Sends one message for an event through whichever provider that event has. Throws
 * `providerNotConfigured` when nothing is connected — email degrades, it never blocks, so
 * callers catch this and report it rather than failing the surrounding request.
 */
export async function deliverEventEmail(ctx: ActionCtx, eventId: Id<"events">, email: EmailMessage): Promise<void> {
  const integration = await resolveEventIntegration(ctx, eventId);
  if (!integration) throw new Error(providerNotConfigured);
  try {
    await sendWithIntegration(integration, email);
  } catch (cause) {
    throw deliveryFailure(cause);
  }
}
