"use node";

// Airtable API calls + fixed field mapping for the per-event CMS sync feature (issue #214).
// This is intentionally separate from src/data/airtable, which is the app-wide alternate data
// backend and uses unrelated deployment credentials.
const AIRTABLE_API = "https://api.airtable.com/v0";

export type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records: AirtableRecord[];
  offset?: string;
};

function airtableHeaders(personalAccessToken: string) {
  return { authorization: `Bearer ${personalAccessToken}` };
}

function airtableTableUrl(baseId: string, tableName: string) {
  return `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`;
}

async function throwAirtableError(response: Response): Promise<never> {
  if (response.status === 401 || response.status === 403) {
    throw new Error("That personal access token isn't valid, or doesn't have access to this base.");
  }
  if (response.status === 404) {
    throw new Error("That base or table wasn't found — check the base ID and table name.");
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(
      retryAfter
        ? `Airtable rate limit reached. Retry after ${retryAfter} seconds.`
        : "Airtable rate limit reached. Try again shortly.",
    );
  }
  throw new Error(`Airtable rejected the request (${response.status}).`);
}

/** Validates the PAT, base, and table together before any credential is stored. */
export async function verifyAirtableConnection(
  personalAccessToken: string,
  baseId: string,
  tableName: string,
): Promise<void> {
  const url = new URL(airtableTableUrl(baseId, tableName));
  url.searchParams.set("maxRecords", "1");
  const response = await fetch(url, { headers: airtableHeaders(personalAccessToken) });
  if (!response.ok) await throwAirtableError(response);
}

export async function queryAirtableTable(
  personalAccessToken: string,
  baseId: string,
  tableName: string,
  offset: string | undefined,
): Promise<AirtableListResponse> {
  const url = new URL(airtableTableUrl(baseId, tableName));
  url.searchParams.set("pageSize", "100");
  if (offset) url.searchParams.set("offset", offset);
  const response = await fetch(url, { headers: airtableHeaders(personalAccessToken) });
  if (!response.ok) await throwAirtableError(response);
  return (await response.json()) as AirtableListResponse;
}

function stringField(fields: Record<string, unknown>, name: string): string {
  const value = fields[name];
  return typeof value === "string" ? value.trim() : "";
}

export type MappedAirtableSpeaker = {
  sourceRef: string;
  firstName: string;
  lastName: string;
  email: string;
  bio?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
};

export type MappedAirtableSubmission = {
  sourceRef: string;
  title: string;
  status: "pending" | "accepted" | "declined";
  notes?: string;
};

export function mapAirtableRecordToSpeaker(record: AirtableRecord): MappedAirtableSpeaker | null {
  const email = stringField(record.fields, "Email").toLowerCase();
  if (!email) return null;
  const name = stringField(record.fields, "Name");
  const [firstName, ...rest] = name.split(/\s+/).filter(Boolean);
  const bio = stringField(record.fields, "Bio");
  const linkedinUrl = stringField(record.fields, "LinkedIn");
  const websiteUrl = stringField(record.fields, "Website");
  return {
    sourceRef: `airtable:${record.id}`,
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    email,
    bio: bio || undefined,
    linkedinUrl: linkedinUrl || undefined,
    websiteUrl: websiteUrl || undefined,
  };
}

const submissionStatusByAirtableSelect: Record<string, MappedAirtableSubmission["status"]> = {
  Pending: "pending",
  Accepted: "accepted",
  Declined: "declined",
};

export function mapAirtableRecordToSubmission(record: AirtableRecord): MappedAirtableSubmission | null {
  const title = stringField(record.fields, "Title");
  if (!title) return null;
  const status = submissionStatusByAirtableSelect[stringField(record.fields, "Status")] ?? "pending";
  const notes = stringField(record.fields, "Notes");
  return { sourceRef: `airtable:${record.id}`, title, status, notes: notes || undefined };
}
