"use node";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type AgentCredentialEnvelope = { version: 1; iv: string; ciphertext: string; tag: string };

function encryptionKey() {
  const configured = process.env.AI_INTEGRATION_ENCRYPTION_KEY;
  if (!configured) throw new Error("AI credential encryption is not configured.");
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("AI_INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptAgentApiKey(apiKey: string): AgentCredentialEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ apiKey }), "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptAgentApiKey(envelope: AgentCredentialEnvelope): string {
  if (!envelope || envelope.version !== 1) throw new Error("Organizer AI credentials are unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(plaintext) as { apiKey?: unknown };
  if (typeof parsed.apiKey !== "string" || !parsed.apiKey) throw new Error("Organizer AI credentials are unavailable.");
  return parsed.apiKey;
}

export function agentCredentialHint(apiKey: string) {
  return apiKey.length > 4 ? `••••${apiKey.slice(-4)}` : "Configured";
}
