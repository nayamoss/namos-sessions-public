import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { UserIdentity } from "convex/server";
import { reviewerProgress } from "../../convex/evaluations";
import type { QueryCtx } from "../../convex/_generated/server";
import { ReviewerProgressPanel } from "@/components/evaluation/ReviewerProgressPanel";
import { RepoContext, type Repository, type ReviewerReminderSend } from "@/data/repo";
import type { EvaluationPlan, EventId, ReviewerProgressRow, ReviewerReminderBatch } from "@/data/types";

// ---------------------------------------------------------------------------
// Convex query: derived progress, organizer-gated, event-scoped.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown> & { _id: string };

function fakeCtx(identity?: UserIdentity, overrides: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    // Authorization is tenant-scoped: the organizer and both events must resolve to the same
    // organization, or the guards deny. event-2 is deliberately in the same org so the
    // "plan belongs to another event" case still tests event scoping, not tenant scoping.
    organizations: [{ _id: "org-1", name: "Test org", createdByUserId: "clerk|organizer" }],
    organizers: [{ _id: "organizer-1", organizationId: "org-1", userId: "clerk|organizer", email: "organizer@example.test", role: "owner" }],
    events: [
      { _id: "event-1", organizationId: "org-1", name: "Test event", slug: "test-event", status: "published" },
      { _id: "event-2", organizationId: "org-1", name: "Other event", slug: "other-event", status: "published" },
    ],
    speakers: [{ _id: "speaker-1", eventId: "event-1", email: "speaker@example.test", firstName: "Ada", lastName: "Lovelace" }],
    evaluation_plans: [{ _id: "plan-1", eventId: "event-1", name: "Program committee", rounds: 1, scoringScaleMax: 5 }, { _id: "plan-2", eventId: "event-2", name: "Other event plan", rounds: 1, scoringScaleMax: 5 }],
    evaluation_assignments: [
      { _id: "a1", eventId: "event-1", evaluationPlanId: "plan-1", submissionId: "s1", reviewerUserId: "chair@example.test", round: 1 },
      { _id: "a2", eventId: "event-1", evaluationPlanId: "plan-1", submissionId: "s2", reviewerUserId: "chair@example.test", round: 1 },
      { _id: "a3", eventId: "event-1", evaluationPlanId: "plan-1", submissionId: "s1", reviewerUserId: "Reviewer 2", round: 1 },
    ],
    evaluations: [
      { _id: "e1", eventId: "event-1", submissionId: "s1", assignmentId: "a1", reviewerName: "chair@example.test", score: 4 },
      // An ad-hoc review with no assignmentId counts toward nobody.
      { _id: "e2", eventId: "event-1", submissionId: "s2", reviewerName: "Reviewer 2", score: 5 },
    ],
    ...overrides,
  };
  const byId = new Map<string, Row>(Object.values(tables).flat().map((row) => [row._id, row]));
  return {
    auth: { getUserIdentity: async () => identity ?? null },
    db: {
      get: async (id: string) => byId.get(id) ?? null,
      query: (table: string) => {
        const rows = tables[table] ?? [];
        const conditions: Array<[string, unknown]> = [];
        const matching = () => rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
        const builder = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return builder; } };
        const result = { collect: async () => matching(), unique: async () => matching()[0] ?? null };
        return { withIndex: (_index: string, apply?: (query: typeof builder) => typeof builder) => { apply?.(builder); return result; }, ...result };
      },
    },
  } as unknown as QueryCtx;
}

const organizer = { subject: "clerk|organizer", email: "organizer@example.test", emailVerified: true, tokenIdentifier: "organizer" } as unknown as UserIdentity;
const progressHandler = (reviewerProgress as unknown as { _handler: (ctx: QueryCtx, args: { eventId: string; evaluationPlanId: string }) => Promise<ReviewerProgressRow[]> })._handler;

