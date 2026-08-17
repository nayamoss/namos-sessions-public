import { describe, expect, it } from "vitest";
import { createAirtableRepo } from "@/data/airtable";
import { createConvexRepo } from "@/data/convex";
import type { EventId, FormId, SpeakerId, SubmissionId, SubmissionStatus, TagId } from "@/data/types";
import type { DataOperation, DataTransport, ReadOperation, WriteOperation } from "@/data/transport";

const eventA = "event-a" as EventId;
const eventB = "event-b" as EventId;
const speakerA = "speaker-a" as SpeakerId;
const speakerB = "speaker-b" as SpeakerId;
const formA = "form-a" as FormId;
const submissionA = "submission-a" as SubmissionId;
const tagA = "tag-a" as TagId;

interface Call {
  operation: DataOperation;
  input: Record<string, unknown>;
}

/**
 * A deliberately small in-memory transport model. These tests exercise the Convex and
 * Airtable repository wrappers only; they do not connect to, or certify, either live backend.
 */
function memoryTransport(options: { failOperation?: DataOperation } = {}) {
  const calls: Call[] = [];
  let onboardingTaskCreates = 0;
  const submissions = new Map<string, {
    id: string;
    eventId: EventId;
    formId: string;
    speakerIds: SpeakerId[];
    status: SubmissionStatus;
  }>([
    ["submission-a", { id: "submission-a", eventId: eventA, formId: "form-a", speakerIds: [speakerA], status: "pending" }],
    ["submission-b", { id: "submission-b", eventId: eventB, formId: "form-b", speakerIds: [speakerB], status: "pending" }],
  ]);
  const tags = new Map([
    ["tag-a", { id: tagA, eventId: eventA, name: "Engineering" }],
  ]);

  const invoke = async (operation: DataOperation, input: Record<string, unknown>) => {
    calls.push({ operation, input });
    if (operation === options.failOperation) throw new Error(`backend failed: ${operation}`);

    if (operation === "submissions.list") {
      return [...submissions.values()].filter((row) => row.eventId === input.eventId);
    }
    if (operation === "events.listForPortal") return [];
    if (operation === "eventMembers.canManage") return true;
    if (operation === "eventMembers.claimPending") return 2;
    if (operation === "eventMembers.invite") {
      return { memberId: "member-invite", status: "pending", clerkInvitationCreated: true, emailSent: true };
    }
    if (operation === "eventMembers.resend") {
      return { memberId: "member-invite", status: "pending", clerkInvitationCreated: true, emailSent: true };
    }

    if (operation === "submissions.decide") {
      const submission = submissions.get(input.submissionId as string);
      if (!submission) throw new Error("backend failed: submission not found");
      const nextStatus = input.status as "accepted" | "declined";

      // This mirrors the invariant the real adapters must preserve: retried decisions
      // leave an already-decided submission and its onboarding side effects unchanged.
      if (submission.status !== nextStatus) {
        submission.status = nextStatus;
        onboardingTaskCreates += 1;
      }
      return submission;
    }

    if (operation === "submissions.setTags") return undefined;

    if (operation === "tags.list") {
      return [...tags.values()].filter((tag) => tag.eventId === input.eventId);
    }

    if (operation === "tags.create") return "tag-created" as TagId;
    if (operation === "tags.rename" || operation === "tags.remove") return undefined;

    if (operation === "speakers.list") {
      if (input.eventId === eventA) {
        return [{ id: speakerA, eventId: eventA, name: "Ada", headshotStorageKey: "headshots/ada.jpg", confirmationStatus: "awaiting" }];
      }
      if (input.eventId === eventB) {
        return [{ id: speakerB, eventId: eventB, name: "Lin", headshotStorageKey: "headshots/lin.jpg", confirmationStatus: "awaiting" }];
      }
      return [];
    }

    if (operation === "speakers.setConfirmationStatus") return undefined;
    if (operation === "speakers.create") return "speaker-created" as SpeakerId;

    if (operation === "agenda.publishSchedule") return undefined;
    return [];
  };

  return {
    calls,
    getOnboardingTaskCreates: () => onboardingTaskCreates,
    transport: {
      read: (operation: ReadOperation, input: Record<string, unknown>) => invoke(operation, input),
      write: (operation: WriteOperation, input: Record<string, unknown>) => invoke(operation, input),
    } as DataTransport,
  };
}

