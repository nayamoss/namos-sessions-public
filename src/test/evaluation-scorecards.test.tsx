import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ClerkProvider } from "@clerk/clerk-react";
import type { UserIdentity } from "convex/server";
import { save, savePlan } from "../../convex/evaluations";
import type { MutationCtx } from "../../convex/_generated/server";
import Evaluation from "@/pages/program/Evaluation";
import { createAirtableRepo } from "@/data/airtable";
import { createConvexRepo } from "@/data/convex";
import { RepoContext, type Repository } from "@/data/repo";
import type { DataTransport, ReadOperation, WriteOperation } from "@/data/transport";
import { criteriaErrors } from "@/lib/evaluation-score";
import type { EventId, EvaluationCriterion, ReviewerQueueRow, SubmissionId } from "@/data/types";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

// Issue #56. Three properties are load-bearing and each is covered below:
//   1. criteria are validated and persisted on the plan,
//   2. a scorecard review writes criteriaScores and never the legacy `score`,
//   3. a plan with no criteria behaves exactly as it did before scorecards existed.

const criteria: EvaluationCriterion[] = [
  { id: "originality", label: "Originality", type: "number", max: 5, weight: 3, required: true },
  { id: "clarity", label: "Clarity", type: "number", max: 5, weight: 1, required: true },
  { id: "notes", label: "Notes", type: "text", required: false },
];

type Row = Record<string, unknown> & { _id: string };

function fakeCtx({ identity, planCriteria }: { identity?: UserIdentity; planCriteria?: EvaluationCriterion[] } = {}) {
  const patched: Array<[string, Record<string, unknown>]> = [];
  const inserted: Array<[string, Record<string, unknown>]> = [];
  const tables: Record<string, Row[]> = {
    // The organizer and the event must share an organization: authorization is tenant-scoped,
    // and a guard that cannot resolve an event's organizationId denies rather than allows.
    organizations: [{ _id: "org-1", name: "Test org", createdByUserId: "clerk|organizer" }],
    organizers: [{ _id: "organizer-1", organizationId: "org-1", userId: "clerk|organizer", email: "organizer@example.test", role: "owner" }],
    events: [{ _id: "event-1", organizationId: "org-1", name: "Test event", slug: "test-event", status: "published" }],
    submissions: [{ _id: "submission-1", eventId: "event-1", title: "Reliable systems" }],
    evaluation_plans: [{ _id: "plan-1", eventId: "event-1", name: "Program committee", rounds: 1, scoringScaleMax: 5, aiAssistEnabled: false, criteria: planCriteria }],
    evaluation_assignments: [{ _id: "assignment-1", eventId: "event-1", evaluationPlanId: "plan-1", submissionId: "submission-1", reviewerUserId: "reviewer@example.test", round: 1 }],
    evaluations: [],
  };
  const byId = new Map<string, Row>(Object.values(tables).flat().map((row) => [row._id, row]));
  const ctx = {
    auth: { getUserIdentity: async () => identity ?? null },
    db: {
      get: async (id: string) => byId.get(id) ?? null,
      patch: async (id: string, patch: Record<string, unknown>) => { patched.push([id, patch]); },
      insert: async (table: string, document: Record<string, unknown>) => { inserted.push([table, document]); return `${table}-new`; },
      query: (table: string) => {
        const rows = tables[table] ?? [];
        const conditions: Array<[string, unknown]> = [];
        const matching = () => rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
        const builder = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return builder; } };
        const result = { collect: async () => matching(), unique: async () => matching()[0] ?? null };
        return { withIndex: (_index: string, apply?: (query: typeof builder) => typeof builder) => { apply?.(builder); return result; }, ...result };
      },
    },
  };
  return { ctx: ctx as unknown as MutationCtx, patched, inserted };
}

const organizer = { subject: "clerk|organizer", email: "organizer@example.test", emailVerified: true, tokenIdentifier: "organizer" } as unknown as UserIdentity;
const reviewer = { subject: "clerk|reviewer", email: "reviewer@example.test", emailVerified: true, tokenIdentifier: "reviewer" } as unknown as UserIdentity;

type Handler<Args> = (ctx: MutationCtx, args: Args) => Promise<unknown>;
const savePlanHandler = (savePlan as unknown as { _handler: Handler<Record<string, unknown>> })._handler;
const saveHandler = (save as unknown as { _handler: Handler<Record<string, unknown>> })._handler;

