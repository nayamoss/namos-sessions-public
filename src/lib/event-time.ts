type EventDateTime = {
  date: string;
  time: string;
};

type NumericDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function numericParts(value: number, timeZone: string): NumericDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute") };
}

function utcTimestamp(parts: NumericDateTimeParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function parseDateTime(date: string, time: string): NumericDateTimeParts | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) return undefined;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(timeMatch[1]), minute: Number(timeMatch[2]) };
  const checked = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (checked.getUTCFullYear() !== parts.year || checked.getUTCMonth() + 1 !== parts.month || checked.getUTCDate() !== parts.day || parts.hour > 23 || parts.minute > 59) return undefined;
  return parts;
}

/** Renders an instant as the editable wall-clock date and time for the event timezone. */
export function eventDateTime(value: number, timeZone: string): EventDateTime {
  const parts = numericParts(value, timeZone);
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

/**
 * Converts a date/time entered for the event into an epoch timestamp without using the
 * browser's timezone. Returns undefined for a nonexistent wall-clock time (DST spring
 * forward), so callers can ask the organizer to choose a valid event-local time.
 */
export function eventDateTimeToEpoch(date: string, time: string, timeZone: string): number | undefined {
  const desired = parseDateTime(date, time);
  if (!desired) return undefined;
  const desiredUtc = utcTimestamp(desired);
  let candidate = desiredUtc - (utcTimestamp(numericParts(desiredUtc, timeZone)) - desiredUtc);
  // An offset can change between the initial UTC guess and the actual local instant.
  candidate = desiredUtc - (utcTimestamp(numericParts(candidate, timeZone)) - candidate);
  const resolved = numericParts(candidate, timeZone);
  return utcTimestamp(resolved) === desiredUtc ? candidate : undefined;
}

/** Event start/end dates are stored as UTC calendar dates in the current event model. */
export function utcCalendarDate(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}