const repositoryWrappers = [
  ["Convex repository wrapper", (transport: DataTransport) => createConvexRepo(transport)],
  ["Airtable repository wrapper", (transport: DataTransport) => createAirtableRepo(transport)],
] as const;

describe.each(repositoryWrappers)("%s in-memory contract", (_name, createRepo) => {
  it("isolates every event-scoped submission list", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await expect(repo.submissions.list({ eventId: eventA })).resolves.toEqual([
      expect.objectContaining({ id: "submission-a", eventId: eventA }),
    ]);
    await expect(repo.submissions.list({ eventId: eventB })).resolves.toEqual([
      expect.objectContaining({ id: "submission-b", eventId: eventB }),
    ]);
    expect(backend.calls).toEqual([
      { operation: "submissions.list", input: { eventId: eventA } },
      { operation: "submissions.list", input: { eventId: eventB } },
    ]);
  });

  it("preserves linked speaker IDs and storage keys without cross-event joins", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    const [submission] = await repo.submissions.list({ eventId: eventA });
    const speakers = await repo.speakers.list({ eventId: eventA });

    expect(submission.speakerIds).toEqual([speakerA]);
    expect(submission.speakerIds).not.toContain(speakerB);
    expect(speakers).toEqual([
      expect.objectContaining({ id: speakerA, eventId: eventA, headshotStorageKey: "headshots/ada.jpg" }),
    ]);
  });

  it("forwards event-scoped explicit speaker confirmation without deriving it from communications", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await repo.speakers.setConfirmationStatus({ eventId: eventA, speakerId: speakerA, status: "confirmed" });

    expect(backend.calls).toContainEqual({
      operation: "speakers.setConfirmationStatus",
      input: { eventId: eventA, speakerId: speakerA, status: "confirmed" },
    });
  });

  it("forwards organizer-created speaker details as a persistent operation", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await expect(repo.speakers.create({ eventId: eventA, firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", confirmationStatus: "awaiting" })).resolves.toBe("speaker-created");
    expect(backend.calls).toContainEqual({
      operation: "speakers.create",
      input: { eventId: eventA, firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", confirmationStatus: "awaiting" },
    });
  });

  it("forwards explicit business-operation inputs unchanged", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await repo.agenda.publishSchedule(eventA);

    expect(backend.calls).toContainEqual({
      operation: "agenda.publishSchedule",
      input: { eventId: eventA },
    });
  });

  it("keeps event-team invitation lifecycle operations behind the repository boundary", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await expect(repo.eventMembers.canManage({ eventId: eventA })).resolves.toBe(true);
    await expect(repo.eventMembers.invite({ eventId: eventA, email: "teammate@example.test", role: "organizer" })).resolves.toMatchObject({
      status: "pending",
      clerkInvitationCreated: true,
      emailSent: true,
    });
    await expect(repo.eventMembers.claimPending()).resolves.toBe(2);
    await expect(repo.eventMembers.resend({ eventId: eventA, memberId: "member-invite" })).resolves.toMatchObject({
      status: "pending",
      clerkInvitationCreated: true,
      emailSent: true,
    });
    await repo.eventMembers.remove({ eventId: eventA, memberId: "member-invite" });

    expect(backend.calls).toContainEqual({ operation: "eventMembers.canManage", input: { eventId: eventA } });
    expect(backend.calls).toContainEqual({ operation: "eventMembers.invite", input: { eventId: eventA, email: "teammate@example.test", role: "organizer" } });
    expect(backend.calls).toContainEqual({ operation: "eventMembers.claimPending", input: {} });
    expect(backend.calls).toContainEqual({ operation: "eventMembers.resend", input: { eventId: eventA, memberId: "member-invite" } });
    expect(backend.calls).toContainEqual({ operation: "eventMembers.remove", input: { eventId: eventA, memberId: "member-invite" } });
  });

  it("uses speaker-scoped reads for portal schedule and availability", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await repo.agenda.listForSpeaker({ eventId: eventA, speakerId: speakerA });
    await repo.availability.list({ eventId: eventA, speakerId: speakerA });

    expect(backend.calls).toContainEqual({
      operation: "agenda.listForSpeaker",
      input: { eventId: eventA, speakerId: speakerA },
    });
    expect(backend.calls).toContainEqual({
      operation: "availability.list",
      input: { eventId: eventA, speakerId: speakerA },
    });
  });

  it("keeps communication template reads and writes event-scoped", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const template = {
      eventId: eventA,
      name: "Speaker reminder",
      kind: "reminder" as const,
      subject: "Your speaker tasks are due",
      body: "Please finish the remaining portal tasks.",
    };

    await repo.comms.listTemplates({ eventId: eventA });
    await repo.comms.saveTemplate(template);

    expect(backend.calls).toContainEqual({ operation: "comms.templates.list", input: { eventId: eventA } });
    expect(backend.calls).toContainEqual({ operation: "comms.templates.save", input: template });
  });

  it("uses a distinct authenticated event read for the speaker portal", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    await repo.events.listForPortal();
    expect(backend.calls).toContainEqual({ operation: "events.listForPortal", input: {} });
  });

  it("keeps API key reads and writes behind the repository boundary", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await repo.apiKeys.list({ eventId: eventA });
    await repo.apiKeys.generate({ eventId: eventA, label: "Website integration" });
    await repo.apiKeys.revoke({ eventId: eventA, id: "key-a" });

    expect(backend.calls).toEqual([
      { operation: "apiKeys.list", input: { eventId: eventA } },
      { operation: "apiKeys.generate", input: { eventId: eventA, label: "Website integration", scopes: ["events:read"] } },
      { operation: "apiKeys.revoke", input: { eventId: eventA, id: "key-a" } },
    ]);
  });

  it("preserves optional event website and location values on save", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const input = {
      id: eventA,
      name: "Sessionboard Summit",
      slug: "sessionboard-summit",
      type: "Conference",
      websiteUrl: "https://summit.example.test",
      location: "New York, NY",
      timezone: "America/New_York",
      startDate: 1_800_000_000_000,
      endDate: 1_800_086_400_000,
      exhibitorsEnabled: false,
      sponsorsEnabled: false,
      status: "draft" as const,
    };

    await repo.events.save(input);

    expect(backend.calls).toContainEqual({ operation: "events.save", input });
  });

  it("creates event rooms and tracks without a synthetic persisted id, and forwards removals", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await repo.events.saveRoom({ eventId: eventA, name: "Main stage", sortOrder: 0 });
    await repo.events.saveTrack({ eventId: eventA, name: "Engineering", sortOrder: 0 });
    await repo.events.removeRoom({ eventId: eventA, id: "room-a" });
    await repo.events.removeTrack({ eventId: eventA, id: "track-a" });

    expect(backend.calls).toContainEqual({ operation: "events.rooms.save", input: { eventId: eventA, name: "Main stage", sortOrder: 0 } });
    expect(backend.calls).toContainEqual({ operation: "events.tracks.save", input: { eventId: eventA, name: "Engineering", sortOrder: 0 } });
    expect(backend.calls).toContainEqual({ operation: "events.rooms.remove", input: { eventId: eventA, id: "room-a" } });
    expect(backend.calls).toContainEqual({ operation: "events.tracks.remove", input: { eventId: eventA, id: "track-a" } });
  });

  it("forwards event scope when reading persisted agenda conflicts", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await repo.agenda.detectConflicts({ eventId: eventA });

    expect(backend.calls).toContainEqual({
      operation: "agenda.detectConflicts",
      input: { eventId: eventA },
    });
  });

  it("forwards event-scoped evaluation plans and reviewer assignments", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const plan = { eventId: eventA, name: "Program committee", rounds: 2, scoringScaleMax: 5 as const, aiAssistEnabled: false };
    const assignment = { eventId: eventA, evaluationPlanId: "plan-a", submissionIds: ["submission-a"], reviewerUserIds: ["demo-reviewer-a"], round: 2 };

    await repo.evaluations.listPlans({ eventId: eventA });
    await repo.evaluations.savePlan(plan);
    await repo.evaluations.listAssignments({ eventId: eventA, reviewerUserId: "demo-reviewer-a" });
    await repo.evaluations.assign(assignment);

    expect(backend.calls).toContainEqual({ operation: "evaluations.plans.list", input: { eventId: eventA } });
    expect(backend.calls).toContainEqual({ operation: "evaluations.plans.save", input: plan });
    expect(backend.calls).toContainEqual({ operation: "evaluations.assignments.list", input: { eventId: eventA, reviewerUserId: "demo-reviewer-a" } });
    expect(backend.calls).toContainEqual({ operation: "evaluations.assignments.assign", input: assignment });
  });

  it("forwards a bulk tag-or-track assignment without ever sending a submission id list", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const byTag = { eventId: eventA, evaluationPlanId: "plan-a", filter: { kind: "tag" as const, tagId: tagA }, reviewerUserIds: ["reviewer@example.com"], round: 1 };
    const byTrack = { eventId: eventA, evaluationPlanId: "plan-a", filter: { kind: "track" as const, trackId: "track-a" }, reviewerUserIds: ["reviewer@example.com"], round: 1 };

    await repo.evaluations.assignByFilter(byTag);
    await repo.evaluations.assignByFilter(byTrack);

    expect(backend.calls).toContainEqual({ operation: "evaluations.assignments.assignByFilter", input: byTag });
    expect(backend.calls).toContainEqual({ operation: "evaluations.assignments.assignByFilter", input: byTrack });
    // The whole point of the server-side filter: the browser never names the submissions.
    for (const call of backend.calls.filter(entry => entry.operation === "evaluations.assignments.assignByFilter")) {
      expect(call.input).not.toHaveProperty("submissionIds");
    }
  });

  it("keeps the manual assign contract unchanged after the shared-helper extraction", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const assignment = { eventId: eventA, evaluationPlanId: "plan-a", submissionIds: ["submission-a"], reviewerUserIds: ["reviewer@example.com"], round: 1 };

    // assign still takes an explicit submission id list and still resolves to an id array —
    // the bulk path is a second door, never a change to the verified manual one.
    await expect(repo.evaluations.assign(assignment)).resolves.toBeInstanceOf(Array);
    expect(backend.calls).toContainEqual({ operation: "evaluations.assignments.assign", input: assignment });
  });

  it("forwards an event-scoped manual task create request unchanged", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const input = {
      eventId: eventA,
      title: "Upload a headshot",
      targetType: "contact" as const,
      speakerId: speakerA,
      linkedFormId: formA,
      dueDate: 1_800_000_000_000,
    };

    await repo.tasks.create(input);

    expect(backend.calls).toContainEqual({ operation: "tasks.create", input });
  });

  it("forwards event-scoped tag CRUD and submission assignment operations", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await expect(repo.tags.list({ eventId: eventA })).resolves.toEqual([
      expect.objectContaining({ id: tagA, eventId: eventA, name: "Engineering" }),
    ]);
    await repo.tags.create({ eventId: eventA, name: "Product" });
    await repo.tags.rename({ eventId: eventA, id: tagA, name: "AI Engineering" });
    await repo.submissions.setTags({ eventId: eventA, submissionId: submissionA, tagIds: [tagA] });
    await repo.tags.remove({ eventId: eventA, id: tagA });

    expect(backend.calls).toEqual(expect.arrayContaining([
      { operation: "tags.list", input: { eventId: eventA } },
      { operation: "tags.create", input: { eventId: eventA, name: "Product" } },
      { operation: "tags.rename", input: { eventId: eventA, id: tagA, name: "AI Engineering" } },
      { operation: "submissions.setTags", input: { eventId: eventA, submissionId: submissionA, tagIds: [tagA] } },
      { operation: "tags.remove", input: { eventId: eventA, id: tagA } },
    ]));
  });

  it("forwards an organizer-created abstract with explicit event and form scope", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const input = {
      eventId: eventA,
      formId: "form-a",
      title: "Organizer-added session",
      description: "A manually curated abstract.",
      status: "accept_queue" as const,
    };

    await repo.submissions.createAdmin(input);

    expect(backend.calls).toContainEqual({ operation: "submissions.createAdmin", input: { input } });
  });

  it("keeps public CFP reads and submits scoped to the slug and public form id", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await repo.publicForms.listOpen("demo-event");
    await repo.publicForms.get("demo-event", "public-form-id");
    await repo.publicForms.submit({
      eventSlug: "demo-event",
      formId: "public-form-id",
      idempotencyKey: "test-retry",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      title: "A reliable proposal",
      answers: { "field-1": "Value" },
      turnstileToken: "test-turnstile-token",
    });

    expect(backend.calls).toContainEqual({ operation: "publicForms.listOpen", input: { eventSlug: "demo-event" } });
    expect(backend.calls).toContainEqual({ operation: "publicForms.get", input: { eventSlug: "demo-event", formId: "public-form-id" } });
    expect(backend.calls).toContainEqual({ operation: "publicForms.submit", input: { input: {
      eventSlug: "demo-event", formId: "public-form-id", idempotencyKey: "test-retry", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", title: "A reliable proposal", answers: { "field-1": "Value" }, turnstileToken: "test-turnstile-token",
    } } });
  });

  it("forwards portal-form lifecycle operations with their event scope", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await repo.forms.createFromTemplate("portal-speaker-contact-bio", eventA);
    await repo.forms.duplicate("portal-form-a", eventA);
    await repo.forms.remove("portal-form-a", eventA);

    expect(backend.calls).toContainEqual({ operation: "forms.createFromTemplate", input: { templateId: "portal-speaker-contact-bio", eventId: eventA } });
    expect(backend.calls).toContainEqual({ operation: "forms.duplicate", input: { id: "portal-form-a", eventId: eventA } });
    expect(backend.calls).toContainEqual({ operation: "forms.remove", input: { id: "portal-form-a", eventId: eventA } });
  });

  it("keeps a headshot upload and its storage lookup explicitly event and speaker scoped", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const scope = { eventId: eventA, speakerId: speakerA };

    await repo.speakers.requestHeadshotUpload(scope);
    await repo.speakers.saveHeadshot({ ...scope, storageId: "storage-a" });
    await repo.speakers.getHeadshotUrl(scope);

    expect(backend.calls).toContainEqual({ operation: "speakers.requestHeadshotUpload", input: scope });
    expect(backend.calls).toContainEqual({ operation: "speakers.saveHeadshot", input: { ...scope, storageId: "storage-a" } });
    expect(backend.calls).toContainEqual({ operation: "speakers.headshotUrl", input: scope });
  });

  it("keeps speaker document uploads, lists, and removals scoped to the submission and speaker", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);
    const scope = { eventId: eventA, speakerId: speakerA, submissionId: submissionA };

    await repo.speakers.requestDocumentUpload(scope);
    await repo.speakers.saveDocument({ ...scope, storageId: "storage-doc-a", fileName: "keynote.pdf", kind: "slides" });
    await repo.speakers.listDocuments(scope);
    await repo.speakers.removeDocument({ ...scope, documentId: "document-a" });

    expect(backend.calls).toContainEqual({ operation: "speakers.documents.requestUpload", input: scope });
    expect(backend.calls).toContainEqual({ operation: "speakers.documents.save", input: { ...scope, storageId: "storage-doc-a", fileName: "keynote.pdf", kind: "slides" } });
    expect(backend.calls).toContainEqual({ operation: "speakers.documents.list", input: scope });
    expect(backend.calls).toContainEqual({ operation: "speakers.documents.remove", input: { ...scope, documentId: "document-a" } });
  });

  it("propagates backend errors instead of replacing or swallowing them", async () => {
    const backend = memoryTransport({ failOperation: "submissions.list" });
    const repo = createRepo(backend.transport);

    await expect(repo.submissions.list({ eventId: eventA })).rejects.toThrow(
      "backend failed: submissions.list",
    );
  });

  it("keeps retried decisions idempotent, including onboarding side effects", async () => {
    const backend = memoryTransport();
    const repo = createRepo(backend.transport);

    await expect(repo.submissions.decide("submission-a", "accepted")).resolves.toMatchObject({
      id: "submission-a",
      status: "accepted",
    });
    await expect(repo.submissions.decide("submission-a", "accepted")).resolves.toMatchObject({
      id: "submission-a",
      status: "accepted",
    });

    expect(backend.getOnboardingTaskCreates()).toBe(1);
    expect(backend.calls.filter((call) => call.operation === "submissions.decide")).toEqual([
      { operation: "submissions.decide", input: { submissionId: "submission-a", status: "accepted" } },
      { operation: "submissions.decide", input: { submissionId: "submission-a", status: "accepted" } },
    ]);
  });
});

