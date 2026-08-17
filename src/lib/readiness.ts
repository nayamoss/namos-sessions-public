import type { AgendaConflict, AgendaItem, Comm, Event, OnboardingTask, Submission } from "@/data/types";
import { eventDateTime, utcCalendarDate } from "@/lib/event-time";
import type { SpeakerOperationsRow } from "@/lib/speaker-operations";

export type ReadinessCategory = "agenda_conflicts" | "speaker_confirmations" | "onboarding_tasks" | "proposal_decisions" | "comms_delivery";
export type ReadinessItem = { id: string; title: string; detail?: string; to: string; eventDate?: string };
export type ReadinessGroup = { category: ReadinessCategory; label: string; items: ReadinessItem[] };

const undecided = new Set<Submission["status"]>(["pending", "accept_queue", "maybe", "decline_queue"]);
const labels: Record<ReadinessCategory, string> = {
  agenda_conflicts: "Agenda conflicts", speaker_confirmations: "Speaker confirmations", onboarding_tasks: "Onboarding tasks", proposal_decisions: "Proposal decisions", comms_delivery: "Comms delivery",
};

function nameForSubmission(submission: Submission) { return submission.title?.trim() || "Untitled session"; }
function dayFor(value: number, event: Event) { return eventDateTime(value, event.timezone).date; }
function agendaConflictItem(conflict: AgendaConflict, agendaById: Map<string, AgendaItem>, event: Event): ReadinessItem | undefined {
  const first = agendaById.get(conflict.itemA);
  const second = agendaById.get(conflict.itemB);
  if (!first || !second) return undefined;
  const isRoom = conflict.reason === "room_overlap";
  const title = isRoom ? `Room clash: ${first.title} vs. ${second.title}` : conflict.reason === "speaker_unavailable" ? `Speaker unavailable: ${first.title}` : `Speaker double-booked: ${first.title} vs. ${second.title}`;
  return { id: `${conflict.reason}-${conflict.itemA}-${conflict.itemB}`, title, detail: `Open ${first.title} to resolve this conflict.`, to: `/program/agenda?selected=${encodeURIComponent(first.id)}`, eventDate: dayFor(first.startTime, event) };
}

export function projectReadinessGroups({ event, agenda, agendaConflicts, speakerRows, submissions, tasks, comms, now }: { event: Event; agenda: AgendaItem[]; agendaConflicts: AgendaConflict[]; speakerRows: SpeakerOperationsRow[]; submissions: Submission[]; tasks: OnboardingTask[]; comms: Comm[]; now: number }): ReadinessGroup[] {
  const agendaById = new Map(agenda.map(item => [item.id, item]));
  const earliestAgendaDayBySpeaker = new Map<string, string>();
  for (const item of [...agenda].sort((a, b) => a.startTime - b.startTime)) for (const speakerId of item.speakerIds) if (!earliestAgendaDayBySpeaker.has(speakerId)) earliestAgendaDayBySpeaker.set(speakerId, dayFor(item.startTime, event));
  const agendaItems = agendaConflicts.map(conflict => agendaConflictItem(conflict, agendaById, event)).filter((item): item is ReadinessItem => Boolean(item));
  const speakerItems = speakerRows.filter(row => row.confirmationStatus !== "confirmed" && row.submissions.length > 0).map(row => ({ id: row.id, title: `${row.name} has not confirmed`, detail: row.submissions.map(submission => submission.title).join(", "), to: `/program/speakers?selected=${encodeURIComponent(row.id)}`, eventDate: earliestAgendaDayBySpeaker.get(row.id) }));
  const taskItems = tasks.filter(task => task.status !== "completed" && task.dueDate !== undefined && task.dueDate < now).map(task => ({ id: task.id, title: `Overdue: ${task.title}`, detail: `Due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(task.dueDate)}`, to: `/portals/tasks#task-${encodeURIComponent(task.id)}`, eventDate: utcCalendarDate(task.dueDate) }));
  const proposalItems = submissions.filter(submission => undecided.has(submission.status)).map(submission => ({ id: submission.id, title: `Decision needed: ${nameForSubmission(submission)}`, detail: submission.status === "pending" ? "Pending review" : submission.status === "accept_queue" ? "In accept queue" : submission.status === "maybe" ? "On hold" : "In decline queue", to: `/program/abstracts?selected=${encodeURIComponent(submission.id)}` }));
  const commItems = comms.filter(comm => comm.status === "failed").map(comm => ({ id: comm.id, title: `Delivery failed: ${comm.type || "Communication"}`, detail: comm.sentAt ?? comm.createdAt ? `Attempted ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(comm.sentAt ?? comm.createdAt!)}` : undefined, to: `/program/communications?selected=${encodeURIComponent(comm.id)}` }));
  const values: Array<[ReadinessCategory, ReadinessItem[]]> = [["agenda_conflicts", agendaItems], ["speaker_confirmations", speakerItems], ["onboarding_tasks", taskItems], ["proposal_decisions", proposalItems], ["comms_delivery", commItems]];
  return values.map(([category, items]) => ({ category, label: labels[category], items }));
}

export function filterReadinessGroupsByDay(groups: ReadinessGroup[], day: string | "all") {
  if (day === "all") return groups;
  return groups.map(group => ({ ...group, items: group.items.filter(item => item.eventDate === undefined || item.eventDate === day) }));
}
