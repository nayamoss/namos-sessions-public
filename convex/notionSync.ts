"use node";

// Notion API calls + field mapping for the Notion CMS sync feature (issue #213).
//
// Provider-specific logic lives here so `contentIntegrationsActions.ts` stays provider-agnostic
// — the later Airtable (#214) and Sanity (#215) syncs add their own `airtableSync.ts` /
// `sanitySync.ts` siblings without touching this file or the actions module.
//
// Notion versions its API via a required header — pin it explicitly rather than omitting it,
// so a future Notion API default-version bump can't silently change behavior here.
const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";

export type NotionTarget = "speakers" | "submissions";

type NotionRichText = { plain_text: string }[];
type NotionProperty =
  | { type: "title"; title: NotionRichText }
  | { type: "rich_text"; rich_text: NotionRichText }
  | { type: "email"; email: string | null }
  | { type: "url"; url: string | null }
  | { type: "select"; select: { name: string } | null }
  | { type: "other" };

export type NotionPage = {
  id: string;
  properties: Record<string, NotionProperty>;
};

type NotionQueryResponse = {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

function notionHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "content-type": "application/json",
  };
}

async function notionRetryAfterMessage(response: Response): Promise<never> {
  const retryAfter = response.headers.get("retry-after");
  throw new Error(
    retryAfter
      ? `Notion rate limit reached. Retry after ${retryAfter} seconds.`
      : "Notion rate limit reached. Try again shortly.",
  );
}

/** Validates a Notion internal integration token. A 401 means the token itself is bad. */
export async function verifyNotionToken(token: string): Promise<void> {
  const response = await fetch(`${NOTION_API}/users/me`, { headers: notionHeaders(token) });
  if (response.status === 401) throw new Error("That token isn't valid.");
  if (response.status === 429) await notionRetryAfterMessage(response);
  if (!response.ok) throw new Error(`Notion rejected the token (${response.status}).`);
}

/**
 * Validates a Notion database id is reachable with this token. A 404 is the single most common
 * Notion integration failure — the database exists but hasn't been shared with the integration
 * — so it gets its own specific message rather than a generic "not found".
 */
export async function verifyNotionDatabase(token: string, databaseId: string): Promise<void> {
  const response = await fetch(`${NOTION_API}/databases/${databaseId}`, { headers: notionHeaders(token) });
  if (response.status === 404) throw new Error("That database isn't shared with your Notion integration yet.");
  if (response.status === 401) throw new Error("That token isn't valid.");
  if (response.status === 429) await notionRetryAfterMessage(response);
  if (!response.ok) throw new Error(`Notion rejected the database lookup (${response.status}).`);
}

export type NotionDatabaseOption = { id: string; title: string };
/** Lists databases selected for the public OAuth integration; no URL-derived ID is required. */
export async function listNotionDatabases(token: string): Promise<NotionDatabaseOption[]> {
  const response = await fetch(`${NOTION_API}/search`, { method: "POST", headers: notionHeaders(token), body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 100 }) });
  if (response.status === 401) throw new Error("Notion authorization expired. Reconnect Notion to continue.");
  if (!response.ok) throw new Error(`Notion could not list databases (${response.status}).`);
  const body = await response.json() as { results?: Array<{ id: string; title?: NotionRichText }> };
  return (body.results ?? []).map((database) => ({ id: database.id, title: (database.title ?? []).map((part) => part.plain_text).join("").trim() || "Untitled database" }));
}

export async function queryNotionDatabase(
  token: string,
  databaseId: string,
  startCursor: string | undefined,
): Promise<NotionQueryResponse> {
  const response = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({ page_size: 100, ...(startCursor ? { start_cursor: startCursor } : {}) }),
  });
  if (response.status === 429) await notionRetryAfterMessage(response);
  if (response.status === 404) throw new Error("That database isn't shared with your Notion integration yet.");
  if (response.status === 401) throw new Error("That token isn't valid.");
  if (!response.ok) throw new Error(`Notion rejected the database query (${response.status}).`);
  return (await response.json()) as NotionQueryResponse;
}

function titleText(property: NotionProperty | undefined): string {
  if (!property || property.type !== "title") return "";
  return property.title.map((segment) => segment.plain_text).join("").trim();
}

function richText(property: NotionProperty | undefined): string {
  if (!property || property.type !== "rich_text") return "";
  return property.rich_text.map((segment) => segment.plain_text).join("").trim();
}

function emailValue(property: NotionProperty | undefined): string {
  if (!property || property.type !== "email") return "";
  return (property.email ?? "").trim();
}

function urlValue(property: NotionProperty | undefined): string | undefined {
  if (!property || property.type !== "url") return undefined;
  const value = (property.url ?? "").trim();
  return value || undefined;
}

function selectValue(property: NotionProperty | undefined): string {
  if (!property || property.type !== "select") return "";
  return property.select?.name ?? "";
}

export type MappedSpeaker = {
  sourceRef: string;
  firstName: string;
  lastName: string;
  email: string;
  bio?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
};

export type MappedSubmission = {
  sourceRef: string;
  title: string;
  status: "pending" | "accepted" | "declined";
  notes?: string;
};

// Field Mapping (design.md): `Name` (title) -> firstName/lastName, `Email` (email, required),
// `Bio` (rich_text), `LinkedIn` (url), `Website` (url). Row is skipped (returns null) when the
// required field is empty — the caller counts these in `skipped`, never silently drops them.
export function mapNotionPageToSpeaker(page: NotionPage): MappedSpeaker | null {
  const email = emailValue(page.properties.Email).toLowerCase();
  if (!email) return null;
  const name = titleText(page.properties.Name);
  const [firstName, ...rest] = name.split(/\s+/).filter(Boolean);
  return {
    sourceRef: `notion:${page.id}`,
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    email,
    bio: richText(page.properties.Bio) || undefined,
    linkedinUrl: urlValue(page.properties.LinkedIn),
    websiteUrl: urlValue(page.properties.Website),
  };
}

const submissionStatusByNotionSelect: Record<string, MappedSubmission["status"]> = {
  Pending: "pending",
  Accepted: "accepted",
  Declined: "declined",
};

// Field Mapping (design.md): `Title` (title, required), `Status` (select, defaults to
// "pending" for unrecognized values), `Notes` (rich_text) -> answers.notes.
export function mapNotionPageToSubmission(page: NotionPage): MappedSubmission | null {
  const title = titleText(page.properties.Title);
  if (!title) return null;
  const status = submissionStatusByNotionSelect[selectValue(page.properties.Status)] ?? "pending";
  const notes = richText(page.properties.Notes);
  return { sourceRef: `notion:${page.id}`, title, status, notes: notes || undefined };
}
