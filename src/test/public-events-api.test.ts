import { describe, expect, it } from "vitest";
import { hashApiKey, isApiKeyActive } from "../../convex/apiKeyAuth";
import { parseBearerApiKey, projectPublicEvent, publicApiError } from "../../convex/publicEventsApi";

const rawKey = `sk_live_${"a1".repeat(24)}`;

describe("public events API authentication", () => {
  it("accepts only the documented bearer header", () => {
    expect(parseBearerApiKey(`Bearer ${rawKey}`)).toBe(rawKey);
    expect(parseBearerApiKey(null)).toBeNull();
    expect(parseBearerApiKey(rawKey)).toBeNull();
    expect(parseBearerApiKey("Bearer sk_live_short")).toBeNull();
    expect(parseBearerApiKey(`Basic ${rawKey}`)).toBeNull();
  });

  it("hashes deterministically without retaining the raw key and rejects revoked records", async () => {
    await expect(hashApiKey(rawKey)).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(hashApiKey(rawKey)).resolves.toBe(await hashApiKey(rawKey));
    expect(isApiKeyActive({})).toBe(true);
    expect(isApiKeyActive({ revokedAt: Date.now() })).toBe(false);
    expect(isApiKeyActive(null)).toBe(false);
  });
});

describe("public events API response contract", () => {
  it("projects exact public fields, ISO timestamps, and explicit nulls", () => {
    // Internal storage keeps its original field names/values (startDate, endDate, lowercase
    // status) — projectPublicEvent maps them to the documented public response shape.
    const response = projectPublicEvent({
      _id: "event-1", name: "Namos Sessions", slug: "takumi-talks", status: "published",
      timezone: "America/New_York", startDate: 0, endDate: 1_000, createdAt: 2_000, updatedAt: 3_000,
    });
    expect(response).toEqual({
      id: "event-1", name: "Namos Sessions", slug: "takumi-talks", status: "ACTIVE",
      websiteUrl: null, location: null, timezone: "America/New_York",
      startsAt: "1970-01-01T00:00:00.000Z", endsAt: "1970-01-01T00:00:01.000Z",
      description: null, programPublishedAt: null, contactEmail: null, logoFileId: null,
      createdAt: "1970-01-01T00:00:02.000Z", updatedAt: "1970-01-01T00:00:03.000Z",
    });
    expect(response).not.toHaveProperty("orgId");
  });

  it("uses the structured error body without internal details", () => {
    expect(publicApiError("internal_error", "Something went wrong.")).toEqual({
      code: "internal_error", message: "Something went wrong.", details: null,
    });
  });
});
