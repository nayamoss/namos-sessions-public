"use node";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decrypt, encrypt, type CredentialEnvelope } from "./credentialEncryption";

export type SlackTokenEnvelope = CredentialEnvelope;

export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verifySlackRequest(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
  nowMs?: number;
}): boolean {
  if (!input.timestamp || !input.signature || !/^\d+$/.test(input.timestamp)) return false;
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 300) return false;
  const expected = `v0=${createHmac("sha256", input.signingSecret)
    .update(`v0:${input.timestamp}:${input.rawBody}`)
    .digest("hex")}`;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(input.signature);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function encryptionKey(): string {
  const value = process.env.SLACK_INTEGRATION_ENCRYPTION_KEY;
  if (!value) throw new Error("Slack token encryption is not configured.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("Slack token encryption is not configured correctly.");
  return value;
}

export function encryptSlackToken(token: string): SlackTokenEnvelope {
  if (!token.trim()) throw new Error("Slack did not return a bot token.");
  return encrypt(token, encryptionKey());
}

export function decryptSlackToken(envelope: SlackTokenEnvelope): string {
  if (!envelope || envelope.version !== 1) throw new Error("Slack credentials are unavailable.");
  return decrypt(envelope, encryptionKey());
}

export function safeSlackError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Slack request failed.";
  return message
    .replace(/xox[baprs]-[A-Za-z0-9-]+/gi, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https:\/\/hooks\.slack\.com\/\S+/gi, "[redacted]")
    .replace(/https:\/\/slack\.com\/api\/\S+response_url\S*/gi, "[redacted]")
    .slice(0, 500);
}
