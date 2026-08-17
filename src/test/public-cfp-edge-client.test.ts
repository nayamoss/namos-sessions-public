import { afterEach, describe, expect, it, vi } from "vitest";
import { submitPublicFormAtEdge } from "@/data/convex";

const submission = {
  eventSlug: "demo-event",
  formId: "form-1",
  idempotencyKey: "retry-key-123",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.test",
  title: "A proposal",
  answers: { "field-1": "Value" },
  turnstileToken: "single-use-proof",
};

afterEach(() => vi.restoreAllMocks());

describe("public CFP edge client", () => {
  it("sends proof to the same-origin endpoint and forwards Clerk auth without putting proof in Convex input", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ speakerId: "speaker-1" }));

    await expect(submitPublicFormAtEdge(submission, "clerk-token")).resolves.toEqual({ speakerId: "speaker-1" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/public/cfp-submissions");
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer clerk-token");
    expect(JSON.parse(String(init?.body))).toEqual({
      input: { eventSlug: "demo-event", formId: "form-1", idempotencyKey: "retry-key-123", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", title: "A proposal", answers: { "field-1": "Value" } },
      turnstileToken: "single-use-proof",
    });
  });

  it("maps throttling and verification failures to generic user-safe errors", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "rate_limited" }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ error: "verification_failed" }, { status: 403 }));

    await expect(submitPublicFormAtEdge(submission)).rejects.toThrow("Submission rate limit reached.");
    await expect(submitPublicFormAtEdge(submission)).rejects.toThrow("Submission verification failed.");
  });
});