const planArgs = { eventId: "event-1", name: "Program committee", rounds: 1, scoringScaleMax: 5 as const, aiAssistEnabled: false };
const reviewArgs = { assignmentId: "assignment-1", eventId: "event-1", submissionId: "submission-1", reviewerName: "reviewer@example.test" };

describe("evaluation plan criteria (convex)", () => {
  it("persists validated criteria on the plan", async () => {
    const backend = fakeCtx({ identity: organizer });

    await savePlanHandler(backend.ctx, { ...planArgs, id: "plan-1", criteria });

    expect(backend.patched[0][1].criteria).toEqual([
      { id: "originality", label: "Originality", type: "number", max: 5, weight: 3, required: true },
      { id: "clarity", label: "Clarity", type: "number", max: 5, weight: 1, required: true },
      { id: "notes", label: "Notes", type: "text", required: false },
    ]);
  });

  it("leaves stored criteria alone when the caller does not send any", async () => {
    const backend = fakeCtx({ identity: organizer, planCriteria: criteria });

    await savePlanHandler(backend.ctx, { ...planArgs, id: "plan-1" });

    expect(backend.patched[0][1]).not.toHaveProperty("criteria");
  });

  it("rejects blank labels, duplicate ids, and out-of-range maxima and weights", async () => {
    const backend = fakeCtx({ identity: organizer });
    const reject = (bad: EvaluationCriterion[]) => savePlanHandler(backend.ctx, { ...planArgs, id: "plan-1", criteria: bad });

    await expect(reject([{ id: "a", label: "   ", type: "number", max: 5, weight: 1, required: true }])).rejects.toThrow("needs a label");
    await expect(reject([criteria[0], { ...criteria[1], id: "originality" }])).rejects.toThrow("unique ids");
    await expect(reject([{ id: "a", label: "Depth", type: "number", max: 0, weight: 1, required: true }])).rejects.toThrow("between 1 and 100");
    await expect(reject([{ id: "a", label: "Depth", type: "number", max: 5, weight: 0, required: true }])).rejects.toThrow("greater than 0");
  });
});

describe("scorecard reviews (convex)", () => {
  it("writes criteriaScores and never the legacy score", async () => {
    const backend = fakeCtx({ identity: reviewer, planCriteria: criteria });

    await saveHandler(backend.ctx, { ...reviewArgs, criteriaScores: [{ criterionId: "originality", value: 4 }, { criterionId: "clarity", value: 5 }] });

    const [table, document] = backend.inserted[0];
    expect(table).toBe("evaluations");
    expect(document.criteriaScores).toEqual([{ criterionId: "originality", value: 4 }, { criterionId: "clarity", value: 5 }]);
    expect(document).not.toHaveProperty("score");
  });

  it("blocks a missing required criterion and an out-of-range value", async () => {
    const backend = fakeCtx({ identity: reviewer, planCriteria: criteria });

    await expect(saveHandler(backend.ctx, { ...reviewArgs, criteriaScores: [{ criterionId: "originality", value: 4 }] })).rejects.toThrow('"Clarity" is required.');
    await expect(saveHandler(backend.ctx, { ...reviewArgs, criteriaScores: [{ criterionId: "originality", value: 9 }, { criterionId: "clarity", value: 5 }] })).rejects.toThrow("between 0 and 5");
  });

  it("drops values for criteria the plan no longer has", async () => {
    const backend = fakeCtx({ identity: reviewer, planCriteria: criteria });

    await saveHandler(backend.ctx, { ...reviewArgs, criteriaScores: [{ criterionId: "originality", value: 4 }, { criterionId: "clarity", value: 5 }, { criterionId: "deleted", value: 2 }] });

    expect(JSON.stringify(backend.inserted[0][1])).not.toContain("deleted");
  });

  // FR-008 / T020: the no-criteria path must be byte-for-byte the behaviour it had before.
  it("still records a single score, and still rejects one out of range, when the plan has no criteria", async () => {
    const backend = fakeCtx({ identity: reviewer });

    await saveHandler(backend.ctx, { ...reviewArgs, score: 4 });

    expect(backend.inserted[0][1]).toMatchObject({ score: 4 });
    expect(backend.inserted[0][1]).not.toHaveProperty("criteriaScores");
    await expect(saveHandler(backend.ctx, { ...reviewArgs, score: 9 })).rejects.toThrow("between 1 and 5");
    await expect(saveHandler(backend.ctx, { ...reviewArgs })).rejects.toThrow("A review score is required.");
  });
});

