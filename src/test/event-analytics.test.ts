import { describe, expect, it } from "vitest";
import { buildEventAnalyticsSummary } from "@/lib/event-analytics";

describe("event analytics summary", () => {
  it("derives count-only operational funnels without exposing source records", () => {
    const now = Date.UTC(2026, 7, 16);
    const summary = buildEventAnalyticsSummary({
      submissions: [
        { id: "accepted-1", status: "accepted" }, { id: "accepted-2", status: "accepted" },
        { id: "declined-1", status: "declined" }, { id: "review-1", status: "maybe" }, { id: "pending-1", status: "pending" },
      ],
      assignments: [{ id: "assignment-1" }, { id: "assignment-2" }],
      evaluations: [{ assignmentId: "assignment-1" }, { assignmentId: "assignment-1" }, {}],
      speakers: [
        { confirmationStatus: "confirmed", bio: "Complete", headshotStorageKey: "storage-key" },
        { confirmationStatus: "awaiting" },
      ],
      agenda: [{ submissionId: "accepted-1", isPublished: true }, { submissionId: "declined-1", isPublished: false }],
      communications: [{ status: "sent" }, { status: "failed" }, { status: "queued" }],
      tasks: [{ status: "completed" }, { status: "pending", dueDate: now - 1 }, { status: "in_progress", dueDate: now + 1 }],
    }, now);
    expect(summary).toMatchObject({
      version: 1,
      submissions: { total: 5, accepted: 2, declined: 1, inReview: 1, acceptanceRate: 66.7 },
      reviews: { assigned: 2, completed: 1, completionRate: 50 },
      speakers: { total: 2, confirmed: 1, profileComplete: 1 },
      agenda: { acceptedSessions: 2, scheduledAccepted: 1, scheduleRate: 50 },
      communications: { total: 3, sent: 1, failed: 1 },
      tasks: { total: 3, completed: 1, overdue: 1, completionRate: 33.3 },
      history: { available: false, daily: [] },
    });
    expect(JSON.stringify(summary)).not.toContain("accepted-1");
    expect(JSON.stringify(summary)).not.toContain("assignment-1");
  });

  it("returns stable zero rates for an empty event", () => {
    const summary = buildEventAnalyticsSummary({ submissions: [], evaluations: [], assignments: [], speakers: [], agenda: [], communications: [], tasks: [] }, 1);
    expect(summary.submissions.acceptanceRate).toBe(0);
    expect(summary.reviews.completionRate).toBe(0);
    expect(summary.agenda.scheduleRate).toBe(0);
    expect(summary.tasks.completionRate).toBe(0);
  });
});
