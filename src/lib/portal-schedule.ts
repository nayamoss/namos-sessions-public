import type { AgendaItem, SpeakerId } from "@/data/types";

export function publishedAgendaForSpeaker<T extends AgendaItem>(items: T[], speakerId: SpeakerId): T[] {
  return items
    .filter((item) => item.isPublished && item.speakerIds.includes(speakerId))
    .sort((first, second) => first.startTime - second.startTime);
}
