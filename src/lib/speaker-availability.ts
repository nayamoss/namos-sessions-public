export type AvailabilityWindow = { speakerId: string; startTime: number; endTime: number };
export function isSpeakerAvailable(speakerId: string, startTime: number, endTime: number, unavailable: AvailabilityWindow[]) { return !unavailable.some(window => window.speakerId === speakerId && startTime < window.endTime && window.startTime < endTime); }

export type DayPart = "morning" | "afternoon" | "evening";
export type DayPartUnavailability = { speakerId: string; date: number; part?: DayPart; hour?: number; minute?: 0 | 30 };

function localParts(value: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { date: Date.UTC(get("year"), get("month") - 1, get("day")), hour: get("hour"), minute: get("minute") };
}

export function unavailableDayPartsForRange(startTime: number, endTime: number, timeZone: string) {
  const parts = new Set<string>();
  for (let cursor = startTime; cursor < endTime; cursor += 30 * 60_000) {
    const local = localParts(cursor, timeZone);
    const part: DayPart = local.hour < 12 ? "morning" : local.hour < 17 ? "afternoon" : "evening";
    parts.add(`${local.date}:${part}`);
  }
  const final = localParts(Math.max(startTime, endTime - 1), timeZone);
  const finalPart: DayPart = final.hour < 12 ? "morning" : final.hour < 17 ? "afternoon" : "evening";
  parts.add(`${final.date}:${finalPart}`);
  return parts;
}

export function isSpeakerAvailableByDayPart(speakerId: string, startTime: number, endTime: number, unavailable: DayPartUnavailability[], timeZone: string) {
  const blockedParts = unavailableDayPartsForRange(startTime, endTime, timeZone);
  const blockedHours = new Set<string>();
  for (let cursor = startTime; cursor < endTime; cursor += 30 * 60_000) {
    const local = localParts(cursor, timeZone);
    blockedHours.add(`${local.date}:${local.hour}:${local.minute < 30 ? 0 : 30}`);
  }
  return !unavailable.some((window) =>
    window.speakerId === speakerId &&
    (window.hour !== undefined
      ? window.minute !== undefined
        ? blockedHours.has(`${window.date}:${window.hour}:${window.minute}`)
        : blockedHours.has(`${window.date}:${window.hour}:0`) || blockedHours.has(`${window.date}:${window.hour}:30`)
      : window.part !== undefined && blockedParts.has(`${window.date}:${window.part}`)),
  );
}
