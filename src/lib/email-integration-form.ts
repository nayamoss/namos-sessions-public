import type { EmailAuthMethod, EmailIntegration, EmailIntegrationCredentials, EmailProvider } from "@/data/types";

// Pure form logic for the email delivery settings screen. It is deliberately free of React and
// of the repository so provider/auth-method switching and per-method validation can be reasoned
// about — and tested — without a backend round-trip.

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const regionPattern = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;

export const providerLabel: Record<EmailProvider, string> = { resend: "Resend", ses: "Amazon SES" };
export const authMethodLabel: Record<EmailAuthMethod, string> = {
  resend_oauth: "OAuth",
  resend_api_key: "API key",
  ses_api: "API access key",
  ses_smtp: "SMTP",
};

/** The first entry for each provider is that provider's default method. */
export const authMethodsByProvider: Record<EmailProvider, EmailAuthMethod[]> = {
  resend: ["resend_api_key", "resend_oauth"],
  ses: ["ses_api", "ses_smtp"],
};

export function providerForAuthMethod(method: EmailAuthMethod): EmailProvider {
  return method.startsWith("resend") ? "resend" : "ses";
}

export function defaultAuthMethod(provider: EmailProvider): EmailAuthMethod {
  return authMethodsByProvider[provider][0];
}

export interface CredentialDraft {
  apiKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  username: string;
  password: string;
}

export const emptyCredentialDraft: CredentialDraft = { apiKey: "", accessKeyId: "", secretAccessKey: "", username: "", password: "" };

/** Which draft fields a given method actually uses — everything else is never transmitted. */
export function credentialFieldsFor(method: EmailAuthMethod): (keyof CredentialDraft)[] {
  if (method === "resend_api_key") return ["apiKey"];
  if (method === "ses_api") return ["accessKeyId", "secretAccessKey"];
  if (method === "ses_smtp") return ["username", "password"];
  return [];
}

export function requiresRegion(method: EmailAuthMethod) {
  return providerForAuthMethod(method) === "ses";
}

export function credentialsFor(method: EmailAuthMethod, draft: CredentialDraft): EmailIntegrationCredentials {
  return Object.fromEntries(credentialFieldsFor(method).map((field) => [field, draft[field].trim()]));
}

export function hasAnyCredential(method: EmailAuthMethod, draft: CredentialDraft) {
  return credentialFieldsFor(method).some((field) => draft[field].trim().length > 0);
}

/** Returns the single most useful message for the first problem found, or undefined. */
export function validateDraft(input: { authMethod: EmailAuthMethod; sender: string; region: string; draft: CredentialDraft }): string | undefined {
  const { authMethod, sender, region, draft } = input;
  if (authMethod === "resend_oauth") return "Resend OAuth is not available yet. Connect with a Resend API key instead.";
  if (!emailPattern.test(sender.trim())) return "Enter a valid sender email address.";
  if (requiresRegion(authMethod) && !regionPattern.test(region.trim())) return "Enter a valid AWS region, such as us-east-1.";
  const missing = credentialFieldsFor(authMethod).filter((field) => !draft[field].trim());
  if (!missing.length) return undefined;
  if (authMethod === "resend_api_key") return "Enter your Resend API key.";
  if (authMethod === "ses_api") return "Enter both an AWS access key ID and secret access key.";
  return "Enter both an SES SMTP username and password.";
}

export function connectionSummary(integration: EmailIntegration | null | undefined): string {
  if (!integration) return "Not connected";
  return `Connected via ${providerLabel[integration.provider]} (${authMethodLabel[integration.authMethod]})`;
}
