"use node";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type CredentialEnvelope = {
  version: 1;
  iv: string;
  ciphertext: string;
  tag: string;
};

function encryptionKey(envKey: string) {
  const key = Buffer.from(envKey, "base64");
  if (key.length !== 32) throw new Error("Credential encryption keys must be base64-encoded 32-byte keys.");
  return key;
}

export function encrypt(plaintext: string, envKey: string): CredentialEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(envKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt(envelope: CredentialEnvelope, envKey: string): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(envKey),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