describe("Airtable tag boundary", () => {
  it("fails explicitly instead of attempting unsupported tag requests", async () => {
    const repo = createAirtableRepo();

    await expect(repo.tags.list({ eventId: eventA })).rejects.toThrow("Airtable tag operations are outside issue #27");
    await expect(repo.submissions.setTags({ eventId: eventA, submissionId: submissionA, tagIds: [tagA] })).rejects.toThrow("Airtable tag operations are outside issue #27");
  });

  it("rejects bulk reviewer assignment loudly rather than silently assigning nothing", async () => {
    const repo = createAirtableRepo();
    await expect(repo.evaluations.assignByFilter({ eventId: eventA, evaluationPlanId: "plan-a", filter: { kind: "tag", tagId: tagA }, reviewerUserIds: ["reviewer@example.com"], round: 1 }))
      .rejects.toThrow("evaluation-plan lifecycle operations");
  });

  it("rejects server-side template expansion instead of attempting an incomplete Airtable write", async () => {
    const repo = createAirtableRepo();
    await expect(repo.forms.createFromTemplate("cfp-standard-abstract", eventA))
      .rejects.toThrow("portal-form or evaluation-plan lifecycle operations");
  });
});

describe("speaker submission editing adapter boundary", () => {
  const scope = { eventId: eventA, submissionId: submissionA, speakerId: speakerA };

  it("forwards the Convex read and write with explicit event, submission, and speaker scope", async () => {
    const backend = memoryTransport();
    const repo = createConvexRepo(backend.transport);
    await repo.submissions.getForSpeaker(scope);
    await repo.submissions.updateBySpeaker({ ...scope, title: "Updated title", answers: { "field-a": "Updated" }, submit: false });
    expect(backend.calls).toContainEqual({ operation: "submissions.getForSpeaker", input: scope });
    expect(backend.calls).toContainEqual({ operation: "submissions.updateBySpeaker", input: { ...scope, title: "Updated title", answers: { "field-a": "Updated" }, submit: false } });
  });

  it("fails closed on Airtable instead of pretending an edit was saved", async () => {
    const repo = createAirtableRepo(memoryTransport().transport);
    await expect(repo.submissions.getForSpeaker(scope)).rejects.toThrow("does not yet provide speaker submission editing");
    await expect(repo.submissions.updateBySpeaker({ ...scope, title: "Updated", answers: {}, submit: false })).rejects.toThrow("does not yet provide speaker submission editing");
  });
});
