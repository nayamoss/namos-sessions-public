export type ScheduledItem = {
  id: string;
  roomId?: string;
  trackId?: string;
  speakerIds: string[];
  startTime: number;
  endTime: number;
};
export type AgendaConflict = {
  type: "room" | "speaker" | "track";
  firstId: string;
  secondId: string;
};
export function findAgendaConflicts(items: ScheduledItem[]): AgendaConflict[] {
  const conflicts: AgendaConflict[] = [];
  for (let index = 0; index < items.length; index += 1)
    for (let next = index + 1; next < items.length; next += 1) {
      const first = items[index];
      const second = items[next];
      if (
        first.startTime >= second.endTime ||
        second.startTime >= first.endTime
      )
        continue;
      if (first.roomId && first.roomId === second.roomId)
        conflicts.push({
          type: "room",
          firstId: first.id,
          secondId: second.id,
        });
      if (
        first.speakerIds.some((speaker) => second.speakerIds.includes(speaker))
      )
        conflicts.push({
          type: "speaker",
          firstId: first.id,
          secondId: second.id,
        });
      if (first.trackId && first.trackId === second.trackId)
        conflicts.push({
          type: "track",
          firstId: first.id,
          secondId: second.id,
        });
    }
  return conflicts;
}