describe("evaluations:reviewerProgress", () => {
  it("requires an organizer", async () => {
    await expect(progressHandler(fakeCtx(undefined), { eventId: "event-1", evaluationPlanId: "plan-1" })).rejects.toThrow("Unauthenticated");
  });

  it("derives per-reviewer completion, least complete first", async () => {
    const rows = await progressHandler(fakeCtx(organizer), { eventId: "event-1", evaluationPlanId: "plan-1" });

    expect(rows).toEqual([
      { reviewerUserId: "Reviewer 2", assigned: 1, completed: 0, outstanding: 1, completionRate: 0, emailResolved: false },
      { reviewerUserId: "chair@example.test", assigned: 2, completed: 1, outstanding: 1, completionRate: 50, emailResolved: true, toEmail: "chair@example.test" },
    ]);
  });

  it("returns an empty list for a plan that belongs to another event, rather than throwing", async () => {
    await expect(progressHandler(fakeCtx(organizer), { eventId: "event-1", evaluationPlanId: "plan-2" })).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Panel: inline confirmation, server-side selection, no native dialogs.
// ---------------------------------------------------------------------------
const rows: ReviewerProgressRow[] = [
  { reviewerUserId: "Reviewer 2", assigned: 4, completed: 1, outstanding: 3, completionRate: 25, emailResolved: false },
  { reviewerUserId: "chair@example.test", assigned: 4, completed: 1, outstanding: 3, completionRate: 25, emailResolved: true, toEmail: "chair@example.test" },
  { reviewerUserId: "lead@example.test", assigned: 2, completed: 2, outstanding: 0, completionRate: 100, emailResolved: true, toEmail: "lead@example.test" },
];
const plan = { id: "plan-1", eventId: "event-1" as EventId, name: "Program committee", rounds: 1, scoringScaleMax: 5, aiAssistEnabled: false } as unknown as EvaluationPlan;
const batch: ReviewerReminderBatch = { status: "sent", requested: 2, sent: 1, failed: 0, skippedNoEmail: 1, results: [{ reviewerUserId: "chair@example.test", toEmail: "chair@example.test", status: "sent" }, { reviewerUserId: "Reviewer 2", status: "skipped", reason: "No email on file" }] };

function renderPanel(overrides: Partial<Repository["evaluations"]> = {}) {
  const sendReviewerReminders = vi.fn(async (_input: ReviewerReminderSend) => batch);
  const repo = { evaluations: { reviewerProgress: async () => rows, sendReviewerReminders, ...overrides } } as unknown as Repository;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return { container, sendReviewerReminders, render: async () => { await act(async () => { root.render(<MemoryRouter><RepoContext.Provider value={repo}><ReviewerProgressPanel eventId={"event-1" as EventId} plan={plan} refreshKey={0} /></RepoContext.Provider></MemoryRouter>); }); } };
}

const buttonsNamed = (container: HTMLElement, label: string) => [...container.querySelectorAll("button")].filter((button) => button.textContent?.trim().startsWith(label));

describe("ReviewerProgressPanel", () => {
  it("renders a row per reviewer with assigned, completed, and completion percent", async () => {
    const panel = renderPanel();
    await panel.render();

    const bodyRows = [...panel.container.querySelectorAll("tbody tr")];
    expect(bodyRows).toHaveLength(3);
    expect(bodyRows[0].textContent).toContain("Reviewer 2");
    expect(bodyRows[0].textContent).toContain("No email on file");
    expect(bodyRows[0].textContent).toContain("25%");
    expect(bodyRows[2].textContent).toContain("100%");
  });

  it("disables Remind for a complete reviewer and for one with no email on file", async () => {
    const panel = renderPanel();
    await panel.render();

    const remind = buttonsNamed(panel.container, "Remind").filter((button) => button.textContent?.trim() === "Remind");
    expect(remind).toHaveLength(3);
    expect(remind[0].disabled).toBe(true); // Reviewer 2 — no email
    expect(remind[1].disabled).toBe(false); // chair — behind and reachable
    expect(remind[2].disabled).toBe(true); // lead — complete
  });

  it("sends a single reminder only after an inline confirmation, never a native dialog", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const panel = renderPanel();
    await panel.render();

    const remind = buttonsNamed(panel.container, "Remind").filter((button) => button.textContent?.trim() === "Remind")[1];
    await act(async () => { remind.click(); });
    expect(panel.container.textContent).toContain("Send reminder?");
    expect(panel.sendReviewerReminders).not.toHaveBeenCalled();

    await act(async () => { buttonsNamed(panel.container, "Confirm send")[0].click(); });

    expect(panel.sendReviewerReminders).toHaveBeenCalledTimes(1);
    expect(panel.sendReviewerReminders.mock.calls[0][0]).toMatchObject({ evaluationPlanId: "plan-1", reviewerUserId: "chair@example.test" });
    expect(panel.sendReviewerReminders.mock.calls[0][0].thresholdPercent).toBeUndefined();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(panel.container.textContent).toContain("Reminded");
  });

  it("sends a bulk reminder as a threshold, never as a recipient list, and reports per reviewer", async () => {
    const panel = renderPanel();
    await panel.render();

    await act(async () => { buttonsNamed(panel.container, "Remind all below")[0].click(); });
    expect(panel.container.textContent).toContain("Send 1 reminder?");
    await act(async () => { buttonsNamed(panel.container, "Confirm send")[0].click(); });

    const input = panel.sendReviewerReminders.mock.calls[0][0];
    expect(input).toMatchObject({ thresholdPercent: 50 });
    expect(JSON.stringify(input)).not.toContain("chair@example.test");
    expect(panel.container.textContent).toContain("Sent 1 of 2 reminders.");
    expect(panel.container.textContent).toContain("Reviewer 2 — no email on file, not sent.");
  });

  it("keeps the table rendered when a send fails", async () => {
    const panel = renderPanel({ sendReviewerReminders: vi.fn(async () => { throw new Error("Your session expired."); }) as never });
    await panel.render();

    const remind = buttonsNamed(panel.container, "Remind").filter((button) => button.textContent?.trim() === "Remind")[1];
    await act(async () => { remind.click(); });
    await act(async () => { buttonsNamed(panel.container, "Confirm send")[0].click(); });

    expect(panel.container.querySelector("[role=alert]")?.textContent).toContain("Your session expired.");
    expect(panel.container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("renders an empty state with no threshold control when nobody is assigned", async () => {
    const panel = renderPanel({ reviewerProgress: (async () => []) as never });
    await panel.render();

    expect(panel.container.textContent).toContain("No CFPs are assigned to reviewers for this plan yet.");
    expect(panel.container.querySelector("#reminder-threshold")).toBeNull();
    expect(buttonsNamed(panel.container, "Remind all below")).toHaveLength(0);
  });
});
