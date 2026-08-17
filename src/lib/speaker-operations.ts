import type { Comm, OnboardingTask, Speaker, SpeakerConfirmationStatus, Submission } from "@/data/types";

export type SpeakerProfileState = "complete" | "bio_missing" | "headshot_missing" | "bio_and_headshot_missing";
export type SpeakerOperationsView = "all" | "needs-attention" | "overdue" | "awaiting" | "profile-incomplete";

export type SpeakerOperationsRow = {
  id: string;
  speaker: Speaker;
  name: string;
  email?: string;
  confirmationStatus: SpeakerConfirmationStatus;
  profileState: SpeakerProfileState;
  submissions: Array<{ id: string; title: string }>;
  tasks: OnboardingTask[];
  openTaskCount: number;
  overdueTaskCount: number;
  lastContactAt?: number;
};

export type SpeakerOperationsSummary = {
  accepted: number;
  needsAttention: number;
  overdue: number;
  confirmed: number;
  /** Speakers missing a bio, a headshot, or both. Surfaced on its own so the
   *  dashboard can flag it directly instead of folding it into needsAttention. */
  profileIncomplete: number;
};

const validViews = new Set<SpeakerOperationsView>(["all", "needs-attention", "overdue", "awaiting", "profile-incomplete"]);

export function parseSpeakerOperationsView(value: string | null): SpeakerOperationsView {
  return value && validViews.has(value as SpeakerOperationsView) ? value as SpeakerOperationsView : "all";
}

export function speakerProfileState(speaker: Speaker): SpeakerProfileState {
  const bioMissing = !speaker.bio?.trim();
  const headshotMissing = !speaker.headshotStorageKey;
  if (bioMissing && headshotMissing) return "bio_and_headshot_missing";
  if (bioMissing) return "bio_missing";
  if (headshotMissing) return "headshot_missing";
  return "complete";
}

export function projectSpeakerOperationsRows({
  speakers,
  submissions,
  tasks,
  comms,
  now,
}: {
  speakers: Speaker[];
  submissions: Submission[];
  tasks: OnboardingTask[];
  comms: Comm[];
  now: number;
}): SpeakerOperationsRow[] {
  const acceptedBySpeaker = new Map<string, Array<{ id: string; title: string }>>();
  for (const submission of submissions) {
    if (submission.status !== "accepted") continue;
    for (const speakerId of submission.speakerIds) {
      const sessions = acceptedBySpeaker.get(speakerId) ?? [];
      if (!sessions.some((session) => session.id === submission.id)) {
        sessions.push({ id: submission.id, title: submission.title?.trim() || "Untitled session" });
      }
      acceptedBySpeaker.set(speakerId, sessions);
    }
  }

  return speakers
    .map((speaker) => {
      const speakerTasks = tasks
        .filter((task) => task.speakerId === speaker.id)
        .sort((a, b) => {
          const aCompleted = a.status === "completed" ? 1 : 0;
          const bCompleted = b.status === "completed" ? 1 : 0;
          if (aCompleted !== bCompleted) return aCompleted - bCompleted;
          return (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER);
        });
      const openTasks = speakerTasks.filter((task) => task.status !== "completed");
      const lastContactAt = comms
        .filter((comm) => comm.speakerId === speaker.id)
        .reduce<number | undefined>((latest, comm) => {
          const timestamp = comm.sentAt ?? comm.createdAt;
          return timestamp !== undefined && (latest === undefined || timestamp > latest) ? timestamp : latest;
        }, undefined);

      return {
        id: speaker.id,
        speaker,
        name: speaker.name || [speaker.firstName, speaker.lastName].filter(Boolean).join(" ") || "Unnamed speaker",
        email: speaker.email,
        confirmationStatus: speaker.confirmationStatus ?? "awaiting",
        profileState: speakerProfileState(speaker),
        submissions: acceptedBySpeaker.get(speaker.id) ?? [],
        tasks: speakerTasks,
        openTaskCount: openTasks.length,
        overdueTaskCount: openTasks.filter((task) => task.dueDate !== undefined && task.dueDate < now).length,
        lastContactAt,
      } satisfies SpeakerOperationsRow;
    })
    .sort((a, b) => {
      const attention = (row: SpeakerOperationsRow) => row.overdueTaskCount * 100 + row.openTaskCount * 10 + (row.confirmationStatus === "awaiting" ? 1 : 0);
      return attention(b) - attention(a) || a.name.localeCompare(b.name);
    });
}

export function speakerNeedsAttention(row: SpeakerOperationsRow) {
  return row.openTaskCount > 0 || row.profileState !== "complete" || row.confirmationStatus === "awaiting";
}

export function summarizeSpeakerOperations(rows: SpeakerOperationsRow[]): SpeakerOperationsSummary {
  return {
    accepted: rows.length,
    needsAttention: rows.filter(speakerNeedsAttention).length,
    overdue: rows.filter((row) => row.overdueTaskCount > 0).length,
    confirmed: rows.filter((row) => row.confirmationStatus === "confirmed").length,
    profileIncomplete: rows.filter((row) => row.profileState !== "complete").length,
  };
}

export function filterSpeakerOperationsRows(rows: SpeakerOperationsRow[], query: string, view: SpeakerOperationsView) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const matchesQuery = !normalizedQuery || `${row.name} ${row.email ?? ""}`.toLocaleLowerCase().includes(normalizedQuery);
    if (!matchesQuery) return false;
    if (view === "needs-attention") return speakerNeedsAttention(row);
    if (view === "overdue") return row.overdueTaskCount > 0;
    if (view === "awaiting") return row.confirmationStatus === "awaiting";
    if (view === "profile-incomplete") return row.profileState !== "complete";
    return true;
  });
}

export const confirmationLabels: Record<SpeakerConfirmationStatus, string> = {
  awaiting: "Awaiting response",
  confirmed: "Confirmed",
  declined: "Declined",
};

export const profileLabels: Record<SpeakerProfileState, string> = {
  complete: "Complete",
  bio_missing: "Bio missing",
  headshot_missing: "Headshot missing",
  bio_and_headshot_missing: "Bio + headshot missing",
};
