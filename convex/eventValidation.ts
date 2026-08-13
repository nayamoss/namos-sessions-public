export function assertEventSchedule(timezone: string, startDate: number, endDate: number) {
  if (!Number.isFinite(startDate) || !Number.isFinite(endDate) || startDate >= endDate) {
    throw new Error("An event must end after it starts.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error("Select a valid IANA timezone, such as America/New_York.");
  }
}
