import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ClerkProvider } from "@clerk/clerk-react";
import type { UserIdentity } from "convex/server";
import { myQueue, reviewerQueueFor, stripIdentifyingAnswers } from "../../convex/evaluations";
import type { QueryCtx } from "../../convex/_generated/server";
import Evaluation from "@/pages/program/Evaluation";
import { createAirtableRepo } from "@/data/airtable";
import { createConvexRepo } from "@/data/convex";
import { RepoContext, type Repository } from "@/data/repo";
import type { DataOperation, DataTransport, ReadOperation, WriteOperation } from "@/data/transport";
import type { EventId, ReviewerQueueRow, SubmissionId } from "@/data/types";
import { isForbiddenError } from "@/lib/authorization";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

// ---------------------------------------------------------------------------
// A minimal in-memory stand-in for Convex's QueryCtx. It records every table a
// handler *queries* so a test can prove the reviewer path never touches the
// organizers table (which is what assertOrganizer reads) or the full
// submissions/speakers/plan rosters.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown> & { _id: string };

const speaker = { _id: "speaker-1", eventId: "event-1", firstName: "Ada", lastName: "Lovelace" };
const mySubmission = { _id: "submission-1", eventId: "event-1", title: "Reliable systems", speakerId: "speaker-1", answers: { abstract: "Why retries are hard.", track: "Engineering" } };
const otherSubmission = { _id: "submission-2", eventId: "event-1", title: "Someone else's talk", answers: { abstract: "Not mine.", track: "Design" } };
const plan = { _id: "plan-1", eventId: "event-1", name: "Program committee", rounds: 2, scoringScaleMax: 10 };
const myAssignment = { _id: "assignment-1", eventId: "event-1", evaluationPlanId: "plan-1", submissionId: "submission-1", reviewerUserId: "reviewer@example.test", round: 2 };
const otherAssignment = { _id: "assignment-2", eventId: "event-1", evaluationPlanId: "plan-1", submissionId: "submission-2", reviewerUserId: "other-reviewer@example.test", round: 1 };
const myReview = { _id: "evaluation-1", eventId: "event-1", submissionId: "submission-1", assignmentId: "assignment-1", reviewerName: "reviewer@example.test", score: 7, comments: "Solid, wants a demo." };

// `plans` lets a test swap in a blinded plan, or drop the plan entirely to exercise the
// fail-closed path in reviewerQueueFor.
function fakeCtx(identity?: UserIdentity, plans: Row[] = [plan]) {
  const gotIds: string[] = [];
  const tables: Record<string, Row[]> = {
    organizers: [{ _id: "organizer-1", userId: "clerk|organizer", email: "organizer@example.test", role: "owner" }],
    speakers: [speaker],
    submissions: [mySubmission, otherSubmission],
    evaluation_plans: plans,
    evaluation_assignments: [myAssignment, otherAssignment],
    evaluations: [myReview],
  };
  const byId = new Map<string, Row>(Object.values(tables).flat().map((row) => [row._id, row]));
  const queriedTables: string[] = [];
  const ctx = {
    auth: { getUserIdentity: async () => identity ?? null },
    db: {
      get: async (id: string) => { gotIds.push(id); return byId.get(id) ?? null; },
      query: (table: string) => {
        queriedTables.push(table);
        const rows = tables[table] ?? [];
        const conditions: Array<[string, unknown]> = [];
        const matching = () => rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
        const builder = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return builder; } };
        const result = {
          collect: async () => matching(),
          unique: async () => matching()[0] ?? null,
        };
        return {
          withIndex: (_index: string, apply?: (query: typeof builder) => typeof builder) => { apply?.(builder); return result; },
          ...result,
        };
      },
    },
  };
  return { ctx: ctx as unknown as QueryCtx, queriedTables, gotIds };
}

const verifiedReviewer = { subject: "clerk|reviewer", email: "Reviewer@example.test", emailVerified: true, tokenIdentifier: "reviewer" } as unknown as UserIdentity;

