import { describe, expect, it } from "vitest";
import type { Comm, EventId, OnboardingTask, Speaker, SpeakerId, Submission } from "@/data/types";
import {
  filterSpeakerOperationsRows,
  parseSpeakerOperationsView,
  projectSpeakerOperationsRows,
  summarizeSpeakerOperations,
} from "@/lib/speaker-operations";

const eventId = "event-a" as EventId;
const adaId = "speaker-ada" as SpeakerId;
const graceId = "speaker-grace" as SpeakerId;
const now = Date.UTC(2026, 7, 11);

const speakers: Speaker[] = [
  { id: adaId, eventId, name: "Ada Lovelace", email: "ada@example.test", bio: "Pioneer", headshotStorageKey: "ada.jpg", confirmationStatus: "awaiting" },
  { id: graceId, eventId, name: "Grace Hopper", email: "grace@example.test", bio: "Compiler pioneer", confirmationStatus: "confirmed" },
];

const submissions: Submission[] = [
  { id: "accepted-a" as never, eventId, formId: "form-a" as never, speakerIds: [adaId], tagIds: [], status: "accepted", title: "Analytical engines" },
  { id: "accepted-b" as never, eventId, formId: "form-a" as never, speakerIds: [adaId, graceId], tagIds: [], status: "accepted", title: "Programming languages" },
  { id: "pending" as never, eventId, formId: "form-a" as never, speakerIds: [graceId], tagIds: [], status: "pending", title: "Not accepted" },
  { id: "dangling" as never, eventId, formId: "form-a" as never, speakerIds: ["missing" as SpeakerId], tagIds: [], status: "accepted", title: "Broken reference" },
];

const tasks: OnboardingTask[] = [
  { id: "task-overdue" as never, eventId, speakerId: adaId, targetType: "contact", title: "Upload slides", source: "manual", status: "pending", dueDate: now - 1 },
  { id: "task-done" as never, eventId, speakerId: adaId, targetType: "contact", title: "Agreement", source: "auto", status: "completed", dueDate: now - 2, completedAt: now - 1 },
  { id: "task-open" as never, eventId, speakerId: graceId, targetType: "contact", title: "Confirm AV", source: "manual", status: "in_progress" },
];

const comms: Comm[] = [
  { id: "comm-a", eventId, speakerId: adaId, type: "email", status: "sent", sentAt: now - 100 },
  { id: "comm-b", eventId, speakerId: adaId, type: "email", status: "sent", sentAt: now - 50 },
];

describe("speaker operations projection", () => {
  it("projects accepted speakers once, preserves multiple sessions, and never treats sent email as confirmation", () => {
    const rows = projectSpeakerOperationsRows({ speakers, submissions, tasks, comms, now });
    const ada = rows.find((row) => row.id === adaId);

    expect(rows).toHaveLength(2);
    expect(ada?.submissions.map((session) => session.title)).toEqual(["Analytical engines", "Programming languages"]);
    expect(ada?.confirmationStatus).toBe("awaiting");
    expect(ada?.lastContactAt).toBe(now - 50);
  });

  it("keeps manually added speakers visible before they have a session", () => {
    const manualId = "speaker-manual" as SpeakerId;
    const rows = projectSpeakerOperationsRows({
      speakers: [...speakers, { id: manualId, eventId, name: "Katherine Johnson", firstName: "Katherine", lastName: "Johnson", email: "katherine@example.test", confirmationStatus: "awaiting" }],
      submissions,
      tasks,
      comms,
      now,
    });

    expect(rows.find((row) => row.id === manualId)).toEqual(expect.objectContaining({ name: "Katherine Johnson", submissions: [] }));
  });

  it("orders open work before completed tasks and excludes completed work from overdue counts", () => {
    const [ada] = projectSpeakerOperationsRows({ speakers, submissions, tasks, comms, now });
    expect(ada.tasks.map((task) => task.id)).toEqual(["task-overdue", "task-done"]);
    expect(ada.openTaskCount).toBe(1);
    expect(ada.overdueTaskCount).toBe(1);
  });

  it("derives summary and every supported view from the same rows", () => {
    const rows = projectSpeakerOperationsRows({ speakers, submissions, tasks, comms, now });
    expect(summarizeSpeakerOperations(rows)).toEqual({ accepted: 2, needsAttention: 2, overdue: 1, confirmed: 1, profileIncomplete: 1 });
    expect(filterSpeakerOperationsRows(rows, "grace", "all").map((row) => row.id)).toEqual([graceId]);
    expect(filterSpeakerOperationsRows(rows, "", "overdue").map((row) => row.id)).toEqual([adaId]);
    expect(filterSpeakerOperationsRows(rows, "", "awaiting").map((row) => row.id)).toEqual([adaId]);
    expect(filterSpeakerOperationsRows(rows, "", "profile-incomplete").map((row) => row.id)).toEqual([graceId]);
    expect(filterSpeakerOperationsRows(rows, "", "needs-attention")).toHaveLength(2);
  });

  it("falls back unknown URL views to all", () => {
    expect(parseSpeakerOperationsView("unknown")).toBe("all");
    expect(parseSpeakerOperationsView("overdue")).toBe("overdue");
  });
});
