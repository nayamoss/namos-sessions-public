"use node";

const SANITY_API_VERSION = "2023-05-03";
const MAX_MUTATIONS_PER_REQUEST = 50;

export type SanitySessionSource = {
  _id: string;
  title: string;
  startTime: number;
  endTime: number;
  speakerIds: string[];
  videoUrl?: string;
};

export type SanitySpeakerSource = {
  _id: string;
  firstName: string;
  lastName: string;
  bio?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
};

export type SanityDocument = {
  _id: string;
  _type: "namosSession" | "namosSpeaker";
  [key: string]: unknown;
};

export type SanityPublishFailure = { name: string; reason: string };
export type SanityPublishDocument = { name: string; document: SanityDocument };

function assertSanityLocation(projectId: string, dataset: string) {
  if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error("Enter a valid Sanity project ID.");
  if (!/^[A-Za-z0-9_-]+$/.test(dataset)) throw new Error("Enter a valid Sanity dataset name.");
}

function sanityEndpoint(projectId: string, dataset: string, operation: "query" | "mutate") {
  assertSanityLocation(projectId, dataset);
  return `https://${projectId}.api.sanity.io/v${SANITY_API_VERSION}/data/${operation}/${encodeURIComponent(dataset)}`;
}

function sanityHeaders(apiToken: string) {
  return { authorization: `Bearer ${apiToken}`, "content-type": "application/json" };
}

async function sanityErrorReason(response: Response) {
  try {
    const body = await response.json() as {
      error?: { description?: string; message?: string } | string;
      message?: string;
    };
    if (typeof body.error === "string") return body.error;
    return body.error?.description ?? body.error?.message ?? body.message ?? `Sanity rejected the request (${response.status}).`;
  } catch {
    return `Sanity rejected the request (${response.status}).`;
  }
}

async function throwSanityConnectionError(response: Response, operation: "read" | "write"): Promise<never> {
  if (response.status === 401) throw new Error("That API token isn't valid.");
  if (response.status === 404) throw new Error("That project ID or dataset wasn't found.");
  if (response.status === 403 && operation === "write") {
    throw new Error("That token doesn't have write access — create one with Editor permissions in manage.sanity.io.");
  }
  throw new Error(await sanityErrorReason(response));
}

export async function verifySanityConnection(
  apiToken: string,
  projectId: string,
  dataset: string,
): Promise<void> {
  const queryUrl = new URL(sanityEndpoint(projectId, dataset, "query"));
  queryUrl.searchParams.set("query", "*[0]");
  const queryResponse = await fetch(queryUrl, { headers: sanityHeaders(apiToken) });
  if (!queryResponse.ok) await throwSanityConnectionError(queryResponse, "read");

  const mutateUrl = new URL(sanityEndpoint(projectId, dataset, "mutate"));
  mutateUrl.searchParams.set("returnIds", "true");
  const mutateResponse = await fetch(mutateUrl, {
    method: "POST",
    headers: sanityHeaders(apiToken),
    body: JSON.stringify({ mutations: [] }),
  });
  if (!mutateResponse.ok) await throwSanityConnectionError(mutateResponse, "write");
}

export function buildSanitySessionDocument(source: SanitySessionSource): SanityDocument {
  const title = source.title.trim();
  if (!title) throw new Error("Session title is required.");
  return {
    _type: "namosSession",
    _id: `namosSession-${source._id}`,
    title,
    startTime: new Date(source.startTime).toISOString(),
    endTime: new Date(source.endTime).toISOString(),
    speakerRefs: source.speakerIds.map((speakerId) => ({
      _type: "reference",
      _ref: `namosSpeaker-${speakerId}`,
    })),
    ...(source.videoUrl ? { videoUrl: source.videoUrl } : {}),
  };
}

export function buildSanitySpeakerDocument(source: SanitySpeakerSource): SanityDocument {
  const name = `${source.firstName} ${source.lastName}`.trim();
  if (!name) throw new Error("Speaker name is required.");
  return {
    _type: "namosSpeaker",
    _id: `namosSpeaker-${source._id}`,
    name,
    ...(source.bio ? { bio: source.bio } : {}),
    ...(source.linkedinUrl ? { linkedinUrl: source.linkedinUrl } : {}),
    ...(source.websiteUrl ? { websiteUrl: source.websiteUrl } : {}),
  };
}

async function mutateSanity(
  apiToken: string,
  projectId: string,
  dataset: string,
  documents: SanityPublishDocument[],
) {
  if (documents.length > MAX_MUTATIONS_PER_REQUEST) {
    throw new Error(`Sanity publish batches cannot exceed ${MAX_MUTATIONS_PER_REQUEST} documents.`);
  }
  const response = await fetch(sanityEndpoint(projectId, dataset, "mutate"), {
    method: "POST",
    headers: sanityHeaders(apiToken),
    body: JSON.stringify({
      mutations: documents.map(({ document }) => ({ createOrReplace: document })),
    }),
  });
  return { response, reason: response.ok ? undefined : await sanityErrorReason(response) };
}

/**
 * Publishes one <=50-document batch. A Sanity validation error makes its transaction fail as a
 * unit, so a failed batch is retried one document at a time to isolate bad rows while allowing
 * valid rows through. Authentication, rate-limit, and provider failures still abort the run.
 */
export async function publishSanityBatch(
  apiToken: string,
  projectId: string,
  dataset: string,
  documents: SanityPublishDocument[],
): Promise<{ successfulIds: string[]; failures: SanityPublishFailure[] }> {
  if (documents.length === 0) return { successfulIds: [], failures: [] };
  const batch = await mutateSanity(apiToken, projectId, dataset, documents);
  if (batch.response.ok) {
    return { successfulIds: documents.map(({ document }) => document._id), failures: [] };
  }
  if (batch.response.status === 401) throw new Error("That API token isn't valid.");
  if (batch.response.status === 403) throw new Error("The stored Sanity token no longer has write access.");
  if (batch.response.status === 404) throw new Error("That project ID or dataset wasn't found.");
  if (batch.response.status === 429) throw new Error("Sanity rate limit reached. Try publishing again shortly.");
  if (batch.response.status !== 400) throw new Error(batch.reason);

  const successfulIds: string[] = [];
  const failures: SanityPublishFailure[] = [];
  for (const item of documents) {
    const single = await mutateSanity(apiToken, projectId, dataset, [item]);
    if (single.response.ok) {
      successfulIds.push(item.document._id);
    } else if (single.response.status === 400) {
      failures.push({ name: item.name, reason: single.reason ?? "Sanity rejected this document." });
    } else if (single.response.status === 429) {
      throw new Error("Sanity rate limit reached. Try publishing again shortly.");
    } else {
      throw new Error(single.reason);
    }
  }
  return { successfulIds, failures };
}
