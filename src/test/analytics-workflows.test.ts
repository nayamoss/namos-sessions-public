import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({
  analyticsErrorCategory: () => "validation",
  track: captured,
}));

import { createRepository, type DataTransport } from "@/data/transport";
import type { EventId } from "@/data/types";

describe("workflow analytics instrumentation", () => {
  beforeEach(() => captured.mockClear());

  it("captures approved public-submission counts without submitted content", async () => {
    const transport: DataTransport = { read: vi.fn(), write: vi.fn().mockResolvedValue({ speakerId: "speaker-private" }) };
    const repo = createRepository(transport);
    await repo.publicForms.submit({
      eventSlug: "private-event-slug", formId: "private-form-id", idempotencyKey: "private-key", firstName: "Jordan", lastName: "Lee", email: "jordan@example.com", title: "Private talk", answers: { abstract: "Secret content" }, participants: [{ role: "co-speaker", answers: { bio: "Private" } }], turnstileToken: "secret-token",
    });
    expect(captured).toHaveBeenCalledWith("public_submission_completed", { participant_count: 1 });
    expect(JSON.stringify(captured.mock.calls)).not.toContain("jordan@example.com");
    expect(JSON.stringify(captured.mock.calls)).not.toContain("Secret content");
    expect(JSON.stringify(captured.mock.calls)).not.toContain("private-event-slug");
  });

  it("captures a coarse failure category and rethrows the original error", async () => {
    const transport: DataTransport = { read: vi.fn(), write: vi.fn().mockRejectedValue(new Error("form closed for jordan@example.com")) };
    const repo = createRepository(transport);
    await expect(repo.publicForms.submit({ eventSlug: "event", formId: "form", idempotencyKey: "key", firstName: "A", lastName: "B", email: "a@example.com", title: "Talk", answers: {}, turnstileToken: "token" })).rejects.toThrow("form closed");
    expect(captured).toHaveBeenCalledWith("public_submission_failed", { error_category: "validation" });
    expect(JSON.stringify(captured.mock.calls)).not.toContain("a@example.com");
  });

  it("tracks representative organizer workflow outcomes at the mutation boundary", async () => {
    const transport: DataTransport = { read: vi.fn(), write: vi.fn().mockResolvedValue({ created: 3, skipped: 1 }) };
    const repo = createRepository(transport);
    await repo.evaluations.assignByFilter({ eventId: "event-1" as EventId, evaluationPlanId: "plan-1", reviewerUserIds: ["user-private"], round: 1, filter: { kind: "track", trackId: "track-private" } });
    expect(captured).toHaveBeenCalledWith("review_assignments_created", { created_count: 3, skipped_count: 1 });
    expect(JSON.stringify(captured.mock.calls)).not.toContain("user-private");
    expect(JSON.stringify(captured.mock.calls)).not.toContain("track-private");
  });
});
