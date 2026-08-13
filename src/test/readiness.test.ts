import { describe, expect, it } from "vitest";
import type { AgendaConflict, AgendaItem, Comm, Event, EventId, OnboardingTask, Speaker, SpeakerId, Submission } from "@/data/types";
import { filterReadinessGroupsByDay, projectReadinessGroups } from "@/lib/readiness";
import { projectSpeakerOperationsRows } from "@/lib/speaker-operations";

const eventId = "event-readiness" as EventId;
const adaId = "speaker-ada" as SpeakerId;
const now = Date.UTC(2026, 7, 14, 12);
const event: Event = { id: eventId, name: "Readiness test", slug: "readiness", timezone: "America/New_York", startDate: Date.UTC(2026, 7, 13), endDate: Date.UTC(2026, 7, 14), exhibitorsEnabled: false, sponsorsEnabled: false, status: "published" };
const speakers: Speaker[] = [{ id: adaId, eventId, name: "Ada Lovelace", confirmationStatus: "awaiting" }];
const submissions: Submission[] = [{ id: "accepted" as never, eventId, formId: "form" as never, speakerIds: [adaId], tagIds: [], status: "accepted", title: "Accepted session" }, { id: "pending" as never, eventId, formId: "form" as never, speakerIds: [], tagIds: [], status: "pending", title: "Pending session" }];
const agenda: AgendaItem[] = [{ id: "agenda-a" as never, eventId, title: "Opening", roomId: "main", speakerIds: [adaId], startTime: Date.UTC(2026, 7, 13, 14), endTime: Date.UTC(2026, 7, 13, 15), isPublished: false }, { id: "agenda-b" as never, eventId, title: "Panel", roomId: "main", speakerIds: [adaId], startTime: Date.UTC(2026, 7, 13, 14, 30), endTime: Date.UTC(2026, 7, 13, 15, 30), isPublished: false }];
const conflicts: AgendaConflict[] = [{ itemA: agenda[0].id, itemB: agenda[1].id, reason: "room_overlap" }];
const tasks: OnboardingTask[] = [{ id: "overdue" as never, eventId, speakerId: adaId, targetType: "contact", title: "Send slides", source: "manual", status: "pending", dueDate: Date.UTC(2026, 7, 13) }, { id: "done" as never, eventId, targetType: "contact", title: "Done", source: "manual", status: "completed", dueDate: now - 1 }];
const comms: Comm[] = [{ id: "failed", eventId, type: "email", status: "failed", createdAt: now }];
function groups() { return projectReadinessGroups({ event, agenda, agendaConflicts: conflicts, speakerRows: projectSpeakerOperationsRows({ speakers, submissions, tasks, comms, now }), submissions, tasks, comms, now }); }

describe("readiness projection", () => {
  it("projects every outstanding category with a source destination", () => {
    const projected = groups();
    expect(projected.map(group => [group.category, group.items.length])).toEqual([["agenda_conflicts", 1], ["speaker_confirmations", 1], ["onboarding_tasks", 1], ["proposal_decisions", 1], ["comms_delivery", 1]]);
    expect(projected.flatMap(group => group.items).map(item => item.to)).toEqual(expect.arrayContaining(["/program/agenda?selected=agenda-a", "/program/speakers?selected=speaker-ada", "/program/abstracts?selected=pending", "/program/communications?selected=failed"]));
  });
  it("keeps all five all-clear groups when there is no outstanding work", () => {
    const projected = projectReadinessGroups({ event, agenda: [], agendaConflicts: [], speakerRows: [], submissions: [], tasks: [], comms: [], now });
    expect(projected).toHaveLength(5);
    expect(projected.every(group => group.items.length === 0)).toBe(true);
  });
  it("filters date-attributable work while retaining non-date-specific work", () => {
    const filtered = filterReadinessGroupsByDay(groups(), "2026-08-13");
    expect(filtered.find(group => group.category === "agenda_conflicts")?.items).toHaveLength(1);
    expect(filtered.find(group => group.category === "onboarding_tasks")?.items).toHaveLength(1);
    expect(filtered.find(group => group.category === "proposal_decisions")?.items).toHaveLength(1);
    expect(filtered.find(group => group.category === "comms_delivery")?.items).toHaveLength(1);
  });
});