describe("criteria editor validation", () => {
  it("flags empty and duplicate labels so the parent can block the save", () => {
    expect(criteriaErrors(criteria).size).toBe(0);
    expect(criteriaErrors([{ id: "a", label: " ", type: "number", max: 5, weight: 1, required: true }]).get("a")).toContain("label");
    expect(criteriaErrors([criteria[0], { ...criteria[0], id: "b" }]).get("b")).toContain("already uses this label");
  });
});

// ---------------------------------------------------------------------------
// The reviewer surface: scorecard vs. the untouched single-score fallback.
// ---------------------------------------------------------------------------
const baseQueueRow: ReviewerQueueRow = {
  assignmentId: "assignment-1", eventId: "event-1" as EventId, submissionId: "submission-1" as SubmissionId,
  submissionTitle: "Reliable systems", submissionAnswers: { abstract: "Why retries are hard.", track: "Engineering" },
  speakerNames: ["Ada Lovelace"], round: 1, planName: "Program committee", scoringScaleMax: 5,
};

function queueRepo(row: ReviewerQueueRow): Repository {
  return {
    events: { list: async () => { throw new Error("Forbidden: organizer access required."); } },
    evaluations: { myQueue: async () => [row] },
  } as unknown as Repository;
}

async function renderEvaluation(repo: Repository) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter><RepoContext.Provider value={repo}><Evaluation /></RepoContext.Provider></MemoryRouter>
      </ClerkProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

describe("reviewer scorecard surface", () => {
  it("renders one input per criterion and a live weighted total", async () => {
    const { container, cleanup } = await renderEvaluation(queueRepo({ ...baseQueueRow, criteria, review: { id: "evaluation-1", criteriaScores: [{ criterionId: "originality", value: 4 }, { criterionId: "clarity", value: 5 }] } }));

    expect(container.textContent).toContain("Originality");
    expect(container.textContent).toContain("Clarity");
    expect(container.textContent).toContain("Notes");
    // (4×3 + 5×1) / (3×5 + 1×5) × 5 = 17/20 × 5 = 4.25 — the worked example from requirements.md.
    expect(container.textContent).toContain("Total 4.25 / 5");
    expect(container.querySelector('[aria-label="Originality: 4 of 5"]')?.getAttribute("aria-checked")).toBe("true");
    cleanup();
  });

  // FR-008 / T020: no criteria means the single score box, unchanged.
  it("falls back to the single score input when the plan has no criteria", async () => {
    const { container, cleanup } = await renderEvaluation(queueRepo(baseQueueRow));

    expect(container.textContent).toContain("Score (1–5)");
    expect(container.textContent).not.toContain("Total");
    cleanup();
  });

  // T021: a review recorded before scorecards existed still renders, labelled as legacy.
  it("labels a legacy score rather than dropping or re-writing it", async () => {
    const { container, cleanup } = await renderEvaluation(queueRepo({ ...baseQueueRow, criteria, review: { id: "evaluation-1", score: 4 } }));

    expect(container.textContent).toContain("Legacy score: 4/5");
    expect(container.textContent).toContain("Total — / 5");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    cleanup();
  });
});

// ---------------------------------------------------------------------------
// T022: the adapter contract carries the widened plan and evaluation shapes.
// ---------------------------------------------------------------------------
describe("scorecard adapter contract", () => {
  it("forwards criteria and criteriaScores unchanged through the Convex wrapper", async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const transport = { read: async (operation: ReadOperation, input: unknown) => { calls.push({ operation, input }); return []; }, write: async (operation: WriteOperation, input: unknown) => { calls.push({ operation, input }); return "id"; } } as unknown as DataTransport;
    const repo = createConvexRepo(transport);
    const plan = { eventId: "event-a" as EventId, name: "Program committee", rounds: 1, scoringScaleMax: 5 as const, aiAssistEnabled: false, criteria };
    const review = { assignmentId: "assignment-1", eventId: "event-a" as EventId, submissionId: "submission-1", reviewerName: "reviewer@example.test", criteriaScores: [{ criterionId: "originality", value: 4 }] };

    await repo.evaluations.savePlan(plan);
    await repo.evaluations.save(review);

    expect(calls).toContainEqual({ operation: "evaluations.plans.save", input: plan });
    expect(calls).toContainEqual({ operation: "evaluations.save", input: review });
  });

  it("still refuses evaluation plans on Airtable rather than silently dropping criteria", async () => {
    await expect(createAirtableRepo().evaluations.savePlan({ eventId: "event-a" as EventId, name: "Plan", rounds: 1, scoringScaleMax: 5, aiAssistEnabled: false, criteria })).rejects.toThrow("Airtable does not yet provide");
  });
});
