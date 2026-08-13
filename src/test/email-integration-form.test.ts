import { describe, expect, it } from "vitest";
import type { EmailIntegration } from "@/data/types";
import {
  authMethodsByProvider,
  connectionSummary,
  credentialFieldsFor,
  credentialsFor,
  defaultAuthMethod,
  emptyCredentialDraft,
  hasAnyCredential,
  providerForAuthMethod,
  requiresRegion,
  validateDraft,
} from "@/lib/email-integration-form";

const filled = { ...emptyCredentialDraft, apiKey: "re_live_key", accessKeyId: "AKIA", secretAccessKey: "secret", username: "smtp-user", password: "smtp-pass" };

describe("email integration provider switching", () => {
  it("offers exactly the auth methods each provider supports", () => {
    expect(authMethodsByProvider.resend).toEqual(["resend_api_key", "resend_oauth"]);
    expect(authMethodsByProvider.ses).toEqual(["ses_api", "ses_smtp"]);
  });

  it("derives the provider from the selected auth method", () => {
    expect(providerForAuthMethod("resend_oauth")).toBe("resend");
    expect(providerForAuthMethod("resend_api_key")).toBe("resend");
    expect(providerForAuthMethod("ses_api")).toBe("ses");
    expect(providerForAuthMethod("ses_smtp")).toBe("ses");
  });

  it("defaults each provider to its first supported method", () => {
    expect(defaultAuthMethod("resend")).toBe("resend_api_key");
    expect(defaultAuthMethod("ses")).toBe("ses_api");
  });

  it("shows only the fields the selected method uses, and a region only for SES", () => {
    expect(credentialFieldsFor("resend_api_key")).toEqual(["apiKey"]);
    expect(credentialFieldsFor("ses_api")).toEqual(["accessKeyId", "secretAccessKey"]);
    expect(credentialFieldsFor("ses_smtp")).toEqual(["username", "password"]);
    expect(credentialFieldsFor("resend_oauth")).toEqual([]);
    expect(requiresRegion("resend_api_key")).toBe(false);
    expect(requiresRegion("ses_smtp")).toBe(true);
  });

  it("never transmits credentials belonging to a method that is not selected", () => {
    expect(credentialsFor("resend_api_key", filled)).toEqual({ apiKey: "re_live_key" });
    expect(credentialsFor("ses_api", filled)).toEqual({ accessKeyId: "AKIA", secretAccessKey: "secret" });
    expect(credentialsFor("ses_smtp", filled)).toEqual({ username: "smtp-user", password: "smtp-pass" });
  });

  it("reports whether the current method has anything entered at all", () => {
    expect(hasAnyCredential("ses_smtp", emptyCredentialDraft)).toBe(false);
    expect(hasAnyCredential("ses_smtp", { ...emptyCredentialDraft, username: "smtp-user" })).toBe(true);
    expect(hasAnyCredential("ses_smtp", { ...emptyCredentialDraft, apiKey: "re_live_key" })).toBe(false);
  });
});

describe("email integration validation messages", () => {
  const base = { sender: "events@example.test", region: "us-east-1", draft: filled };

  it("accepts a complete draft for every supported method", () => {
    expect(validateDraft({ ...base, authMethod: "resend_api_key" })).toBeUndefined();
    expect(validateDraft({ ...base, authMethod: "ses_api" })).toBeUndefined();
    expect(validateDraft({ ...base, authMethod: "ses_smtp" })).toBeUndefined();
  });

  it("names the missing credential rather than failing silently", () => {
    expect(validateDraft({ ...base, authMethod: "resend_api_key", draft: emptyCredentialDraft })).toMatch(/Resend API key/);
    expect(validateDraft({ ...base, authMethod: "ses_api", draft: emptyCredentialDraft })).toMatch(/access key ID/);
    expect(validateDraft({ ...base, authMethod: "ses_smtp", draft: emptyCredentialDraft })).toMatch(/SMTP username/);
  });

  it("rejects an invalid sender and an invalid SES region", () => {
    expect(validateDraft({ ...base, sender: "not-an-email", authMethod: "resend_api_key" })).toMatch(/sender email/);
    expect(validateDraft({ ...base, region: "east", authMethod: "ses_api" })).toMatch(/us-east-1/);
    expect(validateDraft({ ...base, region: "", authMethod: "resend_api_key" })).toBeUndefined();
  });

  it("explains that Resend OAuth has no server support yet instead of submitting it", () => {
    expect(validateDraft({ ...base, authMethod: "resend_oauth" })).toMatch(/OAuth is not available/);
  });
});

describe("connection summary", () => {
  const integration = { id: "i1", eventId: "event-a", provider: "resend", authMethod: "resend_api_key", sender: "events@example.test", credentialHint: "••••key", status: "connected", updatedAt: 0 } as unknown as EmailIntegration;

  it("describes the connected provider and method", () => {
    expect(connectionSummary(integration)).toBe("Connected via Resend (API key)");
    expect(connectionSummary({ ...integration, provider: "ses", authMethod: "ses_smtp" })).toBe("Connected via Amazon SES (SMTP)");
  });

  it("falls back to a plain not-connected state", () => {
    expect(connectionSummary(null)).toBe("Not connected");
  });
});
