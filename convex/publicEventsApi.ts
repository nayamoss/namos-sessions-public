export const API_KEY_PATTERN = /^Bearer\s+(sk_live_[A-Fa-f0-9]{48})$/;

export function parseBearerApiKey(authorization: string | null): string | null {
  return authorization?.match(API_KEY_PATTERN)?.[1] ?? null;
}

export function publicApiError(code: string, message: string) {
  return { code, message, details: null };
}

// Internal storage still uses the original field names/values (startDate, endDate, lowercase
// status) — see the events table in schema.ts. The public API's response shape uses its own
// documented names (startsAt/endsAt, uppercase status) independent of internal storage; this
// mapping happens only here, at the response boundary.
type ApiEvent = {
  _id: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  websiteUrl?: string;
  location?: string;
  timezone: string;
  startDate: number;
  endDate: number;
  description?: string;
  programPublishedAt?: number;
  contactEmail?: string;
  logoFileId?: string;
  createdAt: number;
  updatedAt: number;
};

const isoOrNull = (value?: number) => value === undefined ? null : new Date(value).toISOString();

const publicStatus = { draft: "DRAFT", published: "ACTIVE", archived: "ARCHIVED" } as const;

export function projectPublicEvent(event: ApiEvent) {
  return {
    id: event._id,
    name: event.name,
    slug: event.slug,
    status: publicStatus[event.status],
    websiteUrl: event.websiteUrl ?? null,
    location: event.location ?? null,
    timezone: event.timezone,
    startsAt: new Date(event.startDate).toISOString(),
    endsAt: new Date(event.endDate).toISOString(),
    description: event.description ?? null,
    programPublishedAt: isoOrNull(event.programPublishedAt),
    contactEmail: event.contactEmail ?? null,
    logoFileId: event.logoFileId ?? null,
    createdAt: new Date(event.createdAt).toISOString(),
    updatedAt: new Date(event.updatedAt).toISOString(),
  };
}