describe("reviewer queue (convex)", () => {
  it("returns only the caller's own assignments, joined for display", async () => {
    const { ctx } = fakeCtx(verifiedReviewer);

    const rows = await reviewerQueueFor(ctx, verifiedReviewer);

    expect(rows).toEqual([{
      assignmentId: "assignment-1",
      eventId: "event-1",
      submissionId: "submission-1",
      submissionTitle: "Reliable systems",
      submissionAnswers: { abstract: "Why retries are hard.", track: "Engineering" },
      speakerNames: ["Ada Lovelace"],
      round: 2,
      planName: "Program committee",
      scoringScaleMax: 10,
      anonymized: false,
      review: { id: "evaluation-1", score: 7, comments: "Solid, wants a demo." },
    }]);
  });

  it("leaks nothing about other reviewers, submissions, or plans", async () => {
    const { ctx } = fakeCtx(verifiedReviewer);

    const serialized = JSON.stringify(await reviewerQueueFor(ctx, verifiedReviewer));

    expect(serialized).not.toContain("other-reviewer@example.test");
    expect(serialized).not.toContain("submission-2");
    expect(serialized).not.toContain("Someone else's talk");
    // The reviewer's own row carries no other reviewer's name and no reviewerUserId at all.
    expect(serialized).not.toContain("reviewerUserId");
  });

  it("never reads the organizers table, so being an organizer is not required", async () => {
    const { ctx, queriedTables } = fakeCtx(verifiedReviewer);

    await reviewerQueueFor(ctx, verifiedReviewer);

    expect(queriedTables).not.toContain("organizers");
    // Submissions, speakers, and plans are reached by id (ctx.db.get), never listed.
    expect(queriedTables).not.toContain("submissions");
    expect(queriedTables).not.toContain("speakers");
    expect(queriedTables).not.toContain("evaluation_plans");
    expect(queriedTables).toContain("evaluation_assignments");
  });

  it("ignores an unverified email claim rather than trusting it", async () => {
    const spoofer = { subject: "clerk|spoofer", email: "reviewer@example.test", emailVerified: false, tokenIdentifier: "spoofer" } as unknown as UserIdentity;
    const { ctx } = fakeCtx(spoofer);

    await expect(reviewerQueueFor(ctx, spoofer)).resolves.toEqual([]);
  });

  it("takes no event scope and still requires a signed-in caller", async () => {
    const handler = (myQueue as unknown as { _handler: (ctx: QueryCtx, args: Record<string, never>) => Promise<ReviewerQueueRow[]> })._handler;

    expect(JSON.stringify((myQueue as unknown as { exportArgs: () => string }).exportArgs())).not.toContain("eventId");
    await expect(handler(fakeCtx(undefined).ctx, {})).rejects.toThrow("Unauthenticated");
    await expect(handler(fakeCtx(verifiedReviewer).ctx, {})).resolves.toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Blind review (#57). The guarantee under test is what the server *returns*, not what the page
// renders — a DOM assertion passes even when the identity is sitting in the payload.
// ---------------------------------------------------------------------------
const blindedPlan = { ...plan, anonymized: true };

describe("blind review (convex)", () => {
  it("omits the speaker key entirely on a blinded plan, rather than sending an empty value", async () => {
    const { ctx } = fakeCtx(verifiedReviewer, [blindedPlan]);

    const [row] = await reviewerQueueFor(ctx, verifiedReviewer);

    expect(row.anonymized).toBe(true);
    expect("speakerNames" in row).toBe(false);
    // Everything a reviewer needs to judge the work still arrives.
    expect(row.submissionTitle).toBe("Reliable systems");
    expect(row.submissionAnswers).toEqual({ abstract: "Why retries are hard.", track: "Engineering" });
    expect(row.review).toEqual({ id: "evaluation-1", score: 7, comments: "Solid, wants a demo." });
  });

  it("puts no speaker name or speaker id anywhere in the payload a reviewer receives", async () => {
    const { ctx } = fakeCtx(verifiedReviewer, [blindedPlan]);

    const serialized = JSON.stringify(await reviewerQueueFor(ctx, verifiedReviewer));

    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("Lovelace");
    expect(serialized).not.toContain("speaker-1");
    expect(serialized).not.toContain("speakerNames");
  });

  it("never even reads the speaker record on a blinded plan", async () => {
    const { ctx, gotIds } = fakeCtx(verifiedReviewer, [blindedPlan]);

    await reviewerQueueFor(ctx, verifiedReviewer);

    // Do not fetch what must not be sent: no read, so no headshot URL to resolve and nothing to log.
    expect(gotIds).not.toContain("speaker-1");
  });

  it("fails closed when the assignment's plan cannot be read", async () => {
    const { ctx } = fakeCtx(verifiedReviewer, []);

    const [row] = await reviewerQueueFor(ctx, verifiedReviewer);

    expect(row.anonymized).toBe(true);
    expect("speakerNames" in row).toBe(false);
  });

  it("leaves a plan without the flag exactly as it was — the regression that matters most", async () => {
    const { ctx } = fakeCtx(verifiedReviewer, [{ ...plan, anonymized: false }]);

    const [row] = await reviewerQueueFor(ctx, verifiedReviewer);

    expect(row.anonymized).toBe(false);
    expect(row.speakerNames).toEqual(["Ada Lovelace"]);
  });
});

describe("stripIdentifyingAnswers", () => {
  it("drops identifying keys case-insensitively and keeps the substance", () => {
    const answers = { Email: "ada@example.test", EMAIL: "dup@example.test", name: "Ada", Company: "Acme", abstract: "Why retries are hard.", track: "Engineering", q_notes: "keep me" };

    expect(stripIdentifyingAnswers(answers)).toEqual({ abstract: "Why retries are hard.", track: "Engineering", q_notes: "keep me" });
  });

  it("returns a new object and never mutates the row it was given", () => {
    const answers = { email: "ada@example.test", abstract: "Kept." };

    const stripped = stripIdentifyingAnswers(answers);

    expect(stripped).not.toBe(answers);
    expect(answers.email).toBe("ada@example.test");
  });
});

// ---------------------------------------------------------------------------
// Adapter contract: a reviewer-only session can reach its queue and save a score
// with no organizer-gated operation anywhere in the path.
// ---------------------------------------------------------------------------
const queueRow: ReviewerQueueRow = {
  assignmentId: "assignment-1", eventId: "event-1" as EventId, submissionId: "submission-1" as SubmissionId,
  submissionTitle: "Reliable systems", submissionAnswers: { abstract: "Why retries are hard.", track: "Engineering" },
  speakerNames: ["Ada Lovelace"], round: 2, planName: "Program committee", scoringScaleMax: 10, anonymized: false,
};

// What the server actually sends for a blinded plan: no speakerNames key at all.
const blindedQueueRow: ReviewerQueueRow = {
  assignmentId: "assignment-1", eventId: "event-1" as EventId, submissionId: "submission-1" as SubmissionId,
  submissionTitle: "Reliable systems", submissionAnswers: { abstract: "Why retries are hard.", track: "Engineering" },
  round: 2, planName: "Program committee", scoringScaleMax: 10, anonymized: true,
};

const organizerOnlyOperations: DataOperation[] = ["events.list", "submissions.list", "speakers.list", "evaluations.list", "evaluations.plans.list", "evaluations.assignments.list", "evaluations.assignments.assign", "evaluations.plans.save"];

/** Refuses every organizer-gated operation exactly as convex/functions.ts assertOrganizer does. */
function reviewerOnlyTransport() {
  const calls: DataOperation[] = [];
  const invoke = async (operation: DataOperation) => {
    calls.push(operation);
    if (organizerOnlyOperations.includes(operation)) throw new Error("Forbidden: organizer access required.");
    if (operation === "evaluations.myQueue") return [queueRow];
    if (operation === "evaluations.save") return "evaluation-1";
    return [];
  };
  return { calls, transport: { read: (operation: ReadOperation) => invoke(operation), write: (operation: WriteOperation) => invoke(operation) } as unknown as DataTransport };
}

// T022. Organizer surfaces — the Abstracts grid, the assignment table, submission detail — must
// keep showing every speaker name while a plan is blinded. Rather than re-render each of those
// surfaces, this asserts the property that makes them safe by construction: the blinding flag is
// readable in exactly two backend files, so no organizer-facing query can consult it even by
// accident. If a third file starts reading `anonymized`, this fails and someone has to justify it.
describe("blind review does not reach organizer surfaces", () => {
  it("keeps the anonymized flag confined to the schema and the reviewer query", () => {
    const convexDir = join(process.cwd(), "convex");
    const readers = readdirSync(convexDir)
      .filter((entry) => entry.endsWith(".ts"))
      .filter((entry) => readFileSync(join(convexDir, entry), "utf8").includes("anonymized"));

    expect(readers.sort()).toEqual(["evaluations.ts", "schema.ts"]);
  });

  it("resolves speaker names in the organizer submission path without consulting the flag", () => {
    const submissionsSource = readFileSync(join(process.cwd(), "convex/submissions.ts"), "utf8");

    expect(submissionsSource).toContain("speakerId");
    expect(submissionsSource).not.toContain("anonymized");
  });
});

describe("reviewer queue (adapters)", () => {
  it("reads the queue with no event scope and no organizer-gated call", async () => {
    const backend = reviewerOnlyTransport();
    const repo = createConvexRepo(backend.transport);

    await expect(repo.evaluations.myQueue()).resolves.toEqual([queueRow]);
    await repo.evaluations.save({ assignmentId: queueRow.assignmentId, eventId: queueRow.eventId, submissionId: queueRow.submissionId, reviewerName: "reviewer@example.test", score: 7 });

    expect(backend.calls).toEqual(["evaluations.myQueue", "evaluations.save"]);
    expect(backend.calls.some((operation) => organizerOnlyOperations.includes(operation))).toBe(false);
  });

  it("fails explicitly on Airtable rather than pretending to support the reviewer queue", async () => {
    await expect(createAirtableRepo().evaluations.myQueue()).rejects.toThrow("Airtable does not yet provide");
  });

  it("recognises the organizer gate's error, and only that", () => {
    expect(isForbiddenError(new Error("[Request ID: abc] Server Error\nUncaught Error: Forbidden: organizer access required."))).toBe(true);
    expect(isForbiddenError(new Error("Could not reach the backend."))).toBe(false);
    expect(isForbiddenError(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The page itself: which surface each kind of account gets.
// ---------------------------------------------------------------------------
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

function blindedReviewerRepo() {
  return { events: { list: async () => { throw new Error("Forbidden: organizer access required."); } }, evaluations: { myQueue: async () => [blindedQueueRow] } } as unknown as Repository;
}

function reviewerOnlyRepo() {
  // Deliberately incomplete: events.list is the only organizer-gated method defined, and it
  // refuses. If the reviewer path called speakers.list, submissions.list, listPlans, or
  // listAssignments, this repo would throw a TypeError and the test would fail.
  return { events: { list: async () => { throw new Error("Forbidden: organizer access required."); } }, evaluations: { myQueue: async () => [queueRow] } } as unknown as Repository;
}

function organizerRepo() {
  return {
    events: {
      list: async () => [{ id: "event-1" as EventId, name: "Test Conf", slug: "test-conf", timezone: "UTC", startDate: 0, endDate: 0, exhibitorsEnabled: false, sponsorsEnabled: false, status: "published" }],
      listTracks: async () => [{ id: "track-1", eventId: "event-1" as EventId, name: "Platform", sortOrder: 0 }],
    },
    submissions: { list: async () => [{ id: "submission-1" as SubmissionId, eventId: "event-1" as EventId, formId: "form-1", speakerIds: [], tagIds: ["tag-1"], status: "pending", title: "Reliable systems" }] },
    speakers: { list: async () => [] },
    tags: { list: async () => [{ id: "tag-1", eventId: "event-1" as EventId, name: "AI" }] },
    evaluations: {
      list: async () => [],
      listPlans: async () => [{ id: "plan-1", eventId: "event-1" as EventId, name: "Program committee", rounds: 2, scoringScaleMax: 10 as const, aiAssistEnabled: false }],
      listAssignments: async () => [],
      // The organizer surface also renders the reviewer progress panel for the selected plan.
      reviewerProgress: async () => [],
      myQueue: async () => { throw new Error("An organizer must never need the reviewer fallback."); },
    },
  } as unknown as Repository;
}

describe("Evaluation page surfaces", () => {
  it("gives a reviewer who is not an organizer a working queue instead of an error", async () => {
    const { container, cleanup } = await renderEvaluation(reviewerOnlyRepo());

    expect(container.textContent).not.toContain("You're viewing your reviewer queue.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Reliable systems");
    expect(container.textContent).not.toContain("Program committee");
    // No plan management and no assignment management on a non-organizer's surface.
    expect(container.textContent).not.toContain("Evaluation plans");
    expect(container.textContent).not.toContain("Assign submissions");
    expect(container.textContent).not.toContain("Create evaluation plan");
    cleanup();
  });

  it("identifies the missing speaker on a blinded queue without secondary helper copy", async () => {
    const { container, cleanup } = await renderEvaluation(blindedReviewerRepo());

    expect(container.textContent).toContain("Blinded");
    expect(container.textContent).not.toContain("Speaker hidden");
    expect(container.textContent).not.toContain("Speaker identity is withheld from reviewers by the server.");
    expect(container.textContent).toContain("Reliable systems");
    expect(container.textContent).not.toContain("Ada Lovelace");
    expect(container.textContent).not.toContain("Unassigned");
    cleanup();
  });

  it("keeps organizer actions reachable from the streamlined workspace", async () => {
    const { container, cleanup } = await renderEvaluation(organizerRepo());

    expect(container.textContent).toContain("Manage evaluations");
    expect(container.textContent).not.toContain("You're viewing your reviewer queue.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    cleanup();
  });
});
